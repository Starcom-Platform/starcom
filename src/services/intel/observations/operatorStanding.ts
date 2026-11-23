/**
 * An operator's standing as NavCom derives it (decision D-MX: MX8, MX25,
 * MX26), from public events, as far as this device can see them. NavCom keeps
 * no ledger, so there is no canonical standing: two devices may count
 * differently, and both are right about what they saw.
 *
 * Intel is two counts, never a ratio (NavCom's economy design, section 3): the
 * observations an operator submitted, and how many of them have been refined,
 * taken up downstream: cited in a report or package that a key other than
 * theirs signed (MX26). The reader does any division.
 */
import type { Event as NostrEvent, Filter, SimplePool } from 'nostr-tools';
import { NAVCOM_OBSERVATION_KIND } from './adapters/navcomAdapter';
import { citationsFromTags } from '../citations';

/** What a report or package is published as: what refines an observation. */
const REFINING_KINDS = [1, 30023, 30079];
/** At most this many of an operator's observations are read; observations are made by hand. */
const SUBMITTED_LIMIT = 500;
/** Ids asked about at once, so a filter stays a size relays accept. */
const IDS_PER_ASK = 100;
const WAIT_MS = 8000;

export interface IntelStanding {
  submitted: number;
  refined: number;
}

export interface StandingSources {
  relays: readonly string[];
  pool: Pick<SimplePool, 'querySync'>;
  /** The operator's observations as Starcom reads them, checked by signature and contract: their ids. */
  observationIds: (events: NostrEvent[]) => string[];
  /** Whether a citing event's signature holds. */
  verify: (event: NostrEvent) => boolean;
}

/** What every relay holds for the filter, each event once. Rejects when none answers. */
async function ask(sources: StandingSources, filter: Filter): Promise<NostrEvent[]> {
  const answers = await Promise.allSettled(sources.relays.map((relay) => sources.pool.querySync([relay], filter, { maxWait: WAIT_MS })));
  const reached = answers.filter((a): a is PromiseFulfilledResult<NostrEvent[]> => a.status === 'fulfilled');
  if (reached.length === 0 && sources.relays.length > 0) throw new Error('No relay answered');
  const byId = new Map<string, NostrEvent>();
  for (const { value } of reached) for (const event of value) if (typeof event?.id === 'string') byId.set(event.id, event);
  return [...byId.values()];
}

/** An operator's Intel standing: what they submitted, and how much of it another key's work has cited. */
export async function readIntelStanding(operator: string, sources: StandingSources): Promise<IntelStanding> {
  const ids = sources.observationIds(await ask(sources, { kinds: [NAVCOM_OBSERVATION_KIND], authors: [operator], limit: SUBMITTED_LIMIT }));
  const refined = new Set<string>();
  for (let i = 0; i < ids.length; i += IDS_PER_ASK) {
    const chunk = new Set(ids.slice(i, i + IDS_PER_ASK));
    for (const event of await ask(sources, { kinds: REFINING_KINDS, '#e': [...chunk] })) {
      // Citing your own is not being taken up downstream (MX26); a forged citation refines nothing.
      if (event.pubkey === operator || !sources.verify(event)) continue;
      for (const cite of citationsFromTags(event.tags)) if (chunk.has(cite.eventId)) refined.add(cite.eventId);
    }
  }
  return { submitted: ids.length, refined: refined.size };
}
