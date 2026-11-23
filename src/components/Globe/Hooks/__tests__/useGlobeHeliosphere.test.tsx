/**
 * The solar wind from the Sun to the Earth on the globe (space-weather-visualization.md, SW6, SW16),
 * on a stand-in globe with stand-in wind: read, drawn, keyed with the hindcast's moment, waited for,
 * aligned to the drawn Sun, its flow held at a still's own moment.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { useGlobeHeliosphere, heliosphereReadiness, heliosphereNotes } from '../useGlobeHeliosphere';
import { hindcastMoment, parseWindHistory } from '../../../../services/spaceWeather/heliosphere';
import { FLOW_DAYS_PER_SECOND } from '../../spaceWeather/heliosphereParticles';
import { stillMotion, releaseMotion, phaseSeconds } from '../../../../globe-engine/captureClock';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';
import { formatUtcDateTime } from '../../../../utils/utcTime';

const AT = Date.UTC(2026, 9, 10, 20);
const HEADER = ['time_tag', 'speed', 'density', 'temperature', 'bx', 'by', 'bz', 'bt', 'vx', 'vy', 'vz', 'propagated_time_tag'];
const WIND = [HEADER, ...Array.from({ length: 2 * 24 * 60 }, (_, k) => {
  const t = new Date(AT - (2 * 24 * 60 - k) * 60_000).toISOString();
  return [t, 420, 5, 1, -3, 3, -1, 4, 0, 0, 0, t];
})];
const ok = (body: unknown) => vi.fn(async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response);

function mount(props: Partial<Parameters<typeof useGlobeHeliosphere>[0]> = {}) {
  const scene = new THREE.Scene();
  const globeRef = { current: { scene: () => scene } } as never;
  const fetchImpl = props.fetchImpl ?? ok(WIND);
  // One Sun for every render, as the globe's is between its updates: drawing must align the stream itself.
  const sunDirection = new THREE.Vector3(1, 0, 0);
  const hook = renderHook((p: Partial<Parameters<typeof useGlobeHeliosphere>[0]>) => useGlobeHeliosphere({
    globeRef, active: true, atMs: AT, sunDirection, refreshMinutes: 15, ...props, fetchImpl, ...p,
  }), { initialProps: {} });
  return { scene, fetchImpl, ...hook };
}
const uniforms = (scene: THREE.Scene) => ((scene.getObjectByName('heliosphere-particles') as THREE.Points).material as THREE.ShaderMaterial).uniforms;

afterEach(() => resetLegendsForTest());

describe('the solar wind from the Sun', () => {
  it('is read, drawn, and keyed with the hindcast\'s moment', async () => {
    const { scene, result, unmount } = mount();
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    const moment = hindcastMoment(parseWindHistory(WIND))!;
    expect(result.current.moment).toBe(moment);
    expect(getLegends().find((l) => l.layer === 'Solar wind')!.when).toBe(`a hindcast: as it was at ${formatUtcDateTime(moment)}`);
    expect(heliosphereReadiness()).toEqual({ ready: true });
    // Aligned to the Sun as drawn: x from the Sun toward the Earth.
    expect((uniforms(scene).xAxis.value as THREE.Vector3).x).toBeLessThan(-0.9);
    unmount();
    expect(scene.getObjectByName('heliosphere')).toBeUndefined();
  });

  it('holds a card until the 7 days of wind are read, and says why it could not be', async () => {
    const { result } = mount({ fetchImpl: vi.fn(async () => ({ ok: false, status: 503 }) as unknown as Response) });
    await vi.waitFor(() => expect(result.current.error).toBe('NOAA answered 503'));
    expect(heliosphereReadiness()).toEqual({ ready: true });
    expect(getLegends().find((l) => l.layer === 'Solar wind')).toBeUndefined();
  });

  it('holds its flow at a still\'s own moment', async () => {
    const { scene, result } = mount();
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    const at = Date.UTC(2026, 9, 10, 2, 0, 30);
    try {
      stillMotion(at);
      expect(uniforms(scene).flowDays.value).toBeCloseTo((phaseSeconds(at) * FLOW_DAYS_PER_SECOND) % 1000, 6);
    } finally { releaseMotion(); }
  });

  it('is not read while off', () => {
    const { fetchImpl, scene } = mount({ active: false });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(scene.getObjectByName('heliosphere')).toBeUndefined();
  });

  it('says on a card that it is a hindcast, its assumptions, and its scale', () => {
    const { note, noteShort } = heliosphereNotes(Date.UTC(2026, 9, 6, 9));
    expect(noteShort).toBe('Solar wind: a hindcast, as it was at 6 Oct 09:00Z.');
    expect(note).toMatch(/kept its speed and that the wind's pattern turned with the Sun/);
    expect(note).toMatch(/compressed distances, its flow sped up/);
  });
});
