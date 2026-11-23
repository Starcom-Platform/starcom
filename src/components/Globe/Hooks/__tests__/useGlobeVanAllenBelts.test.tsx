/**
 * The Van Allen belts on the globe (space-weather-visualization.md, SW5), on a stand-in globe with a
 * stand-in GOES: drawn round the dipole's axis for the hour shown, brightened by the electrons read,
 * keyed, waited for, and saying when GOES could not be read.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { useGlobeVanAllenBelts, vanAllenReadiness, vanAllenNotes } from '../useGlobeVanAllenBelts';
import { outerBeltGain } from '../../spaceWeather/vanAllenBelts';
import { recalc } from '../../../../services/spaceWeather/geopack/geopack';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';

const AT = Date.UTC(2026, 9, 10, 12, 40);
const GOES = [{ time_tag: '2026-10-10T12:30:00Z', satellite: 19, flux: 2168.8, energy: '>=2 MeV' }];
const ok = (body: unknown) => vi.fn(async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response);

function mount(props: Partial<Parameters<typeof useGlobeVanAllenBelts>[0]> = {}) {
  const scene = new THREE.Scene();
  const globeRef = { current: { scene: () => scene } } as never;
  const fetchImpl = props.fetchImpl ?? ok(GOES);
  const hook = renderHook((p: Partial<Parameters<typeof useGlobeVanAllenBelts>[0]>) => useGlobeVanAllenBelts({
    globeRef, active: true, atMs: AT, steps: 32, refreshMinutes: 15, ...props, fetchImpl, ...p,
  }), { initialProps: {} });
  return { scene, fetchImpl, ...hook };
}
const uniforms = (scene: THREE.Scene) => ((scene.getObjectByName('van-allen-belts') as THREE.Mesh).material as THREE.ShaderMaterial).uniforms;

afterEach(() => resetLegendsForTest());

describe('the belts', () => {
  it('are drawn round the dipole\'s axis for the hour shown, the outer brightened by the electrons GOES measured', async () => {
    const { scene, result, unmount } = mount();
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    expect(uniforms(scene).outerGain.value).toBeCloseTo(outerBeltGain(2168.8), 9);
    const [x, y, z] = recalc(Date.UTC(2026, 9, 10, 12) / 1000).axis;
    expect((uniforms(scene).axis.value as THREE.Vector3).distanceTo(new THREE.Vector3(y, z, x).normalize())).toBeLessThan(1e-9);
    const key = getLegends().find((l) => l.layer === 'Van Allen belts')!;
    expect(key.when).toBe('GOES-19\'s ≥2 MeV electrons, 10 Oct 12:30Z');
    expect(key.swatches.map((s) => s.label)).toEqual(['outer belt', 'inner belt']);
    expect(vanAllenReadiness()).toEqual({ ready: true });
    unmount();
    expect(scene.getObjectByName('van-allen-belts')).toBeUndefined();
  });

  it('hold a card until GOES answers', async () => {
    let answer: (r: Response) => void = () => undefined;
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => { answer = resolve; }));
    const { result } = mount({ fetchImpl });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(vanAllenReadiness()).toEqual({ ready: false, why: 'GOES\'s electron flux was still being read' });
    answer({ ok: true, status: 200, json: async () => GOES } as unknown as Response);
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    expect(vanAllenReadiness()).toEqual({ ready: true });
  });

  it('are drawn at a typical brightness when GOES cannot be read, and say so', async () => {
    const { scene, result } = mount({ fetchImpl: vi.fn(async () => ({ ok: false, status: 503 }) as unknown as Response) });
    await vi.waitFor(() => expect(result.current.error).toBe('GOES answered 503'));
    expect(uniforms(scene).outerGain.value).toBeCloseTo(outerBeltGain(300), 9);
    expect(getLegends().find((l) => l.layer === 'Van Allen belts')!.when).toBe('a typical brightness');
    expect(vanAllenReadiness()).toEqual({ ready: true });
    expect(vanAllenNotes(null).note).toMatch(/the outer is drawn at a typical brightness: GOES could not be read/);
  });

  it('are not drawn, and GOES not read, while off', () => {
    const { scene, fetchImpl } = mount({ active: false });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(scene.getObjectByName('van-allen-belts')).toBeUndefined();
  });
});

describe('what a card says of them', () => {
  it('a dipole\'s shape, what brightened the outer belt, and that they show where the belts are', () => {
    const { note, noteShort } = vanAllenNotes({ at: '2026-10-10T12:30:00Z', flux: 2168.8, satellite: 19 });
    expect(note).toBe('The Van Allen belts are drawn in a dipole\'s shape round the magnetic axis; the outer is brightened by the flux of ≥2 MeV electrons GOES-19 measured at geostationary orbit, its outer edge (2169 pfu at 10 Oct 12:30Z); the inner at a typical brightness. They show where the belts are, not a measure of them.');
    expect(noteShort).toBe('Van Allen belts: a dipole\'s shape, the outer brightened by GOES\'s electrons.');
  });
});
