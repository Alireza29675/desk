/**
 * Compare two dotted numeric versions (e.g. "1.3.13" vs "1.1.0"). Segments are
 * compared major → minor → patch; a missing segment counts as 0. Pre-release
 * suffixes (e.g. "1.2.0-canary") are tolerated by parsing the leading integer
 * of each segment. Returns true when `version` is greater than or equal to
 * `minimum`.
 */
export function meetsMinimum(version: string, minimum: string): boolean {
  const segment = (value: string | undefined): number => Number.parseInt(value ?? '0', 10) || 0;
  const have = version.split('.');
  const need = minimum.split('.');
  const length = Math.max(have.length, need.length);
  for (let i = 0; i < length; i++) {
    const a = segment(have[i]);
    const b = segment(need[i]);
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}
