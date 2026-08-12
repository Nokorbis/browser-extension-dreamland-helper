import { describe, it, expect } from 'vitest';
import { renderPreset, SELECTION_TOKEN, CURSOR_TOKEN, FILTERS } from './template';

/**
 * These tests ARE the frozen contract described in
 * docs/adr/0015-preset-placeholder-syntax.md. Preset bodies live in users'
 * browsers, so changing a behaviour here silently rewrites what their saved
 * presets do. A failure means either a regression or a decision that needs a
 * superseding ADR — never "just update the expectation".
 */

const render = (body: string, selection = '') => renderPreset({ body, selection });

describe('{SELECTION}', () => {
  it('substitutes the selected text', () => {
    expect(render('[b]{SELECTION}[/b]', 'Bonjour').text).toBe('[b]Bonjour[/b]');
  });

  it('collapses to nothing when there is no selection', () => {
    expect(render('[b]{SELECTION}[/b]', '').text).toBe('[b][/b]');
  });

  it('substitutes every occurrence, each with its own filter chain', () => {
    expect(render('{SELECTION|upper} / {SELECTION|lower}', 'Salut').text).toBe(
      'SALUT / salut',
    );
  });

  it('leaves a body that never mentions it untouched — the caller replaces the selection', () => {
    // The "no {SELECTION} but text is selected → the selection is replaced"
    // rule lives in the caller: it hands insertAtRange the selected range, so
    // the rendered body overwrites it. Nothing to do here.
    expect(render('[hr]', 'du texte sélectionné').text).toBe('[hr]');
  });
});

describe('{CURSOR}', () => {
  it('is removed and reports where the caret lands', () => {
    const { text, caretOffset } = render(
      '[i]{SELECTION}[/i]{CURSOR} — dit-il.',
      'Bonjour',
    );
    expect(text).toBe('[i]Bonjour[/i] — dit-il.');
    expect(caretOffset).toBe('[i]Bonjour[/i]'.length);
  });

  it('puts the caret at the end of the insertion when absent', () => {
    const { text, caretOffset } = render('[b]{SELECTION}[/b]', 'Salut');
    expect(caretOffset).toBe(text.length);
  });

  it('honours the first occurrence and removes the rest, with a warning', () => {
    const { text, caretOffset, warnings } = render('a{CURSOR}b{CURSOR}c');
    // The surplus token must never survive into the post.
    expect(text).toBe('abc');
    expect(caretOffset).toBe(1);
    expect(warnings).toEqual([{ kind: 'duplicateCursor' }]);
  });

  it('parses and ignores filters written on it, without warning', () => {
    const { text, caretOffset, warnings } = render('x{CURSOR|upper}y');
    expect(text).toBe('xy');
    expect(caretOffset).toBe(1);
    expect(warnings).toEqual([]);
  });
});

describe('filters', () => {
  it.each([
    ['upper', 'été chaud', 'ÉTÉ CHAUD'],
    ['lower', 'ÉTÉ CHAUD', 'été chaud'],
    ['title', 'ÉLAN vital', 'Élan Vital'],
    ['trim', '  salut  ', 'salut'],
  ])('%s transforms the selection', (filter, selection, expected) => {
    expect(render(`{SELECTION|${filter}}`, selection).text).toBe(expected);
  });

  it('capitalises accented initials (needs the \\p{L} + u flag)', () => {
    expect(render('{SELECTION|title}', 'élan Étrange').text).toBe('Élan Étrange');
  });

  it('treats a hyphen as a word boundary', () => {
    expect(render('{SELECTION|title}', 'jean-pierre').text).toBe('Jean-Pierre');
  });

  it.each([
    ["l'atrocité", "L'atrocité"],
    ["c'est", "C'est"],
    ['l’ombre', 'L’ombre'],
  ])('does NOT treat an apostrophe as a word boundary (%s)', (input, expected) => {
    // Deliberate: French elision puts an apostrophe inside ordinary words far
    // more often than at a name break, so boundary-ing on it would produce
    // "C'Est". Losing "L'Atrocité" is the accepted cost.
    expect(render('{SELECTION|title}', input).text).toBe(expected);
  });

  it('normalises shouted input rather than preserving it', () => {
    // Idempotent: same output whichever way the source was typed.
    const shouted = render('{SELECTION|title}', 'ES KE TU VAS BI1 HÉ HO ?').text;
    const quiet = render('{SELECTION|title}', 'es ke tu vas bi1 hé ho ?').text;
    expect(shouted).toBe('Es Ke Tu Vas Bi1 Hé Ho ?');
    expect(shouted).toBe(quiet);
    expect(render('{SELECTION|title}', shouted).text).toBe(shouted);
  });

  it('chains left to right', () => {
    // Order is observable: title-then-upper shouts, upper-then-title does not.
    expect(render('{SELECTION|title|upper}', 'cri de guerre').text).toBe('CRI DE GUERRE');
    expect(render('{SELECTION|upper|title}', 'cri de guerre').text).toBe('Cri De Guerre');
  });

  it('skips an unknown filter but keeps applying the rest of the chain', () => {
    const { text, warnings } = render('{SELECTION|bold|upper}', 'salut');
    expect(text).toBe('SALUT');
    expect(warnings).toEqual([{ kind: 'unknownFilter', filter: 'bold' }]);
  });

  it('exposes every documented filter name', () => {
    expect([...FILTERS]).toEqual(['upper', 'lower', 'title', 'trim']);
  });
});

describe('malformed input stays literal', () => {
  it.each([
    ['an unclosed token', '[b]{SELECTION[/b]'],
    ['a lowercase token name', '[b]{selection}[/b]'],
    ['a mixed-case token name', '[b]{Selection}[/b]'],
    ['an uppercase filter name', '[b]{SELECTION|Upper}[/b]'],
    ['the reserved prompt token', '[b]{PROMPT:nom}[/b]'],
    ['ordinary braces in BBCode', '[b]{color}[/b]'],
  ])('leaves %s byte-for-byte', (_label, body) => {
    const { text, warnings } = render(body, 'IGNORÉ');
    expect(text).toBe(body);
    expect(warnings).toEqual([]);
  });
});

describe('the selection is never re-scanned', () => {
  it('does not expand a placeholder that came from the selection', () => {
    // Otherwise a selection containing the literal token recurses forever.
    expect(render('[b]{SELECTION}[/b]', 'a{SELECTION}b').text).toBe(
      '[b]a{SELECTION}b[/b]',
    );
  });

  it('computes the caret while building, not by searching afterwards', () => {
    // indexOf(CURSOR_TOKEN) would wrongly report 0 here.
    const { text, caretOffset } = render('{SELECTION}{CURSOR}', CURSOR_TOKEN);
    expect(text).toBe(CURSOR_TOKEN);
    expect(caretOffset).toBe(CURSOR_TOKEN.length);
  });
});

describe('edge cases', () => {
  it('handles an empty body', () => {
    expect(render('', 'Salut')).toEqual({
      text: '',
      caretOffset: 0,
      warnings: [],
    });
  });

  it('preserves newlines in multi-line presets', () => {
    expect(render('[quote]\n{SELECTION}\n[/quote]', 'Salut').text).toBe(
      '[quote]\nSalut\n[/quote]',
    );
  });

  it('renders the canonical yell preset', () => {
    const { text, caretOffset, warnings } = render(
      '[b][color=#123456]{SELECTION|upper}[/color][/b]',
      'attention',
    );
    expect(text).toBe('[b][color=#123456]ATTENTION[/color][/b]');
    expect(caretOffset).toBe(text.length);
    expect(warnings).toEqual([]);
  });

  it('exports the tokens it documents', () => {
    expect(SELECTION_TOKEN).toBe('{SELECTION}');
    expect(CURSOR_TOKEN).toBe('{CURSOR}');
  });
});
