import type { Source } from '../../../../types/intel/SourceObservation';
import { createObservation, ObservationValidationError } from '../createObservation';
import type { AdapterResult, SourceAdapter } from './types';

/**
 * UCDP Georeferenced Event Dataset → Observation.
 *
 * First adapter, and chosen deliberately as the first: UCDP is the most
 * clearly multi-agency of the five open sources already flowing through this
 * app (academic conflict researchers curating from news and NGO reporting),
 * which makes it the strongest test of whether the envelope generalises beyond
 * NetRunner's OSINT shape.
 *
 * It is also the source whose data the globe already renders and the
 * correlation engine has never seen — the disconnection docs/build-order.md
 * names as the "Global" gap.
 */

/** The subset of a UCDP GED record this adapter reads. */
export interface UcdpGedRecord {
  id?: number | string;
  relid?: string;
  year?: number;
  date_start?: string;
  date_end?: string;
  latitude?: number | string;
  longitude?: number | string;
  country?: string;
  region?: string;
  side_a?: string;
  side_b?: string;
  best?: number;
  deaths_civilians?: number;
  type_of_violence?: number;
  date_prec?: number;
}

/**
 * Time uncertainty, taken from UCDP's OWN stated range rather than from a code
 * table we would have to interpret.
 *
 * date_start..date_end is what the dataset actually asserts about when the
 * event occurred; date_prec is a summary of the same thing. Using the range
 * means the number means what the source says it means, and needs no updating
 * if UCDP revises its precision codes.
 */
function precisionFromRange(start: string | undefined, end: string | undefined): number | undefined {
  if (!start) return undefined;
  const from = Date.parse(start);
  const to = end ? Date.parse(end) : from;
  if (Number.isNaN(from) || Number.isNaN(to)) return undefined;
  // A day-level date is a day wide, not an instant — "2026-06-04" does not
  // mean midnight.
  return Math.max(to - from, 0) + 24 * 60 * 60 * 1000;
}

export const UCDP_SOURCE: Source = {
  id: 'ucdp-ged',
  kind: 'open-data',
  label: 'UCDP Georeferenced Event Dataset',
  // B — usually reliable. Peer-reviewed academic curation with a published
  // methodology, but compiled from news and NGO reporting rather than
  // observed directly, and known to under-count in low-coverage regions.
  // Graded here, by us, at registration; UCDP does not grade itself.
  trustBaseline: 'B',
  ingestMethod: 'poll',
  isMock: false,
};

function num(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export class UcdpAdapter implements SourceAdapter<UcdpGedRecord> {
  readonly source = UCDP_SOURCE;

  constructor(source: Source = UCDP_SOURCE) {
    this.source = source;
  }

  toObservations(raw: UcdpGedRecord[]): AdapterResult {
    const observations = [];
    const dropped: AdapterResult['dropped'] = [];

    for (const rec of raw ?? []) {
      // Upstream payloads are not trustworthy shapes. A null or non-object
      // entry inside an otherwise valid array is exactly the kind of thing an
      // API returns on a partial failure, and it must be counted as a drop
      // rather than crashing the whole ingest batch — one bad record should
      // not cost the other 999.
      if (!rec || typeof rec !== 'object') {
        dropped.push({ reason: 'record is not an object' });
        continue;
      }

      const nativeId = rec.id != null ? String(rec.id) : rec.relid;
      if (!nativeId) {
        dropped.push({ reason: 'no stable upstream identifier (id/relid missing)' });
        continue;
      }

      const lat = num(rec.latitude);
      const lon = num(rec.longitude);
      // A conflict event with no location cannot participate in the spatial
      // correlation this source is being ingested FOR. Dropped and counted
      // rather than given a placeholder coordinate.
      if (lat === undefined || lon === undefined) {
        dropped.push({ nativeId, reason: 'missing or non-numeric coordinates' });
        continue;
      }

      const timestamp = rec.date_start ?? rec.date_end ?? (rec.year ? `${rec.year}-01-01` : undefined);
      if (!timestamp) {
        dropped.push({ nativeId, reason: 'no date_start, date_end, or year' });
        continue;
      }

      // The subject is the named actor where there is one. UCDP's side_a is
      // the primary actor; falling back to country keeps the record usable
      // for place-level correlation without inventing an actor identity.
      const subject = rec.side_a || rec.country || rec.region;
      if (!subject) {
        dropped.push({ nativeId, reason: 'no side_a, country, or region to attribute the event to' });
        continue;
      }

      try {
        observations.push(createObservation(this.source, {
          nativeId,
          subjectEntityRef: subject,
          claim: {
            attribute: 'armed_conflict_event',
            value: {
              sideA: rec.side_a,
              sideB: rec.side_b,
              bestEstimateDeaths: rec.best,
              civilianDeaths: rec.deaths_civilians,
              typeOfViolence: rec.type_of_violence,
              country: rec.country,
            },
          },
          timestamp,
          // Curated from human reporting, not observed by UCDP directly.
          method: 'reported',
          geo: { lat, lon },
          label: rec.side_b
            ? `${rec.side_a ?? 'Unknown'} vs ${rec.side_b}${rec.country ? ` — ${rec.country}` : ''}`
            : `Armed conflict event${rec.country ? ` — ${rec.country}` : ''}`,
          tags: ['conflict', 'ucdp', rec.country, rec.region].filter(Boolean) as string[],
          // side_a is an armed actor — very often a state, otherwise an
          // organised group. Either way it acts in many places at once, so the
          // "can't be in two places" rule must not apply to it. Falling back to
          // country or region is also non-exclusive.
          subjectKind: 'organization',
          timePrecisionMs: precisionFromRange(rec.date_start, rec.date_end),
        }));
      } catch (err) {
        dropped.push({
          nativeId,
          reason: err instanceof ObservationValidationError ? err.message : 'unexpected mapping failure',
        });
      }
    }

    return { observations, dropped };
  }
}

export const ucdpAdapter = new UcdpAdapter();
