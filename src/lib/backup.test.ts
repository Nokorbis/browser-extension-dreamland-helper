import { describe, it, expect } from 'vitest';
import {
  BACKUP_FORMAT_VERSION,
  buildExportBundle,
  parseImportBundle,
  diffImportedPresets,
  applyPresetImport,
} from './backup';
import {
  PRESETS_SCHEMA_VERSION,
  type PresetStore,
  type Folder,
  type Preset,
} from './presets';
import { EMOJI_SCHEMA_VERSION, emptyEmojiPrefs, type EmojiPrefs } from './emoji-recents';
import { DEFAULT_SETTINGS, type Settings } from './storage';

/**
 * The bundle's job is to never silently destroy what's already there. These
 * tests pin: a missing field means "leave it alone" (not "wipe it"), a
 * malformed-but-present field is repaired rather than rejected, and the
 * preset diff/merge matches by folder path + name — never by id, since an
 * imported store mints ids independently of the current one.
 */

const folder = (
  id: string,
  name: string,
  parentId: string | null = null,
  order = 0,
): Folder => ({ id, name, parentId, order });

const preset = (
  id: string,
  name: string,
  folderId: string | null = null,
  body = '',
  order = 0,
): Preset => ({ id, name, body, folderId, order });

const storeOf = (folders: Folder[], presets: Preset[] = []): PresetStore => ({
  version: PRESETS_SCHEMA_VERSION,
  folders: Object.fromEntries(folders.map((f) => [f.id, f])),
  presets: Object.fromEntries(presets.map((p) => [p.id, p])),
});

const settingsOf = (overrides: Record<string, boolean> = {}): Settings => ({
  features: { ...DEFAULT_SETTINGS.features, ...overrides },
});

const emojiOf = (recent: string[] = []): EmojiPrefs => ({
  version: EMOJI_SCHEMA_VERSION,
  recent,
});

describe('buildExportBundle', () => {
  it('assembles a bundle that parses back to the same stores', () => {
    const settings = settingsOf({ 'exit-guard': false });
    const presets = storeOf(
      [folder('f1', 'Perso')],
      [preset('p1', 'Intro', 'f1', 'Salut')],
    );
    const emoji = emojiOf(['😀', '❤️']);
    const bundle = buildExportBundle(
      settings,
      presets,
      emoji,
      '2026-08-11T00:00:00.000Z',
    );

    const parsed = parseImportBundle(JSON.stringify(bundle));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.settings).toEqual(settings);
    expect(parsed.presets).toEqual(presets);
    expect(parsed.emoji).toEqual(emoji);
  });
});

describe('parseImportBundle', () => {
  it.each([
    ['malformed JSON', '{not json'],
    ['a JSON array', '[]'],
    ['a JSON string', '"hi"'],
    ['a JSON number', '42'],
  ])('rejects %s', (_label, text) => {
    expect(parseImportBundle(text)).toEqual({ ok: false });
  });

  it('rejects a formatVersion newer than this build understands', () => {
    const text = JSON.stringify({ formatVersion: BACKUP_FORMAT_VERSION + 1 });
    expect(parseImportBundle(text)).toEqual({ ok: false });
  });

  it('accepts a missing formatVersion as a best-effort read', () => {
    const result = parseImportBundle(JSON.stringify({ settings: { features: {} } }));
    expect(result.ok).toBe(true);
  });

  it('returns null (not an empty store) for a field absent from the file', () => {
    const result = parseImportBundle(JSON.stringify({ formatVersion: 1 }));
    expect(result).toEqual({ ok: true, settings: null, presets: null, emoji: null });
  });

  it('reads a v1 file written before the emoji field existed', () => {
    // `emoji` was added without bumping formatVersion, so both directions have
    // to keep working: an older file has no emoji field, and reads as "leave
    // that store alone" rather than as a corrupt bundle.
    const result = parseImportBundle(
      JSON.stringify({
        formatVersion: 1,
        settings: { features: {} },
        presets: storeOf([]),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.emoji).toBeNull();
  });

  it('repairs a present-but-malformed emoji field instead of rejecting it', () => {
    const result = parseImportBundle(
      JSON.stringify({ formatVersion: 1, emoji: { recent: ['😀', 7, '😀'] } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.emoji).toEqual(emojiOf(['😀']));
  });

  it('resets a present-but-unusable emoji field to an empty list', () => {
    const result = parseImportBundle(JSON.stringify({ formatVersion: 1, emoji: 5 }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.emoji).toEqual(emptyEmojiPrefs());
  });

  it('repairs a present-but-malformed presets field instead of rejecting it', () => {
    const result = parseImportBundle(
      JSON.stringify({ formatVersion: 1, presets: { folders: 'nope', presets: {} } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.presets).toEqual(storeOf([]));
  });

  it('resets a present-but-unusable settings field to the defaults', () => {
    // Present means "the file has an opinion about settings", so it is repaired
    // like any other damaged payload rather than treated as absent. Only a
    // *missing* field leaves the current settings alone.
    const result = parseImportBundle(JSON.stringify({ formatVersion: 1, settings: 5 }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.settings).toEqual(settingsOf());
  });

  it('drops non-boolean feature entries from a present settings field', () => {
    const result = parseImportBundle(
      JSON.stringify({
        formatVersion: 1,
        settings: { features: { 'exit-guard': false, highlight: 'yes' } },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.settings).toEqual(settingsOf({ 'exit-guard': false }));
  });
});

describe('diffImportedPresets', () => {
  it('classifies a preset absent from the current store as new', () => {
    const current = storeOf([]);
    const imported = storeOf([], [preset('p1', 'Intro', null, 'Salut')]);
    expect(diffImportedPresets(current, imported)).toEqual(new Map([['p1', 'new']]));
  });

  it('classifies matching path + name + body as identical', () => {
    const current = storeOf(
      [folder('cf', 'Perso')],
      [preset('cp', 'Intro', 'cf', 'Salut')],
    );
    const imported = storeOf(
      [folder('if', 'Perso')],
      [preset('ip', 'Intro', 'if', 'Salut')],
    );
    expect(diffImportedPresets(current, imported)).toEqual(
      new Map([['ip', 'identical']]),
    );
  });

  it('classifies matching path + name with different body as conflict', () => {
    const current = storeOf(
      [folder('cf', 'Perso')],
      [preset('cp', 'Intro', 'cf', 'Salut')],
    );
    const imported = storeOf(
      [folder('if', 'Perso')],
      [preset('ip', 'Intro', 'if', 'Bonjour')],
    );
    expect(diffImportedPresets(current, imported)).toEqual(new Map([['ip', 'conflict']]));
  });

  it('matches by path and name, not by id', () => {
    // Same path + name, completely different ids on both sides.
    const current = storeOf(
      [folder('cf', 'Perso')],
      [preset('cp', 'Intro', 'cf', 'Salut')],
    );
    const imported = storeOf(
      [folder('zzz', 'Perso')],
      [preset('yyy', 'Intro', 'zzz', 'Salut')],
    );
    expect(diffImportedPresets(current, imported)).toEqual(
      new Map([['yyy', 'identical']]),
    );
  });

  it('treats different folder paths with the same name as unrelated', () => {
    const current = storeOf([folder('cf', 'A')], [preset('cp', 'Intro', 'cf', 'Salut')]);
    const imported = storeOf([folder('if', 'B')], [preset('ip', 'Intro', 'if', 'Salut')]);
    expect(diffImportedPresets(current, imported)).toEqual(new Map([['ip', 'new']]));
  });
});

describe('applyPresetImport', () => {
  it('adds a selected new preset at the root untouched otherwise', () => {
    const current = storeOf([]);
    const imported = storeOf([], [preset('p1', 'Intro', null, 'Salut')]);
    const next = applyPresetImport(current, imported, new Set(['p1']));
    expect(Object.values(next.presets)).toHaveLength(1);
    const added = Object.values(next.presets)[0];
    expect(added.name).toBe('Intro');
    expect(added.body).toBe('Salut');
    expect(added.folderId).toBeNull();
  });

  it('creates a missing folder chain once and files the preset inside it', () => {
    const current = storeOf([]);
    const imported = storeOf(
      [folder('if1', 'Perso'), folder('if2', 'Jean', 'if1')],
      [preset('p1', 'Intro', 'if2', 'Salut'), preset('p2', 'Outro', 'if2', 'Au revoir')],
    );
    const next = applyPresetImport(current, imported, new Set(['p1', 'p2']));

    expect(Object.values(next.folders)).toHaveLength(2);
    const persoFolder = Object.values(next.folders).find((f) => f.name === 'Perso');
    const jeanFolder = Object.values(next.folders).find((f) => f.name === 'Jean');
    expect(persoFolder?.parentId).toBeNull();
    expect(jeanFolder?.parentId).toBe(persoFolder?.id);
    expect(Object.values(next.presets).map((p) => p.folderId)).toEqual([
      jeanFolder?.id,
      jeanFolder?.id,
    ]);
  });

  it('overwrites a matched preset in place instead of duplicating it', () => {
    const current = storeOf(
      [folder('cf', 'Perso')],
      [preset('cp', 'Intro', 'cf', 'Salut', 0)],
    );
    const imported = storeOf(
      [folder('if', 'Perso')],
      [preset('ip', 'Intro', 'if', 'Bonjour')],
    );
    const next = applyPresetImport(current, imported, new Set(['ip']));

    expect(Object.keys(next.presets)).toEqual(['cp']);
    expect(next.presets['cp'].body).toBe('Bonjour');
    expect(Object.keys(next.folders)).toEqual(['cf']);
  });

  it('files a new preset into an existing folder rather than duplicating it', () => {
    const current = storeOf(
      [folder('cf', 'Perso')],
      [preset('cp', 'Intro', 'cf', 'Salut')],
    );
    const imported = storeOf(
      [folder('if', 'Perso')],
      [preset('ip', 'Outro', 'if', 'Au revoir')],
    );
    const next = applyPresetImport(current, imported, new Set(['ip']));

    expect(Object.keys(next.folders)).toEqual(['cf']);
    expect(
      Object.values(next.presets)
        .map((p) => p.name)
        .sort(),
    ).toEqual(['Intro', 'Outro']);
    expect(Object.values(next.presets).every((p) => p.folderId === 'cf')).toBe(true);
  });

  it('collapses two selected imports that share one path and name', () => {
    // The second one must see the first: it lands on the same path + name, so
    // it overwrites rather than adding a twin. Last one wins.
    const imported = storeOf(
      [],
      [preset('ip1', 'Intro', null, 'Salut'), preset('ip2', 'Intro', null, 'Bonjour')],
    );
    const next = applyPresetImport(storeOf([]), imported, new Set(['ip1', 'ip2']));

    expect(Object.values(next.presets)).toHaveLength(1);
    expect(Object.values(next.presets)[0].body).toBe('Bonjour');
  });

  it('leaves unselected presets and empty folders alone', () => {
    const current = storeOf(
      [folder('cf', 'Perso')],
      [preset('cp', 'Intro', 'cf', 'Salut')],
    );
    const imported = storeOf(
      [folder('if', 'Perso')],
      [
        preset('ip1', 'Intro', 'if', 'Bonjour'),
        preset('ip2', 'Outro', 'if', 'Au revoir'),
      ],
    );
    const next = applyPresetImport(current, imported, new Set());
    expect(next).toEqual(current);
  });
});

describe('parseImportBundle version gating', () => {
  it('accepts a bundle with no formatVersion at all', () => {
    // Mirrors how the preset store treats a missing `version` as 0 rather than
    // refusing to load: a best-effort read beats rejecting the user's own backup.
    const result = parseImportBundle(JSON.stringify({ settings: settingsOf() }));
    expect(result.ok).toBe(true);
  });

  it('rejects only a numerically newer format', () => {
    const newer = JSON.stringify({ formatVersion: BACKUP_FORMAT_VERSION + 1 });
    expect(parseImportBundle(newer).ok).toBe(false);
  });

  it('best-effort reads a formatVersion that is not a number', () => {
    // The guard is `typeof === 'number'` first, so a string "2" or a NaN falls through
    // to the lenient path. Pinning current behaviour: every field is normalised anyway,
    // so the worst case is a repaired store rather than a corrupt one.
    for (const formatVersion of ['2', NaN, null, {}]) {
      expect(parseImportBundle(JSON.stringify({ formatVersion })).ok).toBe(true);
    }
  });

  it('rejects text that is not JSON, and JSON that is not an object', () => {
    for (const text of ['', 'not json', '[]', '"a string"', '42', 'null']) {
      expect(parseImportBundle(text).ok).toBe(false);
    }
  });
});

describe('applyPresetImport defensive paths', () => {
  it('returns the current store untouched when nothing is selected', () => {
    const current = storeOf([folder('f', 'Perso')], [preset('p', 'Intro', 'f', 'Salut')]);
    const imported = storeOf(
      [folder('if', 'Autre')],
      [preset('ip', 'Outro', 'if', 'Bye')],
    );
    const result = applyPresetImport(current, imported, new Set());
    expect(result).toBe(current);
  });

  it('creates no folders for presets that were not selected', () => {
    const current = storeOf([]);
    const imported = storeOf(
      [folder('if', 'Perso')],
      [preset('ip', 'Intro', 'if', 'Salut')],
    );
    const result = applyPresetImport(current, imported, new Set());
    expect(Object.keys(result.folders)).toHaveLength(0);
  });

  it('survives a cycle in the imported folder chain', () => {
    // The branch most likely to stack-overflow in production, and the one carrying a
    // five-line comment justifying its existence. `parseImportBundle` normalises (which
    // breaks cycles), but this is an exported pure function that anything may call.
    const imported = storeOf(
      [folder('a', 'A', 'b'), folder('b', 'B', 'a')],
      [preset('p', 'Cri', 'a', 'Aaah')],
    );
    const result = applyPresetImport(storeOf([]), imported, new Set(['p']));
    expect(Object.values(result.presets)).toHaveLength(1);
    expect(Object.values(result.presets)[0].body).toBe('Aaah');
  });

  it('survives a self-parenting imported folder', () => {
    const imported = storeOf([folder('a', 'A', 'a')], [preset('p', 'Cri', 'a', 'Aaah')]);
    const result = applyPresetImport(storeOf([]), imported, new Set(['p']));
    expect(Object.values(result.presets)).toHaveLength(1);
  });

  it('roots a preset whose imported folder is missing entirely', () => {
    const imported = storeOf([], [preset('p', 'Cri', 'ghost', 'Aaah')]);
    const result = applyPresetImport(storeOf([]), imported, new Set(['p']));
    expect(Object.values(result.presets)[0].folderId).toBeNull();
  });
});
