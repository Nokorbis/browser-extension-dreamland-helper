/**
 * Loading the emoji dataset.
 *
 * The dataset is ~250 kB — bigger than the entire content script — so it ships
 * as a `public/` asset fetched from the extension the first time someone opens
 * the picker, not as a bundled module. A forum page where nobody opens it pays
 * nothing. See docs/adr/0022-lazy-loaded-data-assets.md; the fetch is only
 * permitted because `emoji/emoji.json` is listed in `web_accessible_resources`
 * in wxt.config.ts.
 *
 * The payload is repaired on read the same way a `storage.local` payload is
 * (docs/adr/0012): a malformed record is dropped, never thrown on. It is our
 * own generated file, so this is insurance against a half-written asset or a
 * stale one surviving an update — not something expected to fire.
 */
import { browser } from '#imports';
import { warn } from '@/lib/log';
import { isRecord, readInt, readString } from '@/lib/store-kit';
import { emptyEmojiData, type EmojiData, type EmojiGroup, type EmojiRecord } from './types';

const ASSET_PATH = 'emoji/emoji.json';

/**
 * The in-flight or settled load, kept at module scope so the two surfaces on a
 * page (composer and chat) share one fetch and reopening the panel costs
 * nothing. Never reset: the asset ships with the extension and cannot change
 * while the page lives.
 */
let pending: Promise<EmojiData> | null = null;

function normalizeGroups(raw: unknown): EmojiGroup[] {
  if (!Array.isArray(raw)) return [];
  const groups: EmojiGroup[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const id = readString(entry.id);
    if (id === '') continue;
    groups.push({ id, fr: readString(entry.fr, id), en: readString(entry.en, id) });
  }
  return groups;
}

function normalizeRecords(raw: unknown, groupCount: number): EmojiRecord[] {
  if (!Array.isArray(raw)) return [];
  const records: EmojiRecord[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const c = readString(entry.c);
    const g = readInt(entry.g);
    // A record pointing at a group that isn't there would render in no tab at
    // all — drop it rather than inventing a home for it.
    if (c === '' || g === null || g < 0 || g >= groupCount) continue;
    records.push({
      c,
      g,
      fr: readString(entry.fr),
      en: readString(entry.en),
      k: readString(entry.k),
    });
  }
  return records;
}

export function normalizeEmojiData(raw: unknown): EmojiData {
  if (!isRecord(raw)) return emptyEmojiData();
  const groups = normalizeGroups(raw.groups);
  const emoji = normalizeRecords(raw.emoji, groups.length);
  return { version: readInt(raw.version) ?? 0, groups, emoji };
}

/**
 * The dataset, fetched once per page.
 *
 * Resolves to an empty dataset on any failure rather than rejecting — the panel
 * reads `emoji.length === 0` and shows its "could not load" line, which is the
 * only useful thing it could do with an error anyway.
 */
export function loadEmojiData(): Promise<EmojiData> {
  pending ??= (async () => {
    try {
      const response = await fetch(browser.runtime.getURL(`/${ASSET_PATH}`));
      if (!response.ok) {
        warn(`emoji-picker: ${ASSET_PATH} responded ${response.status}`);
        return emptyEmojiData();
      }
      const data = normalizeEmojiData(await response.json());
      if (data.emoji.length === 0) warn(`emoji-picker: ${ASSET_PATH} held no usable emoji`);
      return data;
    } catch (err) {
      // The likeliest cause by far is a missing web_accessible_resources entry
      // — say so, since the stack alone doesn't point there.
      warn(
        `emoji-picker: could not load ${ASSET_PATH} — is it in web_accessible_resources?`,
        err,
      );
      return emptyEmojiData();
    }
  })();
  return pending;
}
