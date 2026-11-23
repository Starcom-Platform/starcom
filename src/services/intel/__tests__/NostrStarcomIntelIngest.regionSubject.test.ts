/**
 * A report that says WHERE IT IS ABOUT without saying where it is.
 *
 * The interchange spec states this gap as ours: an event carrying the hashtag
 * and no position was refused before parsing, so a thread with no spatial
 * component had no surface here at all. An event that names a jurisdiction has
 * stated its place at the resolution it has.
 *
 * The refusal must survive for events that state neither, which is what
 * droppedNoGeo counts and what keeps this from becoming "accept everything".
 */
import { describe, it, expect } from 'vitest';
import { NostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';

type Handler = (event: unknown, relay: string) => void;

/**
 * Reaches readEvent, not handleEvent: standing up relays would test sockets,
 * and handleEvent returns immediately unless the ingest is `active`, which
 * only start() sets and which needs a browser.
 */
const handle = (ingest: NostrStarcomIntelIngest, event: unknown) =>
  (ingest as unknown as { readEvent: Handler }).readEvent(event, 'wss://test');

const event = (over: Record<string, unknown> = {}) => ({
  id: `evt-${Math.random().toString(36).slice(2, 9)}`,
  pubkey: 'a'.repeat(64), created_at: Math.floor(Date.now() / 1000), kind: 1, sig: '',
  tags: [['t', 'starcom_intel']], content: 'A funding pattern with no single location.',
  ...over,
});

const collect = () => {
  const ingest = new NostrStarcomIntelIngest({ relays: [], searchRelays: [] });
  const seen: Array<{ id: string; jurisdictions?: string[]; latitude?: number }> = [];
  ingest.subscribe((r) => seen.push(r as never));
  return { ingest, seen };
};

describe('an event that names a jurisdiction and no coordinate', () => {
  it('becomes a report, instead of being refused for lacking a point', () => {
    const { ingest, seen } = collect();
    handle(ingest, event({ tags: [['t', 'starcom_intel'], ['jurisdiction', 'us-va']] }));
    expect(seen).toHaveLength(1);
    expect(seen[0].jurisdictions).toEqual(['us-va']);
  });

  it('carries no coordinate, rather than an invented one', () => {
    // A centroid would put the report somewhere nobody said anything happened,
    // which is the error D-F 17 removed from polygons.
    const { ingest, seen } = collect();
    handle(ingest, event({ tags: [['t', 'starcom_intel'], ['jurisdiction', 'fr']] }));
    expect(seen[0].latitude).toBeUndefined();
  });

  it('is marked as placed by jurisdiction, so a reader can tell', () => {
    const { ingest, seen } = collect();
    handle(ingest, event({ tags: [['t', 'starcom_intel'], ['jurisdiction', 'fr']] }));
    expect((seen[0] as { tags: string[] }).tags).toContain('geometry:jurisdiction');
  });

  it('counts toward accepted, not toward dropped', () => {
    const { ingest } = collect();
    handle(ingest, event({ tags: [['t', 'starcom_intel'], ['jurisdiction', 'us']] }));
    const metrics = ingest.getMetrics();
    expect(metrics.accepted).toBe(1);
    expect(metrics.droppedNoGeo).toBe(0);
  });

  it('is told apart from an event that states no place at all', () => {
    /*
     * This asserted the opposite until 2026-09-20: an event stating neither was
     * REFUSED, and that refusal was recorded here as what kept the ingest from
     * becoming "accept everything". It is kept now — see
     * NostrStarcomIntelIngest.placeless.test.ts for why the thing the refusal
     * guarded turned out to be guarded by something else.
     *
     * What still has to hold is that the two are distinguishable. A report
     * naming a territory and a report naming nowhere are different claims, and
     * a reader who cannot separate them cannot tell a publisher who works
     * nationally from one whose work has no place.
     */
    const { ingest, seen } = collect();
    handle(ingest, event({ tags: [['t', 'starcom_intel'], ['jurisdiction', 'us-va']] }));
    handle(ingest, event());

    expect(seen).toHaveLength(2);
    expect((seen[0] as { tags: string[] }).tags).toContain('geometry:jurisdiction');
    expect((seen[1] as { tags: string[] }).tags).toContain('geometry:none');
    expect(seen[1].jurisdictions).toBeUndefined();
  });
});
