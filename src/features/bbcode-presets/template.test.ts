import { describe, it, expect } from 'vitest';
import {
  renderPreset,
  collectPrompts,
  promptToken,
  SELECTION_TOKEN,
  CURSOR_TOKEN,
  FILTERS,
} from './template';

/**
 * These tests ARE the frozen contract described in
 * docs/adr/0015-preset-placeholder-syntax.md. Preset bodies live in users'
 * browsers, so changing a behaviour here silently rewrites what their saved
 * presets do. A failure means either a regression or a decision that needs a
 * superseding ADR — never "just update the expectation".
 */

const render = (body: string, selection = '') => renderPreset({ body, selection });

const fill = (body: string, answers: Record<string, string>, selection = '') =>
  renderPreset({ body, selection, answers });

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

describe('{PROMPT:label}', () => {
  it('substitutes the answer given for its label', () => {
    expect(fill('[i]{PROMPT:lieu}[/i]', { lieu: 'la taverne' }).text).toBe(
      '[i]la taverne[/i]',
    );
  });

  it('collapses to nothing when the field was left blank', () => {
    // The writer chose that. Same shape as {SELECTION} with no selection.
    expect(fill('[i]{PROMPT:lieu}[/i]', { lieu: '' }).text).toBe('[i][/i]');
  });

  it('collapses to nothing when no answers were supplied at all', () => {
    // A *cancelled* dialog is not this case — the caller simply never renders.
    const { text, warnings } = render('[i]{PROMPT:lieu}[/i]');
    expect(text).toBe('[i][/i]');
    expect(warnings).toEqual([]);
  });

  it('asks once for a repeated label and fills every occurrence', () => {
    const body = '{PROMPT:lieu} — {PROMPT:lieu|upper}';
    expect(collectPrompts(body)).toEqual(['lieu']);
    expect(fill(body, { lieu: 'la taverne' }).text).toBe('la taverne — LA TAVERNE');
  });

  it('applies a filter chain to the answer, left to right', () => {
    expect(fill('{PROMPT:nom|trim|title}', { nom: '  jean-pierre  ' }).text).toBe(
      'Jean-Pierre',
    );
  });

  it('skips an unknown filter on a prompt, exactly as on a selection', () => {
    const { text, warnings } = fill('{PROMPT:nom|bold|upper}', { nom: 'salut' });
    expect(text).toBe('SALUT');
    expect(warnings).toEqual([{ kind: 'unknownFilter', filter: 'bold' }]);
  });

  it('accepts a label with spaces and accents, and trims it', () => {
    const body = '{PROMPT: Nom du personnage }';
    expect(collectPrompts(body)).toEqual(['Nom du personnage']);
    expect(fill(body, { 'Nom du personnage': 'Aurélien' }).text).toBe('Aurélien');
  });

  it.each([
    ['no label at all', '[b]{PROMPT:}[/b]'],
    ['a label of nothing but spaces', '[b]{PROMPT:   }[/b]'],
  ])('leaves %s literal, but says so', (_label, body) => {
    // The one shape that is both matched and emitted verbatim: a question with
    // no wording cannot be asked, and the token must still round-trip.
    const { text, warnings } = fill(body, {});
    expect(text).toBe(body);
    expect(warnings).toEqual([{ kind: 'emptyPromptLabel' }]);
    expect(collectPrompts(body)).toEqual([]);
  });

  it('never re-scans an answer', () => {
    // Otherwise an answer containing a token would expand, and one containing
    // {CURSOR} would move the caret somewhere the preset never asked for.
    const { text, caretOffset } = fill('{PROMPT:lieu}{CURSOR}', {
      lieu: `a${SELECTION_TOKEN}${CURSOR_TOKEN}b`,
    });
    expect(text).toBe(`a${SELECTION_TOKEN}${CURSOR_TOKEN}b`);
    expect(caretOffset).toBe(text.length);
  });

  it('renders alongside a selection and a caret', () => {
    const { text, caretOffset, warnings } = renderPreset({
      body: '[b]{SELECTION|upper}[/b] à {PROMPT:lieu}{CURSOR} — dit-il.',
      selection: 'attention',
      answers: { lieu: 'la taverne' },
    });
    expect(text).toBe('[b]ATTENTION[/b] à la taverne — dit-il.');
    expect(caretOffset).toBe('[b]ATTENTION[/b] à la taverne'.length);
    expect(warnings).toEqual([]);
  });
});

describe('collectPrompts', () => {
  it('returns the labels in the order they appear', () => {
    expect(collectPrompts('{PROMPT:lieu} {PROMPT:humeur} {PROMPT:heure}')).toEqual([
      'lieu',
      'humeur',
      'heure',
    ]);
  });

  it('de-duplicates, keeping the position of the first mention', () => {
    expect(collectPrompts('{PROMPT:humeur} {PROMPT:lieu} {PROMPT:humeur}')).toEqual([
      'humeur',
      'lieu',
    ]);
  });

  it('ignores the other tokens', () => {
    expect(collectPrompts('[b]{SELECTION|upper}[/b]{CURSOR}')).toEqual([]);
  });

  it('returns nothing for a body with no placeholders', () => {
    expect(collectPrompts('[hr]')).toEqual([]);
  });

  it('builds the token it collects', () => {
    expect(promptToken('lieu')).toBe('{PROMPT:lieu}');
    expect(collectPrompts(promptToken('lieu'))).toEqual(['lieu']);
  });
});

describe('malformed input stays literal', () => {
  // `['the reserved prompt token', '[b]{PROMPT:nom}[/b]']` used to sit in this
  // table. It moved to the {PROMPT:label} block below when the token stopped
  // being reserved — the one deliberate expectation change in this file, made
  // under docs/adr/0026-prompted-preset-placeholders.md and safe only because
  // 0015 had parked the token in this "left literal" bucket precisely so it
  // could be given a meaning later.
  it.each([
    ['an unclosed token', '[b]{SELECTION[/b]'],
    ['a lowercase token name', '[b]{selection}[/b]'],
    ['a mixed-case token name', '[b]{Selection}[/b]'],
    ['an uppercase filter name', '[b]{SELECTION|Upper}[/b]'],
    ['a lowercase prompt token', '[b]{prompt:nom}[/b]'],
    ['an unclosed prompt token', '[b]{PROMPT:nom[/b]'],
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
