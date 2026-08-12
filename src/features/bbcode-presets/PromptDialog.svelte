<script lang="ts">
  import { tick } from 'svelte';
  import { i18n } from '#i18n';
  import type { PromptState } from './prompt-state.svelte';
  // Global (unscoped) — defines the --dlh-* variables every surface reads.
  import '@/lib/palette.css';

  interface Props {
    /** Named `prompt`, not `state`: a local binding called `state` would make
        the compiler read `$state(...)` as a store subscription. */
    prompt: PromptState;
    /** Insert with what has been typed. Answers are read off `prompt.answers`. */
    onconfirm: () => void;
    /** Escape, Annuler, or a click outside — insert nothing at all. */
    oncancel: () => void;
  }

  let { prompt, onconfirm, oncancel }: Props = $props();

  let root = $state<HTMLElement | null>(null);

  /**
   * Focus the first field as the dialog opens, so a one-field preset is
   * "click, type, Enter". Safe for the writer's selection: index.ts snapshotted
   * the range before opening, and the menu item that opened this had its
   * mousedown preventDefault-ed.
   */
  $effect(() => {
    if (!prompt.open) return;
    void tick().then(() => {
      root?.querySelector<HTMLInputElement>('input.answer')?.focus();
    });
  });

  /** Every focusable in the dialog, in tab order. */
  function focusables(): HTMLElement[] {
    return [...(root?.querySelectorAll<HTMLElement>('input.answer, button') ?? [])];
  }

  /**
   * Keyboard handling, registered imperatively on the wrapper — the wrapper is
   * a plain container with no interactive role of its own, and a static element
   * carrying a key handler is exactly what the a11y rules warn about.
   */
  $effect(() => {
    const node = root;
    if (node === null) return;

    const handler = (event: KeyboardEvent) => {
      // `isolateEvents` on the shadow root stops key events reaching the
      // document, so Escape is handled here as well as there.
      if (event.key === 'Escape') {
        event.preventDefault();
        oncancel();
        return;
      }

      // Tab cycles *within* the dialog rather than dismissing it, which is
      // where this parts company with the presets menu: a menu has one thing to
      // do and Tab means "I'm done", while a form has fields to move between.
      // Wrapping also keeps focus off the textarea, whose caret the snapshotted
      // range still describes.
      if (event.key === 'Tab') {
        const cells = focusables();
        if (cells.length === 0) return;
        const active = (node.getRootNode() as ShadowRoot).activeElement;
        const index = cells.indexOf(active as HTMLElement);
        const next = event.shiftKey ? index - 1 : index + 1;
        if (next >= 0 && next < cells.length) return; // let the browser do it
        event.preventDefault();
        (event.shiftKey ? cells[cells.length - 1] : cells[0]).focus();
      }
    };

    node.addEventListener('keydown', handler);
    return () => node.removeEventListener('keydown', handler);
  });

  /** Enter from any field inserts, so the whole flow can stay on the keyboard. */
  function onFieldKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    onconfirm();
  }
</script>

{#if prompt.open}
  <!-- mousedown is swallowed across the whole dialog so the textarea never
       loses focus and the snapshotted selection survives. The fields are the
       exception, below: they have to be able to take focus when clicked. -->
  <div
    class="prompt dlh-theme"
    class:dark={prompt.dark}
    role="dialog"
    aria-label={i18n.t('features.bbcodePresets.prompt.title')}
    bind:this={root}
    onmousedowncapture={(event) => event.preventDefault()}
  >
    <p class="heading">{prompt.presetName}</p>

    {#each prompt.labels as label (label)}
      <label class="field">
        <span>{label}</span>
        <input
          class="answer"
          type="text"
          autocomplete="off"
          spellcheck="false"
          bind:value={prompt.answers[label]}
          onmousedown={(event) => event.stopPropagation()}
          onkeydown={onFieldKeydown}
        />
      </label>
    {/each}

    <div class="actions">
      <button type="button" onclick={oncancel}>
        {i18n.t('features.bbcodePresets.prompt.cancel')}
      </button>
      <button type="button" class="primary" onclick={onconfirm}>
        {i18n.t('features.bbcodePresets.prompt.insert')}
      </button>
    </div>
  </div>
{/if}

<style>
  .prompt {
    /* Fixed, driven by the anchor's real bounding rect — see the same note in
       Menu.svelte. `fit` is on for this surface, so it flips above its anchor
       and clamps horizontally when a multi-field form would run off-screen. */
    position: fixed;
    top: var(--dlh-prompt-top, 0);
    left: var(--dlh-prompt-left, 0);
    z-index: 2147483647;
    box-sizing: border-box;
    width: 18rem;
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

  .heading {
    margin: 0 0 0.45rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin-bottom: 0.4rem;
  }
  .field span {
    color: var(--dlh-muted);
  }

  .answer {
    box-sizing: border-box;
    width: 100%;
    padding: 0.3rem 0.45rem;
    border: 1px solid var(--dlh-border);
    border-radius: 0.3rem;
    background: var(--dlh-surface);
    color: var(--dlh-fg);
    font: inherit;
  }
  .answer:focus-visible {
    outline: 2px solid var(--dlh-accent);
    outline-offset: -1px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.35rem;
    margin-top: 0.55rem;
  }
  .actions button {
    padding: 0.25rem 0.6rem;
    border: 1px solid var(--dlh-border);
    border-radius: 0.3rem;
    background: var(--dlh-surface-alt);
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .actions button:hover {
    background: var(--dlh-hover);
  }
  .actions button.primary {
    border-color: var(--dlh-accent);
    background: var(--dlh-accent);
    color: var(--dlh-surface);
  }
  .actions button:focus-visible {
    outline: 2px solid var(--dlh-accent);
    outline-offset: 1px;
  }
</style>
