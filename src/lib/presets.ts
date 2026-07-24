/**
 * The BBCode preset library: folders, presets, and the tree they form.
 *
 * This is the first *data* a feature owns, as opposed to the on/off flags in
 * `@/lib/storage`. It lives under its own `browser.storage.local` key so the two
 * never contend, and carries its `version` **inside** the payload so a copy of
 * the object is self-describing — which is what will make an Export/Import JSON
 * button a small addition later. See docs/adr/0012-feature-owned-data-stores.md.
 *
 * The shape is deliberately **flat**: two id-keyed records linked by `parentId`
 * and `folderId`, not a nested JSON tree. Moving a folder is then a single field
 * write instead of a splice-and-reinsert across two subtrees, any node can be
 * addressed by id without a path, and a broken link degrades to "orphan shown at
 * the root" rather than an unparseable blob. `buildPresetTree` derives the tree
 * for rendering.
 *
 * Everything below `newId` is pure: the mutations take a store and return a new
 * one, so the options page can hold a store in `$state`, apply a mutation, and
 * persist the result — and so all of it is unit-testable without a browser.
 */
import { browser } from '#imports';
import { warn } from '@/lib/log';

/** Storage key. Separate from `settings` — see docs/adr/0012. */
export const PRESETS_KEY = 'bbcodePresets';

/** Bump only alongside a migration in `MIGRATIONS`. */
export const PRESETS_SCHEMA_VERSION = 1;

export interface Folder {
  id: string;
  name: string;
  /** Parent folder id; `null` means the folder sits at the root. */
  parentId: string | null;
  /** Sort key among siblings. Always `0..n-1` after normalization. */
  order: number;
}

export interface Preset {
  id: string;
  name: string;
  /** Raw BBCode, possibly containing `{SELECTION}` / `{CURSOR}` placeholders. */
  body: string;
  /** Owning folder id; `null` means the preset sits at the root. */
  folderId: string | null;
  /** Sort key among siblings. Always `0..n-1` after normalization. */
  order: number;
}

export interface PresetStore {
  version: number;
  folders: Record<string, Folder>;
  presets: Record<string, Preset>;
}

/** A fresh empty store. A factory, not a shared constant, so callers can't alias it. */
export function emptyPresetStore(): PresetStore {
  return { version: PRESETS_SCHEMA_VERSION, folders: {}, presets: {} };
}

/**
 * Mint an id for a new folder or preset.
 *
 * `crypto.randomUUID()` is gated on a secure context. Extension pages always
 * qualify, and in practice only the options page ever creates records, so the
 * fallback is insurance rather than a load-bearing path. It is not
 * cryptographically strong — irrelevant for a local record id.
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Version-to-version upgrades, keyed by the version being upgraded *from*.
 * Empty at v1; the plumbing exists so the first migration is a one-line change.
 */
const MIGRATIONS: Record<number, (store: PresetStore) => PresetStore> = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readOptionalId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readOrder(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Sort siblings by `order`, breaking ties by name so the result is stable. */
function bySiblingOrder<T extends { order: number; name: string }>(
  a: T,
  b: T,
): number {
  return a.order - b.order || a.name.localeCompare(b.name, 'fr');
}

function groupBy<T>(items: T[], key: (item: T) => string | null) {
  const groups = new Map<string | null, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = groups.get(k);
    if (bucket === undefined) groups.set(k, [item]);
    else bucket.push(item);
  }
  return groups;
}

/** Renumber every sibling group to a dense `0..n-1`. Mutates in place. */
function renumber(store: PresetStore): void {
  for (const [, siblings] of groupBy(
    Object.values(store.folders),
    (f) => f.parentId,
  )) {
    siblings.sort(bySiblingOrder).forEach((folder, index) => {
      folder.order = index;
    });
  }
  for (const [, siblings] of groupBy(
    Object.values(store.presets),
    (p) => p.folderId,
  )) {
    siblings.sort(bySiblingOrder).forEach((preset, index) => {
      preset.order = index;
    });
  }
}

/**
 * Parse and repair whatever is in storage.
 *
 * This runs on **every** load and every change notification, not only on a
 * version bump — it is what makes a hand-edited import, a half-applied write, or
 * a future bug survivable. Anything unrecoverable degrades to "shown at the
 * root" rather than throwing: a writer would far rather find a preset in the
 * wrong place than lose it.
 */
export function normalizePresetStore(raw: unknown): PresetStore {
  if (!isRecord(raw)) return emptyPresetStore();

  const store = emptyPresetStore();
  const repairs: string[] = [];

  // --- shape ---
  if (isRecord(raw.folders)) {
    for (const [id, value] of Object.entries(raw.folders)) {
      if (!isRecord(value)) continue;
      store.folders[id] = {
        id,
        name: readString(value.name),
        parentId: readOptionalId(value.parentId),
        order: readOrder(value.order),
      };
    }
  }
  if (isRecord(raw.presets)) {
    for (const [id, value] of Object.entries(raw.presets)) {
      if (!isRecord(value)) continue;
      store.presets[id] = {
        id,
        name: readString(value.name),
        body: readString(value.body),
        folderId: readOptionalId(value.folderId),
        order: readOrder(value.order),
      };
    }
  }

  // --- migrations ---
  let version = readOrder(raw.version);
  let migrated = store;
  while (version < PRESETS_SCHEMA_VERSION && MIGRATIONS[version]) {
    migrated = MIGRATIONS[version](migrated);
    version += 1;
  }
  migrated.version = PRESETS_SCHEMA_VERSION;

  // --- dangling links → root ---
  for (const folder of Object.values(migrated.folders)) {
    if (folder.parentId !== null && !migrated.folders[folder.parentId]) {
      folder.parentId = null;
      repairs.push(`folder "${folder.id}" had a missing parent`);
    }
  }
  for (const preset of Object.values(migrated.presets)) {
    if (preset.folderId !== null && !migrated.folders[preset.folderId]) {
      preset.folderId = null;
      repairs.push(`preset "${preset.id}" had a missing folder`);
    }
  }

  // --- cycles → broken at the point of revisit ---
  for (const folder of Object.values(migrated.folders)) {
    const seen = new Set<string>([folder.id]);
    let current = folder;
    while (current.parentId !== null) {
      const parent = migrated.folders[current.parentId];
      if (parent === undefined) break; // already handled above
      if (seen.has(parent.id)) {
        current.parentId = null;
        repairs.push(`folder "${current.id}" closed a parent cycle`);
        break;
      }
      seen.add(parent.id);
      current = parent;
    }
  }

  renumber(migrated);

  if (repairs.length > 0) {
    warn(`preset store repaired: ${repairs.join('; ')}`);
  }
  return migrated;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function loadPresetStore(): Promise<PresetStore> {
  const stored = (await browser.storage.local.get(PRESETS_KEY))[PRESETS_KEY];
  return normalizePresetStore(stored);
}

/**
 * Rebuild the store as plain objects holding only known fields.
 *
 * **This is what makes saving work on Firefox.** Callers routinely hand us a
 * store that a UI framework has wrapped — Svelte 5's `$state` deep-proxies every
 * object it holds — and a `Proxy` is *not* structured-cloneable. Firefox clones
 * the value on its way into `storage.local` and throws `DataCloneError`, while
 * Chrome serialises by reading properties and so never notices. The result is a
 * feature that silently persists nothing on one browser only.
 *
 * Rebuilding field by field also drops anything a caller bolted onto a record,
 * so what lands in storage always matches the declared shape.
 */
export function toPlainStore(store: PresetStore): PresetStore {
  const folders: Record<string, Folder> = {};
  for (const folder of Object.values(store.folders)) {
    folders[folder.id] = {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      order: folder.order,
    };
  }

  const presets: Record<string, Preset> = {};
  for (const preset of Object.values(store.presets)) {
    presets[preset.id] = {
      id: preset.id,
      name: preset.name,
      body: preset.body,
      folderId: preset.folderId,
      order: preset.order,
    };
  }

  return { version: store.version, folders, presets };
}

export async function savePresetStore(store: PresetStore): Promise<void> {
  await browser.storage.local.set({ [PRESETS_KEY]: toPlainStore(store) });
}

/**
 * Observe the store from any context — content script, popup, options page.
 * Returns an unsubscriber; wire it into the feature's cleanup.
 *
 * Uses the top-level `browser.storage.onChanged` filtered on the area rather
 * than `browser.storage.local.onChanged`, whose support is patchy on Firefox MV2.
 */
export function watchPresetStore(
  onChange: (store: PresetStore) => void,
): () => void {
  const listener = (
    changes: Record<string, { newValue?: unknown }>,
    areaName: string,
  ) => {
    if (areaName !== 'local') return;
    const change = changes[PRESETS_KEY];
    if (change === undefined) return;
    onChange(normalizePresetStore(change.newValue));
  };

  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

// ---------------------------------------------------------------------------
// Derived views (pure)
// ---------------------------------------------------------------------------

export interface PresetTreeNode {
  folder: Folder;
  folders: PresetTreeNode[];
  presets: Preset[];
}

/** The root level: folders and presets that have no parent. */
export interface PresetTree {
  folders: PresetTreeNode[];
  presets: Preset[];
}

/**
 * Derive the render tree. Subfolders sort before presets at every level.
 * Safe against runaway recursion because every store that reaches here has been
 * through `normalizePresetStore`, which breaks parent cycles.
 */
export function buildPresetTree(store: PresetStore): PresetTree {
  const foldersByParent = groupBy(
    Object.values(store.folders),
    (f) => f.parentId,
  );
  const presetsByFolder = groupBy(
    Object.values(store.presets),
    (p) => p.folderId,
  );

  const childrenOf = (parentId: string | null): PresetTreeNode[] =>
    (foldersByParent.get(parentId) ?? [])
      .slice()
      .sort(bySiblingOrder)
      .map((folder) => ({
        folder,
        folders: childrenOf(folder.id),
        presets: (presetsByFolder.get(folder.id) ?? [])
          .slice()
          .sort(bySiblingOrder),
      }));

  return {
    folders: childrenOf(null),
    presets: (presetsByFolder.get(null) ?? []).slice().sort(bySiblingOrder),
  };
}

export function countPresets(store: PresetStore): number {
  return Object.keys(store.presets).length;
}

export function countFolders(store: PresetStore): number {
  return Object.keys(store.folders).length;
}

/** True when `candidateId` sits anywhere beneath `ancestorId`. */
export function isDescendantFolder(
  store: PresetStore,
  candidateId: string,
  ancestorId: string,
): boolean {
  const seen = new Set<string>();
  let current = store.folders[candidateId];
  while (current !== undefined && current.parentId !== null) {
    if (current.parentId === ancestorId) return true;
    if (seen.has(current.parentId)) return false; // defensive: cycle
    seen.add(current.parentId);
    current = store.folders[current.parentId];
  }
  return false;
}

// ---------------------------------------------------------------------------
// Mutations (pure: store in, new store out)
// ---------------------------------------------------------------------------

function clone(store: PresetStore): PresetStore {
  return {
    version: store.version,
    folders: { ...store.folders },
    presets: { ...store.presets },
  };
}

/** Clone, renumber, return — the tail of every ordering-affecting mutation. */
function settled(store: PresetStore): PresetStore {
  const next = clone(store);
  // Entries whose `order` renumber touches must not be shared with the input.
  for (const [id, folder] of Object.entries(next.folders)) {
    next.folders[id] = { ...folder };
  }
  for (const [id, preset] of Object.entries(next.presets)) {
    next.presets[id] = { ...preset };
  }
  renumber(next);
  return next;
}

function lastOrder(orders: number[]): number {
  return orders.length === 0 ? 0 : Math.max(...orders) + 1;
}

/**
 * Callers mint the id themselves (via `newId`) and pass it in, so that these
 * functions stay deterministic — and so the options page can select the record
 * it just created without the mutation having to return two things.
 */
export function addFolder(
  store: PresetStore,
  folder: { id: string; name: string; parentId?: string | null },
): PresetStore {
  const parentId =
    folder.parentId != null && store.folders[folder.parentId]
      ? folder.parentId
      : null;
  const next = clone(store);
  next.folders[folder.id] = {
    id: folder.id,
    name: folder.name,
    parentId,
    order: lastOrder(
      Object.values(next.folders)
        .filter((f) => f.parentId === parentId)
        .map((f) => f.order),
    ),
  };
  return settled(next);
}

export function addPreset(
  store: PresetStore,
  preset: { id: string; name: string; body?: string; folderId?: string | null },
): PresetStore {
  const folderId =
    preset.folderId != null && store.folders[preset.folderId]
      ? preset.folderId
      : null;
  const next = clone(store);
  next.presets[preset.id] = {
    id: preset.id,
    name: preset.name,
    body: preset.body ?? '',
    folderId,
    order: lastOrder(
      Object.values(next.presets)
        .filter((p) => p.folderId === folderId)
        .map((p) => p.order),
    ),
  };
  return settled(next);
}

export function updateFolder(
  store: PresetStore,
  id: string,
  patch: Partial<Pick<Folder, 'name'>>,
): PresetStore {
  const folder = store.folders[id];
  if (folder === undefined) return store;
  const next = clone(store);
  next.folders[id] = { ...folder, ...patch };
  return next;
}

export function updatePreset(
  store: PresetStore,
  id: string,
  patch: Partial<Pick<Preset, 'name' | 'body'>>,
): PresetStore {
  const preset = store.presets[id];
  if (preset === undefined) return store;
  const next = clone(store);
  next.presets[id] = { ...preset, ...patch };
  return next;
}

/** Delete a folder, everything nested inside it, and every preset they hold. */
export function deleteFolder(store: PresetStore, id: string): PresetStore {
  if (store.folders[id] === undefined) return store;

  const doomed = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of Object.values(store.folders)) {
      if (
        folder.parentId !== null &&
        doomed.has(folder.parentId) &&
        !doomed.has(folder.id)
      ) {
        doomed.add(folder.id);
        grew = true;
      }
    }
  }

  const next = clone(store);
  for (const folderId of doomed) delete next.folders[folderId];
  for (const preset of Object.values(next.presets)) {
    if (preset.folderId !== null && doomed.has(preset.folderId)) {
      delete next.presets[preset.id];
    }
  }
  return settled(next);
}

export function deletePreset(store: PresetStore, id: string): PresetStore {
  if (store.presets[id] === undefined) return store;
  const next = clone(store);
  delete next.presets[id];
  return settled(next);
}

/**
 * Reparent and/or reposition a folder. `order` is the index it should occupy
 * among its new siblings.
 *
 * Returns the store **unchanged** when the move would create a cycle (dropping a
 * folder into its own descendant) or when either id is unknown — the caller's
 * drag simply doesn't take, which is the least surprising failure for a
 * direct-manipulation UI.
 */
export function moveFolder(
  store: PresetStore,
  id: string,
  parentId: string | null,
  order: number,
): PresetStore {
  const folder = store.folders[id];
  if (folder === undefined) return store;
  if (parentId !== null) {
    if (store.folders[parentId] === undefined) return store;
    if (parentId === id || isDescendantFolder(store, parentId, id)) return store;
  }

  const next = clone(store);
  // Slot it half a step ahead of the sibling currently at `order`; `settled`
  // renumbers the fraction away.
  next.folders[id] = { ...folder, parentId, order: order - 0.5 };
  return settled(next);
}

export function movePreset(
  store: PresetStore,
  id: string,
  folderId: string | null,
  order: number,
): PresetStore {
  const preset = store.presets[id];
  if (preset === undefined) return store;
  if (folderId !== null && store.folders[folderId] === undefined) return store;

  const next = clone(store);
  next.presets[id] = { ...preset, folderId, order: order - 0.5 };
  return settled(next);
}
