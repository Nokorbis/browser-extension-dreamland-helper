/**
 * Export/import bundle: settings plus the BBCode preset library, as a single
 * portable JSON file. Highlights are deliberately out of scope — see
 * docs/adr/0021-json-export-import.md.
 *
 * Both `Settings` and `PresetStore` already repair themselves on read
 * (docs/adr/0012-feature-owned-data-stores.md), so parsing an imported file
 * reuses the exact same `normalize…` functions a `storage.local` read already
 * goes through: a hand-edited or partially corrupt file is repaired rather
 * than rejected.
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
import { normalizeSettings, type Settings } from '@/lib/storage';
import { isRecord } from '@/lib/store-kit';

/** Bump only when the envelope shape changes incompatibly. */
export const BACKUP_FORMAT_VERSION = 1;

export interface ExportBundleV1 {
  formatVersion: 1;
  exportedAt: string;
  settings: Settings;
  presets: PresetStore;
}

export function buildExportBundle(
  settings: Settings,
  presets: PresetStore,
  exportedAt: string,
): ExportBundleV1 {
  return { formatVersion: BACKUP_FORMAT_VERSION, exportedAt, settings, presets };
}

export interface ParsedImportBundle {
  ok: true;
  /** `null` means the file had no `settings` field — leave the store untouched. */
  settings: Settings | null;
  /** `null` means the file had no `presets` field — leave the store untouched. */
  presets: PresetStore | null;
}

export interface InvalidImportBundle {
  ok: false;
}

/**
 * Parse an imported file's text. Never throws.
 *
 * A field that is simply *absent* from the file comes back `null` rather than
 * being coerced into an empty store — coercing would silently wipe whatever
 * the user already has. A field that is *present but malformed* is still
 * repaired through the same normalize pass a corrupt `storage.local` payload
 * would go through, so a hand-edited file degrades gracefully instead of
 * being rejected outright.
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

  // Only reject a *newer* format we don't understand yet. A missing or older
  // formatVersion is still worth a best-effort read — mirrors how the preset
  // store treats a missing `version` as 0 rather than refusing to load.
  if (typeof raw.formatVersion === 'number' && raw.formatVersion > BACKUP_FORMAT_VERSION) {
    return { ok: false };
  }

  return {
    ok: true,
    settings: raw.settings === undefined ? null : normalizeSettings(raw.settings),
    presets: raw.presets === undefined ? null : normalizePresetStore(raw.presets),
  };
}

// ---------------------------------------------------------------------------
// Preset diff / selective import
// ---------------------------------------------------------------------------

export type PresetImportStatus = 'new' | 'identical' | 'conflict';

/**
 * The identity a preset is matched on across two stores: its folder path plus
 * its name. `JSON.stringify` of the segment array rather than a joined string,
 * so a folder or preset named with the separator can't forge another's key.
 */
function matchKey(path: string[], name: string): string {
  return JSON.stringify([...path, name]);
}

/**
 * Index a store's presets by `matchKey`.
 *
 * Two same-named siblings collapse to one entry (last wins) — nothing forbids
 * duplicate names, and path+name is the only identity available here. See the
 * duplicate-name consequence in docs/adr/0021-json-export-import.md.
 */
function indexByPath(store: PresetStore): Map<string, Preset> {
  const byKey = new Map<string, Preset>();
  for (const preset of Object.values(store.presets)) {
    byKey.set(matchKey(folderPath(store, preset.folderId), preset.name), preset);
  }
  return byKey;
}

/**
 * Classify every preset in `imported` against `current`, matched by folder
 * path + name — never by id, since an imported store mints its ids
 * independently of the current one.
 */
export function diffImportedPresets(
  current: PresetStore,
  imported: PresetStore,
): Map<string, PresetImportStatus> {
  const currentByKey = indexByPath(current);

  const statuses = new Map<string, PresetImportStatus>();
  for (const preset of Object.values(imported.presets)) {
    const existing = currentByKey.get(matchKey(folderPath(imported, preset.folderId), preset.name));
    if (existing === undefined) statuses.set(preset.id, 'new');
    else statuses.set(preset.id, existing.body === preset.body ? 'identical' : 'conflict');
  }
  return statuses;
}

/**
 * Fold the selected imported presets into `current`, creating whatever
 * folder chain each one needs — de-duplicated by path, so a shared parent is
 * only ever created once — and overwriting an existing `identical`/`conflict`
 * match's body in place rather than duplicating it. Presets that aren't
 * selected, and folders with nothing selected under them, are left alone.
 * Pure: `store → store`.
 */
export function applyPresetImport(
  current: PresetStore,
  imported: PresetStore,
  selectedImportedPresetIds: ReadonlySet<string>,
): PresetStore {
  let next = current;

  // (folder path + name) -> the current preset holding it. Built once and kept
  // up to date incrementally: adding a preset changes no *other* preset's key,
  // so one `set` is all a rebuild would achieve. Keeping it current is what
  // lets a later selection in the same call land on one added moments ago
  // instead of duplicating it.
  const currentByKey = indexByPath(next);

  // Imported folder id -> resolved/created current folder id.
  const resolvedFolderId = new Map<string | null, string | null>([[null, null]]);

  function resolveFolder(importedFolderId: string | null): string | null {
    if (resolvedFolderId.has(importedFolderId)) {
      return resolvedFolderId.get(importedFolderId) ?? null;
    }
    // Claim the id before recursing. Every store that reaches here has been
    // through `normalizePresetStore`, which breaks parent cycles — but this is
    // an exported pure function, and its neighbours (`folderPath`,
    // `isDescendantFolder`) all guard defensively rather than trust that. A
    // cycle now resolves to the root instead of overflowing the stack.
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
