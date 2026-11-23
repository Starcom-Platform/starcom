import type { CorroboratedFinding, LocationConflict } from '../../../applications/intelanalyzer/state/correlationUtils';

/**
 * The contract between intelligence analysis and the globe.
 *
 * docs/build-order.md names the "Global" gap: five open-data feeds already
 * flow into the globe and have never reached the analysis layer, and the
 * analysis layer has never rendered anything back. This is the return path —
 * what the correlation engine CONCLUDED, as opposed to what was fetched.
 *
 * Deliberately plain data. Nothing here imports THREE, GlobeEngine, or any
 * renderer type, and nothing here knows how a mark is drawn. The globe
 * consumes this shape through the existing public `setOverlayData` channel.
 * The boundary matters because the alternative — analysis code reaching into
 * renderer internals — is how this repo's globe layer previously accreted the
 * coupling the architecture guard now exists to prevent.
 */

export const GLOBE_INTEL_LAYER_VERSION = 1;

/** Rendering intent, expressed as meaning rather than as pixels. */
export type GlobeMarkKind =
  /** Multiple independent sources agree on a place. */
  | 'corroboration'
  /** The same entity placed in two locations that cannot both be true. */
  | 'contradiction';

export interface GlobeIntelMark {
  id: string;
  kind: GlobeMarkKind;
  lat: number;
  lon: number;
  label: string;
  /**
   * 0..1, DERIVED — never declared. Drives visual prominence, so a hardcoded
   * value here would put a lie directly into what an analyst sees first.
   */
  weight: number;
  /** Independent sources behind this mark. */
  sourceCount: number;
  /**
   * When the underlying observations occurred — ISO 8601 UTC.
   *
   * A range, not a point: corroboration is agreement across observations made
   * at different moments, and a contradiction is by definition two moments.
   * Carried so a time cursor can include or exclude the mark without the globe
   * needing to know how either was derived.
   */
  observedFrom: string;
  observedTo: string;
  /**
   * True when any contributing observation was fabricated.
   *
   * Carried on the mark itself rather than tracked separately, because the
   * globe is the surface where provenance is most easily lost: a pin looks
   * exactly as authoritative whether it came from a seismometer or a fixture.
   */
  isMock: boolean;
}

/**
 * The pairing between the two halves of a contradiction, so a renderer can
 * connect them without re-deriving which marks belong together.
 */
export interface GlobeConflictLink {
  id: string;
  markIdA: string;
  markIdB: string;
  /** min(confidence) of the two sides — see LocationConflict.strength. */
  strength: number;
  distanceKm: number;
  /**
   * True when the shorter path between the two points crosses the antimeridian.
   *
   * A renderer interpolating naively from lon 179 to lon -179 draws a line the
   * long way around the planet — 358 degrees instead of 2. The contradiction
   * would render as a belt around the Earth rather than as two nearby points
   * that disagree, which is not a cosmetic problem: it changes what the
   * picture asserts.
   */
  crossesAntimeridian: boolean;
}

export interface GlobeIntelLayer {
  id: string;
  version: number;
  marks: GlobeIntelMark[];
  links: GlobeConflictLink[];
  /**
   * Findings that could not be placed, and why.
   *
   * Excluded AND counted. A finding silently dropped for want of coordinates
   * makes the globe look emptier than the analysis actually was, and an
   * analyst has no way to tell the difference between "nothing there" and
   * "something there we could not draw".
   */
  unplaceable: { count: number; reasons: Record<string, number> };
  /**
   * Marks sharing a position with at least one other mark.
   *
   * Reported rather than nudged apart. Jittering a coordinate to make two pins
   * visible puts a mark somewhere nothing was observed — a small lie, on the
   * surface where position IS the claim.
   */
  coincidentMarkIds: string[];
  /**
   * How this layer was produced. A globe layer with no stated derivation is
   * indistinguishable from decoration, which is what the five open-data feeds
   * currently are.
   */
  provenance: {
    /**
     * What produced this layer.
     *
     * An OPEN string, widened from the literal 'correlation-engine' when a
     * second layer was built against this contract and found it could not
     * state its own provenance without lying. A field whose only legal value
     * names the first implementation is not a contract, it is that
     * implementation's shape written down — and the whole purpose of
     * provenance is to distinguish sources from one another.
     *
     * Same reasoning as Source.kind in ADR-0003: adding a producer should be
     * a string literal at the call site that introduces it, not an edit here.
     */
    derivedFrom: 'correlation-engine' | 'published-findings-ledger' | string;
    algorithmVersion: number;
    computedAt: string;
    /** Sources that were unreachable when this was computed — see sourceIngestStatus. */
    blindSpots: string[];
  };
  /**
   * True when at least one source was unreachable. A sparse layer during an
   * outage must not read as "little is happening".
   */
  degraded: boolean;
  /**
   * How much of what produced this layer is real.
   *
   * Surfaced ON the globe rather than only in a panel, because the globe is
   * where a fabricated mark is least distinguishable from a real one — it is
   * a pin either way, and pins on a 3D Earth read as authoritative by default.
   */
  integrity: { totalObservations: number; mockCount: number; realRatio: number } | null;
  /**
   * Why the layer is empty, when it is. Null when it has marks.
   *
   * An empty globe currently says nothing about WHY it is empty, and the
   * possible reasons are not remotely equivalent: analysis that ran and found
   * nothing is a finding, analysis that has not run is an absence, and
   * analysis whose results could not be placed is a rendering failure. Showing
   * the same blank Earth for all three is the failure mode this codebase has
   * now had to fix on the OPSEC panel, the ingest status, and here.
   */
  emptyReason: GlobeEmptyReason | null;
  /**
   * What was left out because the layer hit its mark budget, and what survived.
   *
   * Null when everything is shown.
   *
   * Reported, never silent — the same rule as `unplaceable`, and for a sharper
   * reason. A truncated globe is not a less detailed globe, it is a globe
   * making a false claim: the analyst sees marks, concludes those are the
   * marks, and reasons about a picture with pieces missing. "Fewer pins" and
   * "not all the pins" look identical on a 3D Earth.
   *
   * `budgetOverrun` is true when contradictions alone exceeded the budget and
   * were kept anyway. It is a real state the caller may want to warn about, and
   * it is the only way the mark count can exceed maxMarks.
   */
  truncated: {
    shown: number;
    total: number;
    budgetOverrun: boolean;
  } | null;
}

export type GlobeEmptyReason =
  /** Nothing in the working set to analyse. */
  | 'no-observations'
  /** Analysis ran across real input and found nothing that qualified. */
  | 'nothing-qualified'
  /** Results exist but none could be placed on a map. */
  | 'all-unplaceable';

/** Longitude difference along the shorter arc, in degrees (0..180). */
export function shortestLonDelta(lonA: number, lonB: number): number {
  const raw = Math.abs(lonA - lonB) % 360;
  return raw > 180 ? 360 - raw : raw;
}

/** True when the shorter path between two longitudes crosses ±180. */
export function crossesAntimeridian(lonA: number, lonB: number): boolean {
  return Math.abs(lonA - lonB) > 180;
}

function isPlaceable(lat: unknown, lon: unknown): boolean {
  return typeof lat === 'number' && typeof lon === 'number'
    && Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/**
 * Marks occupying the same point, to 4dp — the precision findings are rounded to.
 *
 * Accumulates with push rather than by rebuilding the array. The previous form,
 * `byPos.set(key, [...(byPos.get(key) ?? []), m.id])`, copied every id already
 * at a position each time another arrived: O(k^2) for a position holding k
 * marks, and O(n^2) when they pile onto one point.
 *
 * That is not a theoretical worst case, it is the ordinary shape of this data.
 * Observation feeds concentrate on cities and incident sites, so coincidence is
 * the common case and the quadratic term is what you hit first. Measured before
 * the change: 8,000 marks at a single point took 82.6ms — five frames, to
 * compute a list of ids.
 */
function findCoincident(marks: GlobeIntelMark[]): string[] {
  const byPos = new Map<string, string[]>();
  for (const m of marks) {
    const key = `${m.lat.toFixed(4)},${m.lon.toFixed(4)}`;
    const at = byPos.get(key);
    if (at) at.push(m.id);
    else byPos.set(key, [m.id]);
  }
  const out: string[] = [];
  for (const ids of byPos.values()) if (ids.length > 1) out.push(...ids);
  return out;
}

export const INTEL_FINDINGS_OVERLAY = 'intelFindings';

/**
 * Most marks the layer will emit.
 *
 * Chosen from measurement, not taste: with the coincidence scan made linear,
 * building 5,000 marks costs ~3ms and 10,000 costs ~8-17ms on the machine this
 * was profiled on. The build runs on the main thread inside a useMemo, so the
 * budget is set where a rebuild stays comfortably inside one 60fps frame on
 * hardware slower than a developer's.
 *
 * A cap rather than clustering, deliberately. Clustering renders 500 marks as
 * one and looks complete while being a summary; an analyst cannot see that a
 * pin means "many". A cap plus an explicit `truncated` count is less pretty and
 * cannot mislead.
 */
export const DEFAULT_MAX_MARKS = 5_000;

/**
 * Trim a mark set to the budget, choosing what to keep by significance.
 *
 * Ordering rule, in priority order:
 *   1. Contradictions, always, in full. A contradiction is the thing this
 *      globe exists to surface — docs/build-order.md puts it as the headline —
 *      and dropping one to make room for agreement would invert the entire
 *      point. Agreement is the cheap signal; disagreement is the expensive one.
 *   2. Then corroborations by descending weight, so what survives is what the
 *      evidence supports most strongly.
 *
 * If contradictions alone exceed the budget, they are ALL kept and the budget
 * is knowingly overrun. A globe that hides contradictions to stay inside a
 * frame budget has optimised away its reason to exist; the overrun is visible
 * in `truncated` and a dropped frame is the lesser harm.
 */
function applyMarkBudget(
  marks: GlobeIntelMark[],
  maxMarks: number,
): { marks: GlobeIntelMark[]; truncated: GlobeIntelLayer['truncated'] } {
  if (marks.length <= maxMarks) return { marks, truncated: null };

  const contradictions = marks.filter((m) => m.kind === 'contradiction');
  const rest = marks.filter((m) => m.kind !== 'contradiction');

  if (contradictions.length >= maxMarks) {
    return {
      marks: contradictions,
      truncated: { shown: contradictions.length, total: marks.length, budgetOverrun: contradictions.length > maxMarks },
    };
  }

  const room = maxMarks - contradictions.length;
  const kept = [...rest].sort((a, b) => b.weight - a.weight).slice(0, room);
  const out = [...contradictions, ...kept];
  return {
    marks: out,
    truncated: { shown: out.length, total: marks.length, budgetOverrun: false },
  };
}

export interface BuildLayerOptions {
  /** Ids of observations known to be fabricated, so marks can be flagged. */
  mockEntityRefs?: Set<string>;
  blindSpots?: string[];
  now?: () => Date;
  /** Integrity of the observations behind this layer — see computeDataIntegritySummary. */
  integrity?: { totalObservations: number; mockCount: number; realRatio: number };
  /** True when the working set had no observations at all, as opposed to none that qualified. */
  hadNoObservations?: boolean;
  /** Mark budget. Defaults to DEFAULT_MAX_MARKS; set 0 or Infinity to disable. */
  maxMarks?: number;
}

/**
 * Corroborated findings as globe marks.
 *
 * Findings already carry a derived confidence and an independent-source count,
 * so nothing is invented here — this is a projection, not an analysis step.
 */
export function buildFindingsLayer(
  findings: CorroboratedFinding[],
  options: BuildLayerOptions = {},
  /**
   * Skip coincidence detection because the caller will redo it over a larger
   * mark set. buildIntelLayer appends conflict marks and then recomputes, so
   * without this the scan ran twice and the first result was discarded.
   */
  deferCoincidence = false,
): GlobeIntelLayer {
  const now = options.now ?? (() => new Date());
  const mockRefs = options.mockEntityRefs ?? new Set<string>();

  const marks: GlobeIntelMark[] = [];
  const reasons: Record<string, number> = {};
  const drop = (reason: string) => { reasons[reason] = (reasons[reason] ?? 0) + 1; };

  for (const f of findings) {
    // A finding about a jurisdiction or a registered city is not an
    // unplaceable location — it is not a location claim at all. Counting it
    // as "missing coordinates" would report a rendering failure where the
    // truth is that the globe is the wrong surface for this claim.
    if (f.attribute !== 'location') {
      drop('not a location claim');
      continue;
    }
    const value = f.value as { lat?: unknown; lon?: unknown };
    if (!isPlaceable(value?.lat, value?.lon)) {
      // Counted, not silently skipped. A dropped finding makes the globe look
      // emptier than the analysis was, and nothing distinguishes that from
      // "nothing is there".
      drop('missing or out-of-range coordinates');
      continue;
    }
    marks.push({
      id: `finding:${f.entityRef}:${f.attribute}`,
      kind: 'corroboration',
      lat: value.lat as number,
      lon: value.lon as number,
      label: f.entityRef,
      weight: f.confidence,
      sourceCount: f.sourceCount,
      observedFrom: f.observedFrom,
      observedTo: f.observedTo,
      isMock: mockRefs.has(f.entityRef),
    });
  }

  const unplaceableCount = findings.length - marks.length;
  const budgeted = deferCoincidence
    // buildIntelLayer applies the budget itself, after conflict marks are
    // added — trimming here first would discard corroborations to make room
    // for contradictions that have not been counted yet.
    ? { marks, truncated: null }
    : applyMarkBudget(marks, options.maxMarks ?? DEFAULT_MAX_MARKS);

  return {
    id: INTEL_FINDINGS_OVERLAY,
    version: GLOBE_INTEL_LAYER_VERSION,
    marks: budgeted.marks,
    truncated: budgeted.truncated,
    links: [],
    unplaceable: { count: unplaceableCount, reasons },
    coincidentMarkIds: deferCoincidence ? [] : findCoincident(budgeted.marks),
    provenance: {
      derivedFrom: 'correlation-engine',
      algorithmVersion: findings[0]?.algorithmVersion ?? 0,
      computedAt: now().toISOString(),
      blindSpots: options.blindSpots ?? [],
    },
    degraded: (options.blindSpots?.length ?? 0) > 0,
    // NULL, not zeros. A zeroed integrity summary renders as "0% real", which
    // is a different and worse claim than "we have not measured this". The
    // caller supplies it when it knows; absence stays absence.
    integrity: options.integrity ?? null,
    emptyReason: emptyReasonFor(marks.length, findings.length, options.hadNoObservations),
  };
}

function emptyReasonFor(
  markCount: number,
  resultCount: number,
  hadNoObservations: boolean | undefined,
): GlobeEmptyReason | null {
  if (markCount > 0) return null;
  if (hadNoObservations) return 'no-observations';
  // Results existed but none survived placement — a rendering failure, not an
  // analytical one, and the two must not look alike.
  if (resultCount > 0) return 'all-unplaceable';
  return 'nothing-qualified';
}

/**
 * Contradictions as globe marks.
 *
 * A contradiction is inherently a PAIR — the same entity in two places — so it
 * cannot be drawn as one pin. Each conflict yields two marks sharing an id
 * stem, which is what lets a renderer connect them without this module knowing
 * anything about how that connection is drawn.
 *
 * Conflicts do not carry coordinates today (LocationConflict records the two
 * source ids, the distance, and the strength, but not the positions), so the
 * caller supplies a resolver. Returning marks at invented positions would be
 * strictly worse than returning none.
 */
export function buildConflictMarks(
  conflicts: LocationConflict[],
  resolvePosition: (sourceId: string) => { lat: number; lon: number } | undefined,
): { marks: GlobeIntelMark[]; links: GlobeConflictLink[]; unplaceable: number } {
  const marks: GlobeIntelMark[] = [];
  const links: GlobeConflictLink[] = [];
  let unplaceable = 0;

  for (const c of conflicts) {
    const a = resolvePosition(c.sourceIdA);
    const b = resolvePosition(c.sourceIdB);
    // Both sides or neither. Drawing one half of a contradiction would render
    // it as an ordinary sighting — the opposite of what it means.
    if (!a || !b || !isPlaceable(a.lat, a.lon) || !isPlaceable(b.lat, b.lon)) {
      unplaceable++;
      continue;
    }

    const stem = `conflict:${c.entity}:${c.sourceIdA}:${c.sourceIdB}`;
    const idA = `${stem}:a`;
    const idB = `${stem}:b`;

    marks.push(
      { id: idA, kind: 'contradiction', lat: a.lat, lon: a.lon, label: c.entity, weight: c.strength, sourceCount: 1, observedFrom: c.observedFrom, observedTo: c.observedTo, isMock: false },
      { id: idB, kind: 'contradiction', lat: b.lat, lon: b.lon, label: c.entity, weight: c.strength, sourceCount: 1, observedFrom: c.observedFrom, observedTo: c.observedTo, isMock: false },
    );
    links.push({
      id: stem,
      markIdA: idA,
      markIdB: idB,
      strength: c.strength,
      distanceKm: c.distanceKm,
      crossesAntimeridian: crossesAntimeridian(a.lon, b.lon),
    });
  }

  return { marks, links, unplaceable };
}

/**
 * The full layer: what agrees, and what disagrees, in one pass.
 *
 * Contradictions are included alongside corroborations rather than living on a
 * separate optional layer, because a globe that shows only agreement is the
 * default every intelligence tool already ships — agreement demos well.
 * docs/build-order.md's "contradiction as the headline" starts here.
 */
export function buildIntelLayer(
  findings: CorroboratedFinding[],
  conflicts: LocationConflict[],
  resolvePosition: (sourceId: string) => { lat: number; lon: number } | undefined,
  options: BuildLayerOptions = {},
): GlobeIntelLayer {
  const base = buildFindingsLayer(findings, options, true);
  const conflict = buildConflictMarks(conflicts, resolvePosition);

  const budgeted = applyMarkBudget(
    [...base.marks, ...conflict.marks],
    options.maxMarks ?? DEFAULT_MAX_MARKS,
  );
  const marks = budgeted.marks;

  return {
    ...base,
    marks,
    truncated: budgeted.truncated,
    links: conflict.links,
    emptyReason: marks.length > 0
      ? null
      : base.emptyReason ?? (conflicts.length > 0 ? 'all-unplaceable' : 'nothing-qualified'),
    unplaceable: {
      count: base.unplaceable.count + conflict.unplaceable,
      reasons: conflict.unplaceable > 0
        ? { ...base.unplaceable.reasons, 'conflict side could not be positioned': conflict.unplaceable }
        : base.unplaceable.reasons,
    },
    coincidentMarkIds: findCoincident(marks),
  };
}

/**
 * Marks whose observation window overlaps a cursor window.
 *
 * Overlap, not containment: a corroboration spanning six hours is present
 * throughout those six hours, and a cursor landing anywhere inside it should
 * show it. Requiring containment would make longer-lived findings vanish
 * exactly when they are most established.
 */
export function marksWithinWindow(
  marks: GlobeIntelMark[],
  window: { start: Date; end: Date },
): GlobeIntelMark[] {
  const start = window.start.getTime();
  const end = window.end.getTime();
  return marks.filter((m) => {
    const from = new Date(m.observedFrom).getTime();
    const to = new Date(m.observedTo).getTime();
    // An unparseable timestamp is kept rather than silently dropped — losing a
    // real finding to a bad date is worse than showing it outside its window.
    if (Number.isNaN(from) || Number.isNaN(to)) return true;
    return from <= end && to >= start;
  });
}
