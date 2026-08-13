<script lang="ts">
  import { tick } from 'svelte';
  import { i18n } from '#i18n';
  import { buildPresetTree, countPresets, type Preset } from '@/lib/presets';
  import type { MenuState } from './menu-state.svelte';
  import MenuNode from './MenuNode.svelte';
  // Global (unscoped) — defines the --dlh-* variables every surface reads.
  import '@/lib/palette.css';

  interface Props {
    /** Named `menu`, not `state`: a local binding called `state` would make the
        compiler read `$state(...)` as a store subscription. */
    menu: MenuState;
    onselect: (preset: Preset) => void;
    onclose: () => void;
  }

  let { menu, onselect, onclose }: Props = $props();

  const tree = $derived(buildPresetTree(menu.store));
  const isEmpty = $derived(countPresets(menu.store) === 0 && tree.folders.length === 0);

  let root = $state<HTMLElement | null>(null);

  // Focus moves in on open, so the keyboard can drive it straight away. The trigger's
  // mousedown is preventDefault-ed, so the textarea still holds the snapshotted selection.
  $effect(() => {
    if (!menu.open) return;
    void tick().then(() => {
      root?.querySelector<HTMLButtonElement>('li > button')?.focus();
    });
  });

  // Imperative rather than an `onkeydown` attribute: the wrapper is a plain container
  // with no ARIA role of its own, and a static element carrying a key handler is what
  // the a11y rules warn about.
  $effect(() => {
    const node = root;
    if (node === null) return;

    const handler = (event: KeyboardEvent) => {
      // `isolateEvents` on the shadow root stops key events reaching the document,
      // so Escape and Tab are handled here as well as there.
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault();
        onclose();
      }
    };

    node.addEventListener('keydown', handler);
    return () => node.removeEventListener('keydown', handler);
  });
</script>

{#if menu.open}
  <div class="menu dlh-theme" class:dark={menu.dark} bind:this={root}>
    {#if isEmpty}
      <p class="empty">
        <strong>{i18n.t('features.bbcodePresets.menu.empty')}</strong>
        <span>{i18n.t('features.bbcodePresets.menu.emptyHint')}</span>
      </p>
    {:else}
      <MenuNode folders={tree.folders} presets={tree.presets} {onselect} />
    {/if}
  </div>
{/if}

<style>
  .menu {
    /* Driven by custom properties `@/lib/popover` writes onto the shadow host from the
     * trigger's measured rect — one of the few things WXT's `all: initial` reset lets
     * through the shadow boundary. Fixed rather than absolute because the host has no size
     * of its own, and a fixed menu escapes any `overflow: hidden` on the toolbar row. */
    position: fixed;
    top: var(--dlh-menu-top, 0);
    left: var(--dlh-menu-left, 0);
    z-index: 2147483647;
    max-width: 20rem;
    border: 1px solid var(--dlh-border);
    border-radius: 0.4rem;
    background: var(--dlh-surface);
    color: var(--dlh-fg);
    box-shadow: 0 6px 20px var(--dlh-shadow);
    font:
      12.5px/1.35 system-ui,
      -apple-system,
      sans-serif;
    text-align: left;
  }

  .empty {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin: 0;
    padding: 0.45rem 0.55rem;
    max-width: 14rem;
  }
  .empty span {
    font-size: 0.8rem;
    color: var(--dlh-muted);
  }
</style>
