import { describe, it, expect, beforeEach } from 'vitest';
import { globeIntelLayerStore } from '../globeIntelLayerStore';
import { buildIntelLayer, DEFAULT_MAX_MARKS } from '../globeIntelLayer';

/**
 * I.A.4 — "Memory: layer teardown on unmount verified, no retained buffers."
 *
 * The store deliberately RETAINS the last layer after the publisher unmounts —
 * that is the whole bridge design, since the analyzer and the globe are
 * mutually exclusive applications and the layer has to survive the handover.
 * So "no retained buffers" cannot mean "retains nothing". What it must mean:
 * retention is BOUNDED and does not accumulate.
 */
const listeners = () => (globeIntelLayerStore as unknown as { listeners: Set<unknown> }).listeners.size;

const finding = (i: number) => ({
  entityRef: `E${i}`, attribute: 'location', value: { lat: (i % 170) - 85, lon: (i % 350) - 175 },
  confidence: 0.5, sourceCount: 2, algorithmVersion: 1,
  observedFrom: '2026-01-01T00:00:00Z', observedTo: '2026-01-02T00:00:00Z',
});

beforeEach(() => globeIntelLayerStore.reset());

describe('globe intel layer teardown', () => {
  it('releases the listener on unsubscribe', () => {
    const off = globeIntelLayerStore.subscribe(() => {});
    expect(listeners()).toBe(1);
    off();
    expect(listeners()).toBe(0);
  });

  it('does not accumulate listeners across repeated mount/unmount cycles', () => {
    for (let i = 0; i < 500; i++) globeIntelLayerStore.subscribe(() => {})();
    expect(listeners()).toBe(0);
  });

  it('stops delivering to a torn-down subscriber', () => {
    let calls = 0;
    const off = globeIntelLayerStore.subscribe(() => { calls++; });
    calls = 0; // subscribe delivers current state immediately
    off();
    globeIntelLayerStore.publish(buildIntelLayer([finding(9)] as never, [], () => undefined));
    expect(calls).toBe(0);
  });

  it('holds one layer PER ID — same id replaces, different ids coexist', () => {
    const a = buildIntelLayer([finding(1)] as never, [], () => undefined);
    const b = buildIntelLayer([finding(2)] as never, [], () => undefined);
    globeIntelLayerStore.publish(a);
    globeIntelLayerStore.publish(b);
    // Same id, so b replaces a rather than joining it.
    expect(globeIntelLayerStore.get()).toEqual([b]);
  });

  it('bounds what a published layer can retain, however large the analysis', () => {
    // Before the mark budget this was unbounded: a 100k-finding correlation
    // produced a 100k-mark layer that the store then held indefinitely, across
    // application switches, with nothing to evict it.
    const layer = buildIntelLayer(Array.from({ length: 100_000 }, (_, i) => finding(i)) as never, [], () => undefined);
    globeIntelLayerStore.publish(layer);
    expect(globeIntelLayerStore.get()[0].marks.length).toBeLessThanOrEqual(DEFAULT_MAX_MARKS);
    expect(layer.truncated).toMatchObject({ total: 100_000, budgetOverrun: false });
  });

  it('a throwing subscriber does not prevent teardown of the others', () => {
    const off1 = globeIntelLayerStore.subscribe(() => { throw new Error('bad subscriber'); });
    let reached = false;
    const off2 = globeIntelLayerStore.subscribe(() => { reached = true; });
    reached = false;
    // A real publish: withdraw(null) on an empty store is correctly a no-op
    // and notifies nobody, so it could not exercise this.
    expect(() => globeIntelLayerStore.publish(
      buildIntelLayer([finding(9)] as never, [], () => undefined),
    )).not.toThrow();
    expect(reached).toBe(true);
    off1(); off2();
    expect(listeners()).toBe(0);
  });
});

describe('multiple layers', () => {
  const layerFrom = (id: string) => ({
    ...buildIntelLayer([finding(1)] as never, [], () => undefined),
    id,
  });

  it('keeps layers from different sources side by side', () => {
    // The defect this pins: the store held ONE slot, so a second source
    // silently replaced the first and it looked like a rendering bug.
    globeIntelLayerStore.publish(layerFrom('intelFindings'));
    globeIntelLayerStore.publish(layerFrom('publishedClaims'));
    expect(globeIntelLayerStore.get().map((l) => l.id).sort())
      .toEqual(['intelFindings', 'publishedClaims']);
  });

  it('withdraws one source without disturbing the other', () => {
    globeIntelLayerStore.publish(layerFrom('intelFindings'));
    globeIntelLayerStore.publish(layerFrom('publishedClaims'));
    globeIntelLayerStore.withdraw('publishedClaims');
    expect(globeIntelLayerStore.get().map((l) => l.id)).toEqual(['intelFindings']);
  });

  it('looks a layer up by id rather than by position', () => {
    globeIntelLayerStore.publish(layerFrom('publishedClaims'));
    expect(globeIntelLayerStore.getLayer('publishedClaims')?.id).toBe('publishedClaims');
    expect(globeIntelLayerStore.getLayer('nope')).toBeUndefined();
  });

  it('tells subscribers the whole set, not just what changed', () => {
    const seen: string[][] = [];
    const off = globeIntelLayerStore.subscribe((ls) => seen.push(ls.map((l) => l.id)));
    globeIntelLayerStore.publish(layerFrom('a'));
    globeIntelLayerStore.publish(layerFrom('b'));
    off();
    expect(seen[seen.length - 1].sort()).toEqual(['a', 'b']);
  });
});
