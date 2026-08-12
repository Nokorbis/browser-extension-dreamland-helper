/**
 * How long ago a draft was saved, bucketed for display.
 *
 * Pure arithmetic, kept out of the bar for the same reason `planInsertion` is
 * kept out of `insertAtRange`: the bucketing is the part that can be wrong in a
 * way nobody notices ("il y a 0 minutes"), and it is the part a unit test can
 * reach. The bar turns the result into a string; this decides what the result
 * *is*.
 *
 * The `unit` is deliberately a small closed union rather than a message key, so
 * the caller can map it with a `switch` over literals the typed i18n catalogue
 * can check — the same trick `colorLabel` uses in `highlight/toolbar.ts`.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type AgeUnit = 'now' | 'minutes' | 'hours' | 'days';

export interface Age {
  unit: AgeUnit;
  /** Whole units elapsed. Always `0` when `unit` is `'now'`. */
  value: number;
}

/**
 * Bucket an elapsed duration in milliseconds.
 *
 * Rounds **down**, so a draft is never described as older than it is. A negative
 * elapsed time — a clock adjustment between the save and the read, which is
 * ordinary on a laptop that slept — reads as `'now'` rather than as some
 * enormous negative age.
 */
export function formatAge(elapsedMs: number): Age {
  if (!Number.isFinite(elapsedMs) || elapsedMs < MINUTE) return { unit: 'now', value: 0 };
  if (elapsedMs < HOUR) return { unit: 'minutes', value: Math.floor(elapsedMs / MINUTE) };
  if (elapsedMs < DAY) return { unit: 'hours', value: Math.floor(elapsedMs / HOUR) };
  return { unit: 'days', value: Math.floor(elapsedMs / DAY) };
}
