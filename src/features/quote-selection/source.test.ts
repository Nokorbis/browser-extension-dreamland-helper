import { describe, it, expect } from 'vitest';
import { openTagsAt, sliceQuotableSource, squeeze, stripBBCode } from './source';

/**
 * Recovering BBCode behind a rendered selection. The whole contract is "align
 * or give up", so the null cases matter as much as the successful slices: a bad
 * guess would put garbage into someone's post, while a null merely costs the
 * formatting.
 */

describe('stripBBCode', () => {
  it('removes tags and maps every surviving character back', () => {
    const { plain, map } = stripBBCode('[b]hi[/b]');
    expect(plain).toBe('hi');
    expect(map).toEqual([3, 4]);
  });

  it('keeps attribute-carrying tags out of the plain text', () => {
    expect(stripBBCode('[color=#BFBFBF]rouge[/color]').plain).toBe('rouge');
  });

  it('strips a tag with spaced attributes', () => {
    expect(
      stripBBCode('[quote="Aetos" post_id=1 time=2 user_id=3]a[/quote]').plain,
    ).toBe('a');
  });

  it('strips an unknown, admin-added BBCode', () => {
    expect(stripBBCode('[spoiler]caché[/spoiler]').plain).toBe('caché');
  });

  it('leaves a square bracket that is not a tag alone', () => {
    expect(stripBBCode('il rit [nerveusement]').plain).toBe('il rit [nerveusement]');
  });

  it('keeps newlines, which are the post line breaks', () => {
    expect(stripBBCode('a\nb').plain).toBe('a\nb');
  });
});

describe('squeeze', () => {
  it('drops every whitespace character and maps the rest back', () => {
    const { squeezed, map } = squeeze('a b\nc');
    expect(squeezed).toBe('abc');
    expect(map).toEqual([0, 2, 4]);
  });
});

describe('openTagsAt', () => {
  it('reports the tags still open, outermost first', () => {
    const raw = '[color=#BFBFBF][b]ici[/b][/color]';
    expect(openTagsAt(raw, 21).map((t) => t.source)).toEqual([
      '[color=#BFBFBF]',
      '[b]',
    ]);
  });

  it('pops a tag that has been closed', () => {
    expect(openTagsAt('[b]a[/b]c', 9)).toEqual([]);
  });

  it('ignores a closing tag with no opener', () => {
    expect(openTagsAt('a[/b]c', 6)).toEqual([]);
  });

  it('never stacks a list item, which has no closer', () => {
    expect(openTagsAt('[list][*]un[/list]', 11).map((t) => t.name)).toEqual(['list']);
  });
});

describe('sliceQuotableSource', () => {
  it('recovers the formatting around the whole passage', () => {
    // The worked case from the forum: the rendered selection is bare text.
    const raw = '[color=#BFBFBF][b]- Ah ?[/b][/color] dit-il';
    expect(sliceQuotableSource(raw, '- Ah ? dit-il', 0)).toBe(raw);
  });

  it('reopens a tag the selection starts inside', () => {
    expect(sliceQuotableSource('[b]gras et suite[/b]', 'et suite', 0)).toBe(
      '[b]et suite[/b]',
    );
  });

  it('closes a tag the selection ends inside', () => {
    expect(sliceQuotableSource('[i]début et fin[/i]', 'début et', 0)).toBe(
      '[i]début et[/i]',
    );
  });

  it('repairs both ends at once, keeping attribute values verbatim', () => {
    const raw = 'avant [color=#FF0000]rouge vif ici[/color] après';
    expect(sliceQuotableSource(raw, 'vif', 0)).toBe('[color=#FF0000]vif[/color]');
  });

  it('does not reopen a quote the passage sits inside', () => {
    // Reopening would nest a stray quote block inside the one being built, and
    // the orphaned closer has to go with it.
    const raw = '[quote="Aetos"]sa phrase[/quote] ma réponse';
    expect(sliceQuotableSource(raw, 'phrase', 0)).toBe('phrase');
  });

  it('drops a list wrapper but keeps inline formatting inside it', () => {
    const raw = '[list][*][b]un[/b][*]deux[/list]';
    expect(sliceQuotableSource(raw, 'un', 0)).toBe('[b]un[/b]');
  });

  it('matches across a source line break the rendered text does not have', () => {
    // `<br>` contributes no text node, so `range.toString()` joins the lines
    // with nothing at all — which is why whitespace is removed, not collapsed.
    expect(sliceQuotableSource('[b]une\nphrase[/b]', 'unephrase', 0)).toBe(
      '[b]une\nphrase[/b]',
    );
  });

  it('uses the hint to pick between identical passages', () => {
    const raw = '[b]- Ah ?[/b] plus tard [i]- Ah ?[/i]';
    expect(sliceQuotableSource(raw, '- Ah ?', 0)).toBe('[b]- Ah ?[/b]');
    expect(sliceQuotableSource(raw, '- Ah ?', 20)).toBe('[i]- Ah ?[/i]');
  });

  it('handles an unknown BBCode generically', () => {
    expect(sliceQuotableSource('[spoiler]caché ici[/spoiler]', 'ici', 0)).toBe(
      '[spoiler]ici[/spoiler]',
    );
  });

  it('gives up when the selection is not in the source', () => {
    // The smiley case: rendered as an <img>, so the selection carries text the
    // source spells differently. Better no formatting than the wrong slice.
    expect(sliceQuotableSource('[b]bonjour[/b]', 'bonsoir', 0)).toBeNull();
  });

  it('gives up on a whitespace-only selection', () => {
    expect(sliceQuotableSource('[b]a b[/b]', '   ', 0)).toBeNull();
  });
});
