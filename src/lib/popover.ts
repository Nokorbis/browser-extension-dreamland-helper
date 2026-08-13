/**
 * An **anchored popover**: a Svelte surface in a shadow root hanging off a trigger button in
 * the page's light DOM. Shared by `bbcode-presets`' menu and `emoji-picker`'s panel; see
 * docs/adr/0023.
 *
 * The surface is `position: fixed` and reads its coordinates from two custom properties
 * published on the shadow *host*: measuring in JS survives whatever the skin does to the
 * toolbar row and escapes an `overflow: hidden` ancestor, and custom properties are one of
 * the few things WXT's `all: initial` host reset lets through the boundary. Dismissal,
 * scroll-following and the async mount live here too.
 *
 * What stays at the call site: the trigger's appearance, what opening means for the feature's
 * state, `aria-expanded`, and whether to keep the surface on screen (`fit`).
 */
import {
  createShadowRootUi,
  type ContentScriptContext,
  type ShadowRootContentScriptUi,
} from '#imports';
import { placeAnchored } from './anchor-position';
import { warn } from './log';

/** Gap between the trigger and the surface, and its margin from the viewport edge. */
const GAP = 4;

/**
 * Keep the surface inside the viewport — worth paying for only when the trigger can sit near
 * an edge, as the Tribune's bottom-of-page toolbar does. Flip and clamp both need the rendered
 * box, hence one option: without a `fit`, nothing is measured and the surface goes below its
 * trigger, left-aligned.
 */
export interface PopoverFit {
  /**
   * The positioned element *inside* the shadow root, e.g. `.panel`. Measured rather than read
   * off its CSS `width`, which is in `rem` (so it follows the forum's root font size) and can
   * shrink further under its own `max-width`.
   */
  selector: string;
}

/** `App` is whatever `render` hands back; generic only so `destroy` takes it without a cast. */
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
   * Close **without** touching focus, for the outside-click path: pulling focus back would
   * fight the click the user just made.
   */
  onClose: () => void;
  /**
   * Close **and** restore focus to the writing surface, for Escape. Separate from `onClose`
   * because the surface takes focus when it opens, so closing without this leaves focus on a
   * hidden node and the caret nowhere.
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
   * `position()` now, and again on the next frame — the rendered size is 0 until Svelte has
   * drawn the surface, which both `fit` adjustments need. Call on open, and after anything
   * that changes the surface's height while open: one flipped above its trigger is anchored
   * by its bottom edge, so it drifts otherwise.
   */
  positionSoon(): void;
  /**
   * `null` before the mount lands. Focus checks against it must use `root.activeElement`,
   * not `document.activeElement`.
   */
  shadow(): ShadowRoot | null;
  /** Tear down the shadow UI. The listeners go with the `signal`. */
  remove(): void;
}

export function createPopover<App>(options: PopoverOptions<App>): Popover {
  const { trigger, prefix, isOpen, onClose, onDismiss, onToggle, fit, signal } = options;

  let ui: ShadowRootContentScriptUi<App> | null = null;

  // Measure, delegate the arithmetic to `@/lib/anchor-position`, assign.
  const position = () => {
    if (ui === null) return;
    const rect = trigger.getBoundingClientRect();

    // Reads 0 until Svelte has drawn the surface; `placeAnchored` treats that as
    // "nothing to fit yet" and `positionSoon` comes back for it on the next frame.
    const box =
      fit === undefined ? null : ui.shadow.querySelector<HTMLElement>(fit.selector);

    const { top, left } = placeAnchored(
      rect,
      { width: box?.offsetWidth ?? 0, height: box?.offsetHeight ?? 0 },
      { width: window.innerWidth, height: window.innerHeight },
      { gap: GAP, align: 'left', side: 'below', fit: fit !== undefined },
    );

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
      // event.target is retargeted to the shadow host, so composedPath() is the
      // only reliable containment test.
      const path = event.composedPath();
      if (path.includes(trigger)) return;
      if (ui !== null && path.includes(ui.shadowHost)) return;
      onClose();
    },
    { capture: true, signal },
  );

  // Only fires while focus is *outside* the shadow root: `isolateEvents` below stops key
  // events escaping it, so in-surface Escape arrives via the component's own `onclose`.
  // Both paths must dismiss identically.
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

  // createShadowRootUi is async while setup() hands back its cleanup synchronously, so
  // the `isDisposed` check after the await stops a fast navigation leaking a mounted UI.
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
      // The surface inside is `position: fixed`, so its host must take up no
      // layout space in the toolbar row.
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
