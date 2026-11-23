/**
 * An event with no readable created_at is malformed, not "now" (D-F step 15).
 *
 * NIP-01 requires created_at, and the event's signature covers it, so a missing
 * one means the event is not what it claims to be. The ingest substituted the
 * current time, which would have placed it as brand new.
 */
import { describe, it, expect } from 'vitest';
import { NostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';

/** handleEvent returns early unless the service is active; the features test does the same. */
const feed = (ingest: NostrStarcomIntelIngest, raw: unknown) => {
  const svc = ingest as unknown as { active: boolean; handleEvent: (e: unknown, relay: string) => void };
  svc.active = true;
  svc.handleEvent(raw, 'wss://test');
};

describe('NostrStarcomIntelIngest — created_at', () => {
  const event = (created_at: unknown) => ({
    id: 'e'.repeat(64), pubkey: 'p'.repeat(64), kind: 1, sig: 's', created_at,
    tags: [['t', 'starcom_intel'], ['geo', 'lat:10,lon:20']], content: 'A report with a place',
  });

  it('refuses an event whose created_at is missing or not a number', () => {
    for (const bad of [undefined, null, 'yesterday', Number.NaN]) {
      const ingest = new NostrStarcomIntelIngest();
      const emitted: unknown[] = [];
      ingest.subscribe((r) => emitted.push(r));
      feed(ingest, event(bad));

      expect(emitted).toHaveLength(0);
      expect(ingest.getMetrics().droppedInvalid).toBe(1);
    }
  });

  it('keeps an event with a real created_at, at that time', () => {
    const ingest = new NostrStarcomIntelIngest();
    const emitted: { createdAt: Date }[] = [];
    ingest.subscribe((r) => emitted.push(r as { createdAt: Date }));
    feed(ingest, event(1_789_000_000));

    expect(emitted[0].createdAt.getTime()).toBe(1_789_000_000_000);
  });
});
