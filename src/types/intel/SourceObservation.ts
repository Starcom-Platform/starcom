import type { IntelReliability } from './IntelItemUI';

/**
 * The generic ingest envelope from ADR-0003 — now real, runtime-backed types
 * rather than documentation-as-types.
 *
 * ADR-0003 deliberately shipped these as unused interfaces and named the risk
 * it was taking: "the shape is a guess informed by exactly two sources ... a
 * genuinely different third source could reveal it needs revision before
 * anything is actually built against it." Wiring five real open-data sources
 * (UCDP, GDACS, EONET, ReliefWeb, USGS) did exactly that. The revisions, and
 * why each one was forced:
 *
 *  - `id` added. Every one of the five is POLLED, so the same upstream record
 *    arrives repeatedly. Without a deterministic id derived from source plus
 *    native id, re-ingest duplicates rather than replaces, and duplicate
 *    observations of one event would read as independent corroboration — the
 *    single most damaging thing a corroboration engine can get wrong.
 *  - `isMock` added, REQUIRED rather than optional. computeDataIntegritySummary
 *    already consumes `{isMock: boolean}[]`, and the whole positioning bet of
 *    this app is real-versus-fabricated provenance. Optional would mean an
 *    adapter could omit it and have its output silently counted as real.
 *  - `method` added. Attestation weight is derived from method and age (see
 *    docs/build-order.md); without a per-observation method there is nothing
 *    to derive from.
 *  - `geo` hoisted to a field. Location is the spatial index the correlation
 *    engine reads, not merely one claim attribute among many.
 *
 * There is deliberately NO per-observation confidence field. Weight is derived
 * from method, source trust, and age — never declared by the adapter that
 * produced the record. An adapter asserting its own confidence is the same
 * failure as an instance asserting its own findings' confidence, which is the
 * thing federation cannot survive.
 */

export const OBSERVATION_SCHEMA_VERSION = 1;

/**
 * How an observation came to be known. This is the "method" half of an
 * attestation (claim / author / method / weight), and it is what weight is
 * derived from, so the values are ordered by evidential directness rather
 * than being an arbitrary vocabulary.
 */
/**
 * What kind of thing the observation is about.
 *
 * This exists because contradiction detection asks "can this entity be in two
 * places at once?" — a question that only has a meaningful answer for subjects
 * that occupy ONE place at a time. Running it against UCDP, whose subject is an
 * armed actor and very often a state, produced 328 same-actor-same-day groups
 * flagged as contradictions; a government operating in twenty places on one day
 * is not a contradiction, it is Tuesday.
 *
 * The distinction is physical exclusivity, not importance: a person and a ship
 * can each only be in one place; an organisation, a state, or a named region
 * cannot be pinned that way at all.
 */
export type SubjectKind =
  /** A person. Physically exclusive. */
  | 'person'
  /** A discrete physical thing — a vessel, an aircraft, a device. Exclusive. */
  | 'object'
  /** A state, agency, company, armed group. NOT exclusive: acts in many places at once. */
  | 'organization'
  /** A country, region, or site. Not exclusive, and not really a locatable subject either. */
  | 'place'
  /** An occurrence rather than a persistent subject — an earthquake, a wildfire. */
  | 'event'
  /**
   * Unknown. Treated as EXCLUSIVE, deliberately.
   *
   * The alternative — treating unknown as non-exclusive — would silently
   * disable contradiction detection for every subject nobody has classified,
   * including the analyst-authored reports it was built for. Better to
   * over-report on unclassified subjects, which is visible, than to
   * under-report, which is not.
   */
  | 'unknown';

/** True when a subject can only occupy one location at a time. */
export function isPhysicallyExclusive(kind: SubjectKind | undefined): boolean {
  return kind === 'person' || kind === 'object' || kind === undefined || kind === 'unknown';
}

export type ObservationMethod =
  | 'measured'    // instrument reading — USGS seismometers
  | 'observed'    // direct observation, incl. remote sensing — NASA EONET
  | 'collected'   // automated collection from a system of record — NetRunner OSINT
  | 'reported'    // curated from human reporting — UCDP, ReliefWeb
  | 'derived'     // produced by a model over other inputs — GDACS alert levels
  /*
   * The three below are field methods, from Navcom's kind-1911 observations.
   *
   * They are their own values rather than aliases onto the five above, and
   * that was the conclusion of an exchange with Navcom rather than a
   * preference. Mapping `told` onto `reported` would have let field hearsay
   * inherit the weight of a curated conflict dataset — laundering arriving
   * through a mapping table, which is the same failure the provenance chain
   * exists to prevent, one layer up. Navcom's own reply generalised it: all
   * three would have been wrong in different directions.
   */
  | 'saw'         // first-person direct observation by a field operator
  | 'told'        // the operator was told by someone they cannot name
  | 'inferred';   // the operator's own inference, reasoning not carried

/**
 * The subset a person standing somewhere can produce.
 *
 * Exported because two places need the same list and had started keeping their
 * own: navcomAdapter, deciding what a kind-1911 `m` tag may say, and a
 * collection requirement, saying what kind of field work would answer it. Two
 * copies of a vocabulary is how the two ends of a round trip come to disagree
 * about what can be asked for versus what can be filed.
 *
 * The other five methods are not field work. A requirement answerable only by
 * `collected` or `derived` is a desk question, and dispatching a person to
 * stand in a street for it would put someone somewhere for no reason.
 */
export const FIELD_METHODS = ['saw', 'told', 'inferred'] as const;
export type FieldMethod = (typeof FIELD_METHODS)[number];

/**
 * A thing that produces observations. `kind` stays an open string, per
 * ADR-0003's reasoning: adding a source type should be a string literal at the
 * call site that introduces it, not an edit to this file.
 */
export interface Source {
  id: string;
  kind: 'osint-bot' | 'watch-pattern' | 'open-data' | string;
  /** Human-readable name, for provenance display. */
  label: string;
  /**
   * Admiralty-style A–F grade, the same scale computeReportConfidence.ts uses.
   * The source's baseline trustworthiness, independent of any one observation.
   */
  trustBaseline: IntelReliability;
  ingestMethod: 'poll' | 'subscribe' | 'manual';
  /**
   * How a third party can resolve this source's `sourceRecordId` values, when
   * they can resolve them at all.
   *
   * Only `'nostr-event'` ids are citable in a published Finding, because an
   * `e` tag means "a Nostr event" and nothing else. A register's row key is a
   * perfectly good record id and is NOT one of these — putting it in an `e`
   * tag would produce a citation that resolves to nothing, which is worse than
   * no citation because it looks checkable.
   *
   * Absent means the ids are meaningful to this source and not fetchable by a
   * stranger.
   */
  recordIdScheme?: 'nostr-event';
  /**
   * Source ids this feed REPUBLISHES OR DERIVES FROM.
   *
   * Declared, because agreement between a feed and its upstream is one
   * measurement counted twice, not corroboration — and it is invisible from
   * the data, which is what makes it dangerous. Measured against the live
   * feeds: every one of 31 USGS earthquakes had a GDACS counterpart at
   * EXACTLY 0 metres. Min, median and max distance were all zero. GDACS
   * republishes USGS coordinates verbatim for earthquakes.
   *
   * Naive cross-source matching would have called that a two-source
   * corroboration and published it. It would have looked more credible than
   * the single-feed case D12 fixed, and been the same error: independence
   * asserted where none exists.
   *
   * The federation code already models this for foreign findings, where it is
   * called `echo`. This is the same idea applied to local feeds, declared
   * up front rather than inferred, because a derivation cannot be detected
   * from values that match perfectly — perfect agreement is exactly what
   * derivation looks like.
   */
  derivesFrom?: string[];
  /**
   * True when this source emits fabricated data — a fixture, a demo feed, a
   * stubbed adapter. Propagates onto every observation it produces so an
   * adapter cannot launder mock data into the real corpus by forgetting.
   */
  isMock: boolean;
}

/** One claim, from one source, about one subject. */
export interface Observation {
  /**
   * Deterministic: `${sourceId}:${nativeId}`. Re-ingesting the same upstream
   * record yields the same id, so it replaces rather than accumulates.
   */
  id: string;
  sourceId: string;
  /**
   * Opaque by intent — see ADR-0003. Raw display strings today, matched via
   * normalizeEntityName() at read time; whichever adapter first needs a real
   * registry is the place to introduce one.
   */
  subjectEntityRef: string;
  /**
   * The subject's name as the source writes it, for a person to read (plan
   * item 3.6). Never matched on and never fingerprinted: `subjectEntityRef` is
   * the identity, and names differ across sources in punctuation, legal form
   * and language.
   */
  subjectName?: string;
  claim: { attribute: string; value: unknown };
  /** The name of the claim's value when the value is an id: the place a Wikidata id names. For reading only. */
  valueLabel?: string;
  /** ISO 8601, UTC. When the observed thing happened, not when it was fetched. */
  timestamp: string;
  /**
   * How wide the uncertainty on `timestamp` is, in milliseconds.
   *
   * Not every source knows when something happened to the same resolution.
   * UCDP states its own precision, and 13% of a current release is imprecise —
   * a few days, a week, a month, a year. Without this, an event known only to
   * within a year is indistinguishable from one timed to the second, and will
   * happily corroborate inside a 24-hour window as though it were exact.
   *
   * Omitted means the source did not say. Callers should treat that as
   * day-precision rather than exact — a date with no stated time is a day, not
   * a midnight.
   */
  timePrecisionMs?: number;
  method: ObservationMethod;
  /** Where the observed thing happened, when that is meaningful. */
  geo?: { lat: number; lon: number };
  /**
   * How wide the uncertainty on `geo` is, as a radius in metres.
   *
   * The spatial twin of `timePrecisionMs`, and the argument for it is the same
   * one, transferred: without this, a position known only to within 20km is
   * indistinguishable from one surveyed to the metre, and will happily
   * corroborate inside a proximity threshold as though it were exact.
   * correlationUtils compares positions with a haversine distance against
   * CONFLICT_DISTANCE_THRESHOLD_KM; two observations coarsened to the same cell
   * arrive at an identical centroid and read as 0km apart.
   *
   * It also carries a cost the temporal field does not, which is why it is
   * required rather than merely useful. Some sources coarsen position
   * DELIBERATELY, to protect the person who filed the observation — Navcom's
   * kind-1911 observations are published as a geohash cell for exactly that
   * reason. Rendering that centroid as a point does not just overstate
   * precision: it asserts a specific location the observer deliberately did
   * not give, and that location is frequently a real address belonging to
   * someone uninvolved. A wrong dot on an innocent building is a different
   * failure from a vague one.
   *
   * Omitted means the source did not say. It does NOT mean exact — a consumer
   * that needs exactness must require this field rather than assume its
   * absence is a guarantee.
   */
  geoPrecisionM?: number;
  /** Human-readable summary, for display. */
  label: string;
  tags: string[];
  /**
   * What kind of thing subjectEntityRef names. Drives whether "can't be in two
   * places at once" applies — see SubjectKind.
   */
  subjectKind: SubjectKind;
  /**
   * The ORIGINAL source, when this observation reached us via a relay.
   *
   * An aggregator is not a source. Wikidata records where each of its
   * statements came from — a national registry, a Wikipedia article, or the
   * Global LEI Index — and flattening all of them to "wikidata" would destroy
   * exactly the information independence depends on. It would also let a
   * Wikidata statement imported FROM GLEIF corroborate GLEIF, which is
   * D13 in a new place: 5,957 of these statements are GLEIF imports.
   *
   * Set to the upstream's own source id where one exists (`gleif`), so a
   * relayed claim and the original land in the SAME feed and cannot corroborate
   * each other. Undefined when the source observed directly.
   */
  upstreamSourceId?: string;
  /** The name of the source `upstreamSourceId` names, as the relaying source gives it. For reading only. */
  upstreamSourceLabel?: string;
  /**
   * The retrievable id of this record in the source system, where the source
   * HAS retrievable records — a Nostr event id, a register's row key.
   *
   * Distinct from `id`, which is Starcom's own handle and may fan one source
   * record into several observations. This is the value a third party uses to
   * fetch the original and check the derivation without asking us, which is
   * why it must survive into any Finding built from it.
   *
   * It is an id and not an identity. Navcom asked for source event ids to be
   * carried into Findings and Starcom's rule is that a Finding never carries
   * source IDENTITIES; an event id is a hash that any relay will resolve, so
   * the two requirements do not actually collide. Pubkeys and callsigns stay
   * out.
   */
  sourceRecordId?: string;
  /** Inherited from the Source; never set independently by an adapter. */
  isMock: boolean;
  /**
   * A per-record reliability grade, when the source supplies one — NetRunner's
   * `Intel.reliability`, for instance.
   *
   * CLAMPED so it can only ever be EQUAL TO OR WORSE THAN the source's
   * trustBaseline, never better. The reason is the same principle the rest of
   * this pipeline runs on: that grade is assigned by the collector about its
   * own output, which makes it a self-report, and self-report grants nothing.
   * A collector saying "this one is especially reliable" is exactly the
   * assertion weight derivation exists to refuse.
   *
   * It is kept rather than discarded because the downward direction is real
   * information: a collector flagging its own output as degraded, or as
   * suspected deception, is telling you something it has no incentive to
   * invent.
   */
  observedTrust?: IntelReliability;
  schemaVersion: number;
}

/** One day, the coarsest precision that can still support a 24-hour-window claim. */
export const DEFAULT_TIME_PRECISION_MS = 24 * 60 * 60 * 1000;

/**
 * Whether an observation's timing is precise enough to support a claim about a
 * window of the given width.
 *
 * Two events "sometime in June" cannot establish that they happened within 24
 * hours of each other. Asserting corroboration or contradiction from them is
 * inventing precision the source explicitly declined to claim.
 */
export function supportsWindow(precisionMs: number | undefined, windowMs: number): boolean {
  return (precisionMs ?? DEFAULT_TIME_PRECISION_MS) <= windowMs;
}

/**
 * Assumed spatial precision when a source does not state one.
 *
 * Deliberately coarse — a kilometre — for the same reason day-precision is the
 * temporal default: a coordinate with no stated uncertainty is a coordinate
 * somebody wrote down, not one somebody surveyed. Treating it as exact is the
 * assumption that produces false contradictions.
 */
export const DEFAULT_GEO_PRECISION_M = 1_000;

/**
 * Whether two observations are positioned precisely enough to support a claim
 * about a separation of the given distance.
 *
 * The spatial twin of `supportsWindow`, and the argument is the same one. Two
 * observations each known only to within 20km cannot establish that they are
 * more than 100km apart: their true positions could be 60km apart. Asserting a
 * contradiction from them invents precision neither source claimed.
 *
 * The uncertainties add, because either could be wrong in the direction that
 * closes the gap.
 */
export function supportsSeparation(
  precisionAM: number | undefined,
  precisionBM: number | undefined,
  separationKm: number,
): boolean {
  const combinedM = (precisionAM ?? DEFAULT_GEO_PRECISION_M) + (precisionBM ?? DEFAULT_GEO_PRECISION_M);
  return combinedM < separationKm * 1_000;
}

/**
 * Decimal places worth printing for a coordinate of the given uncertainty.
 *
 * A centroid rounded to four decimals reads as eleven metres. When it came from
 * a 20km cell, those digits are not merely useless — they assert a position the
 * observer deliberately withheld, and it will often be a real address belonging
 * to somebody uninvolved.
 *
 * One decimal is about 11km at the equator, so the step is chosen to sit just
 * inside the uncertainty rather than far below it.
 */
export function coordinateDecimalsFor(precisionM: number | undefined): number {
  const m = precisionM ?? DEFAULT_GEO_PRECISION_M;
  if (m >= 50_000) return 0;   // ~111 km
  if (m >= 5_000) return 1;    // ~11 km
  if (m >= 500) return 2;      // ~1.1 km
  if (m >= 50) return 3;       // ~110 m
  return 4;                    // ~11 m — only for genuinely surveyed positions
}

/**
 * ─── THE FUNCTION ABOVE HAD NO RENDERER ────────────────────────────────────
 *
 * `coordinateDecimalsFor` existed, was documented in exactly the terms that
 * matter — "it will often be a real address belonging to somebody uninvolved"
 * — and was consulted by ONE caller: correlationUtils, a data path. No renderer
 * anywhere asked it anything. Every coordinate on every surface was a
 * hardcoded `toFixed(2)` or `toFixed(4)`, so a 20km Navcom cell centroid
 * printed to about eleven metres.
 *
 * Redaction was wire-only. `maskCoordinatePairs`, the four-character geohash
 * ceiling, the mission gate (`destinationsOf`) — all of it operates on the payload, and
 * none of it on the pixels. That was survivable while the pixels stayed on one
 * operator's screen. A shareable image makes the screen a wire.
 *
 * ─── WHICH COORDINATES BELONG HERE ─────────────────────────────────────────
 *
 * Observer-derived ones: anything whose position came from a source that could
 * have coarsened it to protect somebody. Those go through this function.
 *
 * NOT coordinates the user produced themselves — a point they clicked on the
 * globe, a measurement they took, a location they typed. Coarsening those helps
 * nobody and loses information the user supplied on purpose. Nor identity keys
 * (`rlshTags`, marker dedupe) or geometry hashes, where the digits are an
 * identifier rather than a claim about the world; rounding those changes what
 * they identify.
 *
 * The distinction is the whole point, so state it at the call site when it is
 * not obvious which side a coordinate falls on.
 */
export function formatCoordinate(
  lat: number | null | undefined,
  lon: number | null | undefined,
  precisionM?: number,
  options: {
    /** Rendered when either coordinate is missing or non-finite. */
    absent?: string;
    /** Append the stated uncertainty, e.g. "±20 km". Off by default. */
    showUncertainty?: boolean;
  } = {},
): string {
  const { absent = '—', showUncertainty = false } = options;

  if (typeof lat !== 'number' || typeof lon !== 'number'
    || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return absent;
  }

  const dp = coordinateDecimalsFor(precisionM);
  const base = `${lat.toFixed(dp)}°, ${lon.toFixed(dp)}°`;

  // Only when the source actually stated one. Printing "±1 km" for an
  // unstated precision would present this module's assumption as the source's
  // claim, which is the error this function exists to stop.
  if (!showUncertainty || precisionM === undefined) return base;
  return `${base} ${formatUncertainty(precisionM)}`;
}

/** "±20 km" / "±150 m", for display beside a coordinate. */
export function formatUncertainty(precisionM: number): string {
  if (!Number.isFinite(precisionM) || precisionM < 0) return '';
  if (precisionM >= 1_000) {
    const km = precisionM / 1_000;
    return `±${km >= 10 ? Math.round(km) : Number(km.toFixed(1))} km`;
  }
  return `±${Math.round(precisionM)} m`;
}
