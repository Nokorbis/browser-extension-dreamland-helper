/**
 * Writing into a `<textarea>` **without destroying the browser's undo stack** — the whole
 * reason the module exists. Assigning `.value` or calling `setRangeText()` wipes the native
 * edit history, so the writer's next Ctrl+Z does nothing.
 *
 * `document.execCommand('insertText')` is deprecated but is the only API that inserts
 * programmatically *and* keeps the undo buffer intact, as a single undo unit. See
 * docs/adr/0013.
 */
import { warn } from '@/lib/log';

export interface TextRange {
  start: number;
  end: number;
}

export interface TextareaSelection extends TextRange {
  /** The selected text; empty string when the selection is collapsed. */
  text: string;
}

/**
 * Snapshot **when a menu opens**, not when the user finally clicks an item: by then the
 * click may already have moved focus and collapsed the selection.
 */
export function readSelection(el: HTMLTextAreaElement): TextareaSelection {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  return { start, end, text: el.value.slice(start, end) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** `ok: false` carries the length the field *would* have reached, for the caller's message. */
export type InsertionPlan =
  { ok: true; start: number; end: number } | { ok: false; projected: number };

/**
 * The clamped replacement range, and whether the result still fits. Split out of
 * `insertAtRange` as the only arithmetic in this module, so it can be unit-tested. Lengths
 * are UTF-16 code units, matching `String.length` and HTML's `maxlength`.
 *
 * Some skins put `maxlength` on `#message`, and `execCommand` truncates silently once it is
 * hit — which would leave half a BBCode structure in the post, far worse than refusing.
 *
 * `maxLength > 0`, not `>= 0`: an absent maxlength reads as -1 per spec, but older
 * implementations reported 0, and treating 0 as a real limit would refuse every insertion.
 */
export function planInsertion(
  valueLength: number,
  range: TextRange,
  textLength: number,
  maxLength: number,
): InsertionPlan {
  const start = clamp(range.start, 0, valueLength);
  const end = clamp(range.end, start, valueLength);

  if (maxLength > 0) {
    // The replaced span comes out of the total before the new text goes in, so
    // shrinking a selection inside an already-full field is still allowed.
    const projected = valueLength - (end - start) + textLength;
    if (projected > maxLength) return { ok: false, projected };
  }

  return { ok: true, start, end };
}

/**
 * Text and caret offset for wrapping a selection in an `open`/`close` pair, ready for
 * `insertAtRange`. An empty selection yields the pair with the caret between them; a
 * non-empty one keeps the selection inside with the caret after the whole thing.
 */
export function wrapSelection(
  open: string,
  close: string,
  selection: string,
): { text: string; caretOffset: number } {
  const text = `${open}${selection}${close}`;
  const caretOffset = selection === '' ? open.length : text.length;
  return { text, caretOffset };
}

/**
 * Replace `range` with `text`, then place the caret `caretOffset` characters into what was
 * inserted. The range is passed in rather than read from the element so a snapshot taken at
 * menu-open time survives the click that dismisses the menu. Replacing it wholesale means a
 * preset that never mentions `{SELECTION}` still overwrites the selection — documented
 * behaviour, see docs/adr/0015.
 */
export function insertAtRange(
  el: HTMLTextAreaElement,
  range: TextRange,
  text: string,
  caretOffset: number,
): void {
  // A preset body pasted from Windows carries CRLF, and textarea value normalization
  // differs between browsers, so settle on \n before measuring anything.
  const value = text.replace(/\r\n?/g, '\n');

  const plan = planInsertion(el.value.length, range, value.length, el.maxLength);
  if (!plan.ok) {
    warn(
      `insertion refused: ${plan.projected} characters would exceed maxlength=${el.maxLength}`,
    );
    return;
  }
  const { start, end } = plan;

  // execCommand acts on the *focused* editable element and on its current selection.
  // Skipping either is the usual reason it silently no-ops.
  el.focus();
  el.setSelectionRange(start, end);

  // Uninitialised on purpose: both branches assign it, and an initialiser would only
  // hide it if that stopped being true.
  let inserted: boolean;
  try {
    inserted = document.execCommand('insertText', false, value);
  } catch {
    inserted = false;
  }

  if (!inserted) {
    // Fallback: correct text, but the undo stack is gone. execCommand also fires a
    // native `input` event, so synthesize one or page scripts never learn of the edit.
    el.setRangeText(value, start, end, 'end');
    el.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: value,
      }),
    );
    warn('execCommand("insertText") unavailable — undo history was not preserved');
  }

  // Moving the caret is not an edit, so this leaves the undo unit above intact.
  const caret = start + clamp(caretOffset, 0, value.length);
  el.setSelectionRange(caret, caret);
}
