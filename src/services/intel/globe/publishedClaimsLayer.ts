import { explainAttestationWeight } from '../findings/deriveAttestationWeight';
import type { PublishedFinding } from '../findings/PublishedFindingsLedger';
import {
  GLOBE_INTEL_LAYER_VERSION, DEFAULT_MAX_MARKS,
  type GlobeIntelLayer, type GlobeIntelMark,
} from './globeIntelLayer';

export const PUBLISHED_CLAIMS_OVERLAY = 'publishedClaims';

/**
 * What THIS instance has told the world, on the globe.
 *
 * I.A.5 asks for the layer contract to be proven by adding "a second,
 * unrelated source layer added by the contract alone". This is that proof, and
 * it is a deliberately awkward one: its source is the published-findings
 * ledger, which has no connection to the correlation engine, no Events, no
 * conflicts, and no CorrelationContext. If the contract only fit the thing it
 * was extracted from, that would show up here.
 *
 * It is also worth having on its own merits. Every other layer shows what the
 * world looks like; this one shows what you have asserted about it — standing
 * public claims, with the weight a stranger would derive today rather than the
 * one they had when you published. A claim you would no longer defend is much
 * easier to notice as a fading pin than as a row in a ledger nobody opens.
 *
 * Notes on what the contract forced, since that is the point of the exercise:
 *
 *  - `provenance.derivedFrom` was typed as the literal 'correlation-engine',
 *    so this layer could not name its own source without lying. Widened to an
 *    open string. That was the first thing the exercise found, and it is the
 *    kind of thing only a second implementation can find.
 *  - `links` is empty. Links are typed for contradictions specifically
 *    (GlobeConflictLink carries `strength` and `distanceKm`), so a layer with
 *    a different kind of relationship could not express it. Recorded rather
 *    than worked around — see the spec's "known limits".
 *  - `unplaceable` had to be counted honestly here too, and it turns out a
 *    published claim can be unplaceable in a way a finding cannot: its value
 *    is an opaque `unknown` on the wire.
 *  - `integrity` stays null. The ledger holds only publishable findings, and
 *    publicationPolicy refuses anything not known-real, so a mock count would
 *    be a measurement of a set that cannot contain them.
 */
export function buildPublishedClaimsLayer(
  published: PublishedFinding[],
  options: { now?: Date; maxMarks?: number } = {},
): GlobeIntelLayer {
  const now = options.now ?? new Date();
  const marks: GlobeIntelMark[] = [];
  const reasons: Record<string, number> = {};
  const drop = (reason: string) => { reasons[reason] = (reasons[reason] ?? 0) + 1; };

  for (const record of published) {
    if (record.retractedAt) continue;

    // A claim's value is `unknown` on the wire — the format does not promise
    // it is a coordinate. Narrow it before trusting it rather than casting.
    const value = record.content.claim.value as { lat?: unknown; lon?: unknown } | null;
    const lat = value?.lat;
    const lon = value?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number'
      || !Number.isFinite(lat) || !Number.isFinite(lon)
      || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      drop('claim value is not a coordinate');
      continue;
    }

    const w = explainAttestationWeight(record.content, { now });
    marks.push({
      id: `published:${record.slot}`,
      kind: 'corroboration',
      lat, lon,
      label: record.content.claim.subjectRef,
      // The weight a stranger derives TODAY, not the one at publication. A pin
      // that kept its original weight would show the claim as we remember it
      // rather than as anyone else now sees it.
      weight: w.weight,
      sourceCount: record.content.method.sourceCount,
      observedFrom: record.content.method.observedFrom,
      observedTo: record.content.method.observedTo,
      isMock: false,
    });
  }

  const budget = options.maxMarks ?? DEFAULT_MAX_MARKS;
  const truncated = marks.length > budget
    ? { shown: budget, total: marks.length, budgetOverrun: false }
    : null;
  /**
   * Truncating by weight works here ONLY because this layer sees corroborated
   * location claims, whose weight genuinely varies with source count.
   *
   * It would degenerate for enumerations. Every complete census of an
   * authoritative register is equally trustworthy, so their weights differ
   * only by snapshot date — measured across 10,514 structural findings, two
   * distinct values. Ranking those by weight sorts by snapshot and nothing
   * else, and the structural panel was doing exactly that: its fifty
   * "highest-weight" findings hid the largest in the corpus because that
   * register had been snapshotted three weeks earlier.
   *
   * Enumerations never reach here — a claim whose value is not a coordinate is
   * dropped above — so this is a note about what would break, not a defect.
   * Weight is a trust measure; ranking wants salience, and salience has to be
   * computed by the consumer from the claim's own facts.
   */
  const shown = truncated ? [...marks].sort((a, b) => b.weight - a.weight).slice(0, budget) : marks;

  return {
    id: PUBLISHED_CLAIMS_OVERLAY,
    version: GLOBE_INTEL_LAYER_VERSION,
    marks: shown,
    links: [],
    // The sum of the reasons, unconditionally. My first version returned 0
    // whenever no marks were placed — which is precisely the case where
    // everything WAS unplaceable, so the one field that exists to prevent a
    // silent drop reported nothing exactly when the drop was total.
    unplaceable: { count: Object.values(reasons).reduce((a, b) => a + b, 0), reasons },
    coincidentMarkIds: [],
    provenance: {
      // Not 'correlation-engine'. This layer never touches it, and the field
      // was typed to that single literal until this layer needed to say
      // otherwise — the first thing the contract test actually found.
      derivedFrom: 'published-findings-ledger',
      // The derivation is deriveAttestationWeight's, whose parameters are
      // published in the NIP draft. Version it independently of correlation's.
      algorithmVersion: 1,
      computedAt: now.toISOString(),
      blindSpots: [],
    },
    degraded: false,
    integrity: null,
    truncated,
    emptyReason: shown.length > 0 ? null
      : published.length === 0 ? 'no-observations'
      : 'all-unplaceable',
  };
}
