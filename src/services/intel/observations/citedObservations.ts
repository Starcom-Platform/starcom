/**
 * The observations a report or package cites, found (decision D-MX, MX23):
 * among those already read here first, then by id on the relays this node
 * reads, and never on a relay a citation names. A row found is kept for the
 * session; one not found is asked for again on the next look, since a relay
 * may have it by then.
 */
import { observationIngestService } from './ObservationIngestService';
import { fieldObservations, type FieldObservation } from './fieldObservations';
import type { Observation } from '../../../types/intel/SourceObservation';

const found = new Map<string, FieldObservation>();

export interface CitedLookup {
  /** What this node has already read. */
  known: () => readonly Observation[];
  /** Asks the relays this node reads for these ids. */
  read: (ids: readonly string[]) => Promise<Observation[]>;
}

const DEFAULT_LOOKUP: CitedLookup = {
  known: () => observationIngestService.getObservations(),
  // Loaded when something is asked for: a screen showing a report need not carry every source's reader.
  read: async (ids) => (await import('./registerSources')).readCitedObservations(ids),
};

/**
 * Each id's observation, or null when no relay this node reads holds it.
 * Rejects when none of them could be asked.
 */
export async function lookUpCited(ids: readonly string[], lookup: CitedLookup = DEFAULT_LOOKUP): Promise<Map<string, FieldObservation | null>> {
  const wanted = new Set(ids);
  for (const row of fieldObservations(lookup.known())) if (wanted.has(row.eventId)) found.set(row.eventId, row);
  const asking = ids.filter((id) => !found.has(id));
  if (asking.length > 0) {
    for (const row of fieldObservations(await lookup.read(asking))) found.set(row.eventId, row);
  }
  return new Map(ids.map((id) => [id, found.get(id) ?? null]));
}
