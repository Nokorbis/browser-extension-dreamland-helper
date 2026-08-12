#!/usr/bin/env node
/**
 * Generates `public/emoji/emoji.json` — the dataset the emoji picker fetches at
 * runtime — from the `emojibase-data` CLDR bundle.
 *
 * Run with `pnpm gen:emoji`. The **output is committed**: `emojibase-data` is a
 * devDependency and this script never runs during `wxt build`, so a build (and
 * CI) stays deterministic and needs no network. Re-run it only to refresh the
 * data or to raise MAX_EMOJI_VERSION, and commit the result.
 *
 * See docs/adr/0022-lazy-loaded-data-assets.md for why the dataset ships as an
 * asset rather than being bundled into the content script.
 */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(repoRoot, 'public/emoji/emoji.json');

/** Bump the payload's own `version` when this file's *shape* changes. */
const SCHEMA_VERSION = 1;

/**
 * Highest Unicode Emoji version to include.
 *
 * Emoji render in the user's own system font, so anything too new shows as a
 * tofu box rather than a picture — for an emoji the user cannot see, offering
 * it is worse than omitting it. 15.1 is the newest release with broad font
 * coverage across the platforms this extension targets. Raising this is a
 * one-line change plus a re-run.
 */
const MAX_EMOJI_VERSION = 15.1;

/**
 * CLDR groups we never offer. `component` holds skin-tone modifiers and hair
 * components — pieces of other emoji, not emoji anyone would insert. Records
 * with no group at all (regional indicators, keycap parts) are dropped the same
 * way, by the `group === undefined` check below.
 */
const SKIPPED_GROUPS = new Set(['component']);

/** Locales we carry. Order matters: the first is the UI's primary language. */
const LOCALES = ['fr', 'en'];

function loadLocale(locale) {
  return {
    emoji: require(`emojibase-data/${locale}/compact.json`),
    messages: require(`emojibase-data/${locale}/messages.json`),
  };
}

/** hexcode → the Emoji version that introduced it. */
function buildVersionIndex() {
  const byVersion = require('emojibase-data/versions/emoji.json');
  const index = new Map();
  for (const [version, hexcodes] of Object.entries(byVersion)) {
    const parsed = Number.parseFloat(version);
    for (const hexcode of hexcodes) index.set(hexcode, parsed);
  }
  return index;
}

/**
 * The searchable keyword blob: every CLDR tag from every locale, deduped,
 * space-joined. Labels are searched separately, so a word already in a label is
 * still dropped here — it buys nothing and the file is downloaded at runtime.
 */
function buildKeywords(records, labels) {
  const inLabel = new Set(
    labels.flatMap((label) => label.toLowerCase().split(/[^\p{L}\p{N}]+/u)),
  );
  const tags = new Set();
  for (const record of records) {
    for (const tag of record.tags ?? []) {
      const clean = tag.toLowerCase().trim();
      if (clean === '' || inLabel.has(clean)) continue;
      tags.add(clean);
    }
  }
  return [...tags].join(' ');
}

async function main() {
  const locales = Object.fromEntries(
    LOCALES.map((locale) => [locale, loadLocale(locale)]),
  );
  const primary = locales[LOCALES[0]];
  const versions = buildVersionIndex();

  // Every locale bundle is the same list in the same order — assert it rather
  // than trust it, since every lookup below indexes across them positionally.
  for (const locale of LOCALES.slice(1)) {
    const other = locales[locale].emoji;
    const aligned =
      other.length === primary.emoji.length &&
      other.every((record, i) => record.hexcode === primary.emoji[i].hexcode);
    if (!aligned) {
      throw new Error(`emojibase-data/${locale} is not aligned with the primary locale`);
    }
  }

  // Groups, in CLDR's own display order, re-indexed densely so the emoji
  // records can carry a small integer instead of repeating the key.
  const groupOrder = [...primary.messages.groups]
    .filter((group) => !SKIPPED_GROUPS.has(group.key))
    .sort((a, b) => a.order - b.order);

  // key → display name, per locale. A locale may not name every group; the
  // primary locale's own message is the fallback.
  const groupNames = Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      new Map(locales[locale].messages.groups.map((g) => [g.key, g.message])),
    ]),
  );

  const groups = groupOrder.map((group) => {
    const entry = { id: group.key };
    for (const locale of LOCALES) {
      entry[locale] = groupNames[locale].get(group.key) ?? group.message;
    }
    return entry;
  });

  // CLDR group number (0..9) → our dense index. `groupOrder` holds the very
  // objects from `primary.messages.groups`, filtered and sorted, so its
  // position *is* the dense index and no lookup back is needed. A skipped
  // group is simply absent, which the `undefined` check below reads as "drop".
  const groupIndex = new Map(groupOrder.map((group, index) => [group.order, index]));

  const emoji = [];
  let skippedTooNew = 0;
  for (const [i, record] of primary.emoji.entries()) {
    if (record.group === undefined) continue;
    const g = groupIndex.get(record.group);
    if (g === undefined) continue;

    // An unlisted hexcode is treated as old rather than skipped: the version
    // index is an optimisation for hiding *new* emoji, not an allowlist.
    const version = versions.get(record.hexcode) ?? 0;
    if (version > MAX_EMOJI_VERSION) {
      skippedTooNew += 1;
      continue;
    }

    // Skin-tone variants (`record.skins`) are deliberately not expanded — the
    // picker has no skin-tone selector, so they would only pad the grid.
    const siblings = LOCALES.map((locale) => locales[locale].emoji[i]);
    const labels = siblings.map((sibling) => sibling.label);

    const entry = { c: record.unicode, g };
    for (const [n, locale] of LOCALES.entries()) entry[locale] = labels[n];
    entry.k = buildKeywords(siblings, labels);
    emoji.push(entry);
  }

  // Sorted by CLDR display order within each group, which is the order every
  // other emoji picker presents and the only one that reads as "correct".
  emoji.sort((a, b) => a.g - b.g);

  const payload = {
    version: SCHEMA_VERSION,
    source: `emojibase-data@${require('emojibase-data/package.json').version}`,
    maxEmojiVersion: MAX_EMOJI_VERSION,
    groups,
    emoji,
  };

  // One line per emoji record: the file is committed, and a 2000-line diff is
  // reviewable in a way a single 250 kB line is not.
  const body = [
    '{',
    `  "version": ${JSON.stringify(payload.version)},`,
    `  "source": ${JSON.stringify(payload.source)},`,
    `  "maxEmojiVersion": ${JSON.stringify(payload.maxEmojiVersion)},`,
    '  "groups": [',
    groups.map((group) => `    ${JSON.stringify(group)}`).join(',\n'),
    '  ],',
    '  "emoji": [',
    emoji.map((entry) => `    ${JSON.stringify(entry)}`).join(',\n'),
    '  ]',
    '}',
    '',
  ].join('\n');

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, body, 'utf8');

  const kb = (Buffer.byteLength(body, 'utf8') / 1024).toFixed(1);
  console.log(
    `emoji.json: ${emoji.length} emoji in ${groups.length} groups, ${kb} kB ` +
      `(${skippedTooNew} skipped as newer than Emoji ${MAX_EMOJI_VERSION})`,
  );
}

await main();
