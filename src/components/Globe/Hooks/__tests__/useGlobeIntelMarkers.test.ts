import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGlobeIntelMarkers, INTEL_MARKER_TYPE, INTEL_LAYER_STALE_AFTER_MS, INTEL_LAYER_EXPIRES_AFTER_MS } from '../useGlobeIntelMarkers';
import { globeIntelLayerStore } from '../../../../services/intel/globe/globeIntelLayerStore';
import { buildIntelLayer } from '../../../../services/intel/globe/globeIntelLayer';
import type { CorroboratedFinding, LocationConflict } from '../../../../applications/intelanalyzer/state/correlationUtils';

const NOW = () => new Date('2026-08-20T00:00:00Z');
/** Hook clock, matched to NOW so fixed-date layers are not treated as hours old. */
const CLOCK = () => Date.parse('2026-08-20T00:00:00Z');

const findings: CorroboratedFinding[] = [
  { entityRef: 'Acme Corp', attribute: 'location', value: { lat: 10, lon: 20 }, confidence: 0.9, sourceCount: 3, algorithmVersion: 1 },
];
const conflicts: LocationConflict[] = [
  { entity: 'Gamma Inc', sourceIdA: 'p', sourceIdB: 'q', distanceKm: 3400, hoursApart: 2, strength: 0.8 },
];
const positions: Record<string, { lat: number; lon: number }> = {
  p: { lat: 0, lon: 179.5 },
  q: { lat: 0, lon: -179.5 },
};

describe('useGlobeIntelMarkers', () => {
  beforeEach(() => globeIntelLayerStore.reset());

  it('shows nothing when the analyzer has published nothing', () => {
    const { result } = renderHook(() => useGlobeIntelMarkers(CLOCK));
    expect(result.current.markers).toEqual([]);
    expect(result.current.arcs).toEqual([]);
  });

  it('receives a layer published from the other React tree', () => {
    const { result } = renderHook(() => useGlobeIntelMarkers(CLOCK));

    act(() => {
      globeIntelLayerStore.publish(buildIntelLayer(findings, [], () => undefined, { now: NOW }));
    });

    expect(result.current.markers).toHaveLength(1);
    expect(result.current.markers[0].type).toBe(INTEL_MARKER_TYPE);
    expect(result.current.markers[0].lng).toBe(20);
  });

  it('keeps showing the layer after the analyzer unmounts', () => {
    // ApplicationRenderer mounts one application at a time, so the analyzer is
    // ALWAYS gone by the time the globe is visible. Withdrawing on unmount
    // would blank the layer at exactly the moment it could be seen.
    const { result } = renderHook(() => useGlobeIntelMarkers(CLOCK));
    act(() => { globeIntelLayerStore.publish(buildIntelLayer(findings, [], () => undefined, { now: NOW })); });

    expect(result.current.markers).toHaveLength(1);
    expect(result.current.stale).toBe(false);
  });

  it('labels fabricated marks as MOCK and drains their colour', () => {
    const { result } = renderHook(() => useGlobeIntelMarkers(CLOCK));
    act(() => {
      globeIntelLayerStore.publish(
        buildIntelLayer(findings, [], () => undefined, { now: NOW, mockEntityRefs: new Set(['Acme Corp']) })
      );
    });

    const marker = result.current.markers[0];
    // The globe is where provenance is easiest to lose: a pin looks equally
    // authoritative either way.
    expect(marker.label).toContain('[MOCK]');
    expect(marker.isMock).toBe(true);
    expect(marker.color).toBe('#6b7280');
  });

  it('gives each mark the note a click opens, from its own layer (C5)', () => {
    const { result } = renderHook(() => useGlobeIntelMarkers(CLOCK));
    act(() => {
      globeIntelLayerStore.publish(
        buildIntelLayer(findings, [], () => undefined, { now: NOW, mockEntityRefs: new Set(['Acme Corp']) })
      );
    });

    const { markers, layers } = result.current;
    expect(markers.length).toBeGreaterThan(0);
    for (const m of markers) {
      expect(m.opens?.heading).toBe('Analysis');
      expect(m.opens?.notes[0].text).toContain(`Computed by ${layers[0].provenance.derivedFrom}`);
    }
  });

  it('scales visual prominence by derived weight, with a floor so weak marks stay visible', () => {
    const { result } = renderHook(() => useGlobeIntelMarkers(CLOCK));
    const weak: CorroboratedFinding[] = [{ ...findings[0], entityRef: 'Faint Co', confidence: 0.05 }];

    act(() => { globeIntelLayerStore.publish(buildIntelLayer([...findings, ...weak], [], () => undefined, { now: NOW })); });

    const strong = result.current.markers.find(m => m.label.startsWith('Acme'))!;
    const faint = result.current.markers.find(m => m.label.startsWith('Faint'))!;
    expect(strong.sizePx).toBeGreaterThan(faint.sizePx);
    expect(faint.sizePx).toBeGreaterThan(0);
  });

  it('emits an arc for a contradiction, connecting both of its marks', () => {
    const { result } = renderHook(() => useGlobeIntelMarkers(CLOCK));
    act(() => {
      globeIntelLayerStore.publish(buildIntelLayer([], conflicts, (id) => positions[id], { now: NOW }));
    });

    expect(result.current.arcs).toHaveLength(1);
    const arc = result.current.arcs[0];
    expect(arc.startLng).toBe(179.5);
    expect(arc.endLng).toBe(-179.5);
    expect(arc.label).toContain('3400 km apart');
  });

  it('gives contradictions the most saturated colour on the layer', () => {
    const { result } = renderHook(() => useGlobeIntelMarkers(CLOCK));
    act(() => {
      globeIntelLayerStore.publish(buildIntelLayer(findings, conflicts, (id) => positions[id], { now: NOW }));
    });

    const contradiction = result.current.markers.find(m => m.markKind === 'contradiction')!;
    const corroboration = result.current.markers.find(m => m.markKind === 'corroboration')!;
    // Every tool foregrounds agreement because agreement demos well. The claim
    // that does not fit is where an analyst's most valuable minute goes.
    expect(contradiction.color).toBe('#ff3b30');
    expect(corroboration.color).toBe('#41e484');
  });

  it('emits no arc when a contradiction could not be positioned', () => {
    const { result } = renderHook(() => useGlobeIntelMarkers(CLOCK));
    act(() => { globeIntelLayerStore.publish(buildIntelLayer([], conflicts, () => undefined, { now: NOW })); });

    expect(result.current.arcs).toEqual([]);
    expect(result.current.markers).toEqual([]);
  });
});

describe('staleness — every layer the globe shows was computed in a previous session', () => {
  beforeEach(() => globeIntelLayerStore.reset());

  const publishAt = (iso: string) =>
    globeIntelLayerStore.publish(buildIntelLayer(findings, [], () => undefined, { now: () => new Date(iso) }));

  const AT = Date.parse('2026-08-20T12:00:00Z');

  it('reports a fresh layer as not stale', () => {
    const { result } = renderHook(() => useGlobeIntelMarkers(() => AT));
    act(() => publishAt('2026-08-20T11:58:00Z'));

    expect(result.current.stale).toBe(false);
    expect(result.current.markers[0].label).not.toContain('as of');
  });

  it('labels every marker with its computation time once stale', () => {
    const { result } = renderHook(() => useGlobeIntelMarkers(() => AT));
    act(() => publishAt('2026-08-20T11:00:00Z'));

    // The globe's other data is live. An unlabelled analysis mark sitting
    // beside it reads as equally current.
    expect(result.current.stale).toBe(true);
    expect(result.current.markers[0].label).toContain('(as of 11:00 UTC)');
  });

  it('drops a layer past the expiry limit rather than labelling it', () => {
    const { result } = renderHook(() => useGlobeIntelMarkers(() => AT));
    act(() => publishAt('2026-08-20T05:00:00Z'));

    expect(result.current.expired).toBe(true);
    expect(result.current.markers).toEqual([]);
  });

  it('distinguishes an expired layer from never having had one', () => {
    /*
     * Asserted through expiredLayers, not a singular `layer`.
     *
     * The hook held one slot and returned `layer`; it now returns `layers` plus
     * `expiredLayers`, because a second publishing source would have evicted
     * the first. This test kept reading `.layer`, got undefined, and failed on
     * the sentinel rather than on the behaviour — which still holds, and is now
     * checked against the field built to carry it: `expired` is documented as
     * "Distinct from having none."
     */
    const { result } = renderHook(() => useGlobeIntelMarkers(() => AT));
    // No analysis at all: nothing shown AND nothing withheld.
    expect(result.current.expired).toBe(false);
    expect(result.current.expiredLayers).toEqual([]);
    expect(result.current.layers).toEqual([]);

    act(() => publishAt('2026-08-20T05:00:00Z'));

    // "The analysis I ran is too old to show" and "no analysis has been run"
    // are different facts, and the globe must be able to say which. Both end
    // with an empty marker set, so the discriminator has to be elsewhere.
    expect(result.current.expired).toBe(true);
    expect(result.current.expiredLayers.length).toBeGreaterThan(0);
    expect(result.current.markers).toEqual([]);
  });

  it('reports age in milliseconds so a caller can render it however it likes', () => {
    const { result } = renderHook(() => useGlobeIntelMarkers(() => AT));
    act(() => publishAt('2026-08-20T11:30:00Z'));

    expect(result.current.ageMs).toBe(30 * 60 * 1000);
  });

  it('has thresholds that are ordered and generous', () => {
    expect(INTEL_LAYER_STALE_AFTER_MS).toBeLessThan(INTEL_LAYER_EXPIRES_AFTER_MS);
  });
});
