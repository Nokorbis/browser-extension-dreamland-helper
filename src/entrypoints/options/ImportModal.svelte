<script lang="ts">
  import { untrack } from 'svelte';
  import { i18n } from '#i18n';
  import { buildPresetTree, type PresetStore } from '@/lib/presets';
  import { diffImportedPresets, type PresetImportStatus } from '@/lib/backup';
  import ImportPresetTree from './ImportPresetTree.svelte';

  interface Props {
    /** Whether the imported file had a `settings` field at all. */
    settingsPresent: boolean;
    /** `null` when the file had no `presets` field. */
    importedPresets: PresetStore | null;
    /** The live library, used only to compute the per-preset status badge. */
    currentPresets: PresetStore;
    onconfirm: (selection: { importSettings: boolean; selectedPresetIds: Set<string> }) => void;
    oncancel: () => void;
  }

  let { settingsPresent, importedPresets, currentPresets, onconfirm, oncancel }: Props = $props();

  // The modal is mounted once per import attempt (App.svelte remounts it via
  // an `{#if}` block for the next file), so these props never change during
  // its lifetime — `$derived` would be needless churn for a value computed
  // once. `untrack` says so explicitly instead of leaving it to look like an
  // accidental one-shot read of reactive state.
  const tree = untrack(() => (importedPresets !== null ? buildPresetTree(importedPresets) : null));
  const statuses = untrack(() =>
    importedPresets !== null
      ? diffImportedPresets(currentPresets, importedPresets)
      : new Map<string, PresetImportStatus>(),
  );

  // Seeded from a prop on purpose — this is independently editable local
  // state from here on, the standard "form default" pattern.
  let importSettings = $state(untrack(() => settingsPresent));
  // New presets are safe to bring in by default; anything that would touch an
  // existing preset (identical or conflicting) needs an explicit opt-in —
  // same "never destroy without being asked" spirit as the confirm() guarding
  // every delete in App.svelte.
  let selectedIds = $state<Set<string>>(
    new Set(
      Array.from(statuses.entries())
        .filter(([, status]) => status === 'new')
        .map(([id]) => id),
    ),
  );

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  function confirm() {
    onconfirm({ importSettings, selectedPresetIds: selectedIds });
  }

  function onBackdropKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') oncancel();
  }

  let dialogEl: HTMLElement | undefined = $state();
  $effect(() => {
    dialogEl?.focus();
  });
</script>

<!--
  Mouse-only backdrop-dismiss. `role="presentation"` marks it as not part of
  the a11y tree; Escape (onBackdropKeydown, bound below) and the visible
  Annuler button already give full keyboard parity, so a keyboard handler on
  the backdrop itself would be redundant.

  The `e.target === e.currentTarget` test is what makes it dismiss on a click
  *on the backdrop* rather than on any click that bubbles up to it. Letting it
  bubble (even with a stopPropagation on the dialog) closed the modal whenever
  a text selection started inside the dialog and released outside it, throwing
  the user's choices away mid-drag.
-->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="backdrop"
  onclick={(e) => {
    if (e.target === e.currentTarget) oncancel();
  }}
  onkeydown={onBackdropKeydown}
  role="presentation"
>
  <div
    bind:this={dialogEl}
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="import-modal-heading"
    tabindex="-1"
  >
    <h2 id="import-modal-heading">{i18n.t('options.backup.modal.heading')}</h2>

    {#if settingsPresent}
      <label class="settings-row">
        <input type="checkbox" bind:checked={importSettings} />
        {i18n.t('options.backup.modal.settingsLabel')}
      </label>
    {/if}

    {#if tree !== null}
      <h3>{i18n.t('options.backup.modal.presetsHeading')}</h3>
      {#if tree.folders.length === 0 && tree.presets.length === 0}
        <p class="muted">{i18n.t('options.backup.modal.noPresetsInFile')}</p>
      {:else}
        <div class="tree">
          <ImportPresetTree
            folders={tree.folders}
            presets={tree.presets}
            {statuses}
            {selectedIds}
            ontoggle={toggle}
          />
        </div>
      {/if}
    {/if}

    <div class="actions">
      <button type="button" onclick={oncancel}>{i18n.t('options.backup.modal.cancel')}</button>
      <button type="button" class="primary" onclick={confirm}>
        {i18n.t('options.backup.modal.confirm')}
      </button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    background: rgba(20, 24, 32, 0.45);
    z-index: 1000;
  }

  .dialog {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    width: min(30rem, 100%);
    max-height: min(34rem, 100%);
    /* Belt-and-braces alongside `.tree`'s own scroll region: if a very large
       preset library still overflows, the whole dialog scrolls rather than
       clipping the confirm/cancel buttons out of reach. */
    overflow-y: auto;
    padding: 1.1rem 1.25rem 1.25rem;
    border-radius: 0.7rem;
    background: var(--dlh-surface);
    color: var(--dlh-fg);
    box-shadow: 0 8px 28px var(--dlh-shadow);
  }
  .dialog:focus {
    outline: none;
  }

  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  h3 {
    margin: 0.2rem 0 0;
    font-size: 0.9rem;
    color: var(--dlh-muted);
  }

  .settings-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .tree {
    overflow-y: auto;
    padding: 0.4rem;
    border: 1px solid var(--dlh-border);
    border-radius: 0.5rem;
  }

  .muted {
    margin: 0;
    color: var(--dlh-muted);
    font-size: 0.85rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.3rem;
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
</style>
