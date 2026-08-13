/**
 * How long ago a draft was saved, bucketed for display. Kept out of the bar for the same
 * reason `planInsertion` is kept out of `insertAtRange`: the bucketing is the part that can
 * be wrong in a way nobody notices ("il y a 0 minutes"), and the part a unit test can reach.
 *
 * `unit` is a small closed union rather than a message key, so the caller can map it with a
 * `switch` over literals the typed i18n catalogue can check.
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
 * Rounds **down**, so a draft is never described as older than it is. A negative elapsed
 * time — a clock adjustment between the save and the read, ordinary on a laptop that slept —
 * reads as `'now'` rather than some enormous negative age.
 */
export function formatAge(elapsedMs: number): Age {
  if (!Number.isFinite(elapsedMs) || elapsedMs < MINUTE) return { unit: 'now', value: 0 };
  if (elapsedMs < HOUR) return { unit: 'minutes', value: Math.floor(elapsedMs / MINUTE) };
  if (elapsedMs < DAY) return { unit: 'hours', value: Math.floor(elapsedMs / HOUR) };
  return { unit: 'days', value: Math.floor(elapsedMs / DAY) };
}
