/**
 * useGlobeFieldLines: the magnetosphere's field lines on the globe (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW4).
 *
 * While Space Weather shows them, T96's drivers are read (the solar wind NOAA measures at L1, and
 * Dst estimated from it; services/spaceWeather/t96Drivers.ts), and the lines are traced in a worker
 * for the moment the globe shows, to the quarter hour (the dipole's tilt and turn), then drawn in
 * the globe's own frame: closed lines, both ends on the Earth, in one colour, open ones, joined to
 * the solar wind, in another; glowing, with pulses of light running along them at a pace set by the
 * wind's speed (SW5, spaceWeather/fieldLineGlow.ts). A still places the pulses for its own moment.
 *
 * It says what it draws where a reader looks: the key (the colours, and the moment traced for),
 * whenReady, which waits for the lines so a card is never cut before they are drawn, and the notes a
 * card's sources carry (fieldLinesNotes): the model, its drivers, any driver beyond the model's range
 * and drawn at its edge, and any feed quiet values stood in for.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import { fetchT96Drivers, type T96DriverReading } from '../../../services/spaceWeather/t96Drivers';
import { recalc } from '../../../services/spaceWeather/geopack/geopack';
import type { FieldLineRequest } from '../spaceWeather/fieldLines';
import { createFieldLineGlow, fieldLineSegments, pulseUnitsPerSecond, type FieldLineGlow } from '../spaceWeather/fieldLineGlow';
import { createFieldLineTracer, type FieldLineTracer } from '../spaceWeather/fieldLineTracer';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import { DATA_SCALES } from '../../../styles/tokens';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { onStill, phaseSeconds } from '../../../globe-engine/captureClock';
import { createLogger } from '@utils/logger';
import { useLayerRoot } from '../../../globe-engine/compareLayers';

const log = createLogger({ prefix: 'Globe:FieldLines' });

const LEGEND_KEY = 'SpaceWeather:fieldLines';
const SCENE_POLL_MS = 100;
const SCENE_POLL_MAX_ATTEMPTS = 100;
/** The moment traced for, to this: the dipole's tilt turns less than a degree in it. */
const TRACE_STEP_MS = 15 * 60_000;
/** The drivers are read no more often than this, whatever the panel's cadence: a day of real-time wind is 250 KB. */
const MIN_REFRESH_MINUTES = 15;
/** The wind's speed the pulses run at when none was read, km/s. */
const QUIET_WIND_KM_S = 400;

/** The footpoints for each density: magnetic latitudes, degrees, and local times, hours. */
export const FIELD_LINE_DENSITY = {
  many: { latitudes: [60, 63, 66, 69, 72, 75, 78, 81], mlts: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22] },
  few: { latitudes: [62, 68, 74, 80], mlts: [0, 3, 6, 9, 12, 15, 18, 21] },
} as const;
export type FieldLineDensity = keyof typeof FIELD_LINE_DENSITY;

let readiness: { ready: boolean; why?: string } = { ready: true };
/** What whenReady asks of the field lines: false while they are on and not yet drawn for the moment shown. */
export function fieldLinesReadiness(): { ready: boolean; why?: string } {
  return readiness;
}

const number1 = (v: number) => v.toFixed(1);
const UNITS: Record<string, string> = { pressure: 'nPa', Dst: 'nT', By: 'nT', Bz: 'nT' };

/** What a card's sources say of the field lines, for the drivers they were traced from. */
export function fieldLinesNotes(reading: T96DriverReading): { note: string; noteShort: string } {
  let note = 'The field lines are N. A. Tsyganenko\'s T96 model with IGRF-14, traced with geopack, driven by the solar wind NOAA measured at L1 and Dst estimated from it (O\'Brien and McPherron, 2000): model output, not a measurement. The pulses along them show the solar wind\'s pace, sped up.';
  let noteShort = 'Field lines: the T96 model, driven by the measured solar wind';
  if (reading.held.length) {
    note += ` The wind was beyond the range T96 was fitted to, so drawn at its edge: ${reading.held.map((h) => `${h.driver} ${number1(h.measured)} ${UNITS[h.driver]} as ${h.given}`).join(', ')}.`;
    noteShort += '; the wind beyond its range, drawn at its edge';
  }
  if (reading.missing.length) {
    note += ` Quiet values stand in for ${reading.missing.join(' and ')}.`;
    noteShort += '; quiet values stand in for a feed';
  }
  return { note, noteShort: `${noteShort}.` };
}

export interface FieldLinesState {
  drawn: boolean;
  loading: boolean;
  error: string | null;
  /** The drivers the lines were traced from. */
  reading: T96DriverReading | null;
  /** The moment traced for, ms. */
  tracedFor: number | null;
}

interface UseGlobeFieldLinesOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  /** Space Weather is on and shows the field lines. */
  active: boolean;
  /** The moment the globe shows, ms. */
  atMs: number;
  density: FieldLineDensity;
  /** How often the drivers are read again, minutes, no more often than every 15; 0 for once. */
  refreshMinutes: number;
  /** Stand-ins for tests: the drivers, and where the lines are traced. */
  fetchDrivers?: () => Promise<T96DriverReading>;
  tracer?: FieldLineTracer;
}

export function useGlobeFieldLines({ globeRef, active, atMs, density, refreshMinutes, fetchDrivers, tracer }: UseGlobeFieldLinesOptions): FieldLinesState {
  const [state, setState] = useState<FieldLinesState>({ drawn: false, loading: false, error: null, reading: null, tracedFor: null });
  const [reading, setReading] = useState<T96DriverReading | null>(null);
  const groupRef = useRef((() => {
    const group = new THREE.Group();
    group.name = 'field-lines';
    return group;
  })());
  // Space Weather's, side by side (D-CM): the layer is tagged whole, every piece of it.
  useLayerRoot('SpaceWeather', groupRef.current);
  // Read when used: a new function from a caller's render is not a reason to read or trace again.
  const fetchRef = useRef(fetchDrivers);
  fetchRef.current = fetchDrivers;
  const tracerRef = useRef<FieldLineTracer | null>(tracer ?? null);
  const glowsRef = useRef<FieldLineGlow[]>([]);
  // The pulses' pace, from the wind last read.
  const paceRef = useRef(pulseUnitsPerSecond(QUIET_WIND_KM_S));
  paceRef.current = pulseUnitsPerSecond(reading?.wind?.speed ?? QUIET_WIND_KM_S);
  const moment = Math.floor(atMs / TRACE_STEP_MS) * TRACE_STEP_MS;
  const footpoints = useMemo(() => FIELD_LINE_DENSITY[density], [density]);

  // The drivers, while on.
  useEffect(() => {
    if (!active) { setReading(null); return undefined; }
    let disposed = false;
    const read = async () => {
      try {
        const next = await (fetchRef.current ?? (() => fetchT96Drivers()))();
        if (!disposed) setReading(next);
      } catch (error) {
        if (disposed) return;
        log.warn(`T96's drivers could not be read: ${(error as Error).message}`);
        setState((s) => ({ ...s, loading: false, error: (error as Error).message }));
        readiness = { ready: true };
      }
    };
    void read();
    const minutes = refreshMinutes > 0 ? Math.max(refreshMinutes, MIN_REFRESH_MINUTES) : 0;
    const timer = minutes > 0 ? setInterval(() => { void read(); }, minutes * 60_000) : null;
    return () => { disposed = true; if (timer) clearInterval(timer); };
  }, [active, refreshMinutes]);

  // The group in the scene, while on.
  useEffect(() => {
    if (!active) {
      readiness = { ready: true };
      publishLegend(LEGEND_KEY, null);
      setState({ drawn: false, loading: false, error: null, reading: null, tracedFor: null });
      return undefined;
    }
    const group = groupRef.current;
    let disposed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let frame: number | null = null;
    readiness = { ready: false, why: 'the field lines were still being traced' };
    setState((s) => ({ ...s, loading: true, error: null }));
    // The pulses: run on the live clock, and placed for a still's own moment while it holds.
    let held = false;
    let ran = 0;
    let last: number | null = null;
    const animate = (now: number) => {
      if (disposed) return;
      if (!held) {
        ran += last === null ? 0 : ((now - last) / 1000) * paceRef.current;
        for (const glow of glowsRef.current) glow.setPulse(ran);
      }
      last = now;
      frame = requestAnimationFrame(animate);
    };
    const leaveStill = onStill({
      still: (atMs) => {
        held = true;
        for (const glow of glowsRef.current) glow.setPulse(phaseSeconds(atMs) * paceRef.current);
      },
      release: () => { held = false; },
    });
    let attempts = 0;
    const poll = () => {
      if (disposed) return;
      const scene = globeRef.current?.scene?.();
      if (scene) {
        if (!scene.children.includes(group)) scene.add(group);
        frame = requestAnimationFrame(animate);
        return;
      }
      if (++attempts >= SCENE_POLL_MAX_ATTEMPTS) { log.warn('Globe scene never became available; field lines not added'); readiness = { ready: true }; return; }
      pollTimer = setTimeout(poll, SCENE_POLL_MS);
    };
    poll();
    return () => {
      disposed = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (frame !== null) cancelAnimationFrame(frame);
      leaveStill();
      for (const glow of glowsRef.current) { group.remove(glow.object); glow.dispose(); }
      glowsRef.current = [];
      group.parent?.remove(group);
      tracerRef.current?.dispose();
      tracerRef.current = tracer ?? null;
      publishLegend(LEGEND_KEY, null);
      readiness = { ready: true };
    };
  }, [active, globeRef, tracer]);

  // The lines, traced for the moment shown from the drivers read, and drawn.
  useEffect(() => {
    if (!active || !reading) return undefined;
    let current = true;
    const group = groupRef.current;
    const request: FieldLineRequest = { ut: moment / 1000, drivers: reading.drivers, latitudes: footpoints.latitudes, mlts: footpoints.mlts };
    readiness = { ready: false, why: 'the field lines were still being traced' };
    setState((s) => ({ ...s, loading: true }));
    tracerRef.current ??= createFieldLineTracer();
    tracerRef.current.trace(request).then((lines) => {
      if (!current) return;
      const frame = recalc(request.ut);
      for (const glow of glowsRef.current) { group.remove(glow.object); glow.dispose(); }
      glowsRef.current = (['closed', 'open'] as const).map((kind) => createFieldLineGlow(fieldLineSegments(lines, kind, frame), DATA_SCALES.fieldLines[kind], `field-lines-${kind}`));
      for (const glow of glowsRef.current) group.add(glow.object);
      publishLegend(LEGEND_KEY, {
        layerId: 'SpaceWeather',
        layer: 'Field lines',
        when: `T96 for ${formatUtcDateTime(moment)}`,
        shapeMeans: 'a glowing line along the magnetic field; pulses run along it at a pace set by the solar wind',
        colorMeans: 'closed, both ends on the Earth; open, one end in the solar wind',
        swatches: (['closed', 'open'] as const).map((kind) => ({ color: DATA_SCALES.fieldLines[kind], label: kind, shape: 'line' })),
      });
      readiness = { ready: true };
      setState({ drawn: true, loading: false, error: null, reading, tracedFor: moment });
    }, (error: Error) => {
      if (!current) return;
      log.warn(`The field lines could not be traced: ${error.message}`);
      readiness = { ready: true };
      setState((s) => ({ ...s, loading: false, error: error.message }));
    });
    return () => { current = false; };
  }, [active, reading, moment, footpoints]);

  return state;
}
