/**
 * The preset placeholder engine.
 *
 * A preset body is plain BBCode with three placeholders woven in — `{SELECTION}`,
 * which stands for whatever the writer had selected, `{CURSOR}`, which marks
 * where the caret should land afterwards, and `{PROMPT:label}`, which is asked
 * for at insertion time:
 *
 *     [b][color=#123456]{SELECTION|upper}[/color][/b], à {PROMPT:lieu}{CURSOR}
 *
 * This module turns that body, the current selection and the answers to any
 * prompts into the literal text to insert and the caret position to leave
 * behind. It is deliberately **pure** and DOM-free: the caller reads the
 * selection, asks `collectPrompts` what to put on the form, collects the
 * answers, calls `renderPreset`, and hands the result to `insertAtRange` in
 * `@/lib/textarea`. That split is what lets the whole grammar be unit-tested
 * even though prompting needs an in-page dialog, and what will let a future
 * keyboard-shortcut feature reuse this engine for plain BBCode tags.
 *
 * The syntax is a **frozen user-facing contract** — people type it into preset
 * bodies that are saved in their browser, so changing its meaning silently
 * rewrites their presets. Every degradation rule below is deliberate and
 * documented in docs/adr/0015-preset-placeholder-syntax.md, extended by
 * docs/adr/0026-prompted-preset-placeholders.md.
 */

/** The selection placeholder, verbatim. Referenced from help text — never hardcode it. */
export const SELECTION_TOKEN = '{SELECTION}';

/** The caret placeholder, verbatim. Referenced from help text — never hardcode it. */
export const CURSOR_TOKEN = '{CURSOR}';

/** What a prompt placeholder opens with, verbatim. */
const PROMPT_PREFIX = 'PROMPT:';

/**
 * Build a `{PROMPT:label}` token. The prompt placeholder takes an argument, so
 * it cannot be a constant the way the other two are — help text and the
 * options-page preview go through this rather than spelling it out.
 */
export function promptToken(label: string): string {
  return `{${PROMPT_PREFIX}${label}}`;
}

/**
 * Transformations applicable to `{SELECTION}` and to a `{PROMPT:…}` answer,
 * chainable left-to-right with `|`.
 */
export const FILTERS = ['upper', 'lower', 'title', 'trim'] as const;

export type FilterName = (typeof FILTERS)[number];

/**
 * Something the engine chose to tolerate rather than fail on. Warnings are
 * ignored at insertion time (a typo must never leak `{SELECTION|bold}` into a
 * published post) but surfaced loudly in the options-page preview, where the
 * mistake can still be fixed.
 */
export type TemplateWarning =
  | { kind: 'unknownFilter'; filter: string }
  | { kind: 'duplicateCursor' }
  | { kind: 'emptyPromptLabel' };

export interface RenderInput {
  /** The preset's raw body, placeholders included. */
  body: string;
  /** The text currently selected in the editor; empty string when nothing is selected. */
  selection: string;
  /**
   * What the writer typed for each `{PROMPT:label}`, keyed by the **trimmed**
   * label — the same strings `collectPrompts` returns. A label with no entry
   * renders as the empty string, exactly like `{SELECTION}` with nothing
   * selected; a *cancelled* dialog never calls this function at all.
   */
  answers?: Readonly<Record<string, string>>;
}

export interface RenderResult {
  /** The literal text to insert. Contains no placeholders. */
  text: string;
  /** Caret position *relative to the start of `text`* once inserted. */
  caretOffset: number;
  /** Tolerated problems, for authoring-time display. Never blocks insertion. */
  warnings: TemplateWarning[];
}

/**
 * The filter implementations.
 *
 * All casing goes through the `toLocale*Case('fr')` variants because the forum
 * is French and the plain ASCII versions mishandle some accented forms.
 */
const FILTER_FNS: Record<FilterName, (value: string) => string> = {
  upper: (value) => value.toLocaleUpperCase('fr'),
  lower: (value) => value.toLocaleLowerCase('fr'),
  // Lowercase first, so the result is the same whether the source was typed
  // quietly or SHOUTED — the filter is idempotent rather than sensitive to how
  // the text happened to arrive.
  //
  // Word boundaries are whitespace and hyphens: "jean-pierre" → "Jean-Pierre",
  // because compound names are common here. Apostrophes are deliberately NOT
  // boundaries — French elision puts one inside ordinary words far more often
  // than at a name break, so treating it as one would turn "c'est" into
  // "C'Est". "L'atrocité" keeping its lowercase a is the accepted cost.
  //
  // The `u` flag and `\p{L}` are load-bearing: with a plain `[a-z]` class,
  // accented initials ("élan") are skipped and stay lowercase.
  title: (value) =>
    value
      .toLocaleLowerCase('fr')
      .replace(
        /(^|[\s-])(\p{L})/gu,
        (_full, lead: string, initial: string) => lead + initial.toLocaleUpperCase('fr'),
      ),
  trim: (value) => value.trim(),
};

/**
 * The one grammar, in one place.
 *
 * Built fresh on every call: a module-level /g regex carries `lastIndex`
 * between calls, which would make results depend on call order.
 *
 * Group 1 is the token — `SELECTION`, `CURSOR`, or `PROMPT:` followed by a
 * label. Group 2 is `''` or `'|a|b'`.
 *
 * The label class is `[^{}|]*`, which stops of its own accord at the `|` that
 * opens the filter chain and at the closing `}`. It allows spaces and accents,
 * because these labels are French and read like questions ("Nom du
 * personnage"). It allows *zero* characters on purpose: that is what lets
 * `{PROMPT:}` be matched, so it can be reported as an authoring mistake while
 * still being emitted byte-for-byte literal.
 */
function placeholderPattern(): RegExp {
  return /\{(SELECTION|CURSOR|PROMPT:[^{}|]*)((?:\|[a-z]+)*)\}/g;
}

/** The trimmed label of a prompt token, or `null` if this isn't one. */
function promptLabel(token: string): string | null {
  return token.startsWith(PROMPT_PREFIX) ? token.slice(PROMPT_PREFIX.length).trim() : null;
}

/**
 * The distinct prompts a body asks for, in the order they appear.
 *
 * The pure half of the prompt flow: the caller uses this to build its form,
 * then passes the answers back to `renderPreset`. Keeping it here rather than
 * making the engine ask keeps `renderPreset` DOM-free.
 *
 * Labels are trimmed and **de-duplicated**, so a body mentioning the same label
 * several times — `{PROMPT:lieu}` and `{PROMPT:lieu|upper}` — asks once and
 * fills every occurrence from that one answer. Labels that trim to nothing are
 * left out: they are an authoring mistake, reported by `renderPreset`, not a
 * question anyone can answer.
 */
export function collectPrompts(body: string): string[] {
  const placeholder = placeholderPattern();
  const labels: string[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = placeholder.exec(body)) !== null) {
    const label = promptLabel(match[1]);
    if (label === null || label === '' || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

function isFilterName(name: string): name is FilterName {
  return (FILTERS as readonly string[]).includes(name);
}

function applyFilters(
  value: string,
  filters: string[],
  warnings: TemplateWarning[],
): string {
  let result = value;
  for (const filter of filters) {
    if (isFilterName(filter)) {
      result = FILTER_FNS[filter](result);
    } else {
      // Skip the unknown filter but keep applying the rest of the chain — a
      // typo costs you one transformation, not the whole insertion.
      warnings.push({ kind: 'unknownFilter', filter });
    }
  }
  return result;
}

/**
 * Render a preset body against the current selection and the prompt answers.
 *
 * Grammar: `{` NAME (`|` filter)* `}` where NAME is `SELECTION`, `CURSOR`
 * (uppercase, exact) or `PROMPT:` plus a label, and each filter is lowercase
 * ASCII. The token names are case-sensitive on purpose, so that BBCode which
 * happens to contain braces — `{color}`, `{Selection}` — is never mangled.
 *
 * Degradation rules, all deliberate:
 *
 * - `{SELECTION}` with nothing selected → empty string.
 * - **No `{SELECTION}` at all** → nothing special happens here; the caller
 *   replaces the selected range with `text`, so the selection is overwritten.
 *   That mirrors typing over a selection, and a single Ctrl+Z restores it.
 * - `{CURSOR}` more than once → the first wins; the rest are removed from the
 *   output (never left visible) and reported as a warning.
 * - Filters written on `{CURSOR}` are parsed and ignored, silently.
 * - `{PROMPT:label}` → the matching answer, filtered like a selection. A label
 *   with no answer — because the caller never asked, or the writer left the
 *   field blank — renders as the empty string, same as an empty selection.
 *   A *cancelled* dialog inserts nothing at all, which is the caller's job:
 *   it simply never calls this function.
 * - `{PROMPT:}`, or a label that is nothing but spaces, is left byte-for-byte
 *   literal **and** warned about. It is the one shape that is both matched and
 *   emitted verbatim, because a question with no wording cannot be asked.
 * - An unknown filter is skipped, with a warning.
 * - Anything that doesn't match the grammar — `{SELECTION`, `{selection}`,
 *   `{SELECTION|Upper}` (filters must be lowercase), `{prompt:nom}` — is left
 *   byte-for-byte literal.
 */
export function renderPreset({ body, selection, answers }: RenderInput): RenderResult {
  const placeholder = placeholderPattern();

  const warnings: TemplateWarning[] = [];
  let text = '';
  let caretOffset: number | null = null;
  let consumed = 0;

  // Scan the BODY only, appending substitutions into `text`. Never re-scan what
  // has been substituted, or a selection — or a prompt answer — containing the
  // literal string "{SELECTION}" would recurse into itself.
  let match: RegExpExecArray | null;
  while ((match = placeholder.exec(body)) !== null) {
    text += body.slice(consumed, match.index);
    consumed = match.index + match[0].length;

    const token = match[1];
    // match[2] is '' or '|a|b'; strip the leading pipe before splitting.
    const filters = match[2] ? match[2].slice(1).split('|') : [];

    if (token === 'CURSOR') {
      if (caretOffset === null) {
        // Recorded while building, not searched for afterwards: a selection
        // containing the literal "{CURSOR}" would defeat an indexOf().
        caretOffset = text.length;
      } else {
        warnings.push({ kind: 'duplicateCursor' });
      }
      continue; // contributes nothing to the output either way
    }

    const label = promptLabel(token);
    if (label !== null) {
      if (label === '') {
        // A question with no wording. Put the token back exactly as it was
        // typed — a preset that round-tripped untouched before this feature
        // existed must keep doing so — and report it where it can still be
        // fixed, in the options-page preview.
        text += match[0];
        warnings.push({ kind: 'emptyPromptLabel' });
        continue;
      }
      text += applyFilters(answers?.[label] ?? '', filters, warnings);
      continue;
    }

    text += applyFilters(selection, filters, warnings);
  }
  text += body.slice(consumed);

  return {
    text,
    caretOffset: caretOffset ?? text.length,
    warnings,
  };
}
