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
    toPlainStore,
    type PresetStore,
  } from '@/lib/presets';
  import {
    renderPreset,
    collectPrompts,
    promptToken,
    SELECTION_TOKEN,
    CURSOR_TOKEN,
    FILTERS,
    type TemplateWarning,
  } from '@/features/bbcode-presets/template';
  import FolderTree from '@/features/bbcode-presets/FolderTree.svelte';
  import { error } from '@/lib/log';

  /**
   * The options page's `#presets` section: the BBCode preset editor.
   *
   * Its own component, like `BackupSection`, so `App.svelte` is page chrome and a list
   * of sections rather than page chrome plus one large editor. The bulk of what lives
   * here is the save state machine in `commit` below, which is the subtle part.
   */

  let store = $state<PresetStore>(emptyPresetStore());
  let selectedKind = $state<'folder' | 'preset' | null>(null);
  let selectedId = $state<string | null>(null);
  let justSaved = $state(false);
  let saveError = $state(false);
  /**
   * Serialized snapshot of the last payload we wrote, used to recognise the echo
   * of our own save.
   *
   * Compared by *value* rather than tracked with an "is a write in flight" flag.
   * A flag has to be cleared somewhere, and clearing it when the write promise
   * resolves assumes `storage.onChanged` has already fired — an ordering neither
   * browser specifies. Whenever the echo arrived late it was applied, reverting
   * any keystroke typed during the round-trip and yanking the caret. Comparing
   * values has no such window, and self-heals if an echo never arrives at all.
   */
  let lastWritten: string | null = null;
  /**
   * Bumped by every `commit`. A queued confirmation only shows if it is still
   * the current one — see `commit` for why clearing the timer isn't enough.
   * A plain `let`, not `$state`: nothing renders from it.
   */
  let commitSeq = 0;

  void loadPresetStore().then((loaded) => {
    store = loaded;
  });

  // Another context (a forum tab, the popup) could change the library while this
  // page is open. Anything that isn't byte-identical to our own last write is a
  // genuine external change and wins.
  watchPresetStore((next) => {
    if (JSON.stringify(toPlainStore(next)) === lastWritten) return;
    store = next;
  });

  /** How long an edit may sit unpersisted. Kept short — this is the data path. */
  const SAVE_DEBOUNCE_MS = 300;
  /** How quiet the editor must go before we confirm. Purely cosmetic. */
  const CONFIRM_IDLE_MS = 900;
  /** How long the confirmation stays up once shown. */
  const CONFIRM_VISIBLE_MS = 1600;

  /** Coalesces edits into one write. */
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  /** Holds a successful write's confirmation back until typing settles. */
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;
  /** Takes the confirmation back down. */
  let savedTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Apply a mutation and persist it, debounced.
   *
   * There is no Save button on purpose: this is a local editor with no server
   * round-trip, so an explicit save would be pure friction. `justSaved` drives a
   * quiet confirmation instead.
   *
   * The write and the confirmation are debounced **separately**, on purpose.
   * Typing is full of 300 ms lulls, so confirming on every write made
   * "Enregistré" flash in on almost every keystroke. Slowing the write down to
   * match would have widened the window in which an edit is unsaved — the wrong
   * thing to trade for calm. So the write keeps its short debounce and the
   * confirmation waits for the editor to actually go quiet: one per burst.
   */
  function commit(next: PresetStore) {
    store = next;
    const seq = ++commitSeq;
    clearTimeout(saveTimer);
    // A fresh edit withdraws a confirmation that hasn't appeared yet. An
    // already-*visible* one is left alone: hiding and re-showing it would be
    // exactly the flicker this is here to remove.
    clearTimeout(confirmTimer);
    saveTimer = setTimeout(() => {
      // Recorded *before* the write, so the echo is recognised however early it
      // lands — including synchronously from within `set()`.
      lastWritten = JSON.stringify(toPlainStore(store));
      // Report the outcome rather than assuming it. An earlier version chained
      // `.finally()`, which does not catch — a rejected write (Firefox refusing
      // to clone a `$state` proxy) surfaced as "Enregistré" while nothing had
      // been persisted. Never claim a save that has not resolved.
      void savePresetStore(store).then(
        () => {
          // A fixed error stops showing at once; only the good news waits.
          saveError = false;
          confirmTimer = setTimeout(() => {
            // Clearing the timer above does not cover this on its own: a write
            // can resolve *after* a newer commit already cleared it, and would
            // then queue a confirmation from stale state. That newer commit's
            // own write is the one that gets to confirm.
            if (seq !== commitSeq) return;
            justSaved = true;
            clearTimeout(savedTimer);
            savedTimer = setTimeout(() => {
              justSaved = false;
            }, CONFIRM_VISIBLE_MS);
          }, CONFIRM_IDLE_MS);
        },
        (err: unknown) => {
          // Nothing landed in storage, so no echo is coming — drop the snapshot
          // rather than leaving it to swallow a later external change.
          lastWritten = null;
          justSaved = false;
          // An earlier write's queued confirmation must not land on top of the
          // failure a moment from now.
          clearTimeout(confirmTimer);
          saveError = true;
          error('failed to save presets', err);
        },
      );
    }, SAVE_DEBOUNCE_MS);
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
        const label = prefix ? `${prefix} / ${node.folder.name}` : node.folder.name;
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

  /**
   * The `{PROMPT:…}` spelling shown in the help text, built through
   * `promptToken` rather than written out — the same rule the other two tokens
   * follow, so the grammar has one home.
   */
  const promptSample = promptToken(i18n.t('features.bbcodePresets.editor.promptSampleLabel'));

  // --- live preview -------------------------------------------------------
  const preview = $derived(
    selectedPreset === null
      ? null
      : renderPreset({
          body: selectedPreset.body,
          selection: i18n.t('features.bbcodePresets.editor.previewSample'),
          // Prompts stand in for themselves rather than being asked here: the
          // preview is for checking the template's shape, not exercising it.
          // Filters still visibly apply to the stand-in, which is the point —
          // {PROMPT:humeur|upper} shows up shouted.
          answers: Object.fromEntries(
            collectPrompts(selectedPreset.body).map((label) => [
              label,
              i18n.t('features.bbcodePresets.editor.previewPromptSample', { label }),
            ]),
          ),
        }),
  );

  function warningText(warning: TemplateWarning): string {
    switch (warning.kind) {
      case 'unknownFilter':
        return i18n.t('features.bbcodePresets.editor.warningUnknownFilter', {
          filter: warning.filter,
        });
      case 'duplicateCursor':
        return i18n.t('features.bbcodePresets.editor.warningDuplicateCursor', {
          cur: CURSOR_TOKEN,
        });
      case 'emptyPromptLabel':
        return i18n.t('features.bbcodePresets.editor.warningEmptyPromptLabel', {
          prompt: promptToken(''),
        });
    }
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

<section id="presets">
  <h2>{i18n.t('features.bbcodePresets.editor.heading')}</h2>
  <p class="intro">{i18n.t('features.bbcodePresets.editor.intro')}</p>

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
              )}></textarea>
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
        <p class="help">
          {i18n.t('features.bbcodePresets.editor.promptHelp', {
            prompt: promptSample,
            example: `[i]${promptSample.slice(0, -1)}|title}[/i]`,
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

  <!--
    The message is rendered conditionally, not just faded with a class: a live
    region only announces when its *content* changes, so text that is always
    present is never read out — and sits in the accessibility tree at opacity 0
    the rest of the time, out of context. Empty when idle, filled on a result.
  -->
  <p
    class="saved"
    class:visible={justSaved || saveError}
    class:failed={saveError}
    role="status"
    aria-live="polite"
  >
    {#if saveError}
      {i18n.t('features.bbcodePresets.editor.saveFailed')}
    {:else if justSaved}
      {i18n.t('features.bbcodePresets.editor.saved')}
    {/if}
  </p>
</section>

<style>
  /* The section's own heading block, mirroring BackupSection — each section styles its
     own heading so App.svelte stays page chrome. */
  h2 {
    margin: 0 0 0.25rem;
    font-size: 1.1rem;
  }
  .intro {
    margin: 0 0 0.8rem;
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
    border: 1px solid var(--dlh-warn-border);
    border-radius: 0.4rem;
    background: var(--dlh-warn-bg);
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
    /* Empty when idle, so it would otherwise collapse to nothing and shift the
       page every time a message arrives. Reserve the line instead. */
    min-height: 1.2em;
    min-height: 1lh;
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
   * Only what the shared palette does not already cover. Surfaces, borders, text,
   * hovers and the warning amber all come from --dlh-* (see palette.css), which flips
   * itself via .dlh-theme-auto — so this block holds just `danger`, the one semantic
   * colour local to this editor, plus the two fields the palette does not reach.
   */
  @media (prefers-color-scheme: dark) {
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
    .saved {
      color: #7ec99a;
    }
  }
</style>
