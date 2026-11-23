/**
 * The solar wind streaming past the magnetosphere (space-weather-visualization.md, SW6, SW17), on a
 * stand-in globe: drawn from the wind the field lines read, round T96's own nose, in the IMF's
 * polarity's colour, keyed with the moment it was measured, replayed at a still's own moment.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { useGlobeNearEarthFlow, nearEarthFlowReadiness } from '../useGlobeNearEarthFlow';
import { magnetopauseNoseRe } from '../../spaceWeather/cusps';
import { stillMotion, releaseMotion } from '../../../../globe-engine/captureClock';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';
import { DATA_SCALES } from '../../../../styles/tokens';
import type { T96DriverReading } from '../../../../services/spaceWeather/t96Drivers';

const AT = Date.UTC(2026, 9, 10, 20, 4);
const reading = (pdyn: number, bx: number, by: number): T96DriverReading => ({
  drivers: { pdyn, dst: -12, byImf: by, bzImf: -3 }, held: [],
  wind: { observed: '2026-10-10T20:00:00Z', arrives: 'a', speed: 600, density: 6, bx, by, bz: -3 }, dst: null, missing: [],
});

function mount(props: Partial<Parameters<typeof useGlobeNearEarthFlow>[0]> = {}) {
  const scene = new THREE.Scene();
  const globeRef = { current: { scene: () => scene } } as never;
  const first = reading(2, -3, 3);
  const hook = renderHook((p: Partial<Parameters<typeof useGlobeNearEarthFlow>[0]>) => useGlobeNearEarthFlow({
    globeRef, active: true, atMs: AT, reading: first, ...props, ...p,
  }), { initialProps: {} });
  return { scene, ...hook };
}
const flow = (scene: THREE.Scene) => scene.getObjectByName('near-earth-flow') as THREE.Mesh | undefined;
// The colour a lit head is drawn in, at full strength: the brightest head's, scaled back to one.
const colorOf = (scene: THREE.Scene) => {
  const c = (flow(scene)!.geometry.getAttribute('instanceColorStart') as THREE.InterleavedBufferAttribute).data.array as Float32Array;
  let best = 3;
  for (let i = 0; i < c.length; i += 6) if (c[i + 3] + c[i + 4] + c[i + 5] > c[best] + c[best + 1] + c[best + 2]) best = i + 3;
  const k = Math.max(c[best], c[best + 1], c[best + 2]);
  return [c[best] / k, c[best + 1] / k, c[best + 2] / k];
};
const hue = (hex: string) => { const col = new THREE.Color(hex); const k = Math.max(col.r, col.g, col.b); return [col.r / k, col.g / k, col.b / k]; };
const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-3);

afterEach(() => resetLegendsForTest());

describe('the wind near the Earth', () => {
  it('streams round T96\'s own nose for the wind\'s pressure, coloured by its polarity, keyed with when it was measured', async () => {
    const { scene, result, unmount } = mount();
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    expect(result.current.standoffRe).toBeCloseTo(Math.round(magnetopauseNoseRe(2) / 0.3) * 0.3, 9);
    expect(near(colorOf(scene), hue(DATA_SCALES.solarWind.away))).toBe(true);
    expect(getLegends().find((l) => l.layer === 'Solar wind near the Earth')!.when).toBe('measured 10 Oct 20:00Z');
    expect(nearEarthFlowReadiness()).toEqual({ ready: true });
    unmount();
    expect(scene.getObjectByName('near-earth-flow-layer')).toBeUndefined();
  });

  it('reshapes when the nose moves, and turns colour with the IMF\'s polarity', async () => {
    const { scene, result, rerender } = mount();
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    const before = flow(scene);
    rerender({ reading: reading(2.02, -3, 3) });
    expect(flow(scene)).toBe(before);
    rerender({ reading: reading(8, 3, -3) });
    await vi.waitFor(() => expect(result.current.standoffRe).toBeCloseTo(Math.round(magnetopauseNoseRe(8) / 0.3) * 0.3, 9));
    expect(flow(scene)).not.toBe(before);
    expect(near(colorOf(scene), hue(DATA_SCALES.solarWind.toward))).toBe(true);
  });

  it('replays the same picture for the same still', async () => {
    const { scene, result } = mount();
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    const at = Date.UTC(2026, 9, 10, 2, 0, 30);
    const positions = () => Array.from((flow(scene)!.geometry.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute).data.array as Float32Array).slice(0, 30);
    try {
      stillMotion(at);
      const once = positions();
      releaseMotion();
      stillMotion(at);
      expect(positions()).toEqual(once);
    } finally { releaseMotion(); }
  });

  it('draws nothing while off, or before the wind is read', () => {
    expect(flow(mount({ active: false }).scene)).toBeUndefined();
    expect(flow(mount({ reading: null }).scene)).toBeUndefined();
  });
});
