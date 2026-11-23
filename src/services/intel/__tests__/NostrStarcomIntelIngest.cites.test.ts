/**
 * A received report keeps what it rests on (decision D-MX: MX3, MX23): the
 * `["e", id, relay, "cites"]` tags its event carries, placed or not, read as
 * citations and nothing else.
 */
import { describe, it, expect } from 'vitest';
import { NostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

type Handler = (event: unknown, relay: string) => void;
const handle = (ingest: NostrStarcomIntelIngest, event: unknown) =>
  (ingest as unknown as { readEvent: Handler }).readEvent(event, 'wss://test');

const A = 'a'.repeat(64);
const RELAY = 'wss://relay.example';
const event = (tags: string[][]) => ({
  id: `evt-${Math.random().toString(36).slice(2, 9)}`,
  pubkey: 'b'.repeat(64), created_at: Math.floor(Date.now() / 1000), kind: 1, sig: '',
  tags: [['t', 'starcom_intel'], ...tags], content: 'What was there at the anchor.',
});

const collect = () => {
  const ingest = new NostrStarcomIntelIngest({ relays: [], searchRelays: [] });
  const seen: IntelReportUI[] = [];
  ingest.subscribe((r) => seen.push(r as IntelReportUI));
  return { ingest, seen };
};

describe('a received report resting on observations', () => {
  it('keeps its citations, when it is placed', () => {
    const { ingest, seen } = collect();
    handle(ingest, event([['geo', 'lat:38.6,lon:-90.2'], ['e', A, RELAY, 'cites']]));
    expect(seen[0].cites).toEqual([{ eventId: A, relay: RELAY }]);
  });

  it('keeps its citations, when it names no place', () => {
    const { ingest, seen } = collect();
    handle(ingest, event([['e', A, '', 'cites']]));
    expect(seen[0].cites).toEqual([{ eventId: A }]);
  });

  it('has none when it cites nothing, a reply included', () => {
    const { ingest, seen } = collect();
    handle(ingest, event([['geo', 'lat:38.6,lon:-90.2'], ['e', A, RELAY, 'reply']]));
    expect(seen[0].cites).toBeUndefined();
  });
});
