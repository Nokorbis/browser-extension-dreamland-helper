<script lang="ts">
  import { i18n } from '#i18n';
  import {
    loadPresetStore,
    savePresetStore,
    watchPresetStore,
    buildPresetTree,
    emptyPresetStore,
    newId,
    addFolder,
    addPreset,
    updateFolder,
    updatePreset,
    deleteFolder,
    deletePreset,
    moveFolder,
    movePreset,
    isDescendantFolder,
    countPresets,
    type PresetStore,
  } from '@/lib/presets';
  import {
    renderPreset,
    SELECTION_TOKEN,
    CURSOR_TOKEN,
    FILTERS,
    type TemplateWarning,
  } from '@/features/bbcode-presets/template';
  import FolderTree from '@/features/bbcode-presets/FolderTree.svelte';
  import { error } from '@/lib/log';
  // Global (unscoped) — the --dlh-* variables FolderTree reads. This is an
  // extension page, so the theme follows the OS preference (see below), unlike
  // the in-page surfaces which follow the forum's own theme.
  import '@/features/bbcode-presets/palette.css';

  let store = $state<PresetStore>(emptyPresetStore());
  let selectedKind = $state<'folder' | 'preset' | null>(null);
  let selectedId = $state<string | null>(null);
  let justSaved = $state(false);
  let saveError = $state(false);
  /** True while our own debounced write is in flight, so we ignore its echo. */
  let writing = false;

  void loadPresetStore().then((loaded) => {
    store = loaded;
  });

  // Another context (a forum tab, the popup) could change the library while this
  // page is open. Ignore the echo of our own writes.
  watchPresetStore((next) => {
    if (!writing) store = next;
  });

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let savedTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Apply a mutation and persist it, debounced.
   *
   * There is no Save button on purpose: this is a local editor with no server
   * round-trip, so an explicit save would be pure friction. `justSaved` drives a
   * quiet confirmation instead.
   */
  function commit(next: PresetStore) {
    store = next;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      writing = true;
      // Report the outcome rather than assuming it. An earlier version chained
      // `.finally()`, which does not catch — a rejected write (Firefox refusing
      // to clone a `$state` proxy) surfaced as "Enregistré" while nothing had
      // been persisted. Never claim a save that has not resolved.
      void savePresetStore(store).then(
        () => {
          writing = false;
          saveError = false;
          justSaved = true;
          clearTimeout(savedTimer);
          savedTimer = setTimeout(() => {
            justSaved = false;
          }, 1600);
        },
        (err: unknown) => {
          writing = false;
          justSaved = false;
          saveError = true;
          error('failed to save presets', err);
        },
      );
    }, 300);
  }

  const tree = $derived(buildPresetTree(store));
  const selectedPreset = $derived(
    selectedKind === 'preset' && selectedId !== null
      ? (store.presets[selectedId] ?? null)
      : null,
  );
  const selectedFolder = $derived(
    selectedKind === 'folder' && selectedId !== null
      ? (store.folders[selectedId] ?? null)
      : null,
  );

  /** Where a "new…" button should put things: the current folder context. */
  const targetFolderId = $derived.by(() => {
    if (selectedFolder !== null) return selectedFolder.id;
    if (selectedPreset !== null) return selectedPreset.folderId;
    return null;
  });

  function select(kind: 'folder' | 'preset', id: string) {
    selectedKind = kind;
    selectedId = id;
  }

  function createFolder() {
    const id = newId();
    commit(
      addFolder(store, {
        id,
        name: i18n.t('features.bbcodePresets.editor.untitledFolder'),
        parentId: targetFolderId,
      }),
    );
    select('folder', id);
  }

  function createPreset() {
    const id = newId();
    commit(
      addPreset(store, {
        id,
        name: i18n.t('features.bbcodePresets.editor.untitledPreset'),
        folderId: targetFolderId,
      }),
    );
    select('preset', id);
  }

  function removeSelected() {
    if (selectedFolder !== null) {
      if (!confirm(i18n.t('features.bbcodePresets.editor.deleteFolderConfirm'))) return;
      commit(deleteFolder(store, selectedFolder.id));
    } else if (selectedPreset !== null) {
      if (!confirm(i18n.t('features.bbcodePresets.editor.deletePresetConfirm'))) return;
      commit(deletePreset(store, selectedPreset.id));
    }
    selectedKind = null;
    selectedId = null;
  }

  /**
   * Flat "Folder / Subfolder" options for the move dropdown, excluding anywhere
   * that would create a cycle when moving a folder.
   */
  const moveTargets = $derived.by(() => {
    const options: Array<{ id: string | null; label: string }> = [
      { id: null, label: i18n.t('features.bbcodePresets.editor.root') },
    ];
    const walk = (nodes: typeof tree.folders, prefix: string) => {
      for (const node of nodes) {
        const label = prefix
          ? `${prefix} / ${node.folder.name}`
          : node.folder.name;
        const forbidden =
          selectedFolder !== null &&
          (node.folder.id === selectedFolder.id ||
            isDescendantFolder(store, node.folder.id, selectedFolder.id));
        if (!forbidden) options.push({ id: node.folder.id, label });
        walk(node.folders, label);
      }
    };
    walk(tree.folders, '');
    return options;
  });

  function moveSelected(destination: string | null) {
    if (selectedFolder !== null) {
      commit(moveFolder(store, selectedFolder.id, destination, Number.MAX_SAFE_INTEGER));
    } else if (selectedPreset !== null) {
      commit(movePreset(store, selectedPreset.id, destination, Number.MAX_SAFE_INTEGER));
    }
  }

  // --- live preview -------------------------------------------------------
  const preview = $derived(
    selectedPreset === null
      ? null
      : renderPreset({
          body: selectedPreset.body,
          selection: i18n.t('features.bbcodePresets.editor.previewSample'),
        }),
  );

  function warningText(warning: TemplateWarning): string {
    return warning.kind === 'unknownFilter'
      ? i18n.t('features.bbcodePresets.editor.warningUnknownFilter', {
          filter: warning.filter,
        })
      : i18n.t('features.bbcodePresets.editor.warningDuplicateCursor', {
          cur: CURSOR_TOKEN,
        });
  }

  /** The caret position, shown in the preview as a visible marker. */
  const previewWithCaret = $derived.by(() => {
    if (preview === null) return null;
    return {
      before: preview.text.slice(0, preview.caretOffset),
      after: preview.text.slice(preview.caretOffset),
    };
  });
</script>

<main>
  <header>
    <h1>{i18n.t('features.bbcodePresets.editor.heading')}</h1>
    <p class="intro">{i18n.t('features.bbcodePresets.editor.intro')}</p>
  </header>

  <div class="panes">
    <aside class="tree-pane">
      <div class="toolbar">
        <button type="button" onclick={createFolder}>
          {i18n.t('features.bbcodePresets.editor.addFolder')}
        </button>
        <button type="button" class="primary" onclick={createPreset}>
          {i18n.t('features.bbcodePresets.editor.addPreset')}
        </button>
      </div>

      {#if countPresets(store) === 0 && tree.folders.length === 0}
        <p class="muted">{i18n.t('features.bbcodePresets.editor.empty')}</p>
      {:else}
        <FolderTree
          folders={tree.folders}
          presets={tree.presets}
          {selectedId}
          onselect={select}
        />
      {/if}
    </aside>

    <section class="edit-pane">
      {#if selectedFolder !== null}
        <label class="field">
          <span>{i18n.t('features.bbcodePresets.editor.nameLabel')}</span>
          <input
            type="text"
            value={selectedFolder.name}
            oninput={(e) =>
              commit(
                updateFolder(store, selectedFolder.id, {
                  name: e.currentTarget.value,
                }),
              )}
          />
        </label>

        <label class="field">
          <span>{i18n.t('features.bbcodePresets.editor.moveLabel')}</span>
          <select
            value={selectedFolder.parentId ?? ''}
            onchange={(e) => moveSelected(e.currentTarget.value || null)}
          >
            {#each moveTargets as target (target.id ?? 'root')}
              <option value={target.id ?? ''}>{target.label}</option>
            {/each}
          </select>
        </label>

        <button type="button" class="danger" onclick={removeSelected}>
          {i18n.t('features.bbcodePresets.editor.delete')}
        </button>
      {:else if selectedPreset !== null}
        <label class="field">
          <span>{i18n.t('features.bbcodePresets.editor.nameLabel')}</span>
          <input
            type="text"
            value={selectedPreset.name}
            oninput={(e) =>
              commit(
                updatePreset(store, selectedPreset.id, {
                  name: e.currentTarget.value,
                }),
              )}
          />
        </label>

        <label class="field">
          <span>{i18n.t('features.bbcodePresets.editor.moveLabel')}</span>
          <select
            value={selectedPreset.folderId ?? ''}
            onchange={(e) => moveSelected(e.currentTarget.value || null)}
          >
            {#each moveTargets as target (target.id ?? 'root')}
              <option value={target.id ?? ''}>{target.label}</option>
            {/each}
          </select>
        </label>

        <label class="field">
          <span>{i18n.t('features.bbcodePresets.editor.bodyLabel')}</span>
          <textarea
            rows="8"
            spellcheck="false"
            value={selectedPreset.body}
            oninput={(e) =>
              commit(
                updatePreset(store, selectedPreset.id, {
                  body: e.currentTarget.value,
                }),
              )}
          ></textarea>
        </label>

        <p class="help">
          {i18n.t('features.bbcodePresets.editor.syntaxHelp', {
            sel: SELECTION_TOKEN,
            cur: CURSOR_TOKEN,
          })}
        </p>
        <p class="help">
          {i18n.t('features.bbcodePresets.editor.filtersHelp', {
            filters: FILTERS.join(', '),
            example: `[b]${SELECTION_TOKEN.slice(0, -1)}|upper}[/b]`,
          })}
        </p>

        {#if previewWithCaret !== null}
          <div class="field">
            <span>{i18n.t('features.bbcodePresets.editor.previewLabel')}</span>
            <pre class="preview">{previewWithCaret.before}<span
                class="caret"
                aria-hidden="true"></span>{previewWithCaret.after}</pre>
          </div>
        {/if}

        {#if preview !== null && preview.warnings.length > 0}
          <div class="warnings">
            <strong>{i18n.t('features.bbcodePresets.editor.warningsLabel')}</strong>
            <ul>
              {#each preview.warnings as warning, index (index)}
                <li>{warningText(warning)}</li>
              {/each}
            </ul>
          </div>
        {/if}

        <button type="button" class="danger" onclick={removeSelected}>
          {i18n.t('features.bbcodePresets.editor.delete')}
        </button>
      {:else}
        <p class="muted">{i18n.t('features.bbcodePresets.editor.noSelection')}</p>
      {/if}
    </section>
  </div>

  <p
    class="saved"
    class:visible={justSaved || saveError}
    class:failed={saveError}
    aria-live="polite"
  >
    {saveError
      ? i18n.t('features.bbcodePresets.editor.saveFailed')
      : i18n.t('features.bbcodePresets.editor.saved')}
  </p>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, sans-serif;
    color: var(--dlh-fg);
    background: var(--dlh-surface);
  }

  main {
    max-width: 60rem;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 3rem;
  }

  h1 {
    margin: 0 0 0.25rem;
    font-size: 1.35rem;
  }
  .intro {
    margin: 0 0 1.25rem;
    color: var(--dlh-muted);
    font-size: 0.9rem;
  }

  .panes {
    display: grid;
    grid-template-columns: minmax(12rem, 18rem) 1fr;
    gap: 1.25rem;
    align-items: start;
  }
  /* Single column once there isn't room for two usable panes. */
  @media (max-width: 46rem) {
    .panes {
      grid-template-columns: 1fr;
    }
  }

  .tree-pane {
    padding: 0.6rem;
    border: 1px solid var(--dlh-border);
    border-radius: 0.6rem;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 0.6rem;
  }

  button {
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--dlh-border);
    border-radius: 0.4rem;
    background: var(--dlh-surface-alt);
    color: inherit;
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  button:hover {
    background: var(--dlh-hover);
  }
  button.primary {
    border-color: var(--dlh-accent);
    background: var(--dlh-accent);
    color: #fff;
  }
  button.primary:hover {
    background: #2860d6;
  }
  button.danger {
    align-self: flex-start;
    border-color: #d0b3b3;
    color: #a12626;
  }
  button.danger:hover {
    background: #fbeaea;
  }

  .edit-pane {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    min-width: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.85rem;
  }
  .field > span {
    font-weight: 600;
  }

  input,
  select,
  textarea {
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--dlh-border);
    border-radius: 0.4rem;
    background: var(--dlh-surface);
    color: inherit;
    font: inherit;
    font-size: 0.9rem;
  }
  textarea {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85rem;
    resize: vertical;
  }

  .help {
    margin: 0;
    color: var(--dlh-muted);
    font-size: 0.8rem;
  }

  .preview {
    margin: 0;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--dlh-border);
    border-radius: 0.4rem;
    background: var(--dlh-surface-alt);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85rem;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-x: auto;
  }
  /* Where the caret lands after insertion. */
  .caret {
    display: inline-block;
    width: 2px;
    height: 1.05em;
    margin: 0 -1px;
    background: var(--dlh-accent);
    vertical-align: text-bottom;
  }

  .warnings {
    padding: 0.5rem 0.7rem;
    border: 1px solid #e6cf9a;
    border-radius: 0.4rem;
    background: #fdf6e6;
    font-size: 0.82rem;
  }
  .warnings ul {
    margin: 0.3rem 0 0;
    padding-left: 1.1rem;
  }

  .muted {
    margin: 0;
    color: var(--dlh-muted);
    font-size: 0.85rem;
  }

  .saved {
    margin: 1rem 0 0;
    color: #2c7a45;
    font-size: 0.8rem;
    opacity: 0;
    transition: opacity 150ms ease;
  }
  .saved.visible {
    opacity: 1;
  }
  .saved.failed {
    color: #a12626;
    font-weight: 600;
  }

  /*
   * Only what the shared palette does not already cover. Surfaces, borders,
   * text and hovers all come from --dlh-* (see palette.css), which flips itself
   * via .dlh-theme-auto — so this block holds just the page chrome and the two
   * semantic colours (danger, warning) that are local to this editor.
   */
  @media (prefers-color-scheme: dark) {
    :global(body) {
      color: var(--dlh-fg);
      background: #1c1f26;
    }
    input,
    select,
    textarea {
      background: #1c1f26;
    }
    button.danger {
      border-color: #5c3a3a;
      color: #ef9a9a;
    }
    button.danger:hover {
      background: #3a2626;
    }
    .warnings {
      border-color: #5c4a26;
      background: #2e2718;
    }
    .saved {
      color: #7ec99a;
    }
  }
</style>
