import type { Event } from '../adapters/eventsAdapter';
import { isPhysicallyExclusive, supportsWindow, supportsSeparation, coordinateDecimalsFor, DEFAULT_TIME_PRECISION_MS, DEFAULT_GEO_PRECISION_M, type SubjectKind } from '../../../types/intel/SourceObservation';
import { normalizeEntityName } from '../../../services/intel/entity/normalizeEntityName';

export type CooccurrencePair = { a: string; b: string; count: number };
export type PlaceCluster = { key: string; center: [number, number]; count: number };

function dayKey(ts: string) {
  return new Date(ts).toISOString().slice(0, 10);
}

export function computeAnomaliesByDay(events: Event[]): Set<string> {
  const counts = new Map<string, number>();
  for (const ev of events) {
    const key = dayKey(ev.timestamp);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const values = Array.from(counts.values());
  if (values.length === 0) return new Set();
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  const std = Math.sqrt(variance);
  const threshold = mean + 2 * std;
  const anomalies = new Set<string>();
  for (const [key, count] of counts.entries()) {
    if (count >= threshold && count > 0) anomalies.add(key);
  }
  return anomalies;
}

export function computeCooccurrence(events: Event[]): CooccurrencePair[] {
  const pairCounts = new Map<string, number>();
  // Pair on the normalized name so "John Smith" and "john smith." count as
  // the same entity instead of silently fragmenting into two unrelated
  // nodes — the same fix applied to IntelWeb's entity registry. Keep a
  // representative original-cased spelling per key for display, since the
  // normalized form itself (all-lowercase) is a worse label than what an
  // analyst actually typed.
  const displayNameByKey = new Map<string, string>();
  for (const ev of events) {
    const ents = (ev.entityRefs || []).slice()
      .sort((a, b) => normalizeEntityName(a).localeCompare(normalizeEntityName(b)));
    for (let i = 0; i < ents.length; i++) {
      for (let j = i + 1; j < ents.length; j++) {
        const keyA = normalizeEntityName(ents[i]);
        const keyB = normalizeEntityName(ents[j]);
        if (keyA === keyB) continue; // same entity, different casing, within one event
        if (!displayNameByKey.has(keyA)) displayNameByKey.set(keyA, ents[i]);
        if (!displayNameByKey.has(keyB)) displayNameByKey.set(keyB, ents[j]);
        const k = `${keyA}||${keyB}`;
        pairCounts.set(k, (pairCounts.get(k) || 0) + 1);
      }
    }
  }
  const pairs: CooccurrencePair[] = [];
  for (const [k, count] of pairCounts.entries()) {
    if (count >= 2) {
      const [keyA, keyB] = k.split('||');
      pairs.push({ a: displayNameByKey.get(keyA) ?? keyA, b: displayNameByKey.get(keyB) ?? keyB, count });
    }
  }
  pairs.sort((x, y) => y.count - x.count);
  return pairs.slice(0, 200);
}

export function computeTagCooccurrence(events: Event[]): CooccurrencePair[] {
  const pairCounts = new Map<string, number>();
  for (const ev of events) {
    const tags = (ev.tags || []).slice().sort();
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const k = `${tags[i]}||${tags[j]}`;
        pairCounts.set(k, (pairCounts.get(k) || 0) + 1);
      }
    }
  }
  const pairs: CooccurrencePair[] = [];
  for (const [k, count] of pairCounts.entries()) {
    if (count >= 2) {
      const [a, b] = k.split('||');
      pairs.push({ a, b, count });
    }
  }
  pairs.sort((x, y) => y.count - x.count);
  return pairs.slice(0, 200);
}

/**
 * Compute simple place clusters by binning lat/lon into a fixed grid.
 * binSizeDeg controls the grid size in degrees (default 1.0° ~ 111km at equator).
 */
export function computePlaceClusters(events: Event[], binSizeDeg = 1): PlaceCluster[] {
  if (binSizeDeg <= 0) binSizeDeg = 1;
  const bins = new Map<string, { count: number; sumLat: number; sumLon: number }>();
  for (const ev of events) {
    if (ev.lat == null || ev.lon == null) continue;
    const latBin = Math.floor(ev.lat / binSizeDeg);
    const lonBin = Math.floor(ev.lon / binSizeDeg);
    const key = `${latBin}:${lonBin}`;
    const rec = bins.get(key) || { count: 0, sumLat: 0, sumLon: 0 };
    rec.count += 1;
    rec.sumLat += ev.lat;
    rec.sumLon += ev.lon;
    bins.set(key, rec);
  }
  const clusters: PlaceCluster[] = [];
  for (const [key, v] of bins.entries()) {
    if (v.count >= 3) { // require at least 3 points to consider a cluster
      clusters.push({ key, center: [v.sumLon / v.count, v.sumLat / v.count], count: v.count });
    }
  }
  clusters.sort((a, b) => b.count - a.count);
  return clusters.slice(0, 200);
}

export interface LocationConflict {
  /** Original-cased entity name, not the normalized matching key. */
  entity: string;
  sourceIdA: string;
  sourceIdB: string;
  distanceKm: number;
  hoursApart: number;
  /**
   * min(confidence of both sides), 0..1. The ACH lesson (weight
   * disconfirming evidence by source quality, don't just count it),
   * applied: a conflict between two well-corroborated reports is a real
   * problem worth an analyst's attention; a conflict where either side is
   * low-confidence is far less alarming — it may just mean the weaker
   * source is wrong, not that there's a genuine contradiction to resolve.
   * min(), not average(), because a conflict is only as strong as its
   * weakest side — one confident claim and one shaky one isn't a strong
   * conflict even though the confident side is solid. Reuses
   * Event.confidence directly, which — since Phase 1's confidence
   * scoring — is itself often already derived from the report's own
   * linked-source reliability grades, not a bare author-typed guess.
   */
  strength: number;
  /** When the two conflicting observations occurred — ISO 8601 UTC, earliest first. */
  observedFrom: string;
  observedTo: string;
  /**
   * Whether either side of this contradiction rests on fabricated evidence.
   *
   * Tri-state on purpose. `true` if EITHER side is mock — a contradiction is
   * only as real as its weaker side, and one fabricated half makes the whole
   * conflict an artifact. `false` only when BOTH sides are known real.
   * `undefined` when either side never said, because "nobody measured this"
   * is not the same claim as "this is genuine".
   */
  isMock?: boolean;
}

const DEFAULT_CONFLICT_STRENGTH = 0.5; // neither side has a real confidence value to weight by

const EARTH_RADIUS_KM = 6371;
// Two reports placing the same entity here are only flagged as conflicting
// if they're close enough in time that the divergence is actually
// meaningful — an entity legitimately shows up in different places over
// weeks or months, and that's not a contradiction, just normal movement.
// Both thresholds are judgment calls, not measured constants: 24h is a
// same-day-ish window, 100km is conservative enough to avoid flagging
// "downtown" vs. "the edge of the same city" as contradictory. Tune these
// once real data shows they're wrong, not before.
export const CONFLICT_TIME_WINDOW_HOURS = 24;
export const CONFLICT_DISTANCE_THRESHOLD_KM = 100;

/**
 * One entity-bucketing pass, shared by conflict and corroboration detection.
 *
 * Two things here are load-bearing for performance, both measured against the
 * baseline in __tests__/correlation.perf.test.ts:
 *
 *  1. `t` is the event timestamp parsed ONCE. Both algorithms previously
 *     called `new Date(...)` on both sides of every pair, inside the inner
 *     loop — at 8000 events across few entities that is tens of millions of
 *     Date constructions, and it dominated the profile.
 *
 *  2. Each bucket is sorted ascending by time, which converts the inner loop's
 *     `continue` on an out-of-window pair into a `break`. Both algorithms only
 *     ever care about pairs within CONFLICT_TIME_WINDOW_HOURS, so once the
 *     first out-of-window partner is reached, every later one is too. That is
 *     what takes the cost from O(n^2) per entity to O(n * w), where w is the
 *     number of events inside one time window.
 *
 * The quadratic was not incidental: with six sources reporting about the same
 * entities, buckets get large, and that is the shape federation produces.
 */
export type BucketedEvent = { ev: Event; t: number };

export function bucketByEntity(events: Event[]): Map<string, { displayName: string; events: BucketedEvent[] }> {
  const byEntity = new Map<string, { displayName: string; events: BucketedEvent[] }>();
  for (const ev of events) {
    // Admit events with coordinates OR an equality-comparable claim.
    //
    // This dropped everything without lat/lon, which was correct while the
    // engine was location-only and silently wrong the moment it was not:
    // GLEIF and Wikidata publish no coordinates, so every claim they make
    // vanished here before any corroboration logic saw it.
    //
    // The location paths guard their own coordinates now rather than relying
    // on this filter to have done it for them.
    if ((ev.lat == null || ev.lon == null) && !ev.claim) continue;
    const t = new Date(ev.timestamp).getTime();
    // An unparseable timestamp cannot be time-windowed, and including it would
    // make every comparison against it NaN — which compares false and silently
    // suppresses real conflicts rather than erroring.
    if (Number.isNaN(t)) continue;
    for (const ref of ev.entityRefs || []) {
      const key = normalizeEntityName(ref);
      const entry = byEntity.get(key) || { displayName: ref, events: [] };
      entry.events.push({ ev, t });
      byEntity.set(key, entry);
    }
  }
  for (const entry of byEntity.values()) entry.events.sort((a, b) => a.t - b.t);
  return byEntity;
}

const CONFLICT_TIME_WINDOW_MS = CONFLICT_TIME_WINDOW_HOURS * 3_600_000;

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Contradiction detection, phase 1 (structured-field conflicts only, no
 * NLP/free-text claim extraction — that needs real infrastructure this
 * app doesn't have). Flags when the same entity is placed in two
 * locations too far apart, too close together in time, to plausibly be
 * the same person/thing — the "can't be in two places at once" signal.
 *
 * Deliberately NOT wired into any status gate. A single credible report
 * is often the entire point of ground-truth reporting; this is
 * informational context for a human reviewer, mirroring AnomalyBadge's
 * existing visible-not-blocking pattern, never a precondition for
 * approval.
 */
/**
 * Conflicts within ONE entity's bucket.
 *
 * Split out so CorrelationIndex can recompute a single entity when new
 * observations arrive for it, instead of re-deriving the whole corpus. An
 * entity's conflicts depend only on that entity's own events, which is what
 * makes per-entity memoisation sound rather than an approximation.
 */
export function conflictsForBucket(displayName: string, evList: BucketedEvent[]): LocationConflict[] {
  const conflicts: LocationConflict[] = [];
  for (let i = 0; i < evList.length; i++) {
    for (let j = i + 1; j < evList.length; j++) {
      const deltaMs = evList[j].t - evList[i].t;
      if (deltaMs > CONFLICT_TIME_WINDOW_MS) break;

      const a = evList[i].ev;
      const b = evList[j].ev;
      if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) continue; // not a location claim
      if (a.sourceId === b.sourceId) continue;

      // "Can't be in two places at once" only means something for a subject
      // that occupies one place at a time. An organisation, a state, a country
      // or an earthquake does not — running the rule against them produced 328
      // same-actor-same-day false positives on UCDP alone, enough to paint the
      // globe red. Undefined stays exclusive, preserving the original
      // behaviour for analyst-authored reports.
      if (!isPhysicallyExclusive(a.subjectKind) || !isPhysicallyExclusive(b.subjectKind)) continue;

      // A source that only knows WHEN to within a week cannot support a claim
      // about a 24-hour window. 13% of a current UCDP release is imprecise —
      // a few days, a week, a month, a year — and without this those events
      // corroborate and contradict inside the window as though they were timed
      // to the second. Asserting either from them invents precision the source
      // explicitly declined to claim.
      if (!supportsWindow(a.timePrecisionMs, CONFLICT_TIME_WINDOW_MS)) continue;
      if (!supportsWindow(b.timePrecisionMs, CONFLICT_TIME_WINDOW_MS)) continue;

      const hoursApart = deltaMs / 3_600_000;
      const distanceKm = haversineDistanceKm(a.lat!, a.lon!, b.lat!, b.lon!);
      /*
       * The spatial twin of the timePrecisionMs guard above, and it was
       * missing. A source that only knows WHERE to within 20km cannot support
       * a claim that two positions are more than 100km apart — their true
       * positions could be 60km apart, and the contradiction is invented.
       *
       * This matters now in a way it did not before: Navcom kind-1911
       * observations are published as a coarse geohash cell deliberately, to
       * protect the person who filed them. Without this they would generate
       * contradictions against each other and against precise sources purely
       * because a cell centroid is not where anybody stood.
       */
      if (!supportsSeparation(a.geoPrecisionM, b.geoPrecisionM, distanceKm)) continue;
      if (distanceKm > CONFLICT_DISTANCE_THRESHOLD_KM) {
        const confA = a.confidence ?? DEFAULT_CONFLICT_STRENGTH;
        const confB = b.confidence ?? DEFAULT_CONFLICT_STRENGTH;
        conflicts.push({
          entity: displayName,
          sourceIdA: a.sourceId,
          sourceIdB: b.sourceId,
          distanceKm: Math.round(distanceKm),
          hoursApart: Math.round(hoursApart * 10) / 10,
          strength: Math.min(confA, confB),
          // evList is time-sorted, so i is always the earlier of the pair.
          observedFrom: new Date(evList[i].t).toISOString(),
          observedTo: new Date(evList[j].t).toISOString(),
          // true if either side is fabricated; false only if both are known
          // real; undefined if either declined to say.
          isMock: a.isMock || b.isMock ? true
            : a.isMock === false && b.isMock === false ? false
            : undefined,
        });
      }
    }
  }
  return conflicts;
}

/** Sorts and truncates a merged conflict set — the global step, applied once. */
export function rankConflicts(conflicts: LocationConflict[]): LocationConflict[] {
  return [...conflicts]
    .sort((x, y) => y.strength - x.strength || y.distanceKm - x.distanceKm)
    .slice(0, 200);
}

export function computeLocationConflicts(events: Event[]): LocationConflict[] {
  // Composes conflictsForBucket rather than repeating its loop.
  //
  // These were two copies of the same logic, and it cost exactly what
  // duplicated rules always cost: the subject-kind exclusivity check was added
  // to this one and not to the other, so the batch path filtered organisations
  // correctly while CorrelationIndex — the path the worker actually runs —
  // kept flagging them, and the globe stayed covered in false contradictions
  // through a fix that looked complete.
  const byEntity = bucketByEntity(events);
  const conflicts: LocationConflict[] = [];
  for (const { displayName, events: evList } of byEntity.values()) {
    conflicts.push(...conflictsForBucket(displayName, evList));
  }
  return rankConflicts(conflicts);
}

export interface CorroboratedFinding {
  /**
   * HOW this was observed, if the producer knows. Absent means the publisher
   * falls back to `inference`, which is true of anything corroborated across
   * observations rather than witnessed directly.
   */
  modality?:
    | 'in_person' | 'field_attested' | 'direct_contact' | 'primary_record'
    | 'secondary_record' | 'inference' | 'self_attested' | 'unknown';
  /** Inputs known to be thin, stale, or unreproducible. See AttestationMethod. */
  weakBacking?: string[];
  /**
   * Whether the evidence behind this finding is fabricated.
   *
   * `true` if ANY contributor is mock, `false` only if all are known real,
   * `undefined` when unmeasured. Consumed by publicationPolicy, which refuses
   * anything not known-real — see the note there on why `undefined` is
   * refused too.
   */
  isMock?: boolean;
  /** Original-cased entity name — same convention as LocationConflict.entity, not the normalized matching key. */
  entityRef: string;
  /**
   * What is asserted about the subject.
   *
   * `'location'` is compared by DISTANCE — two observers of one physical thing
   * report nearby coordinates, not identical ones. Every other attribute is
   * compared by EQUALITY: two registries either say a company is registered in
   * Berlin or they do not, and there is no "within 5km" for a jurisdiction.
   *
   * Widened from the literal `'location'` when GLEIF and Wikidata arrived.
   * Neither publishes coordinates — GLEIF has none at all, and Wikidata's
   * headquarters is a city-level place item — so forcing them through a
   * distance comparison would have required geocoding, which needs a
   * credentialed third party (failing the OSEE fork test) and invents
   * precision the source never claimed. The wire format always allowed this:
   * the NIP declares `attribute` as an open string.
   */
  attribute: string;
  /** `{lat, lon}` for `'location'`; a normalised string for equality-matched attributes. */
  value: { lat: number; lon: number } | string;
  /**
   * How the contributing observations were matched.
   *
   * Published, because a reader deriving their own weight needs to know which
   * comparison produced the agreement — a 5km distance test and an exact
   * identifier match are not interchangeable evidence.
   */
  matchedBy: 'distance' | 'equality';
  /**
   * Aggregators the contributing observations travelled through, if any.
   *
   * Independence is not the whole story. Several registries relayed by ONE
   * aggregator are distinct observers who nonetheless share a single editorial
   * path: one editor could add a value citing two registries without checking
   * either, and nothing downstream could tell. That is a real limit on the
   * claim and it travels with the finding rather than being left for a reader
   * to infer.
   */
  relayedVia?: string[];
  /** Average confidence of the corroborating events, 0..1. */
  confidence: number;
  /** Count of distinct sourceIds agreeing on this claim — never the source identities themselves (see Findings Publisher: never an analyst identity). */
  sourceCount: number;
  /** Fetchable Nostr event ids this finding rests on. See the constructor. */
  citedEventIds: string[];
  /** Uncertainty on a location value, in metres — the coarsest contributor's. */
  geoPrecisionM?: number;
  /**
   * When the corroborating observations occurred — earliest and latest, ISO
   * 8601 UTC.
   *
   * A finding without a time cannot be placed on a timeline, scrubbed, or aged.
   * It is a RANGE rather than a point because corroboration is agreement
   * ACROSS observations made at different moments; collapsing that to a single
   * instant would assert a precision the evidence does not have.
   */
  observedFrom: string;
  observedTo: string;
  /**
   * What kind of thing the subject is, taken from the contributing events.
   *
   * 'unknown' when they disagree — a finding whose contributors cannot agree
   * what the subject IS should not assert one, and the publication gate treats
   * unknown conservatively.
   */
  subjectKind: SubjectKind;
  /** The COARSEST precision among contributors: a finding is only as precisely timed as its vaguest input. */
  timePrecisionMs: number;
  /** Fingerprints of contributing observations, for the reproducibility envelope. Partial when some contributors are analyst reports. */
  contributingFingerprints: string[];
  algorithmVersion: number;
}

/**
 * Bumped whenever the corroboration/clustering logic below changes —
 * same version-stamping discipline as CONFIDENCE_ALGORITHM_VERSION, and
 * published alongside every finding (not just the resulting confidence
 * number) so a finding stays self-describing about what actually
 * qualified it, even after this logic is later refined.
 */
export const CORROBORATION_ALGORITHM_VERSION = 1;

/**
 * Corroboration, v1: an entity's location claim counts as corroborated
 * when at least two INDEPENDENT sources (distinct sourceId) place it
 * within the same distance/time window computeLocationConflicts already
 * uses to detect the opposite condition — and that entity has ZERO
 * unresolved location conflicts anywhere in the working set. Corroboration
 * and contradiction are treated as mutually exclusive on purpose: an
 * entity with a live, unresolved "can't be in two places at once" flag
 * shouldn't also be surfaced as confidently agreed-upon in the same pass.
 *
 * Grouping is pairwise-agreement, not true clustering: any event that
 * mutually agrees with at least one other (distinct-source) event for the
 * same entity joins that entity's single finding, and the finding's
 * location/confidence is the average across everyone in that group. This
 * is a stated v1 approximation — a real k-means-style multi-cluster split
 * (e.g. two genuinely separate corroborated locations for one entity,
 * from two unrelated event pairs) isn't distinguished from one big group.
 * Documented rather than silently assumed away; revisit if real usage
 * shows it matters.
 */
/**
 * Corroboration for attributes compared by EQUALITY rather than distance.
 *
 * Two registries either say a company is registered in Berlin or they do not.
 * There is no "within 5km" for a jurisdiction, and inventing a distance metric
 * for one would invent precision — the same failure geocoding GLEIF addresses
 * would have caused, which is why this exists instead.
 *
 * The independence rules are identical to the location path and deliberately
 * share the same reasoning: distinct FEEDS (D12), with feeds that republish
 * one another collapsed into their upstream (D13).
 *
 * DISAGREEMENT SUPPRESSES THE FINDING, mirroring how an unresolved location
 * conflict does. If two feeds say Berlin and two say Munich, publishing "two
 * independent sources agree on Berlin" is true and misleading: it presents a
 * contested claim as a settled one by omitting the contest. Returning nothing
 * is the honest answer until a human resolves it.
 */
function findingForBucketByEquality(
  displayName: string,
  evList: BucketedEvent[],
  attribute: string,
): CorroboratedFinding | null {
  const withClaim = evList.filter(b => b.ev.claim?.attribute === attribute && b.ev.claim.value);
  if (withClaim.length < 2) return null;

  const byValue = new Map<string, Event[]>();
  for (const b of withClaim) {
    const v = b.ev.claim!.value;
    const at = byValue.get(v);
    if (at) at.push(b.ev); else byValue.set(v, [b.ev]);
  }

  const independentFeeds = (group: Event[]) => {
    const present = new Set(group.map(e => e.feedId ?? e.sourceId));
    const upstream = new Map<string, string[]>();
    for (const e of group) {
      const feed = e.feedId ?? e.sourceId;
      if (e.derivesFrom?.length && !upstream.has(feed)) upstream.set(feed, e.derivesFrom);
    }
    return new Set([...present].filter(f => !(upstream.get(f) ?? []).some(up => present.has(up))));
  };

  // A value is CONTESTED when more than one distinct value has independent
  // backing. One backed value plus a lone unbacked variant is not a real
  // contest — it is one outlier against agreement.
  const backed = [...byValue.entries()].filter(([, g]) => independentFeeds(g).size >= 2);
  if (backed.length === 0) return null;
  if (backed.length > 1) return null; // contested: say nothing rather than pick a side

  const [value, group] = backed[0];
  const feeds = independentFeeds(group);

  const times = group.map(e => new Date(e.timestamp).getTime()).filter(t => !Number.isNaN(t));
  if (times.length === 0) return null;

  const kinds = new Set(group.map(e => e.subjectKind ?? 'unknown'));
  const isMock = group.some(e => e.isMock === true) ? true
    : group.every(e => e.isMock === false) ? false
    : undefined;

  return {
    isMock,
    entityRef: displayName,
    attribute,
    value,
    confidence: Math.round(
      (group.reduce((sum, e) => sum + (e.confidence ?? DEFAULT_CONFLICT_STRENGTH), 0) / group.length) * 100) / 100,
    sourceCount: feeds.size,
    observedFrom: new Date(Math.min(...times)).toISOString(),
    observedTo: new Date(Math.max(...times)).toISOString(),
    subjectKind: kinds.size === 1 ? [...kinds][0] : 'unknown',
    timePrecisionMs: Math.max(...group.map(e => e.timePrecisionMs ?? DEFAULT_TIME_PRECISION_MS)),
    contributingFingerprints: [...new Set(group.map(e => e.fingerprint).filter(Boolean) as string[])].sort(),
    /*
     * The events this finding rests on, for the ones a stranger can fetch.
     *
     * A fingerprint proves a reader looked at the same inputs; it cannot be
     * walked back to them. These can — they are Nostr event ids, and the whole
     * point is that somebody who trusts neither party can check the derivation
     * without asking either of us.
     *
     * Empty for a finding built entirely from sources whose records are not
     * fetchable events, which is most of them. Deduped and sorted so the same
     * inputs always produce the same list.
     */
    citedEventIds: [...new Set(group.map(e => e.sourceEventId).filter(Boolean) as string[])].sort(),
    matchedBy: 'equality',
    relayedVia: [...new Set(group.map(e => e.relayedVia).filter((r): r is string => !!r))].sort(),
    algorithmVersion: CORROBORATION_ALGORITHM_VERSION,
  };
}

export function computeCorroboratedFindings(
  events: Event[],
  /**
   * Precomputed conflicts, when the caller already has them.
   *
   * This function needs the conflicted-entity set to honour the Findings
   * Publisher rule that corroboration and contradiction are mutually
   * exclusive. Recomputing them here meant a caller holding both paid the
   * expensive pass twice — which CorrelationContext does on every recompute.
   * Optional so existing single-call sites are unchanged.
   */
  precomputedConflicts?: LocationConflict[],
): CorroboratedFinding[] {
  const conflicts = precomputedConflicts ?? computeLocationConflicts(events);
  const conflictedEntityKeys = new Set(conflicts.map(c => normalizeEntityName(c.entity)));

  const byEntity = bucketByEntity(events);

  const findings: CorroboratedFinding[] = [];
  for (const [key, { displayName, events: evList }] of byEntity.entries()) {
    // The location conflict gate suppresses the LOCATION finding only.
    //
    // It deliberately does not skip the whole entity, which is what an early
    // `continue` here used to do. A disagreement about where a subject was
    // physically observed says nothing about whether two registries agree on
    // its registered jurisdiction, and discarding the second because of the
    // first throws away evidence for an unrelated reason.
    if (!conflictedEntityKeys.has(key)) {
      const finding = findingForBucket(displayName, evList);
      if (finding) findings.push(finding);
    }

    // Equality-matched attributes, one finding per attribute in the bucket.
    for (const attribute of new Set(
      evList.map(b => b.ev.claim?.attribute).filter((a): a is string => !!a && a !== 'location'),
    )) {
      const eq = findingForBucketByEquality(displayName, evList, attribute);
      if (eq) findings.push(eq);
    }
  }

  // Most-corroborated (highest confidence, most independent sources) first.
  findings.sort((x, y) => y.confidence - x.confidence || y.sourceCount - x.sourceCount);
  return findings;
}

/**
 * A claim resting on exactly ONE independent feed.
 *
 * The corroboration pass computes independence for every claim and then keeps
 * only the ones clearing two feeds; everything below the bar is discarded
 * mid-pass. That discarded set is the most actionable thing the engine knows:
 * it is precisely the list of claims a second source would upgrade.
 *
 * Surfacing it closes the analysis -> collection loop. Without it the workbench
 * can tell an analyst what IS corroborated and stays silent about what is one
 * source away from being so, which is the question that actually sends someone
 * back out to collect.
 *
 * DELIBERATELY NOT A FINDING. It is not published, carries no algorithm
 * version, and is never mistaken for corroboration — an uncorroborated claim
 * is a prompt for work, not evidence. It is also not a CONFLICT: nothing
 * disagrees with it, it is simply alone.
 */
export interface CorroborationGap {
  /** Original-cased entity name, same convention as CorroboratedFinding.entityRef. */
  entityRef: string;
  attribute: string;
  /** The single feed's asserted value — a normalised string, or coordinates for location. */
  value: string;
  /** Which feed carried it, so an analyst can judge whether a second source is plausible. */
  sourceId: string;
  /** Confidence of the lone observation, 0..1. */
  confidence: number;
  /** When it was observed, ISO 8601 UTC. */
  observedAt: string;
  /** True when the lone observation is fabricated — a gap over mock data is not worth collecting against. */
  isMock?: boolean;
}

/**
 * Claims backed by exactly one independent feed, most recent first.
 *
 * Independence is computed with the SAME rules as corroboration (distinct
 * feeds, republishers collapsed into upstream) rather than a simpler count.
 * Using a looser rule here would report "one source" for claims corroboration
 * considers multi-source, so the two passes would contradict each other in
 * the same UI.
 *
 * Entities with an unresolved location conflict are skipped: a contested claim
 * is a different problem with a different remedy, already surfaced elsewhere,
 * and listing it as "needs a second source" would misdescribe it.
 */
export function computeCorroborationGaps(
  events: Event[],
  precomputedConflicts?: LocationConflict[],
): CorroborationGap[] {
  const conflicts = precomputedConflicts ?? computeLocationConflicts(events);
  const conflictedEntityKeys = new Set(conflicts.map(c => normalizeEntityName(c.entity)));

  const byEntity = bucketByEntity(events);
  const gaps: CorroborationGap[] = [];

  for (const [key, { displayName, events: evList }] of byEntity.entries()) {
    if (conflictedEntityKeys.has(key)) continue;

    for (const attribute of new Set(
      evList.map(b => b.ev.claim?.attribute).filter((a): a is string => !!a),
    )) {
      const withClaim = evList.filter(b => b.ev.claim?.attribute === attribute && b.ev.claim.value);
      if (withClaim.length === 0) continue;

      // Group by asserted value, exactly as the corroboration pass does — a
      // gap is about one VALUE standing alone, not about an attribute having
      // one observation.
      const byValue = new Map<string, Event[]>();
      for (const b of withClaim) {
        const v = String(b.ev.claim!.value);
        const at = byValue.get(v);
        if (at) at.push(b.ev); else byValue.set(v, [b.ev]);
      }

      // If ANY value on this attribute already clears two feeds, the attribute
      // is corroborated and its stragglers are outliers, not gaps.
      const independentFeeds = (group: Event[]) => {
        const present = new Set(group.map(e => e.feedId ?? e.sourceId));
        const upstream = new Map<string, string[]>();
        for (const e of group) {
          const feed = e.feedId ?? e.sourceId;
          if (e.derivesFrom?.length && !upstream.has(feed)) upstream.set(feed, e.derivesFrom);
        }
        return new Set([...present].filter(f => !(upstream.get(f) ?? []).some(up => present.has(up))));
      };
      if ([...byValue.values()].some(g => independentFeeds(g).size >= 2)) continue;

      // More than one lone value is a disagreement between single sources —
      // reporting each as "needs corroboration" would hide that they conflict.
      if (byValue.size !== 1) continue;

      const [value, group] = [...byValue.entries()][0];
      const feeds = independentFeeds(group);
      if (feeds.size !== 1) continue;

      const times = group.map(e => new Date(e.timestamp).getTime()).filter(t => !Number.isNaN(t));
      if (times.length === 0) continue;

      gaps.push({
        entityRef: displayName,
        attribute,
        value,
        sourceId: [...feeds][0],
        confidence: Math.round(
          (group.reduce((sum, e) => sum + (e.confidence ?? DEFAULT_CONFLICT_STRENGTH), 0) / group.length) * 100) / 100,
        observedAt: new Date(Math.max(...times)).toISOString(),
        isMock: group.some(e => e.isMock === true) ? true
          : group.every(e => e.isMock === false) ? false
          : undefined,
      });
    }
  }

  gaps.sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  return gaps;
}

/**
 * The corroborated finding for ONE entity's bucket, or null if it does not
 * clear the bar. Counterpart to conflictsForBucket — see that function's note
 * on why per-entity memoisation is sound here.
 */
export function findingForBucket(displayName: string, evList: BucketedEvent[]): CorroboratedFinding | null {
    const corroborating = new Set<Event>();
  for (let i = 0; i < evList.length; i++) {
    for (let j = i + 1; j < evList.length; j++) {
      const deltaMs = evList[j].t - evList[i].t;
      if (deltaMs > CONFLICT_TIME_WINDOW_MS) break; // sorted: see bucketByEntity

      const a = evList[i].ev;
      const b = evList[j].ev;
      if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) continue; // not a location claim
      if (a.sourceId === b.sourceId) continue; // independence required, not the same record twice

      // Same reasoning as conflictsForBucket: two events known only to within a
      // month cannot establish that they happened within 24 hours of each
      // other, so they cannot corroborate on that basis either.
      if (!supportsWindow(a.timePrecisionMs, CONFLICT_TIME_WINDOW_MS)) continue;
      if (!supportsWindow(b.timePrecisionMs, CONFLICT_TIME_WINDOW_MS)) continue;

      const distanceKm = haversineDistanceKm(a.lat!, a.lon!, b.lat!, b.lon!);
      if (distanceKm <= CONFLICT_DISTANCE_THRESHOLD_KM) {
        corroborating.add(a);
        corroborating.add(b);
      }
    }
  }

  if (corroborating.size === 0) return null;
  const group = Array.from(corroborating);
  /**
   * Independence is measured in FEEDS, not records.
   *
   * This counted distinct `sourceId`s, which for an observation is the record
   * id — so two rows from one feed corroborated each other and the finding
   * published `sourceCount: 2`. Every one of the 38 findings the real UCDP
   * asset produced was single-feed.
   *
   * `feedId ?? sourceId` is the feed when one is stated and the record id
   * otherwise. This comment used to say a report "sets feedId to its own id,
   * so two reports still corroborate" — that stopped being true when
   * adaptReportsToEvents started deriving a report's feed from its AUTHOR.
   *
   * The current rule, which is the honest one: two reports by the SAME
   * analyst do not corroborate each other, because one person is one thing
   * that can be wrong. Two reports by DIFFERENT analysts do. What no longer
   * corroborates is one feed with itself, which was never corroboration.
   */
  /**
   * Feeds present, with derived feeds collapsed into what they derive from.
   *
   * A feed that republishes another adds no independence when that upstream is
   * also present: the two agree because they are one measurement, not because
   * two observers saw the same thing. Verified against the live feeds — all 31
   * USGS earthquakes had a GDACS counterpart at EXACTLY 0 metres, min, median
   * and max. GDACS republishes USGS coordinates verbatim.
   *
   * That perfect agreement is precisely why this must be DECLARED rather than
   * detected: derivation and strong corroboration look identical in the data,
   * and the better the derivation the more convincing the false corroboration.
   *
   * A derived feed still counts on its own when its upstream is absent — GDACS
   * reporting a quake USGS did not is a real, if weaker, observation.
   */
  const presentFeeds = new Set(group.map(e => e.feedId ?? e.sourceId));
  const upstreamOf = new Map<string, string[]>();
  for (const e of group) {
    const feed = e.feedId ?? e.sourceId;
    if (e.derivesFrom?.length && !upstreamOf.has(feed)) upstreamOf.set(feed, e.derivesFrom);
  }
  const distinctSources = new Set(
    [...presentFeeds].filter(feed =>
      !(upstreamOf.get(feed) ?? []).some(up => presentFeeds.has(up))),
  );
  if (distinctSources.size < 2) return null; // 2+ independent SOURCES, not records

  // A finding is only as precisely timed as its vaguest input.
  const timePrecisionMs = Math.max(
    ...group.map(e => e.timePrecisionMs ?? DEFAULT_TIME_PRECISION_MS),
  );
  // Contributors disagreeing about what the subject IS means the finding
  // should not assert one.
  const kinds = new Set(group.map(e => e.subjectKind ?? 'unknown'));
  const subjectKind: SubjectKind = kinds.size === 1 ? [...kinds][0] : 'unknown';
  const contributingFingerprints = [...new Set(group.map(e => e.fingerprint).filter(Boolean) as string[])].sort();
  /**
   * Whether any contributor is fabricated.
   *
   * `true` if ANY is — a finding built partly from demo data is not partly
   * real, it is unsafe to publish. `false` only when every contributor is
   * known real. `undefined` when any of them never said, because unmeasured
   * is not the same claim as genuine.
   */
  const isMock = group.some(e => e.isMock === true) ? true
    : group.every(e => e.isMock === false) ? false
    : undefined;

  const times = group.map(e => new Date(e.timestamp).getTime()).filter(t => !Number.isNaN(t));
  const observedFrom = new Date(Math.min(...times)).toISOString();
  const observedTo = new Date(Math.max(...times)).toISOString();

  const avgLat = group.reduce((sum, e) => sum + e.lat!, 0) / group.length;
  const avgLon = group.reduce((sum, e) => sum + e.lon!, 0) / group.length;
  /*
   * The coarsest contributor sets the precision of the average, exactly as
   * timePrecisionMs already takes Math.max below. Averaging a surveyed point
   * with a 20km cell centroid does not produce a surveyed point.
   */
  const geoPrecisionM = Math.max(
    ...group.map(e => e.geoPrecisionM ?? DEFAULT_GEO_PRECISION_M),
  );
  const dp = coordinateDecimalsFor(geoPrecisionM);
  const round = (n: number) => Number(n.toFixed(dp));
  const avgConfidence = group.reduce((sum, e) => sum + (e.confidence ?? DEFAULT_CONFLICT_STRENGTH), 0) / group.length;

  return {
    entityRef: displayName,
    attribute: 'location',
    // Printed to the precision the evidence supports, not to four decimals.
    // Eleven metres on a claim derived from a 20km cell asserts a position the
    // observer withheld — frequently a real address belonging to someone
    // uninvolved.
    value: { lat: round(avgLat), lon: round(avgLon) },
    confidence: Math.round(avgConfidence * 100) / 100,
    sourceCount: distinctSources.size,
    observedFrom,
    observedTo,
    subjectKind,
    timePrecisionMs,
    geoPrecisionM,
    contributingFingerprints,
    citedEventIds: [...new Set(group.map(e => e.sourceEventId).filter(Boolean) as string[])].sort(),
    isMock,
    matchedBy: 'distance',
    algorithmVersion: CORROBORATION_ALGORITHM_VERSION
  };
}

/**
 * One event's position, rounded to the precision its source stated.
 *
 * For anything that draws a single event where it was observed. Corroborations were
 * already printed this way: their averaged position takes the coarsest contributor's
 * precision (findingForBucket, above). Contradictions were not. Both ends were placed at
 * each event's raw coordinates, so the globe drew an observation to full precision when
 * its source had said "within 20 km" — frequently the observer's own position, and at the
 * closest zoom that is around 70 m a pixel.
 *
 * Undefined, never a fallback, when the event has no position: on a map an invented
 * position is an invented observation.
 */
export function publishablePosition(
  ev: { lat?: number | null; lon?: number | null; geoPrecisionM?: number },
): { lat: number; lon: number } | undefined {
  if (ev.lat == null || ev.lon == null || !Number.isFinite(ev.lat) || !Number.isFinite(ev.lon)) return undefined;
  const dp = coordinateDecimalsFor(ev.geoPrecisionM);
  return { lat: Number(ev.lat.toFixed(dp)), lon: Number(ev.lon.toFixed(dp)) };
}

/** Each source's first positioned event, rounded by publishablePosition. What `positionOf` answers from. */
export function buildPositionIndex(
  events: ReadonlyArray<{ sourceId: string; lat?: number | null; lon?: number | null; geoPrecisionM?: number }>,
): Map<string, { lat: number; lon: number }> {
  const map = new Map<string, { lat: number; lon: number }>();
  for (const ev of events) {
    if (map.has(ev.sourceId)) continue;
    const at = publishablePosition(ev);
    if (at) map.set(ev.sourceId, at);
  }
  return map;
}

