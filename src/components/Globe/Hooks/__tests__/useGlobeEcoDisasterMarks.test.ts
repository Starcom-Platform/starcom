/**
 * Eco-disaster marks: the unit conversion, and that a mark can still say what it is.
 *
 * What makes one event bigger than another is decided in EcoNatural/formatters.ts and
 * is not re-litigated here — these markers were legible in principle and illegible in
 * fact, at a median of 3 px² on a share card.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as THREE from 'three';
import {
  useGlobeEcoDisasterMarks, ecoMarkPx, ECO_DISASTER_MARKS_TYPE, type EcoDisasterMarkInput,
} from '../useGlobeEcoDisasterMarks';
import { SURFACE_MARKS } from '../../globeAltitudes';
import { sizeForSeverity, sizeForWildfireAcreage } from '../../../EcoNatural/formatters';

const event = (over: Partial<EcoDisasterMarkInput> = {}): EcoDisasterMarkInput => ({
  lat: -8, lng: 115, size: sizeForSeverity('major'), color: '#ff8800',
  tooltip: 'M6.1 — 30 km depth', ...over,
});

const drawn = (group: THREE.Group) =>
  group.children.find((c) => c.userData.type === ECO_DISASTER_MARKS_TYPE) as THREE.Points | undefined;

describe('the size of an eco-disaster mark', () => {
  it('keeps the order the formatters decided', () => {
    const buckets = ['minor', 'major', 'catastrophic'].map((b) => ecoMarkPx(sizeForSeverity(b)));
    buckets.slice(1).forEach((px, i) => expect(px).toBeGreaterThan(buckets[i]));
    expect(ecoMarkPx(sizeForWildfireAcreage(500_000))).toBeGreaterThan(ecoMarkPx(sizeForWildfireAcreage(50)));
  });

  it('floors the smallest event where a card can still show it, and caps the largest', () => {
    // 0.87 is the card's scale at the audit view and 4 px its floor. Every size the
    // formatters can produce — down to a one-acre fire — sits on or above that floor.
    const floorPx = ecoMarkPx(0.1);
    expect(floorPx * 0.87).toBeGreaterThanOrEqual(4);
    expect(ecoMarkPx(sizeForWildfireAcreage(1))).toBeGreaterThanOrEqual(floorPx);
    expect(ecoMarkPx(sizeForSeverity('minor'))).toBeGreaterThan(floorPx);
    expect(ecoMarkPx(Number.NaN)).toBe(floorPx);
    expect(ecoMarkPx(50)).toBe(20);
  });
});

describe('useGlobeEcoDisasterMarks', () => {
  it('draws one mark per event, in the surface-marks band', () => {
    const scene = new THREE.Scene();
    const events = [event(), event({ lat: 34, size: sizeForSeverity('catastrophic') })];
    const { result } = renderHook(() => useGlobeEcoDisasterMarks({ scene, enabled: true, events }));

    const points = drawn(result.current.groupRef.current)!;
    expect(points.geometry.getAttribute('position').count).toBe(2);
    expect(points.geometry.getAttribute('pointSize').getX(1))
      .toBe(Math.fround(ecoMarkPx(sizeForSeverity('catastrophic'))));
    const p = points.geometry.getAttribute('position');
    expect(Math.hypot(p.getX(0), p.getY(0), p.getZ(0))).toBeCloseTo(100 * SURFACE_MARKS, 3);
  });

  it('takes the colour the hazard decided, and survives an unreadable one', () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobeEcoDisasterMarks({
      scene, enabled: true, events: [event({ color: '#ff0000' }), event({ color: 'not-a-colour' })],
    }));
    const c = drawn(result.current.groupRef.current)!.geometry.getAttribute('pointColor');
    expect([c.getX(0), c.getY(0), c.getZ(0)])
      .toEqual(Array.from(new Float32Array([new THREE.Color(0xff0000).r, 0, 0])));
    // Unreadable: WHITE, all three channels — never the previous mark's colour.
    expect([c.getX(1), c.getY(1), c.getZ(1)]).toEqual([1, 1, 1]);
  });

  it('carries the label a hover asks for, falling back to the point label', () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobeEcoDisasterMarks({
      scene, enabled: true,
      events: [event({ tooltip: 'M6.1 — 30 km depth' }), event({ tooltip: undefined, label: 'Wildfire' })],
    }));

    expect(drawn(result.current.groupRef.current)!.userData.tooltips)
      .toEqual(['M6.1 — 30 km depth', 'Wildfire']);
  });

  it('carries what a click on each event opens, in the same order as its hover (C5)', () => {
    const scene = new THREE.Scene();
    const opens = { heading: 'Earthquake', notes: [{ id: 'q', kind: 'Reported by USGS', title: 'M 6.1', text: '', timeMs: null, sources: [] }] };
    const { result } = renderHook(() => useGlobeEcoDisasterMarks({
      scene, enabled: true, events: [event({ opens }), event()],
    }));

    expect(drawn(result.current.groupRef.current)!.userData.opens).toEqual([opens, null]);
  });

  it('draws nothing when the layer is off, and releases what it drew', () => {
    const scene = new THREE.Scene();
    const { result, rerender } = renderHook(
      ({ enabled }) => useGlobeEcoDisasterMarks({ scene, enabled, events: [event()] }),
      { initialProps: { enabled: true } },
    );
    const points = drawn(result.current.groupRef.current)!;
    let released = 0;
    points.geometry.addEventListener('dispose', () => { released++; });
    (points.material as THREE.Material).addEventListener('dispose', () => { released++; });

    rerender({ enabled: false });
    expect(drawn(result.current.groupRef.current)).toBeUndefined();
    expect(released).toBe(2);
  });
});
