<script lang="ts">
  import { tick } from 'svelte';
  import { i18n } from '#i18n';
  import { RECENT_SHOWN } from '@/lib/emoji-recents';
  import type { PickerState } from './picker-state.svelte';
  import { searchEmoji } from './search';
  import type { EmojiRecord } from './types';
  // Global (unscoped) — defines the --dlh-* variables every surface reads.
  import '@/lib/palette.css';

  interface Props {
    /** Named `picker`, not `state`: a local binding called `state` would make
        the compiler read `$state(...)` as a store subscription. */
    picker: PickerState;
    onselect: (emoji: EmojiRecord) => void;
    onclose: () => void;
  }

  let { picker, onselect, onclose }: Props = $props();

  /**
   * Capped so a one-letter query can't render the whole dataset. 200 is well past what
   * anyone scrolls, and keeps the grid in the same size class as a category.
   */
  const SEARCH_LIMIT = 200;

  const searching = $derived(picker.query.trim() !== '');

  /**
   * Resolved from characters back to records so each cell gets its label. An emoji that
   * has left the dataset drops out rather than rendering a nameless cell.
   */
  const recentRecords = $derived.by(() => {
    if (picker.recent.length === 0) return [];
    const byChar = new Map(picker.data.emoji.map((record) => [record.c, record]));
    return picker.recent
      .slice(0, RECENT_SHOWN)
      .map((char) => byChar.get(char))
      .filter((record): record is EmojiRecord => record !== undefined);
  });

  const shown = $derived(
    searching
      ? searchEmoji(picker.data.emoji, picker.query, SEARCH_LIMIT)
      : picker.data.emoji.filter((record) => record.g === picker.group),
  );

  let root = $state<HTMLElement | null>(null);
  let search = $state<HTMLInputElement | null>(null);
  let grid = $state<HTMLElement | null>(null);

  // Focus the search box on open, so typing a name is the fastest path in. Safe for the
  // selection: the trigger's mousedown is preventDefault-ed and index.ts snapshotted the
  // range before opening.
  $effect(() => {
    if (!picker.open) return;
    void tick().then(() => search?.focus());
  });

  /** Label in the UI's own language — the dataset carries both. */
  function label(record: EmojiRecord): string {
    return record.fr !== '' ? record.fr : record.en;
  }

  /**
   * The grid is laid out by `grid-template-columns` rather than by rows, so "one row down"
   * is however many cells fit — measured from the DOM rather than assumed.
   */
  function columnCount(): number {
    if (grid === null) return 1;
    const style = getComputedStyle(grid);
    return Math.max(1, style.gridTemplateColumns.split(' ').length);
  }

  function moveFocus(from: HTMLElement, delta: number) {
    const cells = [...(grid?.querySelectorAll<HTMLElement>('button.cell') ?? [])];
    const index = cells.indexOf(from);
    if (index === -1) return;
    const next = cells[index + delta];
    // Clamping rather than wrapping: an extra press should stop at the edge, not jump
    // to the far end of 1900 emoji.
    if (next !== undefined) next.focus();
  }

  /**
   * Enter takes the top result and ArrowDown steps into the grid, so a whole insertion is
   * "Alt+I, type, Enter" without the mouse.
   */
  function onSearchKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      const first = shown[0];
      if (first === undefined) return;
      event.preventDefault();
      onselect(first);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      grid?.querySelector<HTMLElement>('button.cell')?.focus();
    }
  }

  /**
   * Registered imperatively rather than as an `onkeydown` attribute, because the wrapper is
   * a plain container with no interactive role of its own. The cells are real `<button>`s,
   * which is also why the grid needs no `role="grid"`/`gridcell` scaffolding: they are
   * focusable and labelled already, and arrow keys are all that is left to add.
   */
  $effect(() => {
    const node = root;
    if (node === null) return;

    const handler = (event: KeyboardEvent) => {
      // `isolateEvents` on the shadow root stops key events reaching the document,
      // so Escape is handled here as well as there.
      if (event.key === 'Escape') {
        event.preventDefault();
        onclose();
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.classList.contains('cell')) return;

      switch (event.key) {
        case 'ArrowRight':
          moveFocus(target, 1);
          break;
        case 'ArrowLeft':
          moveFocus(target, -1);
          break;
        case 'ArrowDown':
          moveFocus(target, columnCount());
          break;
        case 'ArrowUp':
          moveFocus(target, -columnCount());
          break;
        default:
          return;
      }
      event.preventDefault();
    };

    node.addEventListener('keydown', handler);
    return () => node.removeEventListener('keydown', handler);
  });
</script>

{#if picker.open}
  <!-- mousedown is swallowed across the whole panel, so the textarea never loses focus
       and the snapshotted selection survives. The search box is the one exception
       below: it has to be able to take focus. -->
  <div
    class="panel dlh-theme"
    class:dark={picker.dark}
    role="dialog"
    aria-label={i18n.t('features.emojiPicker.panel.title')}
    bind:this={root}
    onmousedowncapture={(event) => event.preventDefault()}
  >
    <input
      class="search"
      type="search"
      autocomplete="off"
      bind:this={search}
      bind:value={picker.query}
      aria-label={i18n.t('features.emojiPicker.panel.searchLabel')}
      placeholder={i18n.t('features.emojiPicker.panel.searchPlaceholder')}
      onmousedown={(event) => event.stopPropagation()}
      onkeydown={onSearchKeydown}
    />

    {#if picker.status === 'loading'}
      <p class="note">{i18n.t('features.emojiPicker.panel.loading')}</p>
    {:else if picker.status === 'failed'}
      <p class="note">{i18n.t('features.emojiPicker.panel.loadFailed')}</p>
    {:else}
      {#if picker.tooLong}
        <p class="warn">{i18n.t('features.emojiPicker.panel.tooLong')}</p>
      {/if}

      {#if !searching && recentRecords.length > 0}
        <p class="heading">{i18n.t('features.emojiPicker.panel.recent')}</p>
        <div class="grid recents">
          {#each recentRecords as record (record.c)}
            <button
              type="button"
              class="cell"
              title={label(record)}
              aria-label={label(record)}
              onclick={() => onselect(record)}>{record.c}</button
            >
          {/each}
        </div>
      {/if}

      {#if !searching}
        <div
          class="tabs"
          role="tablist"
          aria-label={i18n.t('features.emojiPicker.panel.categoriesLabel')}
        >
          {#each picker.data.groups as group, index (group.id)}
            <button
              type="button"
              class="tab"
              class:selected={index === picker.group}
              role="tab"
              aria-selected={index === picker.group}
              title={group.fr}
              onclick={() => (picker.group = index)}>{group.fr}</button
            >
          {/each}
        </div>
      {/if}

      <div class="grid scroller" bind:this={grid}>
        {#each shown as record (record.c)}
          <button
            type="button"
            class="cell"
            title={label(record)}
            aria-label={label(record)}
            onclick={() => onselect(record)}>{record.c}</button
          >
        {/each}
      </div>

      {#if shown.length === 0}
        <p class="note">{i18n.t('features.emojiPicker.panel.noResults')}</p>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .panel {
    /* Fixed, driven by custom properties `@/lib/popover` writes onto the shadow host from
     * the trigger's measured rect — one of the few things WXT's `all: initial` reset lets
     * through the shadow boundary. */
    position: fixed;
    top: var(--dlh-emoji-top, 0);
    left: var(--dlh-emoji-left, 0);
    z-index: 2147483647;
    box-sizing: border-box;
    width: 22rem;
    max-width: calc(100vw - 1rem);
    padding: 0.5rem;
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

  .search {
    box-sizing: border-box;
    width: 100%;
    margin-bottom: 0.4rem;
    padding: 0.3rem 0.45rem;
    border: 1px solid var(--dlh-border);
    border-radius: 0.3rem;
    background: var(--dlh-surface);
    color: var(--dlh-fg);
    font: inherit;
  }
  .search:focus-visible {
    outline: 2px solid var(--dlh-accent);
    outline-offset: -1px;
  }

  .heading {
    margin: 0 0 0.2rem;
    color: var(--dlh-muted);
    font-size: 0.8rem;
    /* CLDR gives category and group names lowercase in French. */
    text-transform: capitalize;
  }

  .note {
    margin: 0.3rem 0 0;
    color: var(--dlh-muted);
  }

  .warn {
    margin: 0 0 0.4rem;
    padding: 0.3rem 0.4rem;
    border: 1px solid var(--dlh-warn-border);
    border-radius: 0.3rem;
    background: var(--dlh-warn-bg);
    color: var(--dlh-warn-fg);
  }

  .tabs {
    display: flex;
    gap: 0.15rem;
    overflow-x: auto;
    margin-bottom: 0.35rem;
    padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--dlh-border-soft);
  }

  .tab {
    flex: 0 0 auto;
    max-width: 6rem;
    padding: 0.2rem 0.4rem;
    border: 0;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--dlh-muted);
    font: inherit;
    font-size: 0.78rem;
    text-transform: capitalize;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  .tab:hover {
    background: var(--dlh-hover);
  }
  .tab.selected {
    background: var(--dlh-selected);
    color: var(--dlh-fg);
  }
  .tab:focus-visible {
    outline: 2px solid var(--dlh-accent);
    outline-offset: -2px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(1.9rem, 1fr));
    gap: 0.1rem;
  }

  .recents {
    margin-bottom: 0.4rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid var(--dlh-border-soft);
  }

  .scroller {
    /* Only the active category renders (≤ ~400 cells), so the grid needs a
       scroll box but not virtualisation. */
    max-height: 14rem;
    overflow-y: auto;
    align-content: start;
  }

  .cell {
    aspect-ratio: 1;
    padding: 0;
    border: 0;
    border-radius: 0.25rem;
    background: transparent;
    /* The emoji renders in the user's own system font — nothing is
       bundled, so the font stack must reach the platform's colour emoji face. */
    font-family:
      'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', 'Twemoji Mozilla',
      sans-serif;
    font-size: 1.15rem;
    line-height: 1;
    cursor: pointer;
  }
  .cell:hover {
    background: var(--dlh-hover);
  }
  .cell:focus-visible {
    outline: 2px solid var(--dlh-accent);
    outline-offset: -2px;
  }
</style>
