/**
 * NOAA's ENLIL on the globe (space-weather-visualization.md, SW6, SW9, SW18), on a stand-in globe
 * with a stand-in run: its frames for the moment shown, blended; keyed with that moment, a forecast
 * when ahead; waited for; followed as the moment moves; nothing drawn outside the run.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { useGlobeEnlil, enlilReadiness, enlilNotes } from '../useGlobeEnlil';
import { enlilTexels } from '../../spaceWeather/enlilDisc';
import type { EnlilGrids } from '../../../../services/spaceWeather/enlil';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';
import { allDrawnFor, resetDrawnForTest } from '../../weather/weatherDrawn';
import { formatUtcDateTime } from '../../../../utils/utcTime';
import { getForecastReach, resetForecastReachForTest } from '../../../../services/globe/forecastReach';

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 9, 10, 0);
/** Six hourly frames from T0, named by their hour. */
const LIST = Array.from({ length: 6 }, (_, h) => ({ url: `/images/animations/enlil/enlil_com2_1_20261010T0${h}0000.jpg` }));
const ok = (body: unknown) => vi.fn(async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response);
const SIZE = 4;
/** A frame's grids: every cell the frame's hour times ten, per cm³ and above 200 km/s. */
const grids = (url: string): EnlilGrids => {
  const hour = Number(url.match(/T(\d{2})0000/)![1]);
  return { size: SIZE, density: new Float32Array(SIZE * SIZE).fill(hour * 10), velocity: new Float32Array(SIZE * SIZE).fill(200 + hour * 100) };
};

function mount(props: Partial<Parameters<typeof useGlobeEnlil>[0]> = {}) {
  const scene = new THREE.Scene();
  const globeRef = { current: { scene: () => scene } } as never;
  const fetchImpl = props.fetchImpl ?? ok(LIST);
  const loadFrame = props.loadFrame ?? vi.fn(async (url: string) => grids(url));
  const sunDirection = new THREE.Vector3(1, 0, 0);
  const hook = renderHook((p: Partial<Parameters<typeof useGlobeEnlil>[0]>) => useGlobeEnlil({
    globeRef, active: true, moment: T0 + HOUR, sunDirection, quantity: 'density', now: () => T0 + 2 * HOUR, ...props, fetchImpl, loadFrame, ...p,
  }), { initialProps: {} });
  return { scene, fetchImpl, loadFrame, ...hook };
}
const disc = (scene: THREE.Scene) => scene.getObjectByName('enlil-disc') as THREE.Mesh | undefined;
const uniforms = (scene: THREE.Scene) => (disc(scene)!.material as THREE.ShaderMaterial).uniforms;
const texels = (scene: THREE.Scene, which: 'before' | 'after') => (uniforms(scene)[which].value as THREE.DataTexture).image.data as Uint8Array;
const legend = () => getLegends().find((l) => l.layer === 'ENLIL');

afterEach(() => { resetLegendsForTest(); resetDrawnForTest(); resetForecastReachForTest(); });

describe('ENLIL on the globe', () => {
  it('draws the two frames round the moment, blended, keyed with the moment', async () => {
    const at = T0 + HOUR + HOUR / 4;
    const { scene, result, unmount } = mount({ moment: at });
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    expect(Array.from(texels(scene, 'before'))).toEqual(Array.from(enlilTexels(grids(LIST[1].url).density, 'density')));
    expect(Array.from(texels(scene, 'after'))).toEqual(Array.from(enlilTexels(grids(LIST[2].url).density, 'density')));
    expect(uniforms(scene).mixWeight.value).toBeCloseTo(0.25, 9);
    expect(disc(scene)!.visible).toBe(true);
    expect(legend()!.when).toBe(`modelled for ${formatUtcDateTime(at)}`);
    expect(enlilReadiness()).toEqual({ ready: true });
    // What a clip sweeping the timeline waits on, frame by frame: this moment drawn, no other.
    expect(allDrawnFor(at)).toBe(true);
    expect(allDrawnFor(at + HOUR)).toBe(false);
    expect(result.current.run).toEqual({ from: T0, until: T0 + 5 * HOUR });
    // The timeline reaches its last frame while it is shown (SW19), and no further once it is not.
    expect(getForecastReach()).toEqual({ until: T0 + 5 * HOUR, by: 'ENLIL' });
    unmount();
    expect(scene.getObjectByName('enlil')).toBeUndefined();
    expect(getForecastReach()).toBeNull();
  });

  it('calls a moment ahead of now a forecast', async () => {
    const at = T0 + 4 * HOUR;
    const { result } = mount({ moment: at });
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    expect(legend()!.when).toBe(`forecast for ${formatUtcDateTime(at)}`);
    expect(result.current.forecast).toBe(true);
  });

  it('follows the moment, holding a card until the new frames are drawn, and reads no frame twice', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const loadFrame = vi.fn(async (url: string) => { if (url.includes('T04')) await gate; return grids(url); });
    const { scene, result, rerender } = mount({ loadFrame });
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    rerender({ moment: T0 + 3 * HOUR + HOUR / 2 });
    await vi.waitFor(() => expect(enlilReadiness().ready).toBe(false));
    expect(enlilReadiness().why).toMatch(/ENLIL's frames for the moment shown were still being read/);
    release();
    await vi.waitFor(() => expect(enlilReadiness().ready).toBe(true));
    expect(Array.from(texels(scene, 'after'))).toEqual(Array.from(enlilTexels(grids(LIST[4].url).density, 'density')));
    expect(allDrawnFor(T0 + 3 * HOUR + HOUR / 2)).toBe(true);
    const reads = loadFrame.mock.calls.length;
    rerender({ moment: T0 + HOUR });
    await vi.waitFor(() => expect(allDrawnFor(T0 + HOUR)).toBe(true));
    expect(loadFrame.mock.calls.length).toBe(reads);
  });

  it('draws nothing outside the run, and says what the run covers', async () => {
    const at = T0 + 9 * HOUR;
    const { scene, result, rerender } = mount();
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    rerender({ moment: at });
    await vi.waitFor(() => expect(result.current.drawn).toBe(false));
    expect(allDrawnFor(at)).toBe(true);
    expect(disc(scene)!.visible).toBe(false);
    expect(result.current.drawn).toBe(false);
    expect(legend()!.when).toBe(`none for ${formatUtcDateTime(at)}: the run covers ${formatUtcDateTime(T0)} to ${formatUtcDateTime(T0 + 5 * HOUR)}`);
    expect(enlilReadiness()).toEqual({ ready: true });
  });

  it('switches density and speed without reading the frames again', async () => {
    const { scene, result, rerender, loadFrame } = mount();
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    const reads = loadFrame.mock.calls.length;
    rerender({ quantity: 'velocity' });
    await vi.waitFor(() => expect(legend()!.colorMeans).toMatch(/speed/));
    expect(Array.from(texels(scene, 'before'))).toEqual(Array.from(enlilTexels(grids(LIST[1].url).velocity, 'velocity')));
    expect(loadFrame.mock.calls.length).toBe(reads);
  });

  it('lets a card be taken once a frame cannot be read, and says why', async () => {
    const { result } = mount({ loadFrame: vi.fn(async () => { throw new Error('NOAA answered 404'); }) });
    await vi.waitFor(() => expect(result.current.error).toBe('NOAA answered 404'));
    expect(enlilReadiness()).toEqual({ ready: true });
  });

  it('lets a card be taken once it cannot be read, and says why', async () => {
    const { result } = mount({ fetchImpl: vi.fn(async () => ({ ok: false, status: 503 }) as unknown as Response) });
    await vi.waitFor(() => expect(result.current.error).toBe('NOAA answered 503'));
    expect(enlilReadiness()).toEqual({ ready: true });
    expect(legend()).toBeUndefined();
  });

  it('is not read while off', () => {
    const { fetchImpl, scene } = mount({ active: false });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(scene.getObjectByName('enlil')).toBeUndefined();
  });

  it('says on a card that it is the model\'s, a forecast when ahead, read off NOAA\'s frames', () => {
    const run = enlilNotes(Date.UTC(2026, 9, 9, 6), 'density', false);
    expect(run.noteShort).toBe('ENLIL: the model\'s density for 9 Oct 06:00Z, not a measurement.');
    expect(run.note).toMatch(/read off the frames NOAA SWPC publishes/);
    const ahead = enlilNotes(Date.UTC(2026, 9, 12, 6), 'velocity', true);
    expect(ahead.noteShort).toBe('ENLIL: the model\'s forecast speed for 12 Oct 06:00Z, not a measurement.');
  });
});
