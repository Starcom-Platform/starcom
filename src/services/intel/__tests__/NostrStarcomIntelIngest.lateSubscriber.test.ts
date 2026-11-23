/**
 * A consumer that arrives after a report did can still ask for it.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * Boot owns the ingest now (decision D-F, step 4.2): startIntelIngestAtBoot asks
 * the relays while the app loads, and the globe subscribes later, when its effect
 * runs. Everything accepted in that gap was delivered to an empty listener set
 * and then lost for good — `listeners.forEach` fires once, at accept time, and
 * `seenIds` skips the event on any later delivery, forgetting it only when the
 * cap evicts it.
 *
 * So the ingest could report SEEN 10 | ACCEPT 7 while the globe drew nothing, and
 * that is exactly what one first-visit probe showed under software rendering: no
 * reports in 90 s with the marquee reporting seven accepted.
 *
 * It did not reproduce — a second run drew all seven at 16.2 s — because the
 * relays are slower than the globe's mount. That is luck, not design. The gap is
 * ~0.6 s on hardware and ~11 s under a software rasterizer, and a fast relay, a
 * warm connection or a returning visitor closes it from the other side.
 *
 * Owning the fetch without owning the buffer is owning a fetch whose results
 * nobody receives.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// start() opens a pool on every configured relay; this one opens nothing.
vi.mock('nostr-tools', () => ({
  SimplePool: class {
    subscribeMany() { return { close() {} }; }
    close() {}
  },
}));

import { nostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';

const pointEvent = (id: string) => ({
  id,
  pubkey: 'c'.repeat(64),
  created_at: Math.floor(Date.parse('2026-06-01T00:00:00.000Z') / 1000),
  kind: 1,
  tags: [['t', 'starcom_intel']],
  content: `Sighting ---GEOJSON---${JSON.stringify({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [10, 20] }, properties: {} }],
  })}`,
  sig: 'sig',
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const internals = nostrStarcomIntelIngest as any;

afterEach(() => {
  nostrStarcomIntelIngest.stop();
  internals.active = false;
  // stop() deliberately does NOT clear the buffer — resetState() runs only from
  // start(), so a globe that unmounts and remounts still receives what arrived
  // meanwhile, which is the point of boot owning the fetch. These cases share one
  // module-level singleton, so the teardown has to clear it or an earlier case's
  // reports replay into a later one's listener.
  internals.retained.clear();
  internals.reportIds = [];
  internals.seenIds.clear();
});

describe('NostrStarcomIntelIngest: a late subscriber is not a lost report', () => {
  it('hands an already-accepted report to a listener that subscribes afterwards', () => {
    internals.active = true;
    internals.handleEvent(pointEvent('late-1'), 'wss://test-relay');
    expect(nostrStarcomIntelIngest.getMetrics().accepted).toBeGreaterThan(0);

    const heard: string[] = [];
    nostrStarcomIntelIngest.replayAccepted((report) => heard.push(report.id));

    expect(heard.length).toBeGreaterThan(0);
  });

  /*
   * The boot-to-globe gap holds more than one event under software rendering,
   * where it measured about eleven seconds.
   */
  it('hands over every report accepted before anyone was listening', () => {
    internals.active = true;
    internals.handleEvent(pointEvent('late-2'), 'wss://test-relay');
    internals.handleEvent(pointEvent('late-3'), 'wss://test-relay');

    const heard: string[] = [];
    nostrStarcomIntelIngest.replayAccepted((report) => heard.push(report.id));

    expect(heard.length).toBeGreaterThanOrEqual(2);
  });

  /*
   * Replay must not double-deliver to someone who was already listening, or the
   * globe would draw the same report twice for the sake of a late arrival.
   */
  it('does not replay to a listener that already received it live', () => {
    internals.active = true;

    const heard: string[] = [];
    const off = nostrStarcomIntelIngest.subscribe((report) => heard.push(report.id));
    try {
      internals.handleEvent(pointEvent('live-1'), 'wss://test-relay');
      const afterLive = heard.length;

      const second: string[] = [];
      nostrStarcomIntelIngest.replayAccepted((report) => second.push(report.id));

      expect(heard.length).toBe(afterLive);
    } finally {
      off();
    }
  });

  /*
   * Nothing accepted yet means nothing to hand over — a fresh listener on a quiet
   * ingest must not be called at all.
   */
  it('says nothing to a subscriber when nothing has been accepted', () => {
    internals.active = true;

    const heard = vi.fn();
    nostrStarcomIntelIngest.replayAccepted(heard);

    expect(heard).not.toHaveBeenCalled();
  });

  /*
   * Added because a mutation that deleted the eviction SURVIVED: nothing asserted
   * that the buffer is bounded. Without it, retained keeps every report ever
   * accepted while reportIds stays capped — unbounded growth in a singleton that
   * now lives for the whole session, on every screen.
   */
  it('does not keep reports the cap has evicted', () => {
    internals.active = true;
    const originalCap = internals.config.maxReports;
    internals.config.maxReports = 2;
    try {
      internals.handleEvent(pointEvent('evict-1'), 'wss://test-relay');
      internals.handleEvent(pointEvent('evict-2'), 'wss://test-relay');
      internals.handleEvent(pointEvent('evict-3'), 'wss://test-relay');

      const heard: string[] = [];
      nostrStarcomIntelIngest.replayAccepted((report) => heard.push(report.id));

      expect(heard).toHaveLength(2);
      expect(heard).not.toContain('evict-1');
      expect(internals.retained.size).toBe(2);
    } finally {
      internals.config.maxReports = originalCap;
    }
  });

  /*
   * Also added after a survivor: subscribe() documents "oldest first", and nothing
   * checked it. A consumer ordering by arrival would have drawn them backwards
   * with no test objecting.
   */
  it('hands them over oldest first, as it says it does', () => {
    internals.active = true;
    internals.handleEvent(pointEvent('order-1'), 'wss://test-relay');
    internals.handleEvent(pointEvent('order-2'), 'wss://test-relay');

    const heard: string[] = [];
    nostrStarcomIntelIngest.replayAccepted((report) => heard.push(report.id));

    expect(heard).toEqual(['order-1', 'order-2']);
  });
});
