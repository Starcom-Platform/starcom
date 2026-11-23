/**
 * Coverage, measured several ways because no single way is honest on its own.
 *
 * ─── WHY FIVE AXES AND NOT ONE NUMBER ──────────────────────────────────────
 *
 * "Coverage" needs a denominator — no intel about WHAT? — and the candidates
 * answer different questions and fail differently:
 *
 *   sources             did the places we ask answer?
 *   questions           does the work we have opened rest on anything?
 *   grid                how is what we have spread over the planet?
 *   stated-jurisdiction what do publishers SAY their reports are about?
 *   derived-territory   which territories contain a report, by its coordinate?
 *
 * Picking one and calling it "coverage" would make a choice look like a fact.
 * Reporting all of them, each with the thing it cannot see written beside it,
 * is the same discipline the globe's disclosures already follow.
 *
 * ─── AND WHY SOME HAVE NO DENOMINATOR ──────────────────────────────────────
 *
 * Only some of these can say "of N things that should have intel, M do".
 * `sources` can: the relay set is known. `questions` can: the open records are
 * known. `derived-territory` can, once a coordinate can be resolved to a
 * territory. `grid` CANNOT — the denominator would be every cell on Earth,
 * most of it ocean, and a 0.3% figure would say nothing except that the planet
 * is large. `stated-jurisdiction` cannot either: we only learn a jurisdiction
 * exists when somebody names it, so the unnamed ones are invisible by
 * construction.
 *
 * Those two therefore report SPREAD — how many distinct buckets hold something
 * — and `expected: null` says outright that no percentage is available. An
 * axis that invented one would be the defect this project keeps removing.
 */
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import type { IntelCaseUI } from '../../../types/intel/IntelCaseUI';
import type { MissionUI } from '../../../types/intel/MissionUI';
import { computePipelineMetrics } from '../pipelineMetrics';
import type { TerritoryIndex } from './territoryIndex';

export type CoverageAxisId =
  | 'sources'
  | 'questions'
  | 'grid'
  | 'stated-jurisdiction'
  | 'derived-territory';

export interface CoverageResult {
  /**
   * How many things SHOULD have something, or null where no honest
   * denominator exists. Null is a result, not a gap in the measurement.
   */
  expected: number | null;
  /** How many of them do — or, where expected is null, how many buckets hold anything. */
  covered: number;
  /** Items this axis counted. */
  items: number;
  /** Items it could not place at all. Never folded into `covered`. */
  unplaced: number;
}

export interface CoverageAxis {
  id: CoverageAxisId;
  /** What this axis counts. */
  measures: string;
  /** What it cannot see. Stated, because an unstated blind spot reads as none. */
  blindSpot: string;
  /** Null when the axis cannot be computed here yet; `why` then says so. */
  result: CoverageResult | null;
  why?: string;
}

export interface CoverageInput {
  reports: readonly IntelReportUI[];
  cases: readonly IntelCaseUI[];
  missions: readonly MissionUI[];
  /** The relays configured, and whether each has answered this session. */
  relays: ReadonlyArray<{ url: string; connected: boolean }>;
  /**
   * Territory lookup, when it has loaded. Absent is a real state — the polygons
   * are a megabyte fetched at runtime — and the axis then says it is not
   * measured rather than reporting zero territories.
   */
  territories?: TerritoryIndex;
}

/** One degree. Coarse on purpose: finer cells make an empty planet look emptier. */
const GRID_DEGREES = 1;

const cellFor = (lat: number, lon: number): string =>
  `${Math.floor(lat / GRID_DEGREES)}:${Math.floor(lon / GRID_DEGREES)}`;

const placed = (report: IntelReportUI): boolean =>
  typeof report.latitude === 'number' && Number.isFinite(report.latitude)
  && typeof report.longitude === 'number' && Number.isFinite(report.longitude);

export function measureCoverage(input: CoverageInput): CoverageAxis[] {
  const { reports, cases, missions, relays, territories } = input;

  // ─── sources ──────────────────────────────────────────────────────────────
  const answered = relays.filter((r) => r.connected).length;

  // ─── questions ────────────────────────────────────────────────────────────
  const metrics = computePipelineMetrics([...reports], [...cases], [...missions]);
  const missionsWithEvidence = metrics.missionCount - metrics.missionsWithoutEvidence;

  // ─── stated jurisdiction ──────────────────────────────────────────────────
  const named = new Set<string>();
  let withoutJurisdiction = 0;
  for (const report of reports) {
    const stated = report.jurisdictions ?? [];
    if (stated.length === 0) { withoutJurisdiction += 1; continue; }
    for (const j of stated) named.add(j);
  }

  // ─── grid ─────────────────────────────────────────────────────────────────
  const cells = new Set<string>();
  let unplacedReports = 0;
  for (const report of reports) {
    if (!placed(report)) { unplacedReports += 1; continue; }
    cells.add(cellFor(report.latitude as number, report.longitude as number));
  }

  // ─── derived territory ────────────────────────────────────────────────────
  const inTerritory = new Set<string>();
  let outsideEveryTerritory = 0;
  if (territories) {
    for (const report of reports) {
      if (!placed(report)) { outsideEveryTerritory += 1; continue; }
      const name = territories.at(report.latitude as number, report.longitude as number);
      // Ocean is not a gap in coverage; it is a place with no territory.
      if (name === null) { outsideEveryTerritory += 1; continue; }
      inTerritory.add(name);
    }
  }

  return [
    {
      id: 'sources',
      // "Connected", not "answered": nothing counts which relays returned anything.
      measures: 'Relays configured, and how many are connected now.',
      blindSpot: 'A connected relay is not a relay that has anything to say.',
      result: { expected: relays.length, covered: answered, items: relays.length, unplaced: 0 },
    },
    {
      id: 'questions',
      measures: 'Missions, and how many rest on at least one linked record.',
      blindSpot: 'Resting on evidence is not the same as resting on GOOD evidence.',
      result: {
        expected: metrics.missionCount,
        covered: missionsWithEvidence,
        items: metrics.missionCount,
        unplaced: 0,
      },
    },
    {
      id: 'grid',
      measures: `Distinct ${GRID_DEGREES}° cells holding at least one report.`,
      blindSpot:
        'No denominator: the whole planet is mostly ocean, so a percentage here '
        + 'would measure the Earth rather than the corpus.',
      result: {
        expected: null,
        covered: cells.size,
        items: reports.length,
        unplaced: unplacedReports,
      },
    },
    {
      id: 'stated-jurisdiction',
      measures: 'Jurisdictions publishers name for their own reports.',
      blindSpot:
        'A jurisdiction nobody names is invisible here by construction, so this '
        + 'can never report what is missing — only what was claimed.',
      result: {
        // No denominator, and this one is structural rather than a gap to fill
        // later: a jurisdiction nobody names cannot be counted as missing,
        // because nothing here knows it exists.
        expected: null,
        covered: named.size,
        items: reports.length,
        unplaced: withoutJurisdiction,
      },
    },
    {
      id: 'derived-territory',
      measures: 'Territories containing at least one report, by its coordinate.',
      blindSpot:
        'It infers a jurisdiction the publisher never stated, which is a claim '
        + 'about their report rather than a reading of it.',
      result: territories
        ? {
          // The one real geographic denominator: the territory set is known
          // and finite, so this is a statement about the world.
          expected: territories.size,
          covered: inTerritory.size,
          items: reports.length,
          unplaced: outsideEveryTerritory,
        }
        : null,
      ...(territories ? {} : { why: 'The territory polygons have not loaded yet.' }),
    },
  ];
}
