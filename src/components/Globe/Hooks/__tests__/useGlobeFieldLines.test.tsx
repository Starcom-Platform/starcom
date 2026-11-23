/**
 * The magnetosphere's field lines on the globe (space-weather-visualization.md, SW4), on a stand-in
 * globe with stand-in drivers and tracer: drawn glowing in two colours with pulses at the wind's pace
 * (SW5), keyed, waited for, traced again when the moment moves a quarter hour, and saying what drove them.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { useGlobeFieldLines, fieldLinesReadiness, fieldLinesNotes } from '../useGlobeFieldLines';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';
import { stillMotion, releaseMotion, phaseSeconds } from '../../../../globe-engine/captureClock';
import { pulseUnitsPerSecond, PULSE_SPACING_RE } from '../../spaceWeather/fieldLineGlow';
import { RE_UNITS } from '../../spaceWeather/fieldLines';
import { DATA_SCALES } from '../../../../styles/tokens';
import type { T96DriverReading } from '../../../../services/spaceWeather/t96Drivers';
import type { FieldLineRequest, TracedFieldLine } from '../../spaceWeather/fieldLines';

const AT = Date.UTC(2026, 9, 10, 12, 4);
const READING: T96DriverReading = {
  drivers: { pdyn: 2, dst: -12, byImf: 1, bzImf: -3 },
  held: [],
  wind: { observed: '2026-10-10T11:58:00Z', arrives: '2026-10-10T12:40:00Z', speed: 420, density: 6, bx: -1, by: 1, bz: -3 },
  dst: { at: '2026-10-10T12:30:00Z', dst: -12, hours: 23.5 },
  missing: [],
};
const LINES: TracedFieldLine[] = [
  { kind: 'closed', hemisphere: 'north', lat: 62, mlt: 12, points: [0.4, 0, 0.9, 2, 0, 0, 0.4, 0, -0.9] },
  { kind: 'open', hemisphere: 'north', lat: 80, mlt: 0, points: [0.1, 0, 1, -5, 0, 3, -20, 0, 6, -40, 0, 8] },
];

function mount(props: Partial<Parameters<typeof useGlobeFieldLines>[0]> = {}) {
  const scene = new THREE.Scene();
  const globeRef = { current: { scene: () => scene } } as never;
  const requests: FieldLineRequest[] = [];
  const tracer = props.tracer ?? { trace: vi.fn(async (r: FieldLineRequest) => { requests.push(r); return LINES; }), traceCusps: vi.fn(), traceTailSheet: vi.fn(), dispose: vi.fn() };
  const fetchDrivers = props.fetchDrivers ?? vi.fn(async () => READING);
  const hook = renderHook((p: Partial<Parameters<typeof useGlobeFieldLines>[0]>) => useGlobeFieldLines({
    globeRef, active: true, atMs: AT, density: 'many', refreshMinutes: 15, ...props, tracer, fetchDrivers, ...p,
  }), { initialProps: {} });
  return { scene, requests, tracer, fetchDrivers, ...hook };
}

afterEach(() => resetLegendsForTest());

const kinds = (scene: THREE.Scene) => {
  const out: Record<string, { color: string; segments: number }> = {};
  scene.traverse((o) => {
    if (/^field-lines-/.test(o.name)) {
      const mesh = o as THREE.Mesh;
      out[o.name] = { color: `#${(mesh.material as THREE.Material & { color: THREE.Color }).color.getHexString().toUpperCase()}`, segments: mesh.geometry.getAttribute('instanceStart').count };
    }
  });
  return out;
};
const pulseOf = (scene: THREE.Scene) => {
  let at: number | null = null;
  scene.traverse((o) => {
    if (o.name === 'field-lines-closed') at = ((o as THREE.Mesh).userData.pulseAt as () => number)();
  });
  return at;
};

describe('the field lines', () => {
  it('trace the moment shown, to the quarter hour, from the drivers read, and draw closed and open lines in their colours', async () => {
    const { scene, result, requests, unmount } = mount();
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    expect(requests[0]).toMatchObject({ ut: Date.UTC(2026, 9, 10, 12, 0) / 1000, drivers: READING.drivers });
    expect(requests[0].latitudes.length * requests[0].mlts.length).toBeGreaterThan(60);
    expect(kinds(scene)).toEqual({
      'field-lines-closed': { color: DATA_SCALES.fieldLines.closed, segments: 2 },
      'field-lines-open': { color: DATA_SCALES.fieldLines.open, segments: 3 },
    });
    const key = getLegends().find((l) => l.layer === 'Field lines')!;
    expect(key).toMatchObject({ layerId: 'SpaceWeather', when: 'T96 for 10 Oct 12:00Z', shapeMeans: 'a glowing line along the magnetic field; pulses run along it at a pace set by the solar wind' });
    expect(key.swatches.map((s) => [s.label, s.color.toUpperCase()])).toEqual([['closed', DATA_SCALES.fieldLines.closed], ['open', DATA_SCALES.fieldLines.open]]);
    expect(fieldLinesReadiness()).toEqual({ ready: true });
    unmount();
    expect(scene.getObjectByName('field-lines')).toBeUndefined();
  });

  it('place their pulses for a still\'s own moment at the wind\'s pace, so the same shot makes the same picture', async () => {
    const { scene, result, unmount } = mount();
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    const at = Date.UTC(2026, 9, 10, 2, 0, 30);
    try {
      stillMotion(at);
      const want = (phaseSeconds(at) * pulseUnitsPerSecond(READING.wind!.speed)) % (PULSE_SPACING_RE * RE_UNITS);
      expect(pulseOf(scene)).toBeCloseTo(want, 6);
    } finally {
      releaseMotion();
    }
    unmount();
  });

  it('hold a card while they are traced', async () => {
    let answer: (lines: TracedFieldLine[]) => void = () => undefined;
    const tracer = { trace: vi.fn(() => new Promise<TracedFieldLine[]>((resolve) => { answer = resolve; })), traceCusps: vi.fn(), traceTailSheet: vi.fn(), dispose: vi.fn() };
    const { result } = mount({ tracer });
    await vi.waitFor(() => expect(tracer.trace).toHaveBeenCalled());
    expect(fieldLinesReadiness()).toEqual({ ready: false, why: 'the field lines were still being traced' });
    answer(LINES);
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    expect(fieldLinesReadiness()).toEqual({ ready: true });
  });

  it('are traced again when the moment moves a quarter hour, or fewer are asked for; not for a minute', async () => {
    const { result, requests, rerender } = mount();
    await vi.waitFor(() => expect(result.current.drawn).toBe(true));
    rerender({ atMs: AT + 60_000 });
    rerender({ atMs: AT + 20 * 60_000 });
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    // 12:24 is traced for its quarter hour, 12:15.
    expect(requests[1].ut).toBe(Date.UTC(2026, 9, 10, 12, 15) / 1000);
    rerender({ atMs: AT + 20 * 60_000, density: 'few' });
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2].latitudes.length * requests[2].mlts.length).toBeLessThan(requests[1].latitudes.length * requests[1].mlts.length);
  });

  it('draw nothing, and ask nothing, while off', () => {
    const { scene, tracer, fetchDrivers } = mount({ active: false });
    expect(fetchDrivers).not.toHaveBeenCalled();
    expect(tracer.trace).not.toHaveBeenCalled();
    expect(scene.getObjectByName('field-lines')).toBeUndefined();
  });
});

describe('what a card says of them', () => {
  it('names the model and its drivers', () => {
    const { note, noteShort } = fieldLinesNotes(READING);
    expect(note).toMatch(/^The field lines are N\. A\. Tsyganenko's T96 model/);
    expect(note).toMatch(/Dst estimated from it/);
    expect(note).toMatch(/model output, not a measurement/);
    expect(note).toMatch(/The pulses along them show the solar wind's pace, sped up\./);
    expect(noteShort).toBe('Field lines: the T96 model, driven by the measured solar wind.');
  });

  it('says which drivers were beyond the model\'s range and drawn at its edge, and what stood in for a feed', () => {
    const { note, noteShort } = fieldLinesNotes({
      ...READING,
      held: [{ driver: 'pressure', measured: 22.27, given: 10 }, { driver: 'By', measured: -16.01, given: -10 }],
      missing: ['Dst, estimated from the real-time wind (NOAA answered 503)'],
    });
    expect(note).toContain('beyond the range T96 was fitted to, so drawn at its edge: pressure 22.3 nPa as 10, By -16.0 nT as -10.');
    expect(note).toContain('Quiet values stand in for Dst, estimated from the real-time wind (NOAA answered 503).');
    expect(noteShort).toBe('Field lines: the T96 model, driven by the measured solar wind; the wind beyond its range, drawn at its edge; quiet values stand in for a feed.');
  });
});
