/**
 * Can anyone still obtain the bytes a claim was derived from?
 *
 * This is the application-side twin of the rule in
 * `scripts/lib/assetProvenance.mjs`, which the freshness guard fails builds on
 * and the health endpoint publishes. The rule lives in two places because it
 * is needed on both sides of a build boundary — the guard runs in Node before
 * the bundle exists, the claim builders run inside it.
 *
 * Two implementations of one rule is exactly the arrangement this project
 * distrusts everywhere else, so it is covered by a test that runs BOTH against
 * the actually-committed assets and fails if they disagree. Without that test
 * this file would be a slow-motion drift into a node publishing claims about
 * its own reliability that its own gate contradicts.
 */
export type RetentionState = 'archived' | 'upstream-dated' | 'UNREPRODUCIBLE';

interface RetainableAsset {
  archivedSnapshot?: { sha256?: string };
  sourceUrl?: string | string[];
  snapshot?: string;
}

/**
 * `archived`        we kept the bytes and can name which ones by digest.
 * `upstream-dated`  the publisher names the exact file in its url.
 * `UNREPRODUCIBLE`  neither — nobody can re-derive the claim, including us.
 */
export function retentionOf(asset: RetainableAsset): RetentionState {
  if (asset.archivedSnapshot?.sha256) return 'archived';
  const urls = Array.isArray(asset.sourceUrl)
    ? asset.sourceUrl
    : [asset.sourceUrl].filter((u): u is string => typeof u === 'string');
  const snapshot = String(asset.snapshot ?? '');
  if (snapshot && urls.some((u) => String(u).includes(snapshot))) return 'upstream-dated';
  return 'UNREPRODUCIBLE';
}

/**
 * The `method.weakBacking` entries a claim built on this source must carry.
 *
 * An empty array is a POSITIVE statement — checked, nothing thin found — so it
 * is only ever returned when the bytes are genuinely still obtainable. An
 * unreproducible source produces a stated weakness rather than silence, which
 * is the whole point of the field: the publisher already knew, and used to
 * keep it to itself.
 */
export function weakBackingFor(source: string, retention: RetentionState): string[] {
  if (retention === 'UNREPRODUCIBLE') {
    return [`${source}: undated source url and no archived copy — this count cannot be re-derived by anyone, including its publisher`];
  }
  return [];
}
