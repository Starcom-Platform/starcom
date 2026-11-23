/**
 * One ping for one item (D-WL, WL2): the M6+ quake ping (quakePings.ts) and the watches (watchPings.ts) read their
 * feeds apart, and the same quake can reach both. Whichever tells of it first claims it; the other passes over it.
 * For this page only.
 */
const claimed = new Set<string>();

/** Claims an item's ping: true for the first to ask, false after. */
export function claimPing(id: string): boolean {
  if (claimed.has(id)) return false;
  claimed.add(id);
  return true;
}

export function resetPingClaimsForTests(): void {
  claimed.clear();
}
