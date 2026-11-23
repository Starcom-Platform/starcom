/**
 * NavCom's field observations, read as the events they are (decision D-MX,
 * MX21), and what a report written on one starts from (MX19).
 *
 * The adapter makes one observation per vocabulary member, because
 * corroboration weighs each claim on its own. A person reads the event: what
 * was seen, where, when, how, and who says so. So the claims are gathered back
 * here by the event they came from.
 *
 * A report written on one rests on it, and is to cite it when published
 * (`["e", id, relay, "cites"]`): the citation is the credit. So the draft's
 * words do not name the operator. Their callsign and key stay on the
 * observation, where they put them. The draft dates it to the day; its author
 * can say more, or less.
 */
import type { Observation, FieldMethod } from '../../../types/intel/SourceObservation';
import type { ReportCitation } from '../../../types/intel/IntelReportUI';
import type { EventTimeFields } from '../../../utils/eventTime';
import { formatUtcDate } from '../../../utils/utcTime';
import { snapPrecisionUp } from '../placePrecision';
import { NAVCOM_SOURCE } from './adapters/navcomAdapter';
import { relayOf as feedRelayOf } from './navcomFeed';

export interface FieldObservation {
  /** The kind 1911 event: what a report cites. */
  eventId: string;
  /** A relay it was read from, as the citation's hint. */
  relay?: string;
  /** The operator's key. */
  operator: string;
  /** The operator as a person reads them: the callsign they gave, then their key, short. */
  operatorLabel: string;
  /** NavCom's id for the place it is about. */
  anchor: string;
  /** What was seen: the vocabulary members, as NavCom wrote them. */
  seen: string[];
  method: FieldMethod;
  /** When it was seen, ISO 8601 in UTC. */
  observedAt: string;
  /** The centre of its cell. */
  lat: number;
  lon: number;
  /** The radius that holds the cell, in metres. */
  precisionM: number;
}

/** The NavCom events among these observations, one row each, newest seen first. */
export function fieldObservations(
  observations: readonly Observation[],
  relayOf: (eventId: string) => string | undefined = feedRelayOf,
): FieldObservation[] {
  const rows = new Map<string, FieldObservation>();
  for (const obs of observations) {
    const eventId = obs.sourceRecordId;
    if (obs.sourceId !== NAVCOM_SOURCE.id || !eventId) continue;
    if (!obs.upstreamSourceId || !obs.geo || obs.geoPrecisionM === undefined) continue;
    // Each claim of one event gives the same row, so the last one written stands for all.
    rows.set(eventId, {
      eventId,
      relay: relayOf(eventId),
      operator: obs.upstreamSourceId,
      operatorLabel: obs.upstreamSourceLabel ?? obs.upstreamSourceId,
      anchor: obs.subjectEntityRef,
      // Every claim of an event carries all its members, in the order written.
      seen: [...obs.tags],
      method: obs.method as FieldMethod,
      observedAt: obs.timestamp,
      lat: obs.geo.lat,
      lon: obs.geo.lon,
      precisionM: obs.geoPrecisionM,
    });
  }
  return [...rows.values()].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
}

/** A report form's fields as an observation starts them, and what the report rests on. */
export interface ObservationReportDraft {
  title: string;
  content: string;
  latitude: string;
  longitude: string;
  precisionM: string;
  event: EventTimeFields;
  cites: ReportCitation[];
}

const HOW: Record<FieldMethod, string> = {
  saw: 'seen',
  told: 'told to the observer',
  inferred: 'inferred',
};

/** How it was known, in words: "seen", "told to the observer", "inferred". */
export const howObserved = (method: FieldMethod): string => HOW[method];

/** What was seen, in words: `alpha_one` and `beta_one` as "alpha one, beta one". */
export const seenWords = (seen: readonly string[]): string => seen.map((member) => member.replace(/_/g, ' ')).join(', ');

/** What a report written on this observation starts from. */
export function reportDraftFrom(row: FieldObservation): ObservationReportDraft {
  const seen = seenWords(row.seen);
  const day = formatUtcDate(Date.parse(row.observedAt), { year: true });
  return {
    title: seen.charAt(0).toUpperCase() + seen.slice(1),
    content: `On a field observation: ${seen}, ${howObserved(row.method)} on ${day} (UTC).\n\n`,
    latitude: row.lat.toFixed(4),
    longitude: row.lon.toFixed(4),
    // Never finer than the cell: rounding down would place it more exactly than anyone saw it.
    precisionM: String(snapPrecisionUp(row.precisionM)),
    event: { startDate: row.observedAt.slice(0, 10), startTime: '', endDate: '', endTime: '', precision: 'day' },
    cites: [{ eventId: row.eventId, ...(row.relay ? { relay: row.relay } : {}) }],
  };
}
