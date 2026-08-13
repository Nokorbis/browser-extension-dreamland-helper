/**
 * Export/import bundle: settings, the preset library and the emoji recents, as one portable
 * JSON file. Highlights are deliberately out of scope — see docs/adr/0021.
 *
 * Parsing an import reuses the same `normalize…` functions a `storage.local` read goes
 * through, so a hand-edited or partly corrupt file is repaired rather than rejected.
 */
import {
  addFolder,
  addPreset,
  folderPath,
  newId,
  normalizePresetStore,
  updatePreset,
  type Preset,
  type PresetStore,
} from '@/lib/presets';
import { normalizeEmojiPrefs, type EmojiPrefs } from '@/lib/emoji-recents';
import { normalizeSettings, type Settings } from '@/lib/storage';
import { isRecord } from '@/lib/store-kit';

/**
 * Bump only when the envelope changes *incompatibly*. `emoji` was added after v1 and did not
 * bump it: an added optional field reads fine in both directions, and bumping would have
 * made every new export unreadable by an installed older version for no gain.
 */
export const BACKUP_FORMAT_VERSION = 1;

export interface ExportBundleV1 {
  formatVersion: 1;
  exportedAt: string;
  settings: Settings;
  presets: PresetStore;
  emoji?: EmojiPrefs;
}

export function buildExportBundle(
  settings: Settings,
  presets: PresetStore,
  emoji: EmojiPrefs,
  exportedAt: string,
): ExportBundleV1 {
  return { formatVersion: BACKUP_FORMAT_VERSION, exportedAt, settings, presets, emoji };
}

export interface ParsedImportBundle {
  ok: true;
  /** `null` means the file had no `settings` field — leave the store untouched. */
  settings: Settings | null;
  /** `null` means the file had no `presets` field — leave the store untouched. */
  presets: PresetStore | null;
  /** `null` means the file had no `emoji` field — leave the store untouched. */
  emoji: EmojiPrefs | null;
}

export interface InvalidImportBundle {
  ok: false;
}

/**
 * Never throws. An *absent* field comes back `null` rather than an empty store, since
 * coercing would silently wipe what the user already has; a *present but malformed* one is
 * repaired through the usual normalize pass.
 */
export function parseImportBundle(
  text: string,
): ParsedImportBundle | InvalidImportBundle {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  if (!isRecord(raw)) return { ok: false };

  // Only reject a *newer* format. A missing or older formatVersion is still worth
  // a best-effort read.
  if (
    typeof raw.formatVersion === 'number' &&
    raw.formatVersion > BACKUP_FORMAT_VERSION
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    settings: raw.settings === undefined ? null : normalizeSettings(raw.settings),
    presets: raw.presets === undefined ? null : normalizePresetStore(raw.presets),
    emoji: raw.emoji === undefined ? null : normalizeEmojiPrefs(raw.emoji),
  };
}

// ---------------------------------------------------------------------------
// Preset diff / selective import
// ---------------------------------------------------------------------------

export type PresetImportStatus = 'new' | 'identical' | 'conflict';

/**
 * A preset's identity across two stores: folder path plus name. `JSON.stringify` of the
 * segments rather than a joined string, so a name containing the separator can't forge
 * another's key.
 */
function matchKey(path: string[], name: string): string {
  return JSON.stringify([...path, name]);
}

/**
 * Two same-named siblings collapse to one entry, last wins — nothing forbids duplicate
 * names, and path+name is the only identity available here. See docs/adr/0021.
 */
function indexByPath(store: PresetStore): Map<string, Preset> {
  const byKey = new Map<string, Preset>();
  for (const preset of Object.values(store.presets)) {
    byKey.set(matchKey(folderPath(store, preset.folderId), preset.name), preset);
  }
  return byKey;
}

/**
 * Matched by folder path + name, never by id: an imported store minted its ids
 * independently of the current one.
 */
export function diffImportedPresets(
  current: PresetStore,
  imported: PresetStore,
): Map<string, PresetImportStatus> {
  const currentByKey = indexByPath(current);

  const statuses = new Map<string, PresetImportStatus>();
  for (const preset of Object.values(imported.presets)) {
    const existing = currentByKey.get(
      matchKey(folderPath(imported, preset.folderId), preset.name),
    );
    if (existing === undefined) statuses.set(preset.id, 'new');
    else
      statuses.set(preset.id, existing.body === preset.body ? 'identical' : 'conflict');
  }
  return statuses;
}

/**
 * Fold the selected imported presets into `current`, creating each one's folder chain
 * (de-duplicated by path, so a shared parent is created once) and overwriting an existing
 * match's body in place rather than duplicating it. Unselected presets, and folders with
 * nothing selected under them, are left alone.
 */
export function applyPresetImport(
  current: PresetStore,
  imported: PresetStore,
  selectedImportedPresetIds: ReadonlySet<string>,
): PresetStore {
  let next = current;

  // (folder path + name) -> the current preset holding it. Kept up to date incrementally so
  // a later selection in this same call lands on one added moments ago instead of
  // duplicating it; adding a preset changes no *other* preset's key, so one `set` suffices.
  const currentByKey = indexByPath(next);

  // Imported folder id -> resolved/created current folder id.
  const resolvedFolderId = new Map<string | null, string | null>([[null, null]]);

  function resolveFolder(importedFolderId: string | null): string | null {
    if (resolvedFolderId.has(importedFolderId)) {
      return resolvedFolderId.get(importedFolderId) ?? null;
    }
    // Claim the id before recursing, so a cycle resolves to the root instead of
    // overflowing the stack. `normalizePresetStore` breaks cycles, but this is an
    // exported pure function and its neighbours guard defensively rather than trust that.
    resolvedFolderId.set(importedFolderId, null);

    const importedFolder =
      importedFolderId !== null ? imported.folders[importedFolderId] : undefined;
    if (importedFolder === undefined) return null;

    const parentId = resolveFolder(importedFolder.parentId);
    // First match wins among same-named siblings — see `indexByPath`.
    const existing = Object.values(next.folders).find(
      (f) => f.parentId === parentId && f.name === importedFolder.name,
    );
    const currentId = existing !== undefined ? existing.id : newId();
    if (existing === undefined) {
      next = addFolder(next, { id: currentId, name: importedFolder.name, parentId });
    }
    resolvedFolderId.set(importedFolderId, currentId);
    return currentId;
  }

  for (const preset of Object.values(imported.presets)) {
    if (!selectedImportedPresetIds.has(preset.id)) continue;
    const folderId = resolveFolder(preset.folderId);
    const key = matchKey(folderPath(next, folderId), preset.name);
    const existing = currentByKey.get(key);
    if (existing !== undefined) {
      next = updatePreset(next, existing.id, { body: preset.body });
    } else {
      const id = newId();
      next = addPreset(next, { id, name: preset.name, body: preset.body, folderId });
      currentByKey.set(key, next.presets[id]);
    }
  }

  return next;
}
