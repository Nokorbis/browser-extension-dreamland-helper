/**
 * Building the `[quote]` block, and nothing else — pure string work, so it is
 * unit-tested (`bbcode.test.ts`) while the DOM around it is verified by hand.
 *
 * The target is phpBB's *own* output. Its topic review hands `addquote` an
 * attribute triple (`{post_id, time, user_id}`), and a quote carrying those
 * renders with the "a écrit" header **and** the arrow back to the source post.
 * Emitting the same thing means a quoted passage is indistinguishable from one
 * made with the forum's own button — see docs/adr/0029.
 */
import type { QuoteAttributes } from '@/lib/phpbb';

/**
 * Escape a value for the `[quote=…]` attribute, matching phpBB's
 * `format_quote_attribute_value`: backslash first (or it would double-escape the
 * escapes added next), then the double quote.
 *
 * The value is always wrapped in quotes rather than only when it contains a
 * space. phpBB accepts both, and a name like `Père Castor` needs them anyway, so
 * the unconditional form is one rule instead of two.
 */
function quoteAttributeValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * A `[quote]` block wrapping `body`, ending in a newline so the reply starts on
 * its own line.
 *
 * Degrades one step at a time rather than refusing: without attributes it is
 * `[quote="Nom"]`, and without an author (a deleted member, a skin we don't
 * recognise) a bare `[quote]`. Both still render as a quote, which is the point.
 */
export function formatQuote(
  body: string,
  meta: { author: string | null; attributes: QuoteAttributes | null },
): string {
  const parts: string[] = [];
  if (meta.author !== null) parts.push(`=${quoteAttributeValue(meta.author)}`);
  if (meta.author !== null && meta.attributes !== null) {
    parts.push(
      ` post_id=${meta.attributes.postId}`,
      ` time=${meta.attributes.time}`,
      ` user_id=${meta.attributes.userId}`,
    );
  }
  return `[quote${parts.join('')}]${body}[/quote]\n`;
}
