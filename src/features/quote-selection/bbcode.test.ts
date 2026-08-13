import { describe, it, expect } from 'vitest';
import { formatQuote } from './bbcode';

/**
 * The quote block's exact spelling. It has to match what phpBB's own button
 * emits, or the rendered quote loses its header and its backlink.
 */

const ATTRS = { postId: '201237', time: '1784900000', userId: '58' };

describe('formatQuote', () => {
  it('emits the full attribute set phpBB itself uses', () => {
    expect(formatQuote('bonjour', { author: 'Aetos', attributes: ATTRS })).toBe(
      '[quote="Aetos" post_id=201237 time=1784900000 user_id=58]bonjour[/quote]\n',
    );
  });

  it('quotes an author whose name contains spaces', () => {
    expect(
      formatQuote('x', { author: 'Père Castor', attributes: ATTRS }),
    ).toContain('[quote="Père Castor" post_id=201237');
  });

  it('escapes a double quote in the author name', () => {
    expect(formatQuote('x', { author: 'A "B" C', attributes: null })).toBe(
      '[quote="A \\"B\\" C"]x[/quote]\n',
    );
  });

  it('escapes a backslash before the quotes it adds', () => {
    expect(formatQuote('x', { author: 'a\\b', attributes: null })).toBe(
      '[quote="a\\\\b"]x[/quote]\n',
    );
  });

  it('falls back to the author alone when there are no attributes', () => {
    expect(formatQuote('x', { author: 'Kiratsu', attributes: null })).toBe(
      '[quote="Kiratsu"]x[/quote]\n',
    );
  });

  it('falls back to a bare quote when there is no author', () => {
    // Attributes without an author would render an attribution to nobody, so
    // they are dropped with it rather than emitted alone.
    expect(formatQuote('x', { author: null, attributes: ATTRS })).toBe(
      '[quote]x[/quote]\n',
    );
  });

  it('keeps the body verbatim, BBCode included', () => {
    const body = '[color=#BFBFBF][b]- Ah ?[/b][/color]';
    expect(formatQuote(body, { author: 'Aetos', attributes: null })).toBe(
      `[quote="Aetos"]${body}[/quote]\n`,
    );
  });

  it('ends with a newline so the reply starts on its own line', () => {
    expect(formatQuote('x', { author: null, attributes: null })).toMatch(/\n$/);
  });
});
