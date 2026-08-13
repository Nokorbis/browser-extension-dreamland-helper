/**
 * The **shared selection toolbar** — one floating row of buttons over a text selection
 * inside a post's message body, on both viewtopic and the topic review. See docs/adr/0028.
 *
 * Features **register a group** rather than build a bar: `buttonsFor(selection)` is asked on
 * every selection and returns the buttons that apply (`[]` withdraws the group). The bar
 * shows when at least one group offers a button, and groups render in registration order —
 * so several features share one bar instead of fighting over the same selection.
 *
 * A singleton, created lazily on the first registration and torn down when the last group
 * leaves, so a page with those features off carries no host and no listeners.
 *
 * ⚠ Like `@/lib/popover.ts` this is DOM and event glue with **no automated coverage by
 * design**: editing it means re-verifying every registered group by hand, in both forum
 * themes and both browsers. Its geometry is the exception and lives in
 * `@/lib/anchor-position` as pure, unit-tested arithmetic.
 */
import { placeAnchored } from '@/lib/anchor-position';
import { followTheme, readPostId } from '@/lib/phpbb';
import {
  createShadowHost,
  MAX_Z,
  styled,
  SYSTEM_FONT,
  themed,
  type Chrome,
  type Themed,
} from '@/lib/shadow-ui';

/** Gap from the selection, and minimum margin from a viewport edge — one number for both. */
const GAP = 6;

/** A live selection that sits wholly inside one post's message body. */
export interface PostSelection {
  /** The live DOM range. */
  range: Range;
  /** The post's `.content` element — what offsets are measured against. */
  content: HTMLElement;
  /** phpBB's numeric post id, shared between viewtopic and the topic review. */
  postId: string;
  /** The selected text, raw (`range.toString()`). */
  text: string;
}

/** A button gives either a `swatch` (a colour chip) or a `glyph` (a character), not both. */
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
   * Invoked on click with the selection the row was built for. The page selection is still
   * alive at that point — the row cancels its own mousedown — so a handler may read it.
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
  theme: Themed;
  visible: boolean;
  teardown: () => void;
}

const groups: ToolbarGroup[] = [];
let instance: ToolbarInstance | null = null;

/**
 * The single `.content` a range sits wholly inside, with its post and id. Null when the
 * selection escapes a post body — spanning two posts, or landing in a signature, the
 * composer or page chrome.
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
  return { content, postId };
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
  // preventDefault keeps the page selection alive across the click — without it the
  // mousedown collapses the very range the handler is about to act on.
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

  // The palette is read back out of `theme` when a row is built, so the instance holds the
  // handle rather than a snapshot.
  const theme = themed();
  theme.paints((chrome) => {
    bar.style.background = chrome.surface;
    bar.style.border = `1px solid ${chrome.border}`;
    bar.style.boxShadow = `0 4px 16px ${chrome.shadow}`;
  });
  const unwatchTheme = followTheme(theme.setDark);

  const self: ToolbarInstance = {
    host,
    bar,
    theme,
    visible: false,
    teardown: () => undefined,
  };

  const controller = new AbortController();
  const { signal } = controller;

  /** Targets inside a shadow root are retargeted, so composedPath is the only test. */
  const onOurUi = (event: Event) => event.composedPath().includes(host);

  // After the mouseup, so the selection is final. Clicks on our own row are ignored,
  // or they would dismiss the toolbar being clicked.
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
 * Ask every group what it offers for the current selection, then show or hide. The row is
 * rebuilt on each show rather than toggled: `buttonsFor` is dynamic — highlight's eraser
 * only exists over an existing highlight — and a handful of buttons is cheap to rebuild.
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

  const { bar, theme } = instance;
  bar.replaceChildren(...buttons.map((b) => buildButton(b, selection, theme.chrome())));
  bar.style.display = 'inline-flex';

  // Measure off-screen first: the row's width depends on which buttons this selection
  // produced, so it has to be laid out before it can be placed.
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

/** Returns its unregister function; wire that into the feature's cleanup. */
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

/** What a handler calls once it has acted, so the row doesn't linger over finished text. */
export function dismissSelectionToolbar(): void {
  hide();
  window.getSelection()?.removeAllRanges();
}
