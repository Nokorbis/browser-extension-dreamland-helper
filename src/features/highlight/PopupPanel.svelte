<script lang="ts">
  import { i18n } from '#i18n';
  import { browser } from '#imports';
  import {
    loadHighlightStore,
    watchHighlightStore,
    saveHighlightStore,
    clearTopic,
    clearAll,
    countHighlights,
    countForTopic,
    emptyHighlightStore,
    type HighlightStore,
  } from '@/lib/highlights';
  import { warn } from '@/lib/log';

  /**
   * The highlight panel inside the popup accordion.
   *
   * Two bulk actions: clear the discussion shown in the active forum tab, and
   * clear everything. "This discussion" reads the active tab's `t=` param — the
   * popup can't see the page DOM, so on a post-permalink page (`?p=…`, no `t=`)
   * the button is simply unavailable. Writes go through `saveHighlightStore`,
   * whose `toPlainHighlightStore` strips Svelte's `$state` proxy so Firefox
   * doesn't throw `DataCloneError` (see CLAUDE.md), and live-update every open
   * forum tab via the store watcher.
   */
  let store = $state<HighlightStore>(emptyHighlightStore());
  let topicId = $state<string | null>(null);

  void loadHighlightStore().then((loaded) => {
    store = loaded;
  });
  watchHighlightStore((next) => {
    store = next;
  });

  void resolveActiveTopic();
  async function resolveActiveTopic() {
    try {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.url === undefined) return;
      const url = new URL(tab.url);
      if (!/(^|\.)dreamland-reborn\.net$/i.test(url.hostname)) return;
      const t = url.searchParams.get('t');
      if (t !== null && /^\d+$/.test(t)) topicId = t;
    } catch {
      // No access to the active tab's URL — leave "this discussion" disabled.
    }
  }

  const total = $derived(countHighlights(store));
  const inTopic = $derived(topicId === null ? 0 : countForTopic(store, topicId));

  async function save(next: HighlightStore) {
    store = next;
    try {
      await saveHighlightStore(next);
    } catch (err) {
      warn('highlight popup: could not save', err);
    }
  }
</script>

<p class="counts">{i18n.t('features.highlight.popup.count', total)}</p>

<div class="actions">
  <button
    type="button"
    disabled={inTopic === 0}
    onclick={() => topicId !== null && save(clearTopic(store, topicId))}
  >
    {i18n.t('features.highlight.popup.clearTopic')}
  </button>
  <button type="button" disabled={total === 0} onclick={() => save(clearAll(store))}>
    {i18n.t('features.highlight.popup.clearAll')}
  </button>
</div>

{#if topicId === null}
  <p class="hint">{i18n.t('features.highlight.popup.noThread')}</p>
{/if}

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
