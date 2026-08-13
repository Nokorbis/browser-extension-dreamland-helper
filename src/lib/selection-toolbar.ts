/**
 * The **shared selection toolbar** — one small floating row of buttons that
 * appears over a text selection inside a post's message body, on both viewtopic
 * and the reply composer's topic review.
 *
 * It began life inside the `highlight` feature (a row of colour swatches plus an
 * eraser). `quote-selection` is the second caller, so under docs/adr/0023 the
 * primitive moves here rather than one feature importing from another. What
 * moved is not just the bar's markup but the whole path that leads to it — the
 * document event wiring, locating which post a selection sits in, the placement
 * maths and the theme watch — because those were never highlight-specific and
 * two copies would fight over the same selection. See
 * docs/adr/0028-shared-selection-toolbar.md.
 *
 * Features **register a group** rather than build a bar: `buttonsFor(selection)`
 * is asked on every selection and returns the buttons that apply (an empty array
 * withdraws the group). The bar shows when at least one group offers a button,
 * and groups render in registration order.
 *
 * This is a singleton, created lazily on the first registration and torn down
 * when the last group unregisters, so a page with both features off carries no
 * host and no listeners.
 *
 * Like `@/lib/popover.ts`, it is DOM and event glue with **no automated coverage
 * by design** — the test suite has no DOM (see CLAUDE.md). Its *geometry* is the
 * exception and does not live here: `placeAnchored` in `@/lib/anchor-position`
 * owns that as pure, unit-tested arithmetic. Editing this module means
 * re-verifying **both** the highlight swatches and the quote button by hand, in
 * both forum themes and both browsers.
 */
import { placeAnchored } from '@/lib/anchor-position';
import { isDarkTheme, readPostId, watchTheme } from '@/lib/phpbb';
import {
  chromeFor,
  createShadowHost,
  MAX_Z,
  styled,
  SYSTEM_FONT,
  type Chrome,
} from '@/lib/shadow-ui';

/**
 * Gap between the selection and the toolbar, and its minimum margin from a
 * viewport edge — `placeAnchored` takes the one number for both.
 */
const GAP = 6;

/** A live selection that sits wholly inside one post's message body. */
export interface PostSelection {
  /** The live DOM range. */
  range: Range;
  /** The post's `.content` element — what offsets are measured against. */
  content: HTMLElement;
  /** The `.post` container, for whole-post knowledge (author, quote attributes). */
  post: HTMLElement;
  /** phpBB's numeric post id, shared between viewtopic and the topic review. */
  postId: string;
  /** The selected text, raw (`range.toString()`). */
  text: string;
}

/**
 * One button in the row. `swatch` paints a colour chip (the highlight palette),
 * `glyph` renders a character (the eraser, the quote mark); a button gives one
 * or the other.
 */
export interface ToolbarButton {
  /** Stable within its group — used to key the DOM node, not shown. */
  key: string;
  /** Tooltip and accessible name. */
  label: string;
  /** Background colour for a swatch-style button. */
  swatch?: string;
  /** Text content for an action-style button. */
  glyph?: string;
  /**
   * Invoked on click, with the selection the row was built for. The page
   * selection is still alive at this point (the row cancels its own mousedown),
   * so a handler may read it.
   */
  onSelect: (selection: PostSelection) => void;
}

export interface ToolbarGroup {
  /** The owning feature's id, for ordering and diagnostics. */
  id: string;
  /** The buttons that apply to this selection; `[]` withdraws the group. */
  buttonsFor: (selection: PostSelection) => ToolbarButton[];
}

interface ToolbarInstance {
  host: HTMLElement;
  bar: HTMLElement;
  chrome: Chrome;
  visible: boolean;
  teardown: () => void;
}

const groups: ToolbarGroup[] = [];
let instance: ToolbarInstance | null = null;

/**
 * The single `.content` a range sits wholly inside, with its post and id.
 *
 * Returns null when the selection escapes a post body — spanning two posts, or
 * landing in a signature, the composer, or page chrome. `readPostId` is what
 * makes this work on both page shapes: viewtopic puts the id on `.post`, the
 * topic review on the inner `.postbody`.
 */
function locate(range: Range): Omit<PostSelection, 'range' | 'text'> | null {
  const common = range.commonAncestorContainer;
  const el =
    common.nodeType === Node.ELEMENT_NODE ? (common as Element) : common.parentElement;
  const content = el?.closest<HTMLElement>('.content') ?? null;
  if (content === null) return null;
  const post = content.closest<HTMLElement>('.post');
  if (post === null) return null;
  const postId = readPostId(post);
  if (postId === null) return null;
  return { content, post, postId };
}

function buildButton(
  button: ToolbarButton,
  selection: PostSelection,
  chrome: Chrome,
): HTMLButtonElement {
  const isSwatch = button.swatch !== undefined;
  const el = styled(
    document.createElement('button'),
    (isSwatch
      ? `width:20px;height:20px;background:${button.swatch};`
      : `width:22px;height:20px;background:transparent;color:${chrome.fg};` +
        `font:15px/1 ${SYSTEM_FONT};`) +
      'padding:0;border-radius:4px;cursor:pointer;' +
      `border:1px solid ${chrome.border};`,
  );
  el.type = 'button';
  el.title = button.label;
  el.setAttribute('aria-label', button.label);
  if (button.glyph !== undefined) el.textContent = button.glyph;
  // preventDefault keeps the page selection alive across the click — without it
  // the mousedown collapses the very range the handler is about to act on.
  el.addEventListener('mousedown', (event) => event.preventDefault());
  el.addEventListener('click', (event) => {
    event.preventDefault();
    button.onSelect(selection);
  });
  return el;
}

/** Create the host, the row and the document listeners. Called once, lazily. */
function createInstance(): ToolbarInstance {
  const { host, shadow } = createShadowHost();
  const bar = styled(
    document.createElement('div'),
    'position:fixed;z-index:' +
      MAX_Z +
      ';display:none;box-sizing:border-box;gap:5px;align-items:center;' +
      `padding:5px 6px;border-radius:8px;font:13px/1 ${SYSTEM_FONT};`,
  );
  shadow.append(bar);
  document.body.append(host);

  const self: ToolbarInstance = {
    host,
    bar,
    chrome: chromeFor(false),
    visible: false,
    teardown: () => undefined,
  };

  const paint = () => {
    bar.style.background = self.chrome.surface;
    bar.style.border = `1px solid ${self.chrome.border}`;
    bar.style.boxShadow = `0 4px 16px ${self.chrome.shadow}`;
  };
  const applyTheme = (dark: boolean) => {
    self.chrome = chromeFor(dark);
    paint();
  };
  applyTheme(isDarkTheme());
  const unwatchTheme = watchTheme(applyTheme);

  const controller = new AbortController();
  const { signal } = controller;

  /** True when an event landed on our own UI — retargeted, so composedPath. */
  const onOurUi = (event: Event) => event.composedPath().includes(host);

  // Evaluate after the mouseup so the selection is final; ignore clicks on our
  // own row, which would otherwise dismiss the toolbar being clicked.
  document.addEventListener(
    'mouseup',
    (event) => {
      if (onOurUi(event)) return;
      setTimeout(evaluateSelection, 0);
    },
    { signal },
  );
  // Starting a new click or drag elsewhere dismisses a stale row.
  document.addEventListener(
    'mousedown',
    (event) => {
      if (!self.visible || onOurUi(event)) return;
      hide();
    },
    { signal },
  );
  // A `position: fixed` row doesn't follow the selection when the page moves.
  const hideOnMove = () => {
    if (self.visible) hide();
  };
  document.addEventListener('scroll', hideOnMove, { capture: true, signal });
  window.addEventListener('resize', hideOnMove, { signal });

  self.teardown = () => {
    controller.abort();
    unwatchTheme();
    host.remove();
  };
  return self;
}

function hide(): void {
  if (instance === null) return;
  instance.bar.style.display = 'none';
  instance.visible = false;
}

/**
 * Ask every group what it offers for the current selection and show, or hide.
 *
 * The row is rebuilt on each show rather than kept and toggled: `buttonsFor` is
 * dynamic (highlight's eraser only exists over an existing highlight) and a row
 * of a handful of buttons is cheap to rebuild.
 */
function evaluateSelection(): void {
  if (instance === null) return;
  const sel = window.getSelection();
  if (sel === null || sel.isCollapsed || sel.rangeCount === 0) return hide();

  const range = sel.getRangeAt(0);
  const where = locate(range);
  if (where === null) return hide();

  const text = range.toString();
  if (text.trim() === '') return hide();

  const selection: PostSelection = { range, text, ...where };
  const buttons: ToolbarButton[] = [];
  for (const group of groups) buttons.push(...group.buttonsFor(selection));
  if (buttons.length === 0) return hide();

  const { bar, chrome } = instance;
  bar.replaceChildren(...buttons.map((b) => buildButton(b, selection, chrome)));
  bar.style.display = 'inline-flex';

  // Measure off-screen first: the row's width depends on which buttons this
  // selection produced, so it has to be laid out before it can be placed.
  bar.style.left = '-9999px';
  bar.style.top = '-9999px';
  const box = bar.getBoundingClientRect();

  const { top, left } = placeAnchored(
    range.getBoundingClientRect(),
    { width: box.width, height: box.height },
    { width: window.innerWidth, height: window.innerHeight },
    { gap: GAP, align: 'center', side: 'above', fit: true },
  );
  bar.style.left = `${Math.round(left)}px`;
  bar.style.top = `${Math.round(top)}px`;
  instance.visible = true;
}

/**
 * Register a feature's buttons and get back its unregister function. Wire that
 * into the feature's cleanup — the toolbar tears itself down when the last
 * group leaves.
 */
export function registerSelectionToolbarGroup(group: ToolbarGroup): () => void {
  groups.push(group);
  instance ??= createInstance();

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    const at = groups.indexOf(group);
    if (at !== -1) groups.splice(at, 1);
    if (groups.length > 0) return;
    instance?.teardown();
    instance = null;
  };
}

/**
 * Hide the toolbar and drop the page selection — what a handler calls once it
 * has acted, so the row doesn't linger over text the user is done with.
 */
export function dismissSelectionToolbar(): void {
  hide();
  window.getSelection()?.removeAllRanges();
}
