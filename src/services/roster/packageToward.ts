/**
 * A Mission Package's `toward` links (the owner's RS59, 2026-10-23; interchange spec rev 18): the Causes and
 * Initiatives a package says it works toward, in the shape roster items carry them, `["a", "30084:<pubkey>:<d>",
 * "<relay>", "toward"]`. A cause counts such a package as work toward it (RS53), as it counts roster items. A link is
 * the package's own claim, which anyone may make (RS18); only a roster item's address is one.
 */
import { ROSTER_LIMITS, type RosterLink } from './rosterItem';

const ROSTER_ADDRESS = /^30084:[0-9a-f]{64}:[^\s]{1,200}$/;

/** The links a package's tags carry toward roster items, each once, up to the spec's limit. */
export function towardOfPackage(tags: readonly string[][]): RosterLink[] {
  const seen = new Set<string>();
  const links: RosterLink[] = [];
  for (const t of tags) {
    if (t[0] !== 'a' || t[3] !== 'toward' || !ROSTER_ADDRESS.test(t[1] ?? '') || seen.has(t[1])) continue;
    seen.add(t[1]);
    links.push({ coordinate: t[1], relay: t[2] ?? '' });
    if (links.length === ROSTER_LIMITS.links) break;
  }
  return links;
}

/** The tags a package carries for its links toward roster items, in the order given, each once. */
export function towardTags(links: readonly RosterLink[] = []): string[][] {
  return towardOfPackage(links.map((l) => ['a', l.coordinate, l.relay, 'toward'])).map((l) => ['a', l.coordinate, l.relay, 'toward']);
}
