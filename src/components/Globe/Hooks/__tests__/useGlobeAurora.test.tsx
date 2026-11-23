/**
 * The aurora from OVATION on the globe (space-weather-visualization.md, SW3), on a stand-in globe
 * with a stand-in fetch: drawn, keyed, waited for, the curtain on or off, and failing to the Kp model
 * with its reason.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { useGlobeAurora, auroraReadiness, auroraNotes } from '../useGlobeAurora';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';
import { stillMotion, releaseMotion } from '../../../../globe-engine/captureClock';
import { subsolarDirectionWorld } from '../../../../globe-engine/globeLighting';

function served(values: Record<string, number>) {
  const coordinates: number[][] = [];
  for (let lon = 0; lon < 360; lon++) for (let lat = -90; lat <= 90; lat++) coordinates.push([lon, lat, values[`${lon},${lat}`] ?? 0]);
  return { 'Observation Time': '2026-10-10T12:14:00Z', 'Forecast Time': '2026-10-10T13:21:00Z', 'Data Format': '[Longitude, Latitude, Aurora]', coordinates };
}
const ok = (body: unknown) => vi.fn(async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response);

const FORECAST = served({ '10,65': 30, '11,66': 20 });

function mount(props: Partial<Parameters<typeof useGlobeAurora>[0]> = {}) {
  const scene = new THREE.Scene();
  const globeRef = { current: { scene: () => scene } } as never;
  // Made once: a render makes no new forecast or fetch.
  const fetchImpl = props.fetchImpl ?? ok(FORECAST);
  const sunDirection = new THREE.Vector3(1, 0, 0);
  const hook = renderHook((p: Partial<Parameters<typeof useGlobeAurora>[0]>) => useGlobeAurora({
    globeRef, active: true, sunDirection, refreshMinutes: 5, ...props, fetchImpl, ...p,
  }), { initialProps: {} });
  return { scene, ...hook };
}

afterEach(() => resetLegendsForTest());

describe('the aurora from OVATION', () => {
  it('draws the band and the night curtain, keys the forecast\'s moment, and is ready for a card', async () => {
    const { scene, result, unmount } = mount();
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    expect(scene.getObjectByName('aurora-band-north')).toBeDefined();
    expect(scene.getObjectByName('aurora-curtain-north')).toBeDefined();
    // No aurora in the south in this forecast: no curtain there.
    expect(scene.getObjectByName('aurora-curtain-south')).toBeUndefined();
    expect(result.current).toMatchObject({ error: null, observed: '2026-10-10T12:14:00Z', forecast: '2026-10-10T13:21:00Z' });
    expect(auroraReadiness()).toEqual({ ready: true });
    const key = getLegends().find((l) => l.layer === 'Aurora')!;
    expect(key).toMatchObject({ layerId: 'SpaceWeather', when: 'OVATION\'s forecast for 10 Oct 13:21Z', colorMeans: 'the chance of seeing aurora overhead, NOAA SWPC OVATION' });
    expect(key.swatches.map((s) => s.label)).toEqual(['10%', '30%', '50%', '90%']);
    unmount();
    expect(scene.getObjectByName('aurora')).toBeUndefined();
  });

  it('draws the band alone while the curtain is off, and its key and notes say only what is drawn', async () => {
    const { scene, result, rerender } = mount({ curtain: false });
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    const shown = () => scene.getObjectByName('aurora-curtain-north')!.visible;
    const shape = () => getLegends().find((l) => l.layer === 'Aurora')!.shapeMeans;
    expect(scene.getObjectByName('aurora-band-north')!.visible).toBe(true);
    expect(shown()).toBe(false);
    expect(shape()).toBe('a glowing band');
    rerender({ curtain: true });
    expect(shown()).toBe(true);
    expect(shape()).toBe('a glowing band; on the night side, a curtain of light');
    expect(auroraNotes(true).note).toMatch(/curtain/);
    expect(auroraNotes(true).noteShort).toMatch(/curtain/);
    expect(auroraNotes(false).note).not.toMatch(/curtain/);
    expect(auroraNotes(false).noteShort).not.toMatch(/curtain/);
  });

  it('lights the curtains for a still\'s own moment and holds their rays there, then gives the light back', async () => {
    const { scene, result, unmount } = mount();
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    const uniforms = (scene.getObjectByName('aurora-curtain-north') as THREE.Mesh).material as THREE.ShaderMaterial;
    const at = Date.UTC(2026, 9, 10, 2, 0);
    try {
      stillMotion(at);
      const sun = subsolarDirectionWorld(new Date(at));
      expect(uniforms.uniforms.sunDirection.value.distanceTo(sun)).toBeLessThan(1e-9);
      expect(uniforms.uniforms.time.value).toBeCloseTo((at / 1000) % 1000, 6);
    } finally {
      releaseMotion();
    }
    expect(uniforms.uniforms.sunDirection.value.toArray()).toEqual([1, 0, 0]);
    unmount();
  });

  it('holds a card while the forecast is loading', async () => {
    let answer: (r: Response) => void = () => undefined;
    const pending = vi.fn(() => new Promise<Response>((resolve) => { answer = resolve; }));
    const { result } = mount({ fetchImpl: pending });
    await vi.waitFor(() => expect(auroraReadiness()).toEqual({ ready: false, why: 'the aurora forecast was still loading' }));
    answer({ ok: true, status: 200, json: async () => served({ '10,65': 30 }) } as unknown as Response);
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    expect(auroraReadiness()).toEqual({ ready: true });
  });

  it('says why it could not, draws nothing of its own, and lets a card go: the Kp model stands in', async () => {
    const { scene, result } = mount({ fetchImpl: vi.fn(async () => ({ ok: false, status: 503 }) as unknown as Response) });
    await vi.waitFor(() => expect(result.current.error).toBe('OVATION answered 503.'));
    expect(result.current.drawn).toBe(false);
    expect(scene.getObjectByName('aurora')).toBeUndefined();
    expect(auroraReadiness()).toEqual({ ready: true });
    expect(getLegends().find((l) => l.layer === 'Aurora')).toBeUndefined();
  });

  it('fetches nothing while off', () => {
    const fetchImpl = ok(served({}));
    const { scene } = mount({ active: false, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(scene.getObjectByName('aurora')).toBeUndefined();
    expect(auroraNotes(false).note).toMatch(/^The aurora is NOAA's OVATION forecast/);
  });
});
