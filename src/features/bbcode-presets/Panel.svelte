<script lang="ts">
  import { i18n } from '#i18n';
  import { buildPresetTree, countPresets, type Preset } from '@/lib/presets';
  import type { MenuState } from './menu-state.svelte';
  import FolderTree from './FolderTree.svelte';
  // Global (unscoped) — defines the --dlh-* variables every surface reads.
  import './palette.css';

  interface Props {
    /** Named `panel`, not `state` — see the note in Menu.svelte. */
    panel: MenuState;
    onselect: (preset: Preset) => void;
    ontoggle: (expanded: boolean) => void;
  }

  let { panel, onselect, ontoggle }: Props = $props();

  const tree = $derived(buildPresetTree(panel.store));
  const isEmpty = $derived(
    countPresets(panel.store) === 0 && tree.folders.length === 0,
  );

  /**
   * The panel reuses the options page's `FolderTree`, which reports a click on
   * either kind of row. Only presets do anything here; clicking a folder is a
   * no-op because the tree always shows every level expanded.
   */
  function handleSelect(kind: 'folder' | 'preset', id: string) {
    if (kind !== 'preset') return;
    const preset = panel.store.presets[id];
    if (preset !== undefined) onselect(preset);
  }
</script>

<!--
  A second way into the same presets, pinned beside the editor. Collapsed to a
  slim handle by default so it costs no space until asked for; the state is
  remembered across pages in its own storage key.
-->
<aside class="dlh-theme" class:dark={panel.dark} class:expanded={panel.open}>
  <button
    type="button"
    class="handle"
    title={panel.open
      ? i18n.t('features.bbcodePresets.panel.collapse')
      : i18n.t('features.bbcodePresets.panel.expand')}
    aria-expanded={panel.open}
    onmousedown={(event) => event.preventDefault()}
    onclick={() => ontoggle(!panel.open)}
  >
    <span class="chevron" aria-hidden="true">{panel.open ? '›' : '‹'}</span>
    <span class="handle-label">{i18n.t('features.bbcodePresets.panel.title')}</span>
  </button>

  {#if panel.open}
    <!--
      Capture mousedown for the whole tree and preventDefault it, so clicking a
      preset never moves focus out of the textarea. That is what keeps the
      writer's selection alive across the click — the same trick the toolbar
      trigger uses.
    -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="body"
      onmousedowncapture={(event) => event.preventDefault()}
    >
      {#if isEmpty}
        <p class="empty">{i18n.t('features.bbcodePresets.menu.empty')}</p>
      {:else}
        <FolderTree
          folders={tree.folders}
          presets={tree.presets}
          selectedId={null}
          onselect={handleSelect}
        />
      {/if}
    </div>
  {/if}
</aside>

<style>
  aside {
    display: flex;
    align-items: flex-start;
    box-sizing: border-box;
    width: 100%;
    margin: 0 0 0.35rem;
    border: 1px solid var(--dlh-border);
    border-radius: 0.4rem;
    background: var(--dlh-surface);
    color: var(--dlh-fg);
    font: 12.5px/1.35 system-ui, -apple-system, sans-serif;
    overflow: hidden;
  }
  aside.expanded {
    display: block;
  }

  .handle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    padding: 0.25rem 0.5rem;
    border: none;
    background: var(--dlh-surface-alt);
    color: inherit;
    font: inherit;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }
  .handle:hover {
    background: var(--dlh-hover);
  }
  .chevron {
    opacity: 0.6;
  }
  .handle-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .body {
    max-height: 14rem;
    overflow-y: auto;
    padding: 0.25rem 0.4rem 0.35rem;
    border-top: 1px solid var(--dlh-border-soft);
  }

  .empty {
    margin: 0;
    padding: 0.3rem 0.1rem;
    color: var(--dlh-muted);
  }
</style>
