/**
 * The cusps and the day side's reconnection on the globe (space-weather-visualization.md, SW5), on a
 * stand-in globe with stand-in drivers and tracer: traced for the moment shown, drawn, keyed, waited
 * for, bursts lit only while the IMF points south, and placed for a still's own moment.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { useGlobeCusps, cuspsReadiness, cuspsNotes } from '../useGlobeCusps';
import { flashesAt, vbsOf, type Cusps } from '../../spaceWeather/cusps';
import { stillMotion, releaseMotion, phaseSeconds } from '../../../../globe-engine/captureClock';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';
import type { T96DriverReading } from '../../../../services/spaceWeather/t96Drivers';

const AT = Date.UTC(2026, 9, 10, 12, 4);
const reading = (bz: number): T96DriverReading => ({
  drivers: { pdyn: 2, dst: -12, byImf: 1, bzImf: bz },
  held: [],
  wind: { observed: '2026-10-10T11:58:00Z', arrives: '2026-10-10T12:40:00Z', speed: 500, density: 6, bx: -1, by: 1, bz },
  dst: { at: '2026-10-10T12:30:00Z', dst: -12, hours: 23.5 },
  missing: [],
});
const CUSPS: Cusps = {
  latitude: { north: 77.3, south: -76.9 },
  lines: [{ kind: 'open', hemisphere: 'north', lat: 77.3, mlt: 12, points: [3, 0, 9, 1, 0, 3, 0.2, 0, 0.98] }],
};

function mount(props: Partial<Parameters<typeof useGlobeCusps>[0]> = {}) {
  const scene = new THREE.Scene();
  const globeRef = { current: { scene: () => scene } } as never;
  const tracer = { trace: vi.fn(), traceCusps: vi.fn(async () => CUSPS), traceTailSheet: vi.fn(), dispose: vi.fn() };
  const hook = renderHook((p: Partial<Parameters<typeof useGlobeCusps>[0]>) => useGlobeCusps({
    globeRef, active: true, atMs: AT, reading: reading(-6), tracer, ...props, ...p,
  }), { initialProps: {} });
  return { scene, tracer, ...hook };
}
const lit = (scene: THREE.Scene) => Array.from((scene.getObjectByName('reconnection-flashes') as THREE.Points).geometry.getAttribute('strength').array as Float32Array);

afterEach(() => resetLegendsForTest());

describe('the cusps', () => {
  it('are traced for the moment shown, to the quarter hour, from the drivers read, and drawn and keyed', async () => {
    const { scene, result, tracer, unmount } = mount();
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    expect(tracer.traceCusps).toHaveBeenCalledWith({ ut: Date.UTC(2026, 9, 10, 12) / 1000, drivers: reading(-6).drivers });
    expect(scene.getObjectByName('cusp-lines')).toBeDefined();
    const key = getLegends().find((l) => l.layer === 'Cusps')!;
    expect(key.when).toBe('T96 for 10 Oct 12:00Z: 77.3° and 76.9° magnetic');
    expect(key.swatches.map((s) => s.label)).toEqual(['cusp', 'reconnection']);
    expect(cuspsReadiness()).toEqual({ ready: true });
    unmount();
    expect(scene.getObjectByName('cusps')).toBeUndefined();
  });

  it('wait for nothing, and trace nothing, until the drivers are read', () => {
    const { tracer } = mount({ reading: null });
    expect(tracer.traceCusps).not.toHaveBeenCalled();
  });

  it('light the bursts a still\'s own moment has, while the IMF points south, and none while it points north', async () => {
    // A moment whose bursts are lit, at 500 km/s and Bz -6 nT.
    let at = AT;
    while (flashesAt(phaseSeconds(at), vbsOf(500, -6)).length === 0) at += 100;
    const south = mount();
    await vi.waitFor(() => expect(south.result.current.drawn).toBe(true));
    try {
      stillMotion(at);
      // Exactly the bursts of the still's own moment, not whatever the live clock last drew.
      const want = flashesAt(phaseSeconds(at), vbsOf(500, -6)).map((f) => f.strength);
      const got = lit(south.scene).slice(0, want.length);
      want.forEach((w, k) => expect(got[k]).toBeCloseTo(w, 5));
      expect(want.some((w) => w > 0)).toBe(true);
    } finally { releaseMotion(); }
    south.unmount();
    const north = mount({ reading: reading(4) });
    await vi.waitFor(() => expect(north.result.current.drawn).toBe(true));
    try {
      stillMotion(at);
      expect(lit(north.scene).every((s) => s === 0)).toBe(true);
    } finally { releaseMotion(); }
  });
});

describe('what a card says of them', () => {
  it('cusps traced from T96, and the bursts an illustration, only while the IMF points south', () => {
    expect(cuspsNotes(reading(-6)).noteShort).toBe('Cusps: traced from T96; the bursts are an illustration.');
    expect(cuspsNotes(reading(-6)).note).toMatch(/an illustration, not a measurement/);
    expect(cuspsNotes(reading(4)).note).toMatch(/The IMF pointed north: no bursts are drawn\./);
  });
});
