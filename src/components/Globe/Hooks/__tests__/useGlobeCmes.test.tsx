/**
 * NASA DONKI's CMEs on the globe (space-weather-visualization.md, SW8, SW20–SW23), on a stand-in globe
 * with stand-in records: those in flight at the moment shown drawn at their drag-based fronts, keyed
 * each with CCMC's ENLIL arrival; followed as the moment moves; waited for; said on a card.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { useGlobeCmes, cmesReadiness, cmeNotes } from '../useGlobeCmes';
import { cmeFrontAu, parseCmes } from '../../../../services/spaceWeather/donki';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';
import { allDrawnFor, resetDrawnForTest } from '../../weather/weatherDrawn';
import { formatUtcDateTime } from '../../../../utils/utcTime';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 10, 23);
const analysis = (time21_5: string, speed: number, lon: number, arrival: string | null) => ({
  isMostAccurate: true, time21_5, latitude: 5, longitude: lon, halfAngle: 40, speed, type: 'C',
  enlilList: [{ modelCompletionTime: time21_5, estimatedShockArrivalTime: arrival, isEarthGB: false, link: 'l' }],
});
const RECORDS = [
  { activityID: 'fast', link: 'f', cmeAnalyses: [analysis('2026-10-10T18:40Z', 1553, 9, '2026-10-12T00:43Z')] },
  { activityID: 'wide', link: 'w', cmeAnalyses: [analysis('2026-10-09T06:00Z', 600, 120, null)] },
  // Long gone past 2 AU by now.
  { activityID: 'old', link: 'o', cmeAnalyses: [analysis('2026-09-29T00:00Z', 900, 0, '2026-10-01T00:00Z')] },
];
const ok = (body: unknown) => vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response);

function mount(props: Partial<Parameters<typeof useGlobeCmes>[0]> = {}) {
  const scene = new THREE.Scene();
  const globeRef = { current: { scene: () => scene } } as never;
  const fetchImpl = props.fetchImpl ?? ok(RECORDS);
  const sunDirection = new THREE.Vector3(1, 0, 0);
  const hook = renderHook((p: Partial<Parameters<typeof useGlobeCmes>[0]>) => useGlobeCmes({
    globeRef, active: true, moment: NOW, sunDirection, now: () => NOW, ...props, fetchImpl, ...p,
  }), { initialProps: {} });
  return { scene, fetchImpl, ...hook };
}
const shells = (scene: THREE.Scene) => {
  const found: THREE.Mesh[] = [];
  scene.traverse((o) => { if (o.name.startsWith('cme-')) found.push(o as THREE.Mesh); });
  return found;
};
const legend = () => getLegends().find((l) => l.layer === 'CMEs');

afterEach(() => { resetLegendsForTest(); resetDrawnForTest(); });

describe('CMEs on the globe', () => {
  it('draws those in flight at the moment, each at its drag-based front, and keys each with CCMC\'s arrival', async () => {
    const { scene, result, unmount } = mount();
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    const drawn = shells(scene);
    expect(drawn.map((s) => s.name).sort()).toEqual(['cme-fast', 'cme-wide']);
    // Each with its flux rope (SW28), its tilt modelled, as the key says.
    expect(scene.getObjectByName('rope-fast')!.visible).toBe(true);
    expect(legend()!.shapeMeans).toMatch(/flux rope.*its tilt modelled/);
    // The Earth's orbit not yet reached: its arc unlit (SW30).
    expect(scene.getObjectByName('sweep-fast')!.visible).toBe(false);
    const [fast] = parseCmes(RECORDS);
    const u = (drawn.find((s) => s.name === 'cme-fast')!.material as THREE.ShaderMaterial).uniforms;
    expect(u.front.value).toBeCloseTo(cmeFrontAu(fast, NOW)!, 9);
    expect(legend()!.when).toBe(`for ${formatUtcDateTime(NOW)}`);
    // Earth arrivals first.
    // One line on a card: the speed scale's ends, and a ring for the arrival CCMC's ENLIL gives.
    expect(legend()!.swatches.map((s) => [s.label, s.shape])).toEqual([
      ['300 km/s', 'glow'], ['2000 km/s', 'glow'], [`Earth ${formatUtcDateTime(Date.UTC(2026, 9, 12, 0, 43))}, in 26 h`, 'ring'],
    ]);
    expect(legend()!.colorMeans).toMatch(/a ring, an arrival at the Earth by CCMC's ENLIL/);
    expect(cmesReadiness()).toEqual({ ready: true });
    expect(allDrawnFor(NOW)).toBe(true);
    expect(allDrawnFor(NOW + HOUR)).toBe(false);
    unmount();
    expect(scene.getObjectByName('cmes')).toBeUndefined();
  });

  it('follows the moment: fronts move out, a CME not yet measured is not drawn, and the same days are not read again', async () => {
    const { scene, result, rerender, fetchImpl } = mount();
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    const before = (shells(scene).find((s) => s.name === 'cme-fast')!.material as THREE.ShaderMaterial).uniforms.front.value as number;
    rerender({ moment: NOW + 6 * HOUR });
    await vi.waitFor(() => expect(allDrawnFor(NOW + 6 * HOUR)).toBe(true));
    expect((shells(scene).find((s) => s.name === 'cme-fast')!.material as THREE.ShaderMaterial).uniforms.front.value).toBeGreaterThan(before);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    rerender({ moment: Date.UTC(2026, 9, 10, 12) });
    await vi.waitFor(() => expect(allDrawnFor(Date.UTC(2026, 9, 10, 12))).toBe(true));
    expect(shells(scene).filter((s) => s.visible).map((s) => s.name)).toEqual(['cme-wide']);
  });

  it('lights the arc of the Earth\'s orbit inside a CME\'s cone as its front crosses it, CCMC\'s arrival', async () => {
    const arrival = Date.UTC(2026, 9, 12, 0, 43);
    const { scene, rerender } = mount();
    await vi.waitFor(() => expect(scene.getObjectByName('sweep-fast')).toBeDefined());
    rerender({ moment: arrival });
    await vi.waitFor(() => expect(allDrawnFor(arrival)).toBe(true));
    expect(scene.getObjectByName('sweep-fast')!.visible).toBe(true);
    rerender({ moment: arrival + 2 * 24 * HOUR });
    await vi.waitFor(() => expect(allDrawnFor(arrival + 2 * 24 * HOUR)).toBe(true));
    expect(scene.getObjectByName('sweep-fast')?.visible ?? false).toBe(false);
  });

  it('holds a card while the moment\'s CMEs are read, and lets it be taken once they cannot be', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const fetchImpl = vi.fn(async () => { await gate; return { ok: false, status: 503 } as unknown as Response; });
    const { result } = mount({ fetchImpl });
    await vi.waitFor(() => expect(cmesReadiness().ready).toBe(false));
    expect(cmesReadiness().why).toMatch(/DONKI's CMEs were still being read/);
    release();
    await vi.waitFor(() => expect(result.current.error).toBe('DONKI answered 503'));
    expect(cmesReadiness()).toEqual({ ready: true });
    expect(legend()).toBeUndefined();
  });

  it('holds a card again while a moment on other days has its CMEs read', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('endDate=2026-09-20')) await gate;
      return { ok: true, status: 200, json: async () => RECORDS } as unknown as Response;
    });
    const { result, rerender } = mount({ fetchImpl });
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    rerender({ moment: Date.UTC(2026, 8, 20, 12) });
    await vi.waitFor(() => expect(cmesReadiness().ready).toBe(false));
    release();
    await vi.waitFor(() => expect(cmesReadiness().ready).toBe(true));
    expect(allDrawnFor(Date.UTC(2026, 8, 20, 12))).toBe(true);
  });

  it('says when none is in flight', async () => {
    const { result } = mount({ fetchImpl: ok(RECORDS.slice(2)) });
    await vi.waitFor(() => expect(result.current.loading).toBe(false));
    await vi.waitFor(() => expect(legend()?.when).toBe(`none in flight at ${formatUtcDateTime(NOW)}`));
    expect(result.current.drawn).toBe(false);
  });

  it('is not read while off', () => {
    const { fetchImpl, scene } = mount({ active: false });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(scene.getObjectByName('cmes')).toBeUndefined();
  });

  it('says on a card how the fronts move, and whose the arrivals still to come are, each once', () => {
    const inFlight = parseCmes(RECORDS).slice(0, 2);
    const { note, noteShort } = cmeNotes(inFlight, NOW);
    expect(noteShort).toBe(`CMEs: drag-based fronts; CCMC's ENLIL: Earth ${formatUtcDateTime(Date.UTC(2026, 9, 12, 0, 43))} (in 26 h).`);
    // Counted down from the moment shown: minutes within the hour, days past two.
    expect(cmeNotes(inFlight, Date.UTC(2026, 9, 12, 0, 3)).noteShort).toMatch(/\(in 40 min\)\.$/);
    expect(cmeNotes(inFlight, Date.UTC(2026, 9, 9, 18)).noteShort).toMatch(/\(in 2 d 7 h\)\.$/);
    expect(note).toMatch(/drag-based model \(Vršnak et al\. 2013/);
    expect(note).toMatch(/Arrivals at the Earth are CCMC's WSA-ENLIL estimates, and a CME with one is paced to reach the Earth then/);
    expect(cmeNotes(inFlight.slice(1), NOW).noteShort).toBe('CMEs: drag-based fronts; CCMC\'s ENLIL has none still to reach the Earth.');
    // An arrival already past at the moment is not one to come.
    expect(cmeNotes(inFlight, Date.UTC(2026, 9, 12, 6)).noteShort).toBe('CMEs: drag-based fronts; CCMC\'s ENLIL has none still to reach the Earth.');
    // Two CMEs one ENLIL run carries to one arrival: the time once.
    const twin = { ...inFlight[0], id: 'twin' };
    expect(cmeNotes([inFlight[0], twin], NOW).noteShort).toBe(`CMEs: drag-based fronts; CCMC's ENLIL: Earth ${formatUtcDateTime(Date.UTC(2026, 9, 12, 0, 43))} (in 26 h).`);
  });
});
