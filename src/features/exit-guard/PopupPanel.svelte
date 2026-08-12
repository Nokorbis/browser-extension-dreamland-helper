<script lang="ts">
  import { i18n } from '#i18n';
  import {
    clearAllDrafts,
    countDrafts,
    emptyDraftStore,
    loadDraftStore,
    saveDraftStore,
    watchDraftStore,
    type DraftStore,
  } from '@/lib/drafts';
  import { warn } from '@/lib/log';

  /**
   * The draft panel inside the popup accordion.
   *
   * Deliberately minimal: a count and one escape hatch. Restoring a draft needs
   * the composer it belongs to — the popup can't see the page DOM, and dropping
   * text into a tab from here would be exactly the silent restore
   * docs/adr/0027 rules out. So the panel only ever *deletes*.
   *
   * Writes go through `saveDraftStore`, whose `toPlainDraftStore` strips Svelte's
   * `$state` proxy so Firefox doesn't throw `DataCloneError` (see CLAUDE.md), and
   * live-update every open forum tab via the store watcher.
   */
  let store = $state<DraftStore>(emptyDraftStore());

  void loadDraftStore().then((loaded) => {
    store = loaded;
  });
  watchDraftStore((next) => {
    store = next;
  });

  const total = $derived(countDrafts(store));

  async function save(next: DraftStore) {
    store = next;
    try {
      await saveDraftStore(next);
    } catch (err) {
      warn('exit-guard popup: could not save', err);
    }
  }
</script>

<p class="counts">{i18n.t('features.exitGuard.popup.count', total)}</p>

<div class="actions">
  <button type="button" disabled={total === 0} onclick={() => save(clearAllDrafts(store))}>
    {i18n.t('features.exitGuard.popup.clearAll')}
  </button>
</div>

<p class="hint">{i18n.t('features.exitGuard.popup.hint')}</p>

<style>
  /* Inherits the --dlh-* palette from the popup's `.dlh-theme-auto` root. */
  .counts {
    margin: 0 0 0.5rem;
    color: var(--dlh-muted);
    font-size: 0.78rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  button {
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--dlh-border);
    border-radius: 0.4rem;
    background: var(--dlh-surface-alt);
    color: inherit;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: var(--dlh-hover);
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .hint {
    margin: 0.5rem 0 0;
    color: var(--dlh-muted);
    font-size: 0.72rem;
  }
</style>
