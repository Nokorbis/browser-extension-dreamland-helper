/**
 * Everything the extension knows about phpBB 3.20's markup. Features must not query the
 * forum DOM themselves — when the skin changes, this is the one file to update.
 */

import { isSafeBBCodeName } from './dom';

/** Origins the extension runs on. The manifest's content-script match reuses this. */
export const FORUM_MATCHES = ['*://*.dreamland-reborn.net/*'];

export function findMessageTextarea(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>(
    'textarea#message, textarea[name="message"]',
  );
}

/** Reached through the textarea's `form`, so it depends on neither `#postform` nor the skin. */
export function findPostForm(): HTMLFormElement | null {
  return findMessageTextarea()?.form ?? null;
}

/**
 * The real "submit the post" button — phpBB names it `post`, while Preview, Save-draft and
 * Cancel carry other `name`s. Used as the submitter when re-firing the form programmatically,
 * so phpBB still receives the `post` field.
 */
export function findSubmitButton(form: HTMLFormElement): HTMLElement | null {
  return form.querySelector<HTMLElement>('input[name="post"], button[name="post"]');
}

/**
 * The composer's subject field. Two things about it, verified against
 * `real_snippets/posting.html`: it carries `maxlength="124"`, and on a reply phpBB
 * **pre-fills** it with `Re: <topic title>` — so "the writer changed the subject" is
 * `value !== defaultValue`, as it is for the message textarea. Absent on surfaces that
 * take none, so handle `null`.
 */
export function findSubjectInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(
    'input#subject, input[name="subject"]',
  );
}

/**
 * phpBB's BBCode button bar. Legitimately absent when BBCode is disabled for a forum
 * (the whole block sits behind `{IF S_BBCODE_ALLOWED}`), so callers must handle `null`
 * and degrade rather than throw. We append after all of its children.
 */
export function findFormatButtons(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#format-buttons, .format-buttons');
}

/**
 * A single toolbar button, addressed by the BBCode it inserts.
 *
 * phpBB derives each button's class from the tag name (`bbcode-b`, `bbcode-quote`), and by
 * the *same* rule for admin-added custom BBCodes — which is why `bbcode-spoiler` is
 * addressable for free. Non-alphanumerics become `-`, so the ordered-list button (`list=`)
 * is `bbcode-list-`; hence `[class~=…]`, since `.bbcode-list` would not match it anyway.
 *
 * `null` when the toolbar is absent *or* this forum has no such BBCode — both ordinary.
 */
export function findFormatButton(bbcode: string): HTMLElement | null {
  // The names are literals from callers' own tables, but an invalid one would
  // make querySelector throw a SyntaxError and take the whole feature down.
  if (!isSafeBBCodeName(bbcode)) return null;
  return (
    findFormatButtons()?.querySelector<HTMLElement>(
      `button[class~="bbcode-${bbcode}"]`,
    ) ?? null
  );
}

/**
 * phpBB's own toolbar-button classes, so an injected button inherits the forum skin — which
 * is also why such a trigger is *not* rendered inside a shadow root, where the skin's styles
 * cannot reach it. See docs/adr/0016-svelte-in-content-script.md. Mirrors the live Bold
 * button, so our `<i class="icon fa-… fa-fw">` child inherits its FontAwesome sizing.
 */
export const FORMAT_BUTTON_CLASS = 'button button-icon-only';

/** What a toolbar trigger needs to look and behave like one of phpBB's own. */
export interface FormatButtonOptions {
  /** FontAwesome glyph class, e.g. `fa-magic` or `fa-face-smile`. */
  icon: string;
  /** Accessible name. */
  label: string;
  /** Tooltip — usually the label plus the keyboard combo. Defaults to `label`. */
  tooltip?: string;
  /** Sets `aria-haspopup` and seeds `aria-expanded="false"` for a surface it opens. */
  popup?: 'menu' | 'dialog';
  /** `aria-keyshortcuts` spelling, from `formatCombo`/`ariaCombo` in `@/lib/keys`. */
  keyshortcuts?: string;
}

/**
 * Build a button styled as one of phpBB's own.
 *
 * ⚠ **This is why the helper exists.** The composer toolbar lives inside
 * `<form id="postform">`, where a button that is not `type="button"` — or that carries a
 * `name` — is a *submit*: the exit guard reads the resulting event as a genuine post and
 * **the half-written message is sent**. Here the type is set and the name is never
 * accepted, so the hazard is unrepresentable rather than remembered.
 */
export function createFormatButton(opts: FormatButtonOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button'; // MANDATORY — see above. Never add a `name`.
  button.className = FORMAT_BUTTON_CLASS;
  button.title = opts.tooltip ?? opts.label;
  button.setAttribute('aria-label', opts.label);
  if (opts.popup !== undefined) {
    button.setAttribute('aria-haspopup', opts.popup);
    button.setAttribute('aria-expanded', 'false');
  }
  if (opts.keyshortcuts !== undefined) {
    button.setAttribute('aria-keyshortcuts', opts.keyshortcuts);
  }
  // Deliberately no `accesskey`: phpBB already claims b/i/u/q/c/l/o/y/p/w/d.
  const icon = document.createElement('i');
  icon.className = `icon ${opts.icon} fa-fw`;
  icon.setAttribute('aria-hidden', 'true');
  button.append(icon);
  return button;
}

/**
 * The wrapper around the composer textarea — the anchor for editor-adjacent UI. Falls back
 * to the textarea's parent so a skin that renamed it still gives us something usable.
 *
 * ⚠ Mount **inside** this element, not as a sibling before it: its siblings are
 * `#format-buttons` and a right-floated `#smiley-box`, so a block-level sibling spans the
 * whole fieldset and runs underneath the emoticon list.
 */
export function findMessageBox(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('#message-box, .message-box') ??
    findMessageTextarea()?.parentElement ??
    null
  );
}

/**
 * Whether the forum is showing its dark theme — a `dark` class on `<html>`, toggled without
 * a reload. In-page UI must key off this, **not** `@media (prefers-color-scheme: dark)`,
 * which reports the OS preference and says nothing about the forum's theme. (Extension
 * pages — popup, options — are the opposite case.)
 */
export function isDarkTheme(): boolean {
  return document.documentElement.classList.contains('dark');
}

/**
 * Observe theme changes. Returns an unsubscriber.
 *
 * An observer rather than a one-shot read because the theme switch mutates the class in
 * place. CSS cannot express this from inside a shadow root portably — `:host-context()` is
 * unsupported in Firefox — hence the JS detour.
 */
export function watchTheme(onChange: (dark: boolean) => void): () => void {
  let last = isDarkTheme();
  const observer = new MutationObserver(() => {
    const next = isDarkTheme();
    if (next !== last) {
      last = next;
      onChange(next);
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => observer.disconnect();
}

/**
 * The topic review shown below the composer on a reply page. Absent on a new topic and when
 * the "Relecture du sujet" block is disabled.
 */
export function findTopicReview(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#topicreview');
}

/**
 * The topic review's heading. It is a **sibling** of `#topicreview` inside `#postform`, not
 * its parent, so anything re-arranging the reply page has to move the two together. It is
 * also the boundary between the form's two halves: children before it belong to the
 * composer, it and everything after to the review. See docs/adr/0030.
 */
export function findReviewHeading(): HTMLElement | null {
  return document.querySelector<HTMLElement>('h3#review');
}

/** The numeric id decoded from a single element's `p…`/`pr…` id, or null. */
function parsePostId(el: HTMLElement | null): string | null {
  if (el === null) return null;
  const match = /^pr?(\d+)$/.exec(el.id);
  return match === null ? null : match[1];
}

/**
 * The numeric post id for a `.post` container — the key shared between viewtopic
 * and the topic review.
 *
 * ⚠ The id lives on a **different element** in the two contexts, verified against
 * the live forum:
 *   - viewtopic: on the `.post` div itself — `<div id="p{POST_ID}" class="post …">`;
 *     its `.postbody` carries no id (the content wrapper is `#post_content{POST_ID}`).
 *   - topic review (posting.php): the `.post` div has **no id**; the `pr{POST_ID}`
 *     sits on the inner `.postbody` — `<div class="postbody" id="pr{POST_ID}">`.
 * Both decode to the same number, which is what lets a highlight follow a post
 * across the two pages. Reading only the `.post` div would silently drop every
 * review post. Returns null for a block that is neither (e.g. a live `#preview`).
 */
export function readPostId(post: HTMLElement): string | null {
  return parsePostId(post) ?? parsePostId(post.querySelector<HTMLElement>('.postbody'));
}

/**
 * Every post's message body, paired with its numeric post id, across both viewtopic and the
 * topic review. Posts without a resolvable id (a live `#preview`) or without a `.content`
 * are skipped.
 */
export function findPostContentElements(): {
  postId: string;
  content: HTMLElement;
}[] {
  const out: { postId: string; content: HTMLElement }[] = [];
  for (const post of document.querySelectorAll<HTMLElement>('.post')) {
    const postId = readPostId(post);
    if (postId === null) continue;
    const content = post.querySelector<HTMLElement>('.content');
    if (content === null) continue;
    out.push({ postId, content });
  }
  return out;
}

/**
 * The current topic id, or null. Usually the `t=` query param; post-permalink pages
 * (`viewtopic.php?p=…`) omit it, so fall back to the `&t=<id>` phpBB puts on its
 * reply/quote and pagination links.
 */
export function readTopicId(): string | null {
  const fromUrl = new URLSearchParams(location.search).get('t');
  if (fromUrl !== null && /^\d+$/.test(fromUrl)) return fromUrl;

  for (const anchor of document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="posting.php"], a[href*="viewtopic.php"]',
  )) {
    const match = /[?&]t=(\d+)/.exec(anchor.getAttribute('href') ?? '');
    if (match !== null) return match[1];
  }
  return null;
}

/**
 * Used as a *success* signal: landing here after a submit is the point at which the post
 * demonstrably went through, which is what lets `exit-guard` retire a draft it only marked.
 * A bounced submit leaves you on `posting.php` or an error page instead.
 */
export function isTopicPage(): boolean {
  return /\/viewtopic\.php$/.test(location.pathname);
}

/**
 * What the composer's URL says about which document is being written. `mode` is phpBB's own;
 * the rest are the id it pairs with. Any may be `null`; deciding what a combination *means*
 * is `draftKey`'s job in `@/lib/drafts`.
 */
export interface ComposerParams {
  mode: string | null;
  t: string | null;
  f: string | null;
  p: string | null;
}

function readNumericParam(params: URLSearchParams, name: string): string | null {
  const value = params.get(name);
  return value !== null && /^\d+$/.test(value) ? value : null;
}

/**
 * ⚠ Read from `location.search`, **never** from `form.action`: phpBB's Preview button
 * appends `#preview` to the action on click, so it mutates under any code that reads it
 * afterwards. The form's hidden inputs are no help either — the mode and ids live solely in
 * that query string.
 *
 * `t` falls back to `readTopicId()` because a `mode=quote&p=…` URL carries no topic id,
 * while the topic-review links on that same page do.
 */
export function readComposerParams(): ComposerParams {
  const params = new URLSearchParams(location.search);
  return {
    mode: params.get('mode'),
    t: readNumericParam(params, 't') ?? readTopicId(),
    f: readNumericParam(params, 'f'),
    p: readNumericParam(params, 'p'),
  };
}

/**
 * phpBB's font-colour palette, `display:none` until the `bbcode-color` button opens it.
 *
 * ⚠ Its inner grid is **generated by phpBB's own JS** (`registerPalette`) on DOM-ready: the
 * server-rendered table is replaced wholesale and each swatch's click bound per-anchor.
 * Anything decorating the grid must survive and re-run after that — watch the placeholder,
 * don't assume the table read at boot is the final one.
 */
export function findColourPalette(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#colour_palette');
}

/** The element phpBB regenerates the palette grid into — the mutation to watch. */
export function findColourPalettePlaceholder(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#color_palette_placeholder');
}

/**
 * The palette swatches — `<a data-color="RRGGBB">`, uppercase hex without a `#`.
 * phpBB's own click handler on each inserts `[color=#RRGGBB]…[/color]`.
 */
export function findColourPaletteCells(): HTMLAnchorElement[] {
  return Array.from(
    document.querySelectorAll<HTMLAnchorElement>(
      '#color_palette_placeholder a[data-color]',
    ),
  );
}

/** The palette grid's `<tbody>` — where extra rows of swatches get appended. */
export function findColourPaletteBody(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#color_palette_placeholder table tbody');
}

/**
 * Every inline colour used in the topic review, paired with the author of the post it
 * appears in. Returns raw `span.style.color` strings so the colour maths stays out of this
 * module; see `canonicalizeColor` / `aggregateUsage`.
 *
 * A colour is attributed to the containing post's author whether they authored or quoted it:
 * telling the two apart isn't reliable, so the feature lists everyone and orders by usage.
 */
export function readReviewColorUsages(): { rawColor: string; author: string }[] {
  const review = findTopicReview();
  if (review === null) return [];

  const usages: { rawColor: string; author: string }[] = [];
  for (const post of review.querySelectorAll<HTMLElement>('.post')) {
    const author = readPostAuthorName(post);
    if (author === null) continue;
    const content = post.querySelector<HTMLElement>('.content');
    if (content === null) continue;
    for (const span of content.querySelectorAll<HTMLElement>('span[style*="color"]')) {
      const rawColor = span.style.color;
      if (rawColor.trim() === '') continue; // e.g. a stray background-color span
      usages.push({ rawColor, author });
    }
  }
  return usages;
}

/**
 * Members with no group colour get a plain `.username` instead of `.username-coloured`,
 * hence the fallback chain. `.author` sits inside `.postbody`, so this works from the
 * `.post` container on both viewtopic and the topic review.
 */
export function readPostAuthorName(post: HTMLElement): string | null {
  const link =
    post.querySelector<HTMLElement>('.author a.username-coloured') ??
    post.querySelector<HTMLElement>('.author a.username') ??
    post.querySelector<HTMLElement>('.author a');
  const name = link?.textContent?.trim();
  return name === undefined || name === '' ? null : name;
}
