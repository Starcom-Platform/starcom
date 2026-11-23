/**
 * The geoelectric field on the globe (space-weather-visualization.md, SW1, SW2), mounted on a
 * stand-in globe with a scene and no renderer (jsdom has no WebGL): the colour field drawn
 * from every sample, its key, and whenReady's wait.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { useGlobeEField, eFieldReadiness, eFieldLookNote, E_FIELD_STREAK_NOTE } from '../useGlobeEField';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';
import type { ProcessedElectricFieldData } from '../../../../types/data/spaceWeather';

const sample = (longitude: number, latitude: number, ex: number, ey: number) => ({ longitude, latitude, ex, ey, magnitude: Math.hypot(ex, ey) });
const set = (source: ProcessedElectricFieldData['source'], vectors: ReturnType<typeof sample>[]) =>
  ({ timestamp: '2026-10-10T12:15:30Z', source, unit: 'mV/km', vectors, coverage: {}, statistics: {} }) as unknown as ProcessedElectricFieldData;
const INTERMAG = set('InterMagEarthScope', [sample(-100, 40, 3, 4), sample(-99.5, 40, 1, 0)]);

function mount(props: Partial<Parameters<typeof useGlobeEField>[0]> = {}) {
  const scene = new THREE.Scene();
  const globeRef = { current: { scene: () => scene } } as never;
  const hook = renderHook((p: Partial<Parameters<typeof useGlobeEField>[0]>) => useGlobeEField({
    globeRef, active: true, loading: false, interMag: INTERMAG, usCanada: null, grids: 'both', look: 'streaks',
    scale: 'absolute', opacity: 0.6, flowSpeed: 1, flowDensity: 1, ...props, ...p,
  }), { initialProps: {} });
  return { scene, ...hook };
}
const field = (scene: THREE.Scene) => scene.getObjectByName('e-field') as THREE.Mesh | undefined;

afterEach(() => resetLegendsForTest());

describe('the geoelectric field on the globe', () => {
  it('draws every sample as one colour field, keys it, and is ready for a card', async () => {
    const { scene, unmount } = mount();
    await vi.waitFor(() => expect(field(scene)).toBeDefined());
    expect(eFieldReadiness()).toEqual({ ready: true });
    const key = getLegends().find((l) => l.layer === 'Geoelectric field')!;
    expect(key).toMatchObject({ layerId: 'SpaceWeather', when: 'NOAA\'s files of 10 Oct 12:15Z', shapeMeans: 'the coloured ground; streaks move the way the field points' });
    expect(key.swatches.map((s) => s.label)).toEqual(['1 mV/km', '10 mV/km', '100 mV/km', '1 V/km', 'a streak: the field\'s direction']);
    // Keyed as an area, which a card's key always names: the field has no marks to count.
    expect(key.swatches[0].shape).toBe('area');
    unmount();
    expect(field(scene)).toBeUndefined();
    expect(getLegends().find((l) => l.layer === 'Geoelectric field')).toBeUndefined();
  });

  it('keys the relative scale by the field\'s own strengths, and no streak when none is drawn', async () => {
    const { scene, rerender } = mount();
    await vi.waitFor(() => expect(field(scene)).toBeDefined());
    rerender({ scale: 'relative', look: 'arrows' });
    const key = getLegends().find((l) => l.layer === 'Geoelectric field')!;
    expect(key.swatches.map((s) => s.label)).not.toContain('a streak: the field\'s direction');
    expect(key.swatches.map((s) => s.label)).not.toEqual(['1 mV/km', '10 mV/km', '100 mV/km', '1 V/km']);
    expect(key.shapeMeans).toBe('the coloured ground; arrows point the way the field points, longer where stronger');
  });

  // Step 2: the other looks (SW1).
  it('keys each look by what it draws: arrows, ripples, or a relief coloured by direction', async () => {
    const { scene, rerender } = mount({ look: 'arrows' });
    await vi.waitFor(() => expect(field(scene)).toBeDefined());
    const keyed = () => getLegends().find((l) => l.layer === 'Geoelectric field')!;
    expect(keyed().shapeMeans).toBe('the coloured ground; arrows point the way the field points, longer where stronger');
    expect(keyed().swatches.at(-1)).toMatchObject({ label: 'an arrow: the field\'s direction', shape: 'line' });
    expect((field(scene)!.material as THREE.ShaderMaterial).uniforms.look.value).toBe(1);
    rerender({ look: 'ripples' });
    expect(keyed().shapeMeans).toBe('the coloured ground; ripples run the way the field points');
    expect((field(scene)!.material as THREE.ShaderMaterial).uniforms.look.value).toBe(2);
    rerender({ look: 'relief' });
    expect(keyed()).toMatchObject({ shapeMeans: 'a surface raised by the field\'s strength', colorMeans: 'the way the field points' });
    expect(keyed().swatches.map((w) => w.label)).toEqual(['toward north', 'toward east', 'toward south', 'toward west']);
    expect((field(scene)!.material as THREE.ShaderMaterial).uniforms.look.value).toBe(3);
  });

  it('says on a card what each look stands for, beyond the field itself', async () => {
    expect(eFieldLookNote('streaks')).toBe(E_FIELD_STREAK_NOTE);
    expect(eFieldLookNote('ripples')).toBe('The e-field\'s ripples are sped up for viewing; their direction and relative strength are the model\'s.');
    expect(eFieldLookNote('relief')).toBe('The e-field\'s relief stands for its strength on a log scale, raised to be seen; its colour is the way it points.');
    expect(eFieldLookNote('arrows')).toBe('');
  });

  it('holds a card while its files are loading, and lets it go when there are none', async () => {
    const { scene, rerender } = mount({ interMag: null, loading: true });
    await vi.waitFor(() => expect(eFieldReadiness()).toEqual({ ready: false, why: 'the geoelectric field was still loading' }));
    expect(field(scene)).toBeUndefined();
    rerender({ loading: false });
    expect(eFieldReadiness()).toEqual({ ready: true });
  });

  it('draws nothing, keys nothing and holds nothing while off', () => {
    const { scene } = mount({ active: false });
    expect(field(scene)).toBeUndefined();
    expect(getLegends().find((l) => l.layer === 'Geoelectric field')).toBeUndefined();
    expect(eFieldReadiness()).toEqual({ ready: true });
  });
});
