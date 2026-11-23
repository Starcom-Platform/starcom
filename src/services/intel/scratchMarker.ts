/**
 * The hashtag a publisher attaches to say "this is a fixture, do not ingest".
 *
 * ─── WHY IT IS ITS OWN MODULE ──────────────────────────────────────────────
 *
 * Three things need this string and they must not disagree: the ingest that
 * refuses it, the audit script that finds our litter on the relays by it, and
 * the interchange spec that asks peers to honour it. The audit script is plain
 * node and cannot import the ingest — that module builds its singleton at
 * import time and pulls in nostr-tools — so a constant living there would have
 * been copied, and a copied constant is how `normalizeTag` came to exist after
 * two normalisers drifted apart and made a filter decorative.
 *
 * Small enough to be loaded through tsx's require hook from a script, the way
 * scripts/lib/relayRegistry.mjs loads the relay sets.
 *
 * ─── WHAT IT IS FOR ────────────────────────────────────────────────────────
 *
 * A node that cannot mark its own test traffic has no way to rehearse against a
 * live network without polluting it for everyone else reading the same relays.
 * Starcom learned this the expensive way: three events tagged this way sit on
 * nostr.mom and nos.lol permanently, from cross-node verification runs on
 * 2026-08-06, and cannot be retracted by anyone — deletion and addressable
 * replacement both need the publishing key's signature, and the three carry
 * three different pubkeys minted per-run by scratch scripts that no longer
 * exist. Refusing them at the read side is the only remedy that was ever
 * available.
 *
 * Published in the interchange spec (rev 8) as shared vocabulary rather than a
 * local convention, for the same reason: the alternative to marking test
 * traffic is not an absence of litter, it is litter nobody can identify.
 */
export const SCRATCH_MARKER_TAG = 'scratch-verification';

export default SCRATCH_MARKER_TAG;
