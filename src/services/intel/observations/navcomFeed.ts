/**
 * NavCom's raw intel, read (interchange rev 11; decision D-MX: MX3): kind 1911
 * under `navcom-intel/0.1.0`, from every relay this node reads. Operators
 * publish to NavCom's relays, which are among them (NavCom's section 5.0).
 *
 * The adapter (navcomAdapter.ts) does the validating and verifies each
 * signature itself: this only gathers events, each once, keeping the first
 * relay it arrived on, which a citation names (`["e", id, relay, "cites"]`).
 *
 * A relay that cannot be reached is not an empty one: when no relay answers at
 * all, the fetch rejects, so the source reports as failing rather than as
 * holding nothing.
 */
import type { Filter, SimplePool, Event as NostrEvent } from 'nostr-tools';
import { NAVCOM_OBSERVATION_KIND, type NavcomRawEvent } from './adapters/navcomAdapter';

/** How far back to read: an observation NavCom has not seen cited is dropped from its stores at 90 days. */
const NAVCOM_FEED_WINDOW_DAYS = 90;
/** At most this many per relay; observations are made by hand, at a person's pace. */
const NAVCOM_FEED_LIMIT = 500;
/** How long a relay may take to send what it holds. */
const NAVCOM_FEED_WAIT_MS = 8000;

/** Where each event was first seen, for a citation's relay hint. */
const arrivedOn = new Map<string, string>();

/** The relay an observation was first read from, if this node read it. */
export function relayOf(eventId: string): string | undefined {
  return arrivedOn.get(eventId);
}

export interface NavcomFeedOptions {
  relays: readonly string[];
  pool: Pick<SimplePool, 'querySync'>;
  now?: () => number;
}

/** Kind 1911 from each relay, each event once, the first relay it came from remembered. */
export async function fetchNavcomEvents({ relays, pool, now = () => Date.now() }: NavcomFeedOptions): Promise<NavcomRawEvent[]> {
  const since = Math.floor(now() / 1000) - NAVCOM_FEED_WINDOW_DAYS * 86_400;
  return gather(relays, { kinds: [NAVCOM_OBSERVATION_KIND], since, limit: NAVCOM_FEED_LIMIT }, pool);
}

/**
 * Kind 1911 by id (D-MX, MX23): the observations a report or package cites,
 * asked of these relays and no others, whatever relay a citation names.
 */
export async function fetchNavcomEventsById({ ids, relays, pool }: { ids: readonly string[] } & Omit<NavcomFeedOptions, 'now'>): Promise<NavcomRawEvent[]> {
  if (ids.length === 0) return [];
  return gather(relays, { ids: [...ids], kinds: [NAVCOM_OBSERVATION_KIND] }, pool);
}

/** What each relay sends for the filter, each event once, its first relay remembered. Rejects when none answers. */
async function gather(relays: readonly string[], filter: Filter, pool: NavcomFeedOptions['pool']): Promise<NavcomRawEvent[]> {
  const answers = await Promise.allSettled(relays.map(async (relay) => ({
    relay,
    events: await pool.querySync([relay], filter, { maxWait: NAVCOM_FEED_WAIT_MS }) as NostrEvent[],
  })));
  const reached = answers.filter((a): a is PromiseFulfilledResult<{ relay: string; events: NostrEvent[] }> => a.status === 'fulfilled');
  if (reached.length === 0 && relays.length > 0) {
    throw new Error(`No relay answered for kind ${NAVCOM_OBSERVATION_KIND}`);
  }
  const seen = new Map<string, NavcomRawEvent>();
  for (const { relay, events } of reached.map((a) => a.value)) {
    for (const event of events) {
      if (typeof event?.id !== 'string') continue;
      // Keyed by id, so an event two relays sent is kept once.
      seen.set(event.id, event);
      // The first relay it ever came from stays its hint, across reads.
      if (!arrivedOn.has(event.id)) arrivedOn.set(event.id, relay);
    }
  }
  return [...seen.values()];
}
