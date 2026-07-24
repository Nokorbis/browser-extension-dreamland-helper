/**
 * Writing into a `<textarea>` **without destroying the browser's undo stack**.
 *
 * This is the whole reason the module exists. The obvious ways to insert text —
 * assigning `.value`, or calling `setRangeText()` — wipe the native edit history,
 * so the writer's next Ctrl+Z does nothing (or worse, jumps past everything they
 * typed before). For someone composing a long roleplay post, silently taking
 * away undo is a serious regression.
 *
 * `document.execCommand('insertText')` is deprecated but is the only API that
 * inserts programmatically *and* keeps the undo buffer intact — MDN carries an
 * explicit carve-out saying so, and no replacement exists. It also inserts as a
 * single undo unit, so one Ctrl+Z removes an entire preset and restores whatever
 * was selected before. See docs/adr/0013-undo-safe-text-insertion.md.
 *
 * Nothing here knows about phpBB: reading a selection out of a textarea is the
 * same on every website, which is why this is not in `@/lib/phpbb` (that module
 * is strictly forum-markup knowledge — see docs/adr/0005). Keeping the split
 * also means a future keyboard-shortcut feature can insert plain `[b]…[/b]`
 * through exactly this helper.
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
 * Snapshot the current selection.
 *
 * Callers should take this snapshot **when a menu opens**, not when the user
 * finally clicks an item: by then the click may already have moved focus and
 * collapsed the selection.
 */
export function readSelection(el: HTMLTextAreaElement): TextareaSelection {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  return { start, end, text: el.value.slice(start, end) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Replace `range` with `text`, then place the caret `caretOffset` characters
 * into what was inserted.
 *
 * The range is passed in rather than read from the element so that a snapshot
 * taken at menu-open time survives the click that dismisses the menu. Because
 * the range is replaced wholesale, a preset that never mentions `{SELECTION}`
 * still overwrites the selection — which is the documented behaviour in
 * docs/adr/0015-preset-placeholder-syntax.md.
 */
export function insertAtRange(
  el: HTMLTextAreaElement,
  range: TextRange,
  text: string,
  caretOffset: number,
): void {
  // A preset body pasted from Windows carries CRLF; textarea value normalization
  // differs between browsers, so settle on \n before measuring anything.
  const value = text.replace(/\r\n?/g, '\n');

  const start = clamp(range.start, 0, el.value.length);
  const end = clamp(range.end, start, el.value.length);

  // Some skins put maxlength on #message. execCommand truncates silently once
  // the limit is hit, which would leave half a BBCode structure in the post —
  // far worse than refusing.
  //
  // `> 0`, not `>= 0`: an absent maxlength reads as -1 per spec (and does on the
  // target forum), but older implementations reported 0. Treating 0 as a real
  // limit would refuse every insertion; a textarea that genuinely allows zero
  // characters isn't a case worth honouring.
  if (el.maxLength > 0) {
    const projected = el.value.length - (end - start) + value.length;
    if (projected > el.maxLength) {
      warn(
        `insertion refused: ${projected} characters would exceed maxlength=${el.maxLength}`,
      );
      return;
    }
  }

  // execCommand acts on the *focused* editable element and on its current
  // selection. Skipping either of these is the usual reason it silently no-ops.
  el.focus();
  el.setSelectionRange(start, end);

  let inserted = false;
  try {
    inserted = document.execCommand('insertText', false, value);
  } catch {
    inserted = false;
  }

  if (!inserted) {
    // Fallback: correct text, but the undo stack is gone. execCommand also
    // fires a native `input` event, so synthesize one here or page scripts
    // watching the editor never learn about the edit.
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

  // Moving the caret is not an edit, so this does not disturb the undo unit
  // created above.
  const caret = start + clamp(caretOffset, 0, value.length);
  el.setSelectionRange(caret, caret);
}
