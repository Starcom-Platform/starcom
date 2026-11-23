/**
 * The signed intel broadcast carries when the reported event happened, as
 * optional keys (decision D-E; docs/interchange/2026-09-14-nostr-intel-event-time.md).
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { NostrIntelBroadcastService } from '../NostrIntelBroadcastService';
import type { IntelBroadcastPayload } from '../NostrIntelBroadcastService';

const service = new NostrIntelBroadcastService(['wss://test-relay']);
const base: IntelBroadcastPayload = { title: 'OSINT Report: example.com', ipfsCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi' };
const contentOf = (payload: IntelBroadcastPayload) =>
  JSON.parse(service.buildUnsignedEvent(payload).content as string) as Record<string, unknown>;

describe('NostrIntelBroadcastService: event time in the signed content', () => {
  it('carries the event time and how closely it is known when the report has one', () => {
    const content = contentOf({
      ...base,
      startDate: '2026-07-27T21:24:04.800Z',
      endDate: '2026-07-27T21:24:09.000Z',
      timePrecisionMs: 1000,
    });
    expect(content.startDate).toBe('2026-07-27T21:24:04.800Z');
    expect(content.endDate).toBe('2026-07-27T21:24:09.000Z');
    expect(content.timePrecisionMs).toBe(1000);
  });

  it('leaves the keys out when there is none, so an absent key means not stated', () => {
    const content = contentOf(base);
    expect(Object.keys(content)).not.toContain('startDate');
    expect(Object.keys(content)).not.toContain('endDate');
    expect(Object.keys(content)).not.toContain('timePrecisionMs');
  });

  it('keeps created_at as the time the note is signed, not the event time', () => {
    const before = Math.floor(Date.now() / 1000);
    const event = service.buildUnsignedEvent({ ...base, startDate: '2026-07-27T21:24:04.800Z' });
    expect(event.created_at).toBeGreaterThanOrEqual(before);
  });
});
