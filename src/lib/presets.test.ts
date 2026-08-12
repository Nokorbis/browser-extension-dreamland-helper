import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  PRESETS_KEY,
  PRESETS_SCHEMA_VERSION,
  emptyPresetStore,
  normalizePresetStore,
  loadPresetStore,
  savePresetStore,
  watchPresetStore,
  buildPresetTree,
  countPresets,
  countFolders,
  isDescendantFolder,
  addFolder,
  addPreset,
  updateFolder,
  updatePreset,
  deleteFolder,
  deletePreset,
  moveFolder,
  movePreset,
  folderPath,
  toPlainStore,
  newId,
  type PresetStore,
  type Folder,
  type Preset,
} from './presets';

/**
 * The store's job is to never lose a preset. These tests pin the invariants
 * that guarantee it: links always resolve, cycles are always broken, sibling
 * order is always dense, and a mutation never mutates its input.
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
  order = 0,
  body = '',
): Preset => ({ id, name, body, folderId, order });

const storeOf = (folders: Folder[], presets: Preset[] = []): PresetStore => ({
  version: PRESETS_SCHEMA_VERSION,
  folders: Object.fromEntries(folders.map((f) => [f.id, f])),
  presets: Object.fromEntries(presets.map((p) => [p.id, p])),
});

describe('normalizePresetStore', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'nope'],
    ['an array', []],
    ['a number', 42],
  ])('returns an empty store for %s', (_label, raw) => {
    expect(normalizePresetStore(raw)).toEqual(emptyPresetStore());
  });

  it('stamps the current schema version', () => {
    expect(normalizePresetStore({ folders: {}, presets: {} }).version).toBe(
      PRESETS_SCHEMA_VERSION,
    );
  });

  it('drops entries that are not objects', () => {
    const result = normalizePresetStore({
      folders: { a: folder('a', 'Aramis'), bad: 'nope' },
      presets: { p: preset('p', 'Cri'), worse: null },
    });
    expect(Object.keys(result.folders)).toEqual(['a']);
    expect(Object.keys(result.presets)).toEqual(['p']);
  });

  it('fills in missing fields rather than dropping the record', () => {
    const result = normalizePresetStore({
      folders: {},
      presets: { p: { id: 'p' } },
    });
    expect(result.presets.p).toEqual({
      id: 'p',
      name: '',
      body: '',
      folderId: null,
      order: 0,
    });
  });

  it('reparents a folder whose parent no longer exists', () => {
    const result = normalizePresetStore(storeOf([folder('child', 'Dialogue', 'ghost')]));
    expect(result.folders.child.parentId).toBeNull();
  });

  it('reparents a preset whose folder no longer exists', () => {
    const result = normalizePresetStore(storeOf([], [preset('p', 'Cri', 'ghost')]));
    expect(result.presets.p.folderId).toBeNull();
  });

  it('breaks a two-folder cycle', () => {
    const result = normalizePresetStore(
      storeOf([folder('a', 'A', 'b'), folder('b', 'B', 'a')]),
    );
    const roots = Object.values(result.folders).filter((f) => f.parentId === null);
    expect(roots).toHaveLength(1);
    // Still reachable, still present — nothing was deleted to fix it.
    expect(Object.keys(result.folders).sort()).toEqual(['a', 'b']);
  });

  it('breaks a self-parenting folder', () => {
    const result = normalizePresetStore(storeOf([folder('a', 'A', 'a')]));
    expect(result.folders.a.parentId).toBeNull();
  });

  it('renumbers sparse sibling order to a dense 0..n-1', () => {
    const result = normalizePresetStore(
      storeOf([
        folder('a', 'A', null, 50),
        folder('b', 'B', null, 10),
        folder('c', 'C', null, 30),
      ]),
    );
    expect([
      result.folders.b.order,
      result.folders.c.order,
      result.folders.a.order,
    ]).toEqual([0, 1, 2]);
  });

  it('renumbers each sibling group independently', () => {
    const result = normalizePresetStore(
      storeOf([folder('root', 'Root', null, 7), folder('kid', 'Kid', 'root', 9)]),
    );
    expect(result.folders.root.order).toBe(0);
    expect(result.folders.kid.order).toBe(0);
  });

  it('breaks ties by name so ordering is stable', () => {
    const result = normalizePresetStore(
      storeOf([folder('z', 'Zoé', null, 0), folder('a', 'Aramis', null, 0)]),
    );
    expect(result.folders.a.order).toBe(0);
    expect(result.folders.z.order).toBe(1);
  });
});

describe('buildPresetTree', () => {
  it('nests folders and attaches presets at each level', () => {
    const tree = buildPresetTree(
      normalizePresetStore(
        storeOf(
          [
            folder('aramis', 'Aramis', null, 0),
            folder('dialogue', 'Dialogue', 'aramis', 0),
          ],
          [preset('cri', 'Cri', 'dialogue', 0), preset('libre', 'Libre', null, 0)],
        ),
      ),
    );

    expect(tree.folders).toHaveLength(1);
    expect(tree.presets.map((p) => p.id)).toEqual(['libre']);

    const aramis = tree.folders[0];
    expect(aramis.folder.name).toBe('Aramis');
    expect(aramis.folders[0].folder.name).toBe('Dialogue');
    expect(aramis.folders[0].presets.map((p) => p.id)).toEqual(['cri']);
  });

  it('sorts siblings by order', () => {
    const tree = buildPresetTree(
      storeOf([folder('b', 'B', null, 1), folder('a', 'A', null, 0)]),
    );
    expect(tree.folders.map((n) => n.folder.id)).toEqual(['a', 'b']);
  });

  it('returns an empty tree for an empty store', () => {
    expect(buildPresetTree(emptyPresetStore())).toEqual({
      folders: [],
      presets: [],
    });
  });
});

describe('isDescendantFolder', () => {
  const nested = storeOf([
    folder('a', 'A'),
    folder('b', 'B', 'a'),
    folder('c', 'C', 'b'),
    folder('other', 'Other'),
  ]);

  it('finds a direct child', () => {
    expect(isDescendantFolder(nested, 'b', 'a')).toBe(true);
  });

  it('finds a grandchild', () => {
    expect(isDescendantFolder(nested, 'c', 'a')).toBe(true);
  });

  it('rejects an unrelated folder', () => {
    expect(isDescendantFolder(nested, 'other', 'a')).toBe(false);
  });

  it('does not consider a folder its own descendant', () => {
    expect(isDescendantFolder(nested, 'a', 'a')).toBe(false);
  });
});

describe('mutations', () => {
  it('never mutates the store it was given', () => {
    const before = normalizePresetStore(
      storeOf([folder('a', 'A')], [preset('p', 'P', 'a')]),
    );
    const snapshot = structuredClone(before);

    addFolder(before, { id: 'new', name: 'New' });
    addPreset(before, { id: 'np', name: 'NP' });
    updateFolder(before, 'a', { name: 'Renamed' });
    updatePreset(before, 'p', { body: '[b]x[/b]' });
    moveFolder(before, 'a', null, 0);
    movePreset(before, 'p', null, 0);
    deletePreset(before, 'p');
    deleteFolder(before, 'a');

    expect(before).toEqual(snapshot);
  });

  it('appends a new folder after its siblings', () => {
    let store = emptyPresetStore();
    store = addFolder(store, { id: 'a', name: 'Aramis' });
    store = addFolder(store, { id: 'l', name: 'Lyra' });
    expect(store.folders.a.order).toBe(0);
    expect(store.folders.l.order).toBe(1);
  });

  it('roots a new folder whose requested parent does not exist', () => {
    const store = addFolder(emptyPresetStore(), {
      id: 'a',
      name: 'A',
      parentId: 'ghost',
    });
    expect(store.folders.a.parentId).toBeNull();
  });

  it('defaults a new preset body to empty', () => {
    const store = addPreset(emptyPresetStore(), { id: 'p', name: 'Cri' });
    expect(store.presets.p.body).toBe('');
  });

  it('updates only the patched fields', () => {
    const before = addPreset(emptyPresetStore(), {
      id: 'p',
      name: 'Cri',
      body: '[b]{SELECTION}[/b]',
    });
    const after = updatePreset(before, 'p', { name: 'Hurlement' });
    expect(after.presets.p).toMatchObject({
      name: 'Hurlement',
      body: '[b]{SELECTION}[/b]',
    });
  });

  it('ignores an update to an unknown id', () => {
    const before = emptyPresetStore();
    expect(updatePreset(before, 'ghost', { name: 'x' })).toBe(before);
    expect(updateFolder(before, 'ghost', { name: 'x' })).toBe(before);
  });

  it('cascades a folder delete through descendants and their presets', () => {
    const store = normalizePresetStore(
      storeOf(
        [
          folder('aramis', 'Aramis'),
          folder('dialogue', 'Dialogue', 'aramis'),
          folder('lyra', 'Lyra'),
        ],
        [
          preset('cri', 'Cri', 'dialogue'),
          preset('autre', 'Autre', 'lyra'),
          preset('libre', 'Libre', null),
        ],
      ),
    );

    const after = deleteFolder(store, 'aramis');

    expect(Object.keys(after.folders).sort()).toEqual(['lyra']);
    expect(Object.keys(after.presets).sort()).toEqual(['autre', 'libre']);
  });

  it('closes the order gap left by a delete', () => {
    let store = emptyPresetStore();
    store = addPreset(store, { id: 'a', name: 'A' });
    store = addPreset(store, { id: 'b', name: 'B' });
    store = addPreset(store, { id: 'c', name: 'C' });
    store = deletePreset(store, 'b');
    expect([store.presets.a.order, store.presets.c.order]).toEqual([0, 1]);
  });

  it('reparents a folder on move', () => {
    const store = normalizePresetStore(storeOf([folder('a', 'A'), folder('b', 'B')]));
    const after = moveFolder(store, 'b', 'a', 0);
    expect(after.folders.b.parentId).toBe('a');
    expect(after.folders.b.order).toBe(0);
  });

  it('refuses a move that would put a folder inside its own descendant', () => {
    const store = normalizePresetStore(
      storeOf([folder('a', 'A'), folder('b', 'B', 'a')]),
    );
    // Dropping A into B would orphan the whole subtree from the root.
    expect(moveFolder(store, 'a', 'b', 0)).toBe(store);
  });

  it('refuses a move into itself', () => {
    const store = normalizePresetStore(storeOf([folder('a', 'A')]));
    expect(moveFolder(store, 'a', 'a', 0)).toBe(store);
  });

  it('refuses a move to an unknown parent', () => {
    const store = normalizePresetStore(storeOf([folder('a', 'A')]));
    expect(moveFolder(store, 'a', 'ghost', 0)).toBe(store);
  });

  it('inserts a moved preset at the requested index', () => {
    let store = emptyPresetStore();
    store = addPreset(store, { id: 'a', name: 'A' });
    store = addPreset(store, { id: 'b', name: 'B' });
    store = addPreset(store, { id: 'c', name: 'C' });

    // Move C to the front.
    store = movePreset(store, 'c', null, 0);

    const ordered = Object.values(store.presets)
      .sort((x, y) => x.order - y.order)
      .map((p) => p.id);
    expect(ordered).toEqual(['c', 'a', 'b']);
  });

  it('keeps sibling order dense after a move between folders', () => {
    let store = emptyPresetStore();
    store = addFolder(store, { id: 'f', name: 'F' });
    store = addPreset(store, { id: 'a', name: 'A' });
    store = addPreset(store, { id: 'b', name: 'B' });
    store = movePreset(store, 'a', 'f', 0);

    expect(store.presets.a).toMatchObject({ folderId: 'f', order: 0 });
    expect(store.presets.b).toMatchObject({ folderId: null, order: 0 });
  });
});

describe('counts', () => {
  it('counts folders and presets', () => {
    const store = normalizePresetStore(
      storeOf([folder('a', 'A'), folder('b', 'B')], [preset('p', 'P')]),
    );
    expect(countFolders(store)).toBe(2);
    expect(countPresets(store)).toBe(1);
  });
});

describe('newId', () => {
  it('produces distinct non-empty ids', () => {
    const ids = new Set(Array.from({ length: 50 }, newId));
    expect(ids.size).toBe(50);
    expect([...ids].every((id) => id.length > 0)).toBe(true);
  });
});

describe('toPlainStore', () => {
  it('produces a deep copy the caller cannot reach back into', () => {
    const original = normalizePresetStore(
      storeOf([folder('f', 'Aramis')], [preset('p', 'Cri', 'f')]),
    );
    const plain = toPlainStore(original);

    plain.folders.f.name = 'changed';
    plain.presets.p.body = 'changed';

    expect(original.folders.f.name).toBe('Aramis');
    expect(original.presets.p.body).toBe('');
  });

  it('keeps only the declared fields', () => {
    const store = normalizePresetStore(storeOf([folder('f', 'F')]));
    (store.folders.f as unknown as Record<string, unknown>).stray = 'nope';

    expect(Object.keys(toPlainStore(store).folders.f).sort()).toEqual([
      'id',
      'name',
      'order',
      'parentId',
    ]);
  });

  it('survives structuredClone when the input is a Proxy', () => {
    // The regression this guards: a UI framework hands us proxied state (Svelte
    // 5's `$state` deep-proxies everything). Firefox structured-clones values on
    // their way into storage.local and a Proxy is not cloneable, so the write
    // throws DataCloneError — while Chrome, which serialises by reading
    // properties, persists it fine. That asymmetry made saving fail on Firefox
    // only. `toPlainStore` is what unwraps it.
    const proxied = new Proxy(
      normalizePresetStore(storeOf([folder('f', 'Aramis')], [preset('p', 'Cri', 'f')])),
      {},
    );

    expect(() => structuredClone(toPlainStore(proxied))).not.toThrow();
    expect(toPlainStore(proxied).folders.f.name).toBe('Aramis');
  });
});

describe('persistence', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('returns an empty store when nothing is stored yet', async () => {
    expect(await loadPresetStore()).toEqual(emptyPresetStore());
  });

  it('round-trips a store through storage', async () => {
    const store = addPreset(addFolder(emptyPresetStore(), { id: 'f', name: 'Aramis' }), {
      id: 'p',
      name: 'Cri',
      body: '[b]{SELECTION}[/b]',
      folderId: 'f',
    });
    await savePresetStore(store);
    expect(await loadPresetStore()).toEqual(store);
  });

  it('repairs damaged data on the way out of storage', async () => {
    await fakeBrowser.storage.local.set({
      [PRESETS_KEY]: storeOf([folder('orphan', 'Orphan', 'ghost')]),
    });
    const loaded = await loadPresetStore();
    expect(loaded.folders.orphan.parentId).toBeNull();
  });

  it('notifies watchers when the store changes', async () => {
    const seen: PresetStore[] = [];
    const unwatch = watchPresetStore((store) => seen.push(store));

    await savePresetStore(addFolder(emptyPresetStore(), { id: 'f', name: 'Aramis' }));

    expect(seen).toHaveLength(1);
    expect(seen[0].folders.f.name).toBe('Aramis');

    unwatch();
    await savePresetStore(addFolder(emptyPresetStore(), { id: 'g', name: 'Lyra' }));
    expect(seen).toHaveLength(1);
  });

  it('ignores changes to unrelated keys', async () => {
    const seen: PresetStore[] = [];
    watchPresetStore((store) => seen.push(store));
    await fakeBrowser.storage.local.set({ settings: { features: {} } });
    expect(seen).toHaveLength(0);
  });
});

/**
 * `folderPath` had no direct coverage despite being load-bearing for import matching:
 * `backup.ts` identifies a preset across two stores by its folder path plus its name, so
 * a wrong path here silently duplicates presets or overwrites the wrong one.
 */
describe('folderPath', () => {
  const tree = storeOf([
    folder('a', 'Aramis'),
    folder('b', 'Dialogue', 'a'),
    folder('c', 'Cris', 'b'),
  ]);

  it('is empty at the root', () => {
    expect(folderPath(tree, null)).toEqual([]);
  });

  it('names each ancestor, outermost first', () => {
    expect(folderPath(tree, 'c')).toEqual(['Aramis', 'Dialogue', 'Cris']);
  });

  it('is empty for a folder that is not there', () => {
    expect(folderPath(tree, 'ghost')).toEqual([]);
  });

  it('stops at a dangling parent instead of walking off the end', () => {
    const orphan = storeOf([folder('kid', 'Kid', 'ghost')]);
    expect(folderPath(orphan, 'kid')).toEqual(['Kid']);
  });

  it('terminates on a parent cycle', () => {
    // `normalizePresetStore` breaks cycles on read, but this is an exported pure
    // function and its neighbours all guard defensively rather than trust that.
    const cyclic = storeOf([folder('a', 'A', 'b'), folder('b', 'B', 'a')]);
    expect(folderPath(cyclic, 'a')).toEqual(['B', 'A']);
  });

  it('terminates on a folder that is its own parent', () => {
    const selfish = storeOf([folder('a', 'A', 'a')]);
    expect(folderPath(selfish, 'a')).toEqual(['A']);
  });
});
