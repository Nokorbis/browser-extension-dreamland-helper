<script lang="ts">
  import { tick } from 'svelte';
  import type { Preset, PresetTreeNode } from '@/lib/presets';
  // Self-import: this is what makes folders nest to arbitrary depth.
  import Self from './MenuNode.svelte';

  interface Props {
    folders: PresetTreeNode[];
    presets: Preset[];
    onselect: (preset: Preset) => void;
    /**
     * Close this level and hand focus back to the folder that opened it.
     * Undefined at the root, which is how ArrowLeft knows to stop.
     */
    onback?: () => void;
  }

  let { folders, presets, onselect, onback }: Props = $props();

  /** Which subfolder is currently flown out. One at a time, per level. */
  let openFolderId = $state<string | null>(null);
  let list = $state<HTMLElement | null>(null);

  /** Direct-child menu items of *this* level (never the submenu's own items). */
  function items(): HTMLButtonElement[] {
    if (list === null) return [];
    return Array.from(list.querySelectorAll<HTMLButtonElement>(':scope > li > button'));
  }

  function moveFocus(step: number) {
    const buttons = items();
    if (buttons.length === 0) return;
    // `document.activeElement` is retargeted to the shadow *host* for anything
    // inside the root, so it would never match one of these buttons. Ask the
    // containing root — the ShadowRoot here — for its own active element.
    const root = list?.getRootNode() as ShadowRoot | Document | undefined;
    const active = root?.activeElement ?? null;
    const current = buttons.findIndex((button) => button === active);
    // Nothing focused yet: ArrowDown enters at the top, ArrowUp at the bottom.
    const next =
      current === -1
        ? step > 0
          ? 0
          : buttons.length - 1
        : (current + step + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  async function openFolder(id: string, focusFirst: boolean) {
    openFolderId = id;
    if (!focusFirst) return;
    await tick();
    list
      ?.querySelector<HTMLButtonElement>(
        `:scope > li[data-folder="${CSS.escape(id)}"] .submenu li > button`,
      )
      ?.focus();
  }

  function focusFolderButton(id: string) {
    list
      ?.querySelector<HTMLButtonElement>(
        `:scope > li[data-folder="${CSS.escape(id)}"] > button`,
      )
      ?.focus();
  }

  function onKeydown(event: KeyboardEvent) {
    // Each level handles only the keys it owns and stops there, so a keypress
    // deep in the tree isn't also processed by every ancestor level.
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        moveFocus(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        moveFocus(-1);
        break;
      case 'ArrowLeft':
        if (onback === undefined) return; // root level: let Escape handle it
        event.preventDefault();
        event.stopPropagation();
        onback();
        break;
      default:
    }
  }

  /**
   * Flip a submenu to the left when it would otherwise run off the viewport.
   * Measured after layout rather than guessed, because how much room there is
   * depends on where the forum puts the toolbar.
   */
  function keepOnScreen(node: HTMLElement) {
    // Runs once per flyout: the element is created fresh each time a folder
    // opens, so there is nothing to keep in sync afterwards.
    // getBoundingClientRect() forces layout, so the measurement is accurate
    // even though the node was only just inserted.
    if (node.getBoundingClientRect().right > window.innerWidth - 8) {
      node.classList.add('flip');
    }
  }
</script>

<ul role="menu" bind:this={list} onkeydown={onKeydown}>
  {#each folders as node (node.folder.id)}
    <!-- role="none" so the role="menu" list owns the buttons directly: an <li>
         carrying its implicit listitem role between the two breaks the required
         menu → menuitem relationship. The element stays an <li> for the
         `:scope > li > button` queries above and for markup validity. -->
    <li role="none" class="folder" data-folder={node.folder.id}>
      <button
        type="button"
        role="menuitem"
        tabindex="-1"
        aria-haspopup="menu"
        aria-expanded={openFolderId === node.folder.id}
        onmousedown={(event) => event.preventDefault()}
        onpointerenter={() => openFolder(node.folder.id, false)}
        onfocus={() => openFolder(node.folder.id, false)}
        onclick={() => openFolder(node.folder.id, true)}
        onkeydown={(event) => {
          if (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            void openFolder(node.folder.id, true);
          }
        }}
      >
        <span class="label">{node.folder.name}</span>
        <span class="chevron" aria-hidden="true">›</span>
      </button>

      {#if openFolderId === node.folder.id}
        <div class="submenu" use:keepOnScreen>
          <Self
            folders={node.folders}
            presets={node.presets}
            {onselect}
            onback={() => {
              openFolderId = null;
              focusFolderButton(node.folder.id);
            }}
          />
        </div>
      {/if}
    </li>
  {/each}

  {#each presets as preset (preset.id)}
    <li role="none">
      <button
        type="button"
        role="menuitem"
        tabindex="-1"
        class="preset"
        onmousedown={(event) => event.preventDefault()}
        onpointerenter={() => (openFolderId = null)}
        onclick={() => onselect(preset)}
      >
        <span class="label">{preset.name}</span>
      </button>
    </li>
  {/each}
</ul>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0.15rem;
    /* Just wide enough that short names don't look cramped; entries stretch it
       as needed, capped by .menu's max-width. */
    min-width: 8rem;
  }

  li {
    position: relative;
  }

  button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    box-sizing: border-box;
    width: 100%;
    padding: 0.25rem 0.45rem;
    border: none;
    border-radius: 0.3rem;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  button:hover,
  button:focus {
    background: var(--dlh-hover);
    outline: none;
  }

  .label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chevron {
    flex: none;
    opacity: 0.6;
  }

  .submenu {
    position: absolute;
    top: -0.15rem;
    left: 100%;
    z-index: 1;
    border: 1px solid var(--dlh-border);
    border-radius: 0.4rem;
    background: var(--dlh-surface);
    box-shadow: 0 6px 20px var(--dlh-shadow);
  }
  /* Applied by `keepOnScreen` when the flyout would leave the viewport. */
  .submenu:global(.flip) {
    left: auto;
    right: 100%;
  }
</style>
