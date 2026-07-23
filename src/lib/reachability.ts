/**
 * Network reachability preflight for the forum.
 *
 * The exit guard uses this to confirm the server actually responds *before* a
 * post submission navigates away — a down forum, or a broken intermediate
 * gateway, otherwise swallows the POST and loses the draft. See
 * docs/adr/0011-presend-server-reachability-check.md.
 */
import { log } from '@/lib/log';

/** How long to wait for the ping before treating the forum as unreachable. */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Ping the forum and report whether it looks reachable.
 *
 * Callers should probe the URL the POST actually targets (the composer form's
 * `action`, i.e. `posting.php`) rather than the homepage: a caching proxy/CDN
 * can serve a stale `200` for `/` while the origin that handles the POST is
 * down — the very "intermediate gateway" case this guards against. We also
 * cache-bust the request so no cache layer can answer it. The verdict is
 * deliberately lenient:
 *
 * - reachable   → a response came back with status < 500
 * - unreachable → the request threw, timed out, or returned 5xx (the
 *   "gateway down" case)
 *
 * Odd-but-alive statuses (a 405 to HEAD, an auth 403) count as reachable; the
 * exit guard's "send anyway" escape hatch covers the rare false positive, so it
 * is better to under- than over-block.
 *
 * Note: this runs in the content script's own network context, which is *not*
 * affected by DevTools "Offline" throttling — validate the down-path with a
 * real outage (OS Wi-Fi off) instead.
 */
export async function isForumReachable(
  probeUrl: string = `${location.origin}/`,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(probeUrl);
    // Cache-bust so no HTTP cache, proxy or CDN edge can serve a stale 200.
    url.searchParams.set('_dlh', Date.now().toString());
    const response = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    });
    log('reachability probe', url.href, '→ status', response.status);
    return response.status < 500;
  } catch (err) {
    // Network error or aborted timeout — treat as unreachable.
    log('reachability probe failed →', err instanceof Error ? err.name : err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
