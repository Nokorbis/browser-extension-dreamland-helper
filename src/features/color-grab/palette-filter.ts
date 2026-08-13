/**
 * Pure logic behind the colour-grab filter, split out of the DOM glue in `index.ts` so it
 * can be unit-tested without a browser. Reading the review out of the page and mutating
 * phpBB's palette stay there.
 */

/** One colour occurrence in the review, already canonicalised, with its author. */
export interface ColorObservation {
  /** Canonical `#rrggbb`. */
  color: string;
  /** The post author who used (or quoted) it. */
  author: string;
}

export interface AuthorCount {
  author: string;
  count: number;
}

/** A colour and everyone who used it, ready to render as a swatch tooltip. */
export interface ColorUsage {
  /** Canonical `#rrggbb`. */
  color: string;
  /** Total occurrences across every post. */
  total: number;
  /** Authors who used it, most uses first (ties broken by name). */
  authors: AuthorCount[];
}

/**
 * Fold every CSS colour we might read down to one lowercase `#rrggbb`, so the same visual
 * colour groups into one entry however it was authored — `span.style.color` always
 * serialises to `rgb(…)` while phpBB's palette carries bare uppercase hex. `null` for
 * anything unreadable as an opaque RGB colour.
 *
 * An alpha channel is read but **ignored**: the palette groups by visual hue and phpBB never
 * authors a translucent colour, so `rgba(r,g,b,0)` canonicalises rather than being rejected.
 * Pinned by test — a decision, not an oversight.
 */
export function canonicalizeColor(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value === '') return null;

  const rgb =
    // Legacy comma form. What every engine currently serialises `.style.color` to,
    // so this is the live path.
    value.match(
      /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+%?\s*)?\)$/,
    ) ??
    // CSS Color 4 space form, not what browsers emit today. Read anyway because the
    // failure mode if one starts is silent: the colour just vanishes from the filter.
    value.match(
      /^rgba?\(\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*(?:\/\s*[\d.]+%?\s*)?\)$/,
    );
  if (rgb !== null) {
    const r = Number(rgb[1]);
    const g = Number(rgb[2]);
    const b = Number(rgb[3]);
    if (r > 255 || g > 255 || b > 255) return null;
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  const hex = value.replace(/^#/, '');
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  return null;
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

/**
 * One entry per colour with per-author counts. Colours are ordered by total usage
 * descending, ties keeping first-seen order (`sort` is stable); within a colour, authors by
 * their own count then name. Usage surfaces the colour's primary owner without trying to
 * guess who "owns" it versus who quoted it.
 */
export function aggregateUsage(observations: ColorObservation[]): ColorUsage[] {
  const byColor = new Map<string, Map<string, number>>();
  for (const { color, author } of observations) {
    let authors = byColor.get(color);
    if (authors === undefined) {
      authors = new Map();
      byColor.set(color, authors);
    }
    authors.set(author, (authors.get(author) ?? 0) + 1);
  }

  const usages: ColorUsage[] = [];
  for (const [color, authors] of byColor) {
    const counts: AuthorCount[] = [...authors].map(([author, count]) => ({
      author,
      count,
    }));
    counts.sort((a, b) => b.count - a.count || a.author.localeCompare(b.author));
    const total = counts.reduce((sum, a) => sum + a.count, 0);
    usages.push({ color, total, authors: counts });
  }
  usages.sort((a, b) => b.total - a.total);
  return usages;
}

/**
 * Both sides are canonicalised before comparing, so the grid's uppercase `data-color` and
 * the review's `rgb(…)` match. `custom` keeps the input order, which the caller passes
 * pre-sorted by usage.
 */
export function partitionByGrid(
  reviewColors: string[],
  gridColors: string[],
): { inGrid: string[]; custom: string[] } {
  const grid = new Set<string>();
  for (const g of gridColors) {
    const c = canonicalizeColor(g);
    if (c !== null) grid.add(c);
  }

  const inGrid: string[] = [];
  const custom: string[] = [];
  for (const color of reviewColors) {
    const c = canonicalizeColor(color);
    if (c === null) continue;
    (grid.has(c) ? inGrid : custom).push(c);
  }
  return { inGrid, custom };
}
