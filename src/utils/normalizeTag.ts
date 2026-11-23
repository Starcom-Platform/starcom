/**
 * One way to normalise a tag, used by everything that compares them.
 *
 * ─── WHY THIS IS ITS OWN MODULE ────────────────────────────────────────────
 *
 * There were two of these and they disagreed, which is the whole of a defect
 * that made the globe's priority filter decorative for every report from the
 * network. `NostrStarcomIntelIngest.normalizeHashtag` lowercased every hashtag
 * it collected; `getIntelReportPriority` compared against uppercase `'CRITICAL'`.
 * `reportToMarker` merges the author's hashtags into the marker's tags, so the
 * plumbing read correctly end to end and a post tagged #critical still
 * classified as `unset`. Every test of the classifier passed uppercase tags, so
 * the suite agreed.
 *
 * Fixing the comparison alone would have left two normalisers free to drift
 * apart again. This is the one, and both sides call it.
 *
 * Leading '#' is stripped because a person typing into a tag field writes the
 * hash and a Nostr `t` tag does not carry one, and those two have to land on the
 * same value.
 */
export function normalizeTag(tag: string): string {
  // Trim BEFORE stripping the hash, then again after. The copy this replaced
  // stripped first, so ' #high ' kept its hash and read as a different tag from
  // 'high' — the same class of near-miss as the case mismatch itself.
  return String(tag ?? '').trim().replace(/^#/, '').trim().toLowerCase();
}

export default normalizeTag;
