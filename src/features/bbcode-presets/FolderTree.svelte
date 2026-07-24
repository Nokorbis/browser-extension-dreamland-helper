<script lang="ts">
  import type { Preset, PresetTreeNode } from '@/lib/presets';
  // A component may import itself; this is what makes the tree recursive.
  import Self from './FolderTree.svelte';

  interface Props {
    /** Subfolders at this level, already sorted. */
    folders: PresetTreeNode[];
    /** Presets sitting directly at this level, already sorted. */
    presets: Preset[];
    /** Id of the currently selected folder or preset, if any. */
    selectedId: string | null;
    onselect: (kind: 'folder' | 'preset', id: string) => void;
  }

  let { folders, presets, selectedId, onselect }: Props = $props();
</script>

<!--
  The preset library rendered as a tree. Folders nest to arbitrary depth, so this
  component renders one level and recurses for the next. It is shared between the
  options-page editor and (later) the in-page panel — writing it once is the main
  reason the in-page UI is Svelte rather than hand-built DOM.
  See docs/adr/0016-svelte-in-content-script.md.
-->
<ul>
  {#each folders as node (node.folder.id)}
    <li>
      <button
        type="button"
        class="row folder"
        class:selected={selectedId === node.folder.id}
        onclick={() => onselect('folder', node.folder.id)}
      >
        <span class="glyph" aria-hidden="true">📁</span>
        <span class="label">{node.folder.name}</span>
      </button>
      {#if node.folders.length > 0 || node.presets.length > 0}
        <!--
          The indent lives on this wrapper rather than on a `ul ul` rule: the
          nested list is rendered by the recursive child instance, so Svelte's
          per-component CSS analysis sees no second `ul` here and would strip
          such a selector as unused.
        -->
        <div class="children">
          <Self
            folders={node.folders}
            presets={node.presets}
            {selectedId}
            {onselect}
          />
        </div>
      {/if}
    </li>
  {/each}

  {#each presets as preset (preset.id)}
    <li>
      <button
        type="button"
        class="row preset"
        class:selected={selectedId === preset.id}
        onclick={() => onselect('preset', preset.id)}
      >
        <span class="glyph" aria-hidden="true">✦</span>
        <span class="label">{preset.name}</span>
      </button>
    </li>
  {/each}
</ul>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  /* Each nested level steps in; the top-level list is flush. */
  .children {
    padding-left: 0.8rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    box-sizing: border-box;
    width: 100%;
    padding: 0.2rem 0.35rem;
    border: none;
    border-radius: 0.3rem;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row:hover {
    background: var(--dlh-hover);
  }
  .row.selected {
    background: var(--dlh-selected);
    font-weight: 600;
  }

  .glyph {
    flex: none;
    font-size: 0.85em;
    opacity: 0.75;
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Colours come from the --dlh-* palette set by whichever surface mounts this
     component, so the same tree works in-page and in the options page. */
</style>
