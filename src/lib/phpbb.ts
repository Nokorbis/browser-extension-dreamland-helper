/**
 * Helpers for reading the phpBB 3.20 DOM.
 *
 * Everything the extension knows about the forum's markup lives here, so that
 * when phpBB's HTML changes (or we support another skin) there is exactly one
 * place to update. Features should never hard-code selectors themselves.
 */

import { isSafeBBCodeName } from './dom';

/** Origins the extension runs on. Single source of truth for the manifest match. */
export const FORUM_MATCHES = ['*://*.dreamland-reborn.net/*'];

/**
 * The post/reply editor textarea on posting.php pages.
 * phpBB 3.x renders it as `<textarea name="message" id="message">`.
 */
export function findMessageTextarea(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>(
    'textarea#message, textarea[name="message"]',
  );
}

/**
 * The composer `<form>` that owns the message textarea. phpBB renders it as
 * `<form id="postform" method="post" action="./posting.php?...">`, but we reach
 * it through the textarea's own `form` property so we depend on neither the id
 * nor the skin.
 */
export function findPostForm(): HTMLFormElement | null {
  return findMessageTextarea()?.form ?? null;
}

/**
 * The real "submit the post" button inside the composer form. phpBB names it
 * `post` (`<input type="submit" name="post">`); the Preview, Save-draft and
 * Cancel buttons carry other `name`s. Used as the submitter when re-submitting
 * the form programmatically, so phpBB still receives the `post` field.
 */
export function findSubmitButton(form: HTMLFormElement): HTMLElement | null {
  return form.querySelector<HTMLElement>('input[name="post"], button[name="post"]');
}

/**
 * The composer's subject field — `<input type="text" name="subject" id="subject">`.
 *
 * ⚠ Two things about it, both verified against `real_snippets/posting.html`: it
 * carries `maxlength="124"`, and on a reply phpBB **pre-fills** it with
 * `Re: <topic title>`. So "the writer changed the subject" is
 * `value !== defaultValue`, exactly as it is for the message textarea, and
 * anything writing into it must respect the length limit.
 *
 * Absent on surfaces that don't take one, so callers must handle `null`.
 */
export function findSubjectInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(
    'input#subject, input[name="subject"]',
  );
}

/**
 * phpBB's BBCode button bar — the row holding B / i / u / Quote / Code above the
 * composer. prosilver's `posting_buttons.html` renders it as
 * `<div id="format-buttons" class="format-buttons">` with
 * `<button class="button button-icon-only bbcode-*">` children, identically in
 * 3.2.x and 3.3.x.
 *
 * The whole block sits behind `{IF S_BBCODE_ALLOWED}`, so it is legitimately
 * absent when BBCode is disabled for a forum — and a custom skin may drop it
 * altogether. **Callers must handle `null`** and degrade rather than throw.
 *
 * Verified against the live forum: `<div id="format-buttons" class="format-buttons">`,
 * whose children are the stock `bbcode-b/i/u/quote/code/list/img/url/color`
 * buttons, a `select.bbcode-size`, and several admin-added custom BBCodes
 * carrying `button-secondary` instead. We append after all of them.
 */
export function findFormatButtons(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#format-buttons, .format-buttons');
}

/**
 * A single button in that toolbar, addressed by the BBCode it inserts.
 *
 * phpBB derives each button's class from the BBCode tag name — `bbcode-b`,
 * `bbcode-quote`, `bbcode-img` for the stock set, and the *same* rule for
 * admin-added custom BBCodes, which is why `bbcode-spoiler` and `bbcode-mp3`
 * exist on this forum and are addressable without knowing anything else about
 * them. Non-alphanumerics become `-`, so the ordered-list button (`list=`) is
 * `bbcode-list-`.
 *
 * Matched with `[class~=…]` rather than `.bbcode-…` for two reasons: class
 * selectors match whole tokens, so `.bbcode-list` would not find `bbcode-list-`
 * anyway, and a CSS identifier ending in a hyphen is a needless edge case.
 *
 * Returns `null` when the toolbar is absent *or* when this forum has no such
 * BBCode — both are ordinary, and callers should degrade rather than throw.
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
 * phpBB's own toolbar-button classes. An injected button carries these so it
 * inherits the forum skin instead of looking like a foreign object — which is
 * also why the trigger button is *not* rendered inside a shadow root, where the
 * skin's styles cannot reach it. See docs/adr/0016-svelte-in-content-script.md.
 *
 * Mirrors the live forum's Bold button exactly:
 *   <button type="button" class="button button-icon-only bbcode-b" …>
 *     <i class="icon fa-bold fa-fw" aria-hidden="true"></i>
 *   </button>
 * so our own `<i class="icon fa-… fa-fw">` child inherits the same FontAwesome
 * sizing. We deliberately omit their `name` and `accesskey` — see the ⚠ note on
 * `createFormatButton` below.
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
 * Build a button styled as one of phpBB's own toolbar buttons.
 *
 * ⚠ **This is why the helper exists.** The composer toolbar lives inside
 * `<form id="postform">`. A button there that is not `type="button"`, or that carries a
 * `name`, is a *submit* button: clicking it fires a submit event which the exit guard
 * reads as a genuine post, and **the half-written message is sent**. Both features that
 * inject a trigger carried their own copy of that warning, and nothing enforced it. Here
 * the type is set and the name is never accepted, so the hazard is unrepresentable rather
 * than remembered. See `src/features/exit-guard/index.ts`.
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
 * The `<div id="message-box">` wrapping the composer textarea — the anchor for
 * any UI that wants to sit beside the editor. Falls back to the textarea's own
 * parent so a skin that renamed the wrapper still gives us something usable.
 *
 * ⚠ Mount editor-adjacent UI **inside** this element, not as a sibling before
 * it. Its siblings in the fieldset are `#format-buttons` and a right-floated
 * `#smiley-box`; a block-level sibling therefore spans the whole fieldset and
 * runs underneath the emoticon list. Anything inside `#message-box` instead
 * inherits the same column the textarea occupies, whatever width the skin
 * chose.
 */
export function findMessageBox(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('#message-box, .message-box') ??
    findMessageTextarea()?.parentElement ??
    null
  );
}

/**
 * Whether the forum is currently showing its dark theme.
 *
 * The skin marks it with a `dark` class on `<html>`, toggled without a reload.
 * This is forum knowledge, so it lives here rather than in the feature.
 *
 * In-page UI must key off **this**, not `@media (prefers-color-scheme: dark)`:
 * that media query reports the *operating system's* preference, which says
 * nothing about which theme the forum is showing. (Extension pages — popup,
 * options — are the opposite case and should keep using the media query.)
 */
export function isDarkTheme(): boolean {
  return document.documentElement.classList.contains('dark');
}

/**
 * Observe theme changes and report the new state. Returns an unsubscriber.
 *
 * A `MutationObserver` rather than a one-shot read because the forum's theme
 * switch mutates the class in place — a UI that only sampled at boot would be
 * left inverted until the next page load.
 *
 * CSS alone cannot do this from inside a shadow root: `:host-context()` would
 * express it, but Firefox does not support it. Hence the JS detour.
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
 * The topic review (`<div id="topicreview">`) shown below the composer on a
 * reply page — the last posts of the thread, rendered. Absent on a new topic and
 * when the "Relecture du sujet" block is disabled. The colour-grab feature reads
 * its inline colour spans; see `readReviewColorUsages`.
 */
export function findTopicReview(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#topicreview');
}

/**
 * The topic review's own heading — `<h3 id="review" class="review">`, carrying
 * the "Relecture du sujet" title and phpBB's Agrandir/Réduire link.
 *
 * It is a **sibling** of `#topicreview` inside `<form id="postform">`, not its
 * parent, which is why anything re-arranging the reply page has to move the two
 * together. It is also the boundary between the two halves of that form: every
 * child before it belongs to the composer, this one and everything after it to
 * the review. See `docs/adr/0030-reply-page-layout-rearrangement.md`.
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
 * Every post's message body on the page, paired with its numeric post id —
 * across both viewtopic and the topic review (`.post` matches both). The body is
 * `.content`, the same element `readReviewColorUsages` reads. Posts without a
 * resolvable id (e.g. a live `#preview` block) or without a `.content` are
 * skipped. The highlight feature anchors ranges inside these `.content` elements.
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
 * The current topic id, or null when it can't be determined.
 *
 * Usually the `t=` query param (`viewtopic.php?t=…`, `posting.php?mode=reply&t=…`).
 * Post-permalink pages (`viewtopic.php?p=…#p…`) omit it, so fall back to the
 * `&t=<id>` phpBB puts on its reply/quote and pagination links. Used to scope a
 * "clear this discussion" without reading the whole page.
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
 * Whether we are on a thread view (`viewtopic.php`).
 *
 * Used as a *success* signal: landing here after a submit is the point at which
 * the post demonstrably went through, which is what lets `exit-guard` retire
 * a draft it only marked as submitted. A bounced submit leaves you on
 * `posting.php` or an error page instead.
 */
export function isTopicPage(): boolean {
  return /\/viewtopic\.php$/.test(location.pathname);
}

/**
 * What the composer's URL says about which document is being written.
 *
 * `mode` is phpBB's own (`reply`, `quote`, `post`, `edit`, and others we don't
 * care about); the rest are the id it pairs with — `t` a topic, `f` a forum,
 * `p` a post. Any of them may be `null`; deciding what a given combination
 * *means* is `draftKey`'s job in `@/lib/drafts`, not this module's.
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
 * Read the composer's mode and ids off the current URL.
 *
 * ⚠ **From `location.search`, never from `form.action`.** phpBB's Preview button
 * carries `onclick="document.getElementById('postform').action += '#preview'"`
 * (`real_snippets/posting.html`), so the form's action mutates under any code
 * that reads it after a click. The URL doesn't move.
 *
 * The form itself is no help either: its only hidden inputs are
 * `topic_cur_post_id`, `show_panel`, `creation_time` and `form_token` — the
 * mode and the ids live *solely* in the action's query string, which is a copy
 * of the URL we were loaded with.
 *
 * `t` falls back to `readTopicId()` because a `mode=quote&p=…` URL carries no
 * topic id, while the topic-review links on that same page do.
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
 * phpBB's font-colour palette (`<div id="colour_palette">`), toggled open by the
 * `bbcode-color` toolbar button. It is `display:none` until opened.
 *
 * ⚠ Its inner grid is **generated by phpBB's own JS** (`registerPalette` in
 * core.js) on DOM-ready: the server-rendered `<table>` inside
 * `#color_palette_placeholder` is replaced wholesale, and each swatch's click is
 * bound per-anchor. Anything that decorates the grid must therefore survive (and
 * re-run after) that regeneration — watch the placeholder, don't assume the
 * table read at boot is the final one.
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
 * Every inline colour used in the topic review, each paired with the author of
 * the post it appears in. Returns raw `span.style.color` strings (browser-
 * serialised `rgb(…)`) so the colour maths — canonicalising and grouping — stays
 * out of this forum-DOM module; see `canonicalizeColor` / `aggregateUsage`.
 *
 * A colour is attributed to the containing post's author whether they authored
 * or quoted it: telling the two apart isn't reliable (colours get reproduced
 * with or without `[quote]`, sometimes from an earlier page), so the feature
 * instead lists everyone and orders by usage.
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
 * The display name of a post's author. phpBB renders it as
 * `<p class="author">… <a class="username-coloured">Name</a></p>`; members with
 * no group colour get a plain `.username`, so fall back to it and then to any
 * author link. `.author` sits inside `.postbody`, so this works from the `.post`
 * container on both viewtopic and the topic review.
 */
export function readPostAuthorName(post: HTMLElement): string | null {
  const link =
    post.querySelector<HTMLElement>('.author a.username-coloured') ??
    post.querySelector<HTMLElement>('.author a.username') ??
    post.querySelector<HTMLElement>('.author a');
  const name = link?.textContent?.trim();
  return name === undefined || name === '' ? null : name;
}
