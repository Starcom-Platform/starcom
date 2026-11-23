/**
 * How Starcom shows a count (decision D-E, settled 2026-09-14 for step 9,
 * docs/missions/01-architecture-decisions/time-model.md).
 *
 * A whole number with commas between thousands, the same on every page and in
 * every browser. Counts were formatted at each site, some in the viewer's own
 * digit grouping and some in en-US, so one page could group digits two ways. It
 * also keeps step 9's search for times, toLocale(Date|Time)?String, from finding
 * counts.
 */
export function formatCount(n: number): string {
  // Made for each call, so the en-US it pins is what formats the count; its test
  // swaps the browser's locale to check that.
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}
