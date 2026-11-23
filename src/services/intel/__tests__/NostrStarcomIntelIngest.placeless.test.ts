/**
 * Intel with no place at all.
 *
 * ─── WHY THIS OVERTURNS A DELIBERATE REFUSAL ───────────────────────────────
 *
 * An event carrying the hashtag and neither a coordinate nor a jurisdiction was
 * refused at the door, counted as droppedNoGeo, and never became a report. That
 * refusal was recorded as "what keeps this from becoming 'accept everything'".
 *
 * It is overturned because the thing it was protecting was already protected by
 * something else. The refusal guarded the GLOBE from marks it could not place —
 * but reportToMarker returns null without a coordinate, so a placeless report
 * cannot reach the globe whatever this does. What the refusal actually cost was
 * the report itself: a peer publishing desk work with no spatial component got
 * a counter and silence, and Starcom has list surfaces (IntelDashboard,
 * IntelAnalyzer, IntelWeb) that read the workspace and never ask for a
 * coordinate. The bound moves from "refuse at the door" to "accept, mark, cap,
 * and never draw" — the last of which is by construction rather than by rule.
 *
 * Measured reason: of the 85 asks on the peer board published 2026-09-20, 69
 * are desk work with no place. The refusal made the majority of a federating
 * node's output unreachable here.
 *
 * ─── AND WHY THE CAP IS TESTED HERE ────────────────────────────────────────
 *
 * The jurisdiction-only branch this extends retained every report it ever
 * accepted: it unshifted onto reportIds and set into retained without the
 * eviction the coordinate path runs, so a long session grew without bound.
 * Adding a second unbounded branch beside it would have doubled that, so the
 * cap is asserted for both.
 */
import { describe, it, expect } from 'vitest';
import { NostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';

type Handler = (event: unknown, relay: string) => void;

/** Reaches readEvent for the reason the regionSubject tests give: handleEvent
 * returns immediately unless the ingest is `active`, which needs a browser. */
const handle = (ingest: NostrStarcomIntelIngest, event: unknown) =>
  (ingest as unknown as { readEvent: Handler }).readEvent(event, 'wss://test');

const event = (over: Record<string, unknown> = {}) => ({
  id: `evt-${Math.random().toString(36).slice(2, 9)}`,
  pubkey: 'a'.repeat(64),
  created_at: Math.floor(Date.now() / 1000),
  kind: 1,
  sig: '',
  tags: [['t', 'starcom_intel']],
  content: 'A records request thread. Nothing about it happens anywhere in particular.',
  ...over,
});

const collect = (over: Record<string, unknown> = {}) => {
  const ingest = new NostrStarcomIntelIngest({ relays: [], searchRelays: [], ...over });
  const seen: Array<{ id: string; jurisdictions?: string[]; latitude?: number; tags: string[] }> = [];
  ingest.subscribe((r) => seen.push(r as never));
  return { ingest, seen };
};

describe('an event with neither a coordinate nor a jurisdiction', () => {
  it('becomes a report, instead of being refused for having no place', () => {
    const { ingest, seen } = collect();
    handle(ingest, event());
    expect(seen).toHaveLength(1);
  });

  it('carries no coordinate and claims no jurisdiction', () => {
    const { ingest, seen } = collect();
    handle(ingest, event());
    expect(seen[0].latitude).toBeUndefined();
    expect(seen[0].jurisdictions).toBeUndefined();
  });

  it('is marked as having no place, so a reader can tell it from an unplaced one', () => {
    // Distinct from `geometry:jurisdiction`, which means a place was stated at
    // territory resolution, and from `geometry:polygon-centroid`, which means a
    // point was derived. This one means the publisher named nowhere.
    const { ingest, seen } = collect();
    handle(ingest, event());
    expect(seen[0].tags).toContain('geometry:none');
    expect(seen[0].tags).not.toContain('geometry:jurisdiction');
  });

  it('counts toward accepted rather than toward dropped', () => {
    const { ingest } = collect();
    handle(ingest, event());
    const metrics = ingest.getMetrics();
    expect(metrics.accepted).toBe(1);
    expect(metrics.droppedNoGeo).toBe(0);
  });

  it('is counted separately, so "how much of this has no place" stays answerable', () => {
    const { ingest } = collect();
    handle(ingest, event());
    handle(ingest, event({ tags: [['t', 'starcom_intel'], ['jurisdiction', 'fr']] }));
    expect(ingest.getMetrics().acceptedPlaceless).toBe(1);
  });
});

describe('retention is bounded on every path that accepts', () => {
  it('evicts placeless reports past the cap', () => {
    const { ingest } = collect({ maxReports: 3 });
    for (let i = 0; i < 6; i++) handle(ingest, event());
    expect((ingest as unknown as { reportIds: string[] }).reportIds).toHaveLength(3);
    expect((ingest as unknown as { retained: Map<string, unknown> }).retained.size).toBe(3);
  });

  it('evicts jurisdiction-only reports past the cap, which it did not', () => {
    const { ingest } = collect({ maxReports: 3 });
    for (let i = 0; i < 6; i++) {
      handle(ingest, event({ tags: [['t', 'starcom_intel'], ['jurisdiction', 'us-va']] }));
    }
    expect((ingest as unknown as { reportIds: string[] }).reportIds).toHaveLength(3);
    expect((ingest as unknown as { retained: Map<string, unknown> }).retained.size).toBe(3);
  });
});
