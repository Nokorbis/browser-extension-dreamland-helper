/**
 * The preset placeholder engine.
 *
 * A preset body is plain BBCode with two placeholders woven in — `{SELECTION}`,
 * which stands for whatever the writer had selected, and `{CURSOR}`, which marks
 * where the caret should land afterwards:
 *
 *     [b][color=#123456]{SELECTION|upper}[/color][/b]{CURSOR}
 *
 * This module turns that body plus the current selection into the literal text
 * to insert and the caret position to leave behind. It is deliberately **pure**
 * and DOM-free: the caller reads the selection, calls `renderPreset`, and hands
 * the result to `insertAtRange` in `@/lib/textarea`. That split is what lets the
 * whole grammar be unit-tested, and what will let a future keyboard-shortcut
 * feature reuse this engine for plain BBCode tags.
 *
 * The syntax is a **frozen user-facing contract** — people type it into preset
 * bodies that are saved in their browser, so changing its meaning silently
 * rewrites their presets. Every degradation rule below is deliberate and
 * documented in docs/adr/0015-preset-placeholder-syntax.md.
 */

/** The selection placeholder, verbatim. Referenced from help text — never hardcode it. */
export const SELECTION_TOKEN = '{SELECTION}';

/** The caret placeholder, verbatim. Referenced from help text — never hardcode it. */
export const CURSOR_TOKEN = '{CURSOR}';

/** Transformations applicable to `{SELECTION}`, chainable left-to-right with `|`. */
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
  | { kind: 'duplicateCursor' };

export interface RenderInput {
  /** The preset's raw body, placeholders included. */
  body: string;
  /** The text currently selected in the editor; empty string when nothing is selected. */
  selection: string;
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
        (_full, lead: string, initial: string) =>
          lead + initial.toLocaleUpperCase('fr'),
      ),
  trim: (value) => value.trim(),
};

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
 * Render a preset body against the current selection.
 *
 * Grammar: `{` NAME (`|` filter)* `}` where NAME is `SELECTION` or `CURSOR`
 * (uppercase, exact) and each filter is lowercase ASCII. The token names are
 * case-sensitive on purpose, so that BBCode which happens to contain braces —
 * `{color}`, `{Selection}` — is never mangled.
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
 * - An unknown filter is skipped, with a warning.
 * - Anything that doesn't match the grammar — `{SELECTION`, `{selection}`,
 *   `{SELECTION|Upper}` (filters must be lowercase), `{PROMPT:nom}` — is left
 *   byte-for-byte literal. `{PROMPT:…}` is reserved for a later iteration.
 */
export function renderPreset({ body, selection }: RenderInput): RenderResult {
  // Built fresh per call: a module-level /g regex carries `lastIndex` between
  // calls, which would make results depend on call order.
  const placeholder = /\{(SELECTION|CURSOR)((?:\|[a-z]+)*)\}/g;

  const warnings: TemplateWarning[] = [];
  let text = '';
  let caretOffset: number | null = null;
  let consumed = 0;

  // Scan the BODY only, appending substitutions into `text`. Never re-scan what
  // has been substituted, or a selection containing the literal string
  // "{SELECTION}" would recurse into itself.
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

    text += applyFilters(selection, filters, warnings);
  }
  text += body.slice(consumed);

  return {
    text,
    caretOffset: caretOffset ?? text.length,
    warnings,
  };
}
