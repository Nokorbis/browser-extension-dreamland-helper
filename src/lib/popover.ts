/**
 * An **anchored popover**: a Svelte surface in a shadow root that hangs off a
 * trigger button living in the page's light DOM.
 *
 * Two features want exactly this — `bbcode-presets`' toolbar menu and
 * `emoji-picker`'s panel — and before this module they each carried their own
 * copy of the same seven concerns, comments included. See
 * docs/adr/0023-shared-primitives-in-lib.md.
 *
 * What is genuinely the same every time, and lives here:
 *
 *  - **Positioning.** The surface is `position: fixed` and reads its viewport
 *    coordinates from two custom properties published on the shadow *host*.
 *    Measuring the trigger in JS rather than styling from CSS keeps the surface
 *    correct whatever the skin does to the toolbar row, and lets it escape an
 *    `overflow: hidden` ancestor. Custom properties are one of the few things
 *    WXT's `all: initial` host reset deliberately lets through the boundary.
 *  - **Dismissal.** Outside click, Escape, and the distinction between the two
 *    (see `onClose` / `onDismiss` below).
 *  - **Following the page.** A fixed surface does not scroll with its anchor.
 *  - **The mount.** `createShadowRootUi` is async while `setup()` returns its
 *    cleanup synchronously, so a fast navigation can land between the two.
 *
 * What stays at the call site, because it genuinely differs: what the trigger
 * looks like, what opening means for the feature's state, `aria-expanded`, and
 * whether the surface is kept inside the viewport (`fit`).
 *
 * This module knows nothing about phpBB or about any feature — it is anchoring
 * arithmetic and event plumbing, which is why it is in `src/lib`.
 */
import {
  createShadowRootUi,
  type ContentScriptContext,
  type ShadowRootContentScriptUi,
} from '#imports';
import { warn } from './log';

/** Gap between the trigger and the surface, and its margin from the viewport edge. */
const GAP = 4;

/**
 * Keep the surface inside the viewport.
 *
 * Only worth paying for when the trigger can sit near an edge — the Tribune's
 * chatbox toolbar is at the very bottom of the page, where a surface opening
 * downwards would fall off entirely. Both adjustments need the rendered box, so
 * they are one option rather than two: without a `fit` the surface is simply
 * placed below and left-aligned with its trigger, and nothing is measured.
 */
export interface PopoverFit {
  /**
   * Selects the positioned element *inside* the shadow root, e.g. `.panel`.
   * Measured rather than assumed from its CSS `width`, which is typically in
   * `rem` — and so depends on the forum's root font size — and can shrink
   * further under its own `max-width`.
   */
  selector: string;
}

/**
 * `App` is whatever `render` hands back — Svelte's mounted-app handle at both
 * current call sites. Generic rather than `unknown` purely so `destroy` receives
 * it without a cast; nothing here inspects it.
 */
export interface PopoverOptions<App> {
  ctx: ContentScriptContext;
  /** Shadow-host element name, e.g. `dlh-emoji-picker-chat`. Must be unique per surface. */
  name: string;
  /** The button in the page that opens the surface and that it anchors to. */
  trigger: HTMLElement;
  /**
   * Custom-property prefix: `menu` publishes `--dlh-menu-top` and
   * `--dlh-menu-left`, which the surface's own CSS must read.
   */
  prefix: string;
  /** Mount the Svelte component into the shadow container; return the mounted app. */
  render: (container: HTMLElement) => App;
  /** Unmount it again. */
  destroy: (app: App) => void;
  /** Whether the surface is currently showing. Read, never written. */
  isOpen: () => boolean;
  /** True once the feature's cleanup has run — checked across every `await`. */
  isDisposed: () => boolean;
  /**
   * Close **without** touching focus. Used for the outside-click path: pulling
   * focus back there would fight the click the user just made.
   */
  onClose: () => void;
  /**
   * Close **and** restore focus to the writing surface. Used for Escape, and
   * the reason this is a separate callback: the surface takes focus when it
   * opens, so closing it without this leaves focus on a hidden node and the
   * caret nowhere.
   */
  onDismiss: () => void;
  /** Called on click and on the trigger's own keyboard activation. */
  onToggle: () => void;
  /** Optional — see `PopoverFit`. */
  fit?: PopoverFit;
  /** Aborted by the feature's cleanup; every listener here is registered against it. */
  signal: AbortSignal;
}

export interface Popover {
  /** Measure the trigger and publish the surface's position. No-op before the mount lands. */
  position(): void;
  /**
   * `position()` now, and again on the next frame — the surface's rendered size
   * is 0 until Svelte has drawn it, which both `fit` adjustments need. Call
   * this on open, and after anything that changes the surface's height while it
   * is open (a surface flipped above its trigger is anchored by its bottom edge,
   * so it drifts otherwise).
   */
  positionSoon(): void;
  /**
   * The surface's shadow root, or `null` before the mount lands. For reaching a
   * node inside it imperatively — remember that focus checks there must use
   * `root.activeElement`, not `document.activeElement`.
   */
  shadow(): ShadowRoot | null;
  /** Tear down the shadow UI. The listeners go with the `signal`. */
  remove(): void;
}

export function createPopover<App>(options: PopoverOptions<App>): Popover {
  const { trigger, prefix, isOpen, onClose, onDismiss, onToggle, fit, signal } = options;

  let ui: ShadowRootContentScriptUi<App> | null = null;

  const position = () => {
    if (ui === null) return;
    const rect = trigger.getBoundingClientRect();

    // The unfitted placement, and the whole of it when `fit` is off: directly
    // below the trigger, left edges aligned.
    let top = rect.bottom + GAP;
    let left = rect.left;

    if (fit !== undefined) {
      const box = ui.shadow.querySelector<HTMLElement>(fit.selector);
      // Both read 0 until Svelte has drawn the surface, which each guard below
      // treats as "nothing to fit yet" — `positionSoon` comes back for it.
      const height = box?.offsetHeight ?? 0;
      const width = box?.offsetWidth ?? 0;

      // Flip only when there is genuinely more room above — falling off the top
      // is no better than falling off the bottom.
      const above = rect.top - GAP - height;
      if (height > 0 && top + height > window.innerHeight && above >= GAP) {
        top = above;
      }
      if (width > 0) {
        left = Math.max(GAP, Math.min(left, window.innerWidth - width - GAP));
      }
    }

    const host = ui.shadowHost.style;
    host.setProperty(`--dlh-${prefix}-top`, `${top}px`);
    host.setProperty(`--dlh-${prefix}-left`, `${left}px`);
  };

  const positionSoon = () => {
    position();
    requestAnimationFrame(() => {
      if (isOpen()) position();
    });
  };

  // preventDefault on mousedown so the textarea keeps its selection across the
  // click that opens the surface.
  trigger.addEventListener('mousedown', (event) => event.preventDefault(), { signal });
  trigger.addEventListener('click', onToggle, { signal });

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!isOpen()) return;
      // event.target is retargeted to the shadow host for anything inside the
      // shadow root, so composedPath() is the only reliable containment test.
      const path = event.composedPath();
      if (path.includes(trigger)) return;
      if (ui !== null && path.includes(ui.shadowHost)) return;
      onClose();
    },
    { capture: true, signal },
  );

  // Only fires while focus is *outside* the shadow root — `isolateEvents` below
  // stops key events escaping it, so the in-surface case is handled by the
  // component calling `onclose`. Both paths must dismiss identically.
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !isOpen()) return;
      onDismiss();
    },
    { signal },
  );

  // A fixed surface does not follow the page, so re-measure while it is open.
  // Capture phase so scrolling inside any container counts, not just window.
  const reposition = () => {
    if (isOpen()) position();
  };
  document.addEventListener('scroll', reposition, { capture: true, signal });
  window.addEventListener('resize', reposition, { signal });

  // createShadowRootUi is async (it fetches the built CSS) while setup() hands
  // back its cleanup synchronously, so the `isDisposed` check after the await is
  // what stops a fast navigation from leaking a mounted UI.
  void (async () => {
    try {
      const created = await createShadowRootUi<App>(options.ctx, {
        name: options.name,
        position: 'inline',
        anchor: trigger,
        append: 'after',
        isolateEvents: ['keydown', 'keyup', 'keypress'],
        onMount: (container) => options.render(container),
        onRemove: (app) => {
          if (app) options.destroy(app);
        },
      });
      if (options.isDisposed()) return;

      ui = created;
      ui.mount();
      // The host is only a carrier for the shadow root: the surface inside is
      // `position: fixed`, so the host itself must take up no layout space in
      // the toolbar row.
      ui.shadowHost.style.display = 'inline-block';
      ui.shadowHost.style.width = '0';
      ui.shadowHost.style.height = '0';
    } catch (err) {
      warn(`could not mount the ${options.name} popover`, err);
    }
  })();

  return {
    position,
    positionSoon,
    shadow: () => ui?.shadow ?? null,
    remove: () => ui?.remove(),
  };
}
