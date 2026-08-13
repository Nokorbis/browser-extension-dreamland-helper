<script lang="ts">
  import { i18n } from '#i18n';
  import type { Preset, PresetTreeNode } from '@/lib/presets';
  import type { PresetImportStatus } from '@/lib/backup';
  // Self-import: this is what makes the tree recursive. A checkbox-and-badge sibling of
  // FolderTree.svelte rather than a reuse — that one is built for single-select
  // navigation, this one for multi-select review.
  import Self from './ImportPresetTree.svelte';

  interface Props {
    /** Already sorted. Organisational only — folders are inferred from the presets
     * picked beneath them, never selected individually. */
    folders: PresetTreeNode[];
    /** Presets sitting directly at this level, already sorted. */
    presets: Preset[];
    /** Imported preset id -> how it compares to the current library. */
    statuses: Map<string, PresetImportStatus>;
    /** Imported preset ids currently checked for import. */
    selectedIds: Set<string>;
    ontoggle: (id: string) => void;
  }

  let { folders, presets, statuses, selectedIds, ontoggle }: Props = $props();

  function badgeText(id: string): string | null {
    const status = statuses.get(id);
    if (status === 'identical') return i18n.t('options.backup.modal.badgeIdentical');
    if (status === 'conflict') return i18n.t('options.backup.modal.badgeConflict');
    return null;
  }
</script>

<ul>
  {#each folders as node (node.folder.id)}
    <li>
      <div class="row folder">
        <span class="glyph" aria-hidden="true">📁</span>
        <span class="label">{node.folder.name}</span>
      </div>
      {#if node.folders.length > 0 || node.presets.length > 0}
        <!-- Indent lives on this wrapper, not a `ul ul` rule — see FolderTree.svelte. -->
        <div class="children">
          <Self
            folders={node.folders}
            presets={node.presets}
            {statuses}
            {selectedIds}
            {ontoggle}
          />
        </div>
      {/if}
    </li>
  {/each}

  {#each presets as preset (preset.id)}
    <li>
      <label class="row preset">
        <input
          type="checkbox"
          checked={selectedIds.has(preset.id)}
          onchange={() => ontoggle(preset.id)}
        />
        <span class="glyph" aria-hidden="true">✦</span>
        <span class="label">{preset.name}</span>
        {#if badgeText(preset.id) !== null}
          <span class="badge" class:conflict={statuses.get(preset.id) === 'conflict'}>
            {badgeText(preset.id)}
          </span>
        {/if}
      </label>
    </li>
  {/each}
</ul>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .children {
    padding-left: 0.8rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0.35rem;
    border-radius: 0.3rem;
  }
  .row.folder {
    color: var(--dlh-muted);
  }
  .row.preset {
    cursor: pointer;
  }
  .row.preset:hover {
    background: var(--dlh-hover);
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

  .badge {
    margin-left: auto;
    flex: none;
    padding: 0.1rem 0.5rem;
    border-radius: 1rem;
    background: var(--dlh-surface-alt);
    color: var(--dlh-muted);
    font-size: 0.72rem;
    white-space: nowrap;
  }
  /* Amber, like the editor's template warnings: not an error, but read it before
     ticking the box — this preset would overwrite an existing one. */
  .badge.conflict {
    background: var(--dlh-warn-bg);
    color: var(--dlh-warn-fg);
  }
</style>
