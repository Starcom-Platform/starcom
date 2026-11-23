/**
 * The analysis layer: how big its marks are, and the gate that decides whether they
 * reach the globe at all.
 *
 * Ungated, corroboration and contradiction marks rendered in EVERY visualization mode —
 * on top of space weather, submarine cables, conflict zones — where they read as part
 * of that layer rather than as intel analysis. A correlation finding indistinguishable
 * from a geomagnetic reading is the failure the globe's own rules exist to prevent: on
 * a 3D Earth a pin looks exactly as authoritative whatever produced it.
 *
 * It stayed invisible because the analysis layer is behind VITE_GLOBE_INTEL_LAYER,
 * which has never been switched on — so the defect would have shipped the moment
 * somebody flipped it, on the most authoritative surface in the app.
 *
 * Tested at the hook because nothing renders Globe.tsx: its only non-test importer is
 * CyberCommandCenterManager, so a gate left inline there is unverifiable. This replaces
 * mergeIntelMarkers.test.ts — the marks no longer share react-globe.gl's point set with
 * other layers, so "does not disturb another layer's marks" is now structural: this
 * layer owns its own group and touches nothing else in the scene.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as THREE from 'three';
import {
  useGlobeIntelMarkPoints, intelMarkPx, INTEL_MARKER_TYPE, type IntelGlobeMarker,
} from '../useGlobeIntelMarkers';
import { COUNTRY_MARKS } from '../../globeAltitudes';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';

const marker = (over: Partial<IntelGlobeMarker> = {}): IntelGlobeMarker => ({
  lat: 12, lng: 34, sizePx: intelMarkPx(0.5), color: '#41e484',
  type: INTEL_MARKER_TYPE, label: 'Two sources agree', markKind: 'corroboration',
  isMock: false, ...over,
});

const drawn = (group: THREE.Group) =>
  group.children.find((c) => c.userData.type === INTEL_MARKER_TYPE) as THREE.Points | undefined;

describe('the size of an analysis mark', () => {
  it('grows with derived weight, and a weak one still lands on a card', () => {
    expect(intelMarkPx(1)).toBeGreaterThan(intelMarkPx(0));
    // 0.87 is the card's scale at the audit view; 4 px is the audit's floor.
    expect(intelMarkPx(0) * 0.87).toBeGreaterThanOrEqual(4);
  });

  it('holds its range against a weight outside 0..1 or missing', () => {
    expect(intelMarkPx(5)).toBe(intelMarkPx(1));
    expect(intelMarkPx(-1)).toBe(intelMarkPx(0));
    expect(intelMarkPx(Number.NaN)).toBe(intelMarkPx(0));
  });
});

describe('what the card is told these marks mean', () => {
  it('names a fixture as a fixture before anything else about it', () => {
    resetLegendsForTest();
    const scene = new THREE.Scene();
    renderHook(() => useGlobeIntelMarkPoints({
      scene, layerActive: true,
      markers: [
        marker({ markKind: 'contradiction', color: '#ff3b30' }),
        marker({ isMock: true, color: '#6b7280' }),
      ],
    }));

    const legend = getLegends()[0];
    expect(legend.layer).toBe('Analysis');
    expect(legend.swatches).toEqual([
      { color: '#ff3b30', label: 'contradiction' },
      { color: '#6b7280', label: 'fabricated (fixture)' },
    ]);
  });

  it('tells the card nothing when the layer is not drawing', () => {
    resetLegendsForTest();
    renderHook(() => useGlobeIntelMarkPoints({
      scene: new THREE.Scene(), markers: [marker()], layerActive: false,
    }));

    expect(getLegends()).toEqual([]);
  });
});

describe('useGlobeIntelMarkPoints', () => {
  it('draws one mark per conclusion, above the marks it was drawn from', () => {
    const scene = new THREE.Scene();
    const markers = [marker(), marker({ lat: -20, sizePx: intelMarkPx(1) })];
    const { result } = renderHook(() => useGlobeIntelMarkPoints({ scene, markers, layerActive: true }));

    const points = drawn(result.current.groupRef.current)!;
    expect(points.geometry.getAttribute('position').count).toBe(2);
    expect(points.geometry.getAttribute('pointSize').getX(1)).toBe(Math.fround(intelMarkPx(1)));
    const p = points.geometry.getAttribute('position');
    expect(Math.hypot(p.getX(0), p.getY(0), p.getZ(0))).toBeCloseTo(100 * COUNTRY_MARKS, 3);
  });

  it('says what a mark is when asked, so a reader can check it', () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobeIntelMarkPoints({
      scene, markers: [marker({ label: '[MOCK] fixture' })], layerActive: true,
    }));

    expect(drawn(result.current.groupRef.current)!.userData.tooltips).toEqual(['[MOCK] fixture']);
  });

  it('withholds everything when the intel layer is not active', () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobeIntelMarkPoints({
      scene, markers: [marker()], layerActive: false,
    }));

    expect(drawn(result.current.groupRef.current)).toBeUndefined();
  });

  it('CLEARS what it drew when the layer goes inactive, and releases it', () => {
    // Skipping rather than clearing would strand the previous layer's conclusions on a
    // globe that has since switched to showing something else.
    const scene = new THREE.Scene();
    const { result, rerender } = renderHook(
      ({ layerActive }) => useGlobeIntelMarkPoints({ scene, markers: [marker()], layerActive }),
      { initialProps: { layerActive: true } },
    );
    const points = drawn(result.current.groupRef.current)!;
    let released = 0;
    points.geometry.addEventListener('dispose', () => { released++; });
    (points.material as THREE.Material).addEventListener('dispose', () => { released++; });

    rerender({ layerActive: false });
    expect(drawn(result.current.groupRef.current)).toBeUndefined();
    expect(released).toBe(2);
  });

  it('replaces the previous pass wholesale rather than accumulating', () => {
    // Recomputing must not leave last pass's conclusions beside this pass's.
    const scene = new THREE.Scene();
    const { result, rerender } = renderHook(
      ({ markers }) => useGlobeIntelMarkPoints({ scene, markers, layerActive: true }),
      { initialProps: { markers: [marker(), marker({ lat: 40 })] } },
    );
    expect(drawn(result.current.groupRef.current)!.geometry.getAttribute('position').count).toBe(2);

    rerender({ markers: [marker({ lat: 60 })] });
    const group = result.current.groupRef.current;
    expect(group.children.length).toBe(1);
    expect(drawn(group)!.geometry.getAttribute('position').count).toBe(1);
  });
});

describe('what a click on an analysis mark opens (C5)', () => {
  it('reaches the drawn marks, in their order', () => {
    const opens = { heading: 'Analysis', notes: [{ id: 'm1', kind: "Starcom's analysis: corroboration", title: 'Two sources agree', text: '', timeMs: null, sources: [] }] };
    const { result } = renderHook(() => useGlobeIntelMarkPoints({
      scene: new THREE.Scene(), markers: [marker({ opens }), marker()], layerActive: true,
    }));
    expect(drawn(result.current.groupRef.current)!.userData.opens).toEqual([opens, null]);
  });
});
