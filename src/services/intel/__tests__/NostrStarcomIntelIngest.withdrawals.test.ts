/**
 * Withdrawals are asked for by their own tag (decision D-RP, RP7). Mecha Jono drops `starcom_intel` from the version
 * that withdraws a note (all 53 of its withdrawn notes on The Record, read 20 Nov 2026), so the intake's tag filter
 * never returned them, and a copy saved before the withdrawal stayed on the globe.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const subscriptions = vi.hoisted(() => [] as Array<{ relay: string; filter: Record<string, unknown> }>);
vi.mock('nostr-tools', () => ({
  SimplePool: class {
    subscribeMany(relays: string[], filter: Record<string, unknown>) {
      subscriptions.push({ relay: relays[0], filter });
      return { close() {} };
    }
    close() {}
  },
}));

import { NostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';

const RELAYS = ['wss://one.example', 'wss://two.example'];
const MECHA = 'a'.repeat(64);
type Handler = (event: unknown, relay: string) => void;

let ingest: NostrStarcomIntelIngest;
beforeEach(() => {
  subscriptions.length = 0;
  ingest = new NostrStarcomIntelIngest({ relays: RELAYS, enableRelaySearch: false });
});
afterEach(() => ingest.stop());

describe('withdrawals', () => {
  it('are asked of every read relay, by their own tag, over the same window as the reports', async () => {
    await ingest.start();
    const asked = subscriptions.filter((s) => (s.filter['#t'] as string[] | undefined)?.includes('retracted'));
    expect(asked).toEqual(RELAYS.map((relay) => ({ relay, filter: expect.objectContaining({ kinds: [30023], '#t': ['retracted'] }) })));
    const reports = subscriptions.find((s) => (s.filter['#t'] as string[]).includes('starcom_intel'))!;
    expect(asked[0].filter.since).toBe(reports.filter.since);
  });

  it('take off a note whose withdrawal no longer carries starcom_intel, as Mecha Jono publishes them', () => {
    const withdrawn: string[][] = [];
    ingest.onWithdrawn((ids) => withdrawn.push(ids));
    const read = (event: unknown) => (ingest as unknown as { readEvent: Handler }).readEvent(event, RELAYS[0]);
    const d = 'starcom-intel-ic-jurisdiction-f4ea7410d2';
    read({
      id: 'a1', pubkey: MECHA, kind: 30023, created_at: 1_793_000_000, sig: '',
      tags: [['d', d], ['t', 'starcom_intel'], ['jurisdiction', 'us-oh']], content: 'Four charities lost their exemption.',
    });
    read({
      id: 'a2', pubkey: MECHA, kind: 30023, created_at: 1_793_100_000, sig: '',
      tags: [['d', d], ['t', 'retracted'], ['t', 'intel_report'], ['t', 'duplicate']], content: 'Withdrawn: an intel report. Why: a duplicate.',
    });
    expect(withdrawn).toEqual([[`30023:${MECHA}:${d}`]]);
    const held: unknown[] = [];
    ingest.replayAccepted((r) => held.push(r));
    expect(held).toEqual([]);
  });
});
