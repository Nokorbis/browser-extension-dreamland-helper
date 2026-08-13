/**
 * Reachability preflight: the exit guard confirms the server responds *before* a submission
 * navigates away, since a down forum or a broken gateway otherwise swallows the POST and
 * loses the draft. See docs/adr/0011.
 */
import { log } from '@/lib/log';

/** How long to wait for the ping before treating the forum as unreachable. */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * ⚠ Probe the URL the POST actually targets (the form's `action`), not the homepage: a
 * caching proxy can serve a stale `200` for `/` while the origin handling the POST is down —
 * the exact case this guards against.
 *
 * Deliberately lenient: status < 500 is reachable, a throw/timeout/5xx is not. Odd-but-alive
 * statuses (405 to HEAD, an auth 403) pass, and the "send anyway" escape hatch covers a false
 * positive — better to under- than over-block.
 *
 * ⚠ Runs in the content script's own network context, which DevTools "Offline" throttling
 * does *not* affect — validate the down-path with a real outage instead.
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
