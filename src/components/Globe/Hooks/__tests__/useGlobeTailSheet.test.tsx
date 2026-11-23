/**
 * The magnetotail's current sheet on the globe (space-weather-visualization.md, SW5), on a stand-in
 * globe and tracer: found for the moment shown from the field lines' drivers, drawn, keyed, waited for,
 * its shimmer held at a still's own moment.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { useGlobeTailSheet, tailSheetReadiness, TAIL_SHEET_NOTES } from '../useGlobeTailSheet';
import { stillMotion, releaseMotion, phaseSeconds } from '../../../../globe-engine/captureClock';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';
import type { T96DriverReading } from '../../../../services/spaceWeather/t96Drivers';
import type { TailSheet } from '../../spaceWeather/tailSheet';

const AT = Date.UTC(2026, 9, 10, 12, 4);
const READING: T96DriverReading = {
  drivers: { pdyn: 2, dst: -12, byImf: 1, bzImf: -3 }, held: [],
  wind: { observed: 'w', arrives: 'a', speed: 500, density: 6, bx: -1, by: 1, bz: -3 }, dst: null, missing: [],
};
const SHEET: TailSheet = { xs: [-8, -10, -12], ys: [-2, 0, 2], z: new Float32Array(9).fill(0.2), lobe: new Float32Array(9).fill(30) };

function mount(props: Partial<Parameters<typeof useGlobeTailSheet>[0]> = {}) {
  const scene = new THREE.Scene();
  const globeRef = { current: { scene: () => scene } } as never;
  const tracer = { trace: vi.fn(), traceCusps: vi.fn(), traceTailSheet: vi.fn(async () => SHEET), dispose: vi.fn() };
  const hook = renderHook((p: Partial<Parameters<typeof useGlobeTailSheet>[0]>) => useGlobeTailSheet({
    globeRef, active: true, atMs: AT, reading: READING, tracer, ...props, ...p,
  }), { initialProps: {} });
  return { scene, tracer, ...hook };
}

afterEach(() => resetLegendsForTest());

describe('the tail\'s current sheet', () => {
  it('is found for the moment shown, to the quarter hour, from the drivers read, and drawn and keyed', async () => {
    const { scene, result, tracer, unmount } = mount();
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    expect(tracer.traceTailSheet).toHaveBeenCalledWith({ ut: Date.UTC(2026, 9, 10, 12) / 1000, drivers: READING.drivers });
    expect(scene.getObjectByName('tail-sheet')).toBeDefined();
    expect(getLegends().find((l) => l.layer === 'Tail current sheet')!.when).toBe('T96 for 10 Oct 12:00Z');
    expect(tailSheetReadiness()).toEqual({ ready: true });
    unmount();
    expect(scene.getObjectByName('tail-sheet-layer')).toBeUndefined();
  });

  it('is not looked for until the drivers are read', () => {
    const { tracer } = mount({ reading: null });
    expect(tracer.traceTailSheet).not.toHaveBeenCalled();
  });

  it('holds its shimmer at a still\'s own moment', async () => {
    const { scene, result } = mount();
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    const at = Date.UTC(2026, 9, 10, 2, 0, 30);
    try {
      stillMotion(at);
      const time = ((scene.getObjectByName('tail-sheet') as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.time.value;
      expect(time).toBeCloseTo(phaseSeconds(at) % 3600, 6);
    } finally { releaseMotion(); }
  });

  it('says on a card that its place is T96\'s and its shimmer an illustration', () => {
    expect(TAIL_SHEET_NOTES.noteShort).toBe('Tail sheet: T96\'s place for it; the shimmer is an illustration.');
  });
});
