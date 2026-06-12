/**
 * Compact, always-visible artifact timestamps for the meta lines. Pure
 * functions, locale-default formatting.
 */

/**
 * Compact absolute date — "Jun 1", or "Jun 1, 2025" when the year differs
 * from the current one. `now` is injectable for tests; it defaults to today.
 */
export function formatArtifactDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** Full locale date + time, for tooltips on the compact dates. */
export function formatArtifactDateFull(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
}
