import { describe, it, expect } from 'vitest';
import {
  BACKUP_FORMAT_VERSION,
  buildExportBundle,
  parseImportBundle,
  diffImportedPresets,
  applyPresetImport,
} from './backup';
import { PRESETS_SCHEMA_VERSION, type PresetStore, type Folder, type Preset } from './presets';
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

describe('buildExportBundle', () => {
  it('assembles a bundle that parses back to the same stores', () => {
    const settings = settingsOf({ 'exit-guard': false });
    const presets = storeOf([folder('f1', 'Perso')], [preset('p1', 'Intro', 'f1', 'Salut')]);
    const bundle = buildExportBundle(settings, presets, '2026-08-11T00:00:00.000Z');

    const parsed = parseImportBundle(JSON.stringify(bundle));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.settings).toEqual(settings);
    expect(parsed.presets).toEqual(presets);
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
    expect(result).toEqual({ ok: true, settings: null, presets: null });
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
    const current = storeOf([folder('cf', 'Perso')], [preset('cp', 'Intro', 'cf', 'Salut')]);
    const imported = storeOf([folder('if', 'Perso')], [preset('ip', 'Intro', 'if', 'Salut')]);
    expect(diffImportedPresets(current, imported)).toEqual(new Map([['ip', 'identical']]));
  });

  it('classifies matching path + name with different body as conflict', () => {
    const current = storeOf([folder('cf', 'Perso')], [preset('cp', 'Intro', 'cf', 'Salut')]);
    const imported = storeOf([folder('if', 'Perso')], [preset('ip', 'Intro', 'if', 'Bonjour')]);
    expect(diffImportedPresets(current, imported)).toEqual(new Map([['ip', 'conflict']]));
  });

  it('matches by path and name, not by id', () => {
    // Same path + name, completely different ids on both sides.
    const current = storeOf([folder('cf', 'Perso')], [preset('cp', 'Intro', 'cf', 'Salut')]);
    const imported = storeOf([folder('zzz', 'Perso')], [preset('yyy', 'Intro', 'zzz', 'Salut')]);
    expect(diffImportedPresets(current, imported)).toEqual(new Map([['yyy', 'identical']]));
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
      [
        preset('p1', 'Intro', 'if2', 'Salut'),
        preset('p2', 'Outro', 'if2', 'Au revoir'),
      ],
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
    const imported = storeOf([folder('if', 'Perso')], [preset('ip', 'Intro', 'if', 'Bonjour')]);
    const next = applyPresetImport(current, imported, new Set(['ip']));

    expect(Object.keys(next.presets)).toEqual(['cp']);
    expect(next.presets['cp'].body).toBe('Bonjour');
    expect(Object.keys(next.folders)).toEqual(['cf']);
  });

  it('files a new preset into an existing folder rather than duplicating it', () => {
    const current = storeOf([folder('cf', 'Perso')], [preset('cp', 'Intro', 'cf', 'Salut')]);
    const imported = storeOf([folder('if', 'Perso')], [preset('ip', 'Outro', 'if', 'Au revoir')]);
    const next = applyPresetImport(current, imported, new Set(['ip']));

    expect(Object.keys(next.folders)).toEqual(['cf']);
    expect(Object.values(next.presets).map((p) => p.name).sort()).toEqual(['Intro', 'Outro']);
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
