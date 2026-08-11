<script lang="ts">
  /**
   * Export and import of settings + the BBCode preset library as one JSON file.
   * See docs/adr/0021-json-export-import.md. Highlights are out of scope.
   *
   * Both halves live here, on the options page, rather than in the popup. The
   * action popup closes the instant it loses focus, and a native
   * `<input type="file">` dialog is exactly the kind of window that takes it —
   * so anything waiting inside the popup for a `change` event never gets it.
   * Export alone *could* have stayed there (a download opens no dialog), but
   * splitting one feature across two surfaces was worse than the second click
   * it costs to get here; the popup's cog is now a plain link to this page.
   *
   * This section owns its own copies of both stores and persists them itself.
   * The preset editor in the section above is not consulted: it watches
   * `storage.local` for changes from any context, so a write from here reaches
   * it the same way a write from the popup would.
   */
  import { i18n } from '#i18n';
  import { loadSettings, saveSettings, watchSettings, type Settings } from '@/lib/storage';
  import {
    loadPresetStore,
    savePresetStore,
    watchPresetStore,
    emptyPresetStore,
    type PresetStore,
  } from '@/lib/presets';
  import { buildExportBundle, parseImportBundle, applyPresetImport } from '@/lib/backup';
  import { error } from '@/lib/log';
  import ImportModal from './ImportModal.svelte';

  // Both stores, loaded on mount and kept live. Staying subscribed matters:
  // this page is long-lived and the preset editor sitting right above can
  // change the library at any moment, so a one-shot snapshot taken at mount
  // would export a stale one.
  let settings = $state<Settings | null>(null);
  let presetStore = $state<PresetStore | null>(null);
  const ready = $derived(settings !== null && presetStore !== null);

  void loadPresetStore().then((loaded) => {
    presetStore = loaded;
  });
  watchPresetStore((next) => {
    presetStore = next;
  });
  void loadSettings().then((loaded) => {
    settings = loaded;
  });
  watchSettings((next) => {
    settings = next;
  });

  /** The single status line for this section. `null` clears it. */
  let message = $state<string | null>(null);
  let failed = $state(false);

  function report(text: string | null, isFailure = false) {
    message = text;
    failed = isFailure;
  }

  // --- export -------------------------------------------------------------

  function downloadJson(filename: string, text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    // Attached and revoked a tick late on purpose: Firefox has historically
    // wanted the anchor in the document, and revoking synchronously after
    // click() can cancel the download before it starts.
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function exportBundle() {
    if (settings === null || presetStore === null) return; // the button is disabled until then
    try {
      const now = new Date();
      const bundle = buildExportBundle(settings, presetStore, now.toISOString());
      downloadJson(
        `dreamland-reborn-qol-${now.toISOString().slice(0, 10)}.json`,
        JSON.stringify(bundle, null, 2),
      );
      // The file appearing is the confirmation; only a failure needs words.
      report(null);
    } catch (err) {
      report(i18n.t('options.backup.exportFailed'), true);
      error('failed to export backup', err);
    }
  }

  // --- import -------------------------------------------------------------

  let fileInput: HTMLInputElement | undefined = $state();
  let pendingImport: { settings: Settings | null; presets: PresetStore | null } | null =
    $state(null);

  function triggerImport() {
    fileInput?.click();
  }

  async function onFileSelected(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = ''; // so picking the same file again still fires `change`
    if (file === undefined) return;

    const parsed = parseImportBundle(await file.text());
    if (!parsed.ok) {
      report(i18n.t('options.backup.invalidFile'), true);
      return;
    }
    if (parsed.settings === null && parsed.presets === null) {
      report(i18n.t('options.backup.nothingToImport'), true);
      return;
    }
    report(null);
    pendingImport = parsed;
  }

  async function onImportConfirm(selection: {
    importSettings: boolean;
    selectedPresetIds: Set<string>;
  }) {
    const importing = pendingImport;
    pendingImport = null;
    if (importing === null) return;

    // What the user actually asked for, narrowed once so the writes below read
    // straight through.
    const presets = selection.selectedPresetIds.size > 0 ? importing.presets : null;
    const settings = selection.importSettings ? importing.settings : null;
    if (presets === null && settings === null) {
      report(i18n.t('options.backup.importNothingSelected'));
      return;
    }

    try {
      if (presets !== null) {
        // Re-read rather than folding into our watched copy: reviewing the
        // modal takes seconds, and this is the last moment before the write.
        const base = await loadPresetStore();
        await savePresetStore(applyPresetImport(base, presets, selection.selectedPresetIds));
      }
      if (settings !== null) {
        await saveSettings(settings);
      }
    } catch (err) {
      // Both writes are awaited, so a result is only ever announced for
      // something that resolved — never "Import terminé" over a pending write.
      report(i18n.t('options.backup.importFailed'), true);
      error('failed to import backup', err);
      return;
    }

    // Imported feature flags land in storage, but `bootFeatures` reads them
    // once at content-script boot — same caveat the popup's own hint carries.
    report(
      settings !== null
        ? i18n.t('options.backup.importDoneWithSettings')
        : i18n.t('options.backup.importDone'),
    );
  }
</script>

<section id="backup">
  <h2>{i18n.t('options.backup.heading')}</h2>
  <p class="intro">{i18n.t('options.backup.intro')}</p>

  <div class="toolbar">
    <button type="button" onclick={exportBundle} disabled={!ready}>
      {i18n.t('options.backup.exportButton')}
    </button>
    <button type="button" onclick={triggerImport}>
      {i18n.t('options.backup.importButton')}
    </button>
    <input
      type="file"
      accept=".json,application/json"
      class="visually-hidden"
      bind:this={fileInput}
      onchange={onFileSelected}
    />
  </div>

  <!--
    Rendered conditionally rather than merely faded: a live region only
    announces when its *content* changes, so text that is always present is
    never read out — and sits in the accessibility tree at opacity 0 the rest
    of the time. Same shape as the editor's own status line.
  -->
  <p class="status" class:visible={message !== null} class:failed role="status" aria-live="polite">
    {#if message !== null}{message}{/if}
  </p>
</section>

{#if pendingImport !== null}
  <ImportModal
    settingsPresent={pendingImport.settings !== null}
    importedPresets={pendingImport.presets}
    currentPresets={presetStore ?? emptyPresetStore()}
    onconfirm={onImportConfirm}
    oncancel={() => (pendingImport = null)}
  />
{/if}

<style>
  h2 {
    margin: 0 0 0.25rem;
    font-size: 1.1rem;
  }
  .intro {
    margin: 0 0 0.8rem;
    color: var(--dlh-muted);
    font-size: 0.9rem;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
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
  button:hover:not(:disabled) {
    background: var(--dlh-hover);
  }
  button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  /* Kept off-screen rather than `display: none`, so `.click()` still opens the
     picker in every browser. */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .status {
    margin: 0.7rem 0 0;
    /* Empty when idle, so it would otherwise collapse and shift the section
       every time a message arrives. Reserve the line instead. */
    min-height: 1.2em;
    min-height: 1lh;
    color: #2c7a45;
    font-size: 0.8rem;
    opacity: 0;
    transition: opacity 150ms ease;
  }
  .status.visible {
    opacity: 1;
  }
  .status.failed {
    color: #a12626;
    font-weight: 600;
  }
  @media (prefers-color-scheme: dark) {
    .status {
      color: #7ec99a;
    }
    .status.failed {
      color: #ef9a9a;
    }
  }
</style>
