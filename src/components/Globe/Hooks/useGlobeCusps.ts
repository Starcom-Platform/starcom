/**
 * useGlobeCusps: the polar cusps and the day side's reconnection on the globe (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW5).
 *
 * From the field lines' drivers (T96's, read by useGlobeFieldLines), the cusps are traced in the
 * worker for the moment shown, to the quarter hour (spaceWeather/cusps.ts), and drawn as bundles of
 * glowing lines with pulses running down them into each pole's noon side; and while the measured IMF
 * points south, bursts of light flash at the magnetopause's nose, more often the stronger the wind's
 * electric field. A still places the pulses and the bursts for its own moment.
 *
 * It says what it draws: the key, whenReady (which waits for the cusps), and the notes a card's
 * sources carry (cuspsNotes): model-traced cusps, and bursts that are an illustration.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import type { T96DriverReading } from '../../../services/spaceWeather/t96Drivers';
import { recalc } from '../../../services/spaceWeather/geopack/geopack';
import { flashesAt, magnetopauseNoseRe, vbsOf, type Cusps } from '../spaceWeather/cusps';
import { gsmToScene } from '../spaceWeather/fieldLines';
import { createFieldLineGlow, fieldLineSegments, pulseUnitsPerSecond, type FieldLineGlow } from '../spaceWeather/fieldLineGlow';
import { createReconnectionFlashes, type ReconnectionFlashes } from '../spaceWeather/reconnectionFlashes';
import { createFieldLineTracer, type FieldLineTracer } from '../spaceWeather/fieldLineTracer';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import { DATA_SCALES } from '../../../styles/tokens';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { onStill, phaseSeconds } from '../../../globe-engine/captureClock';
import { createLogger } from '@utils/logger';
import { useLayerRoot } from '../../../globe-engine/compareLayers';

const log = createLogger({ prefix: 'Globe:Cusps' });

const LEGEND_KEY = 'SpaceWeather:cusps';
const SCENE_POLL_MS = 100;
const SCENE_POLL_MAX_ATTEMPTS = 100;
const TRACE_STEP_MS = 15 * 60_000;
const QUIET_WIND_KM_S = 400;
/** The cusps' lines drawn a little wider than the field lines: they are the point of this. */
const CUSP_PX = 4;

let readiness: { ready: boolean; why?: string } = { ready: true };
/** What whenReady asks of the cusps: false while they are on and not yet traced. */
export function cuspsReadiness(): { ready: boolean; why?: string } {
  return readiness;
}

/** What a card's sources say of the cusps and the bursts, for the drivers read. */
export function cuspsNotes(reading: T96DriverReading): { note: string; noteShort: string } {
  const south = (reading.wind?.bz ?? 0) < 0;
  return {
    note: `The cusps are traced from T96 where the day side's closed field lines give way to open ones; the pulses down them show the solar wind's particles reaching the atmosphere. ${south
      ? 'The bursts at the magnetopause\'s nose mark where the southward IMF joins the Earth\'s field, more often the stronger the wind\'s electric field: an illustration, not a measurement.'
      : 'The IMF pointed north: no bursts are drawn.'}`,
    noteShort: south ? 'Cusps: traced from T96; the bursts are an illustration.' : 'Cusps: traced from T96.',
  };
}

export interface CuspsState {
  drawn: boolean;
  loading: boolean;
  error: string | null;
  cusps: Cusps | null;
}

interface UseGlobeCuspsOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  active: boolean;
  /** The moment the globe shows, ms. */
  atMs: number;
  /** T96's drivers, as the field lines read them; nothing is traced until there are some. */
  reading: T96DriverReading | null;
  tracer?: FieldLineTracer;
}

export function useGlobeCusps({ globeRef, active, atMs, reading, tracer }: UseGlobeCuspsOptions): CuspsState {
  const [state, setState] = useState<CuspsState>({ drawn: false, loading: false, error: null, cusps: null });
  const groupRef = useRef((() => { const g = new THREE.Group(); g.name = 'cusps'; return g; })());
  // Space Weather's, side by side (D-CM): the layer is tagged whole, every piece of it.
  useLayerRoot('SpaceWeather', groupRef.current);
  const tracerRef = useRef<FieldLineTracer | null>(tracer ?? null);
  const glowRef = useRef<FieldLineGlow | null>(null);
  const flashesRef = useRef<ReconnectionFlashes | null>(null);
  // Where the nose is, and the wind's pace and electric field: read each frame.
  const windRef = useRef({ pace: pulseUnitsPerSecond(QUIET_WIND_KM_S), vbs: 0, nose: magnetopauseNoseRe(2), frame: recalc(atMs / 1000) });
  const moment = Math.floor(atMs / TRACE_STEP_MS) * TRACE_STEP_MS;
  windRef.current.pace = pulseUnitsPerSecond(reading?.wind?.speed ?? QUIET_WIND_KM_S);
  windRef.current.vbs = reading?.wind ? vbsOf(reading.wind.speed, reading.wind.bz) : 0;
  windRef.current.nose = magnetopauseNoseRe(reading?.drivers.pdyn ?? 2);

  // The group in the scene, the pulses and bursts running, while on.
  useEffect(() => {
    if (!active) {
      readiness = { ready: true };
      publishLegend(LEGEND_KEY, null);
      setState({ drawn: false, loading: false, error: null, cusps: null });
      return undefined;
    }
    const group = groupRef.current;
    const flashes = createReconnectionFlashes(DATA_SCALES.cusps.flash);
    flashesRef.current = flashes;
    group.add(flashes.object);
    let disposed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let frame: number | null = null;
    readiness = { ready: false, why: 'the cusps were still being traced' };
    setState((s) => ({ ...s, loading: true, error: null }));
    // The bursts and pulses for a moment, seconds on the clock they run by.
    const place = (seconds: number) => {
      const w = windRef.current;
      glowRef.current?.setPulse(seconds * w.pace);
      flashes.set(flashesAt(seconds, w.vbs).map((f) => {
        // On the magnetopause about its nose: curving back from it, as a paraboloid does.
        const x = w.nose - (f.y * f.y + f.z * f.z) / (2.6 * w.nose);
        return { at: gsmToScene(w.frame, [x, f.y, f.z]), strength: f.strength };
      }));
    };
    let held = false;
    const animate = (now: number) => {
      if (disposed) return;
      if (!held) place(now / 1000);
      frame = requestAnimationFrame(animate);
    };
    const leaveStill = onStill({
      still: (atMs) => { held = true; place(phaseSeconds(atMs)); },
      release: () => { held = false; },
    });
    let attempts = 0;
    const poll = () => {
      if (disposed) return;
      const scene = globeRef.current?.scene?.();
      if (scene) { if (!scene.children.includes(group)) scene.add(group); frame = requestAnimationFrame(animate); return; }
      if (++attempts >= SCENE_POLL_MAX_ATTEMPTS) { log.warn('Globe scene never became available; cusps not added'); readiness = { ready: true }; return; }
      pollTimer = setTimeout(poll, SCENE_POLL_MS);
    };
    poll();
    return () => {
      disposed = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (frame !== null) cancelAnimationFrame(frame);
      leaveStill();
      if (glowRef.current) { group.remove(glowRef.current.object); glowRef.current.dispose(); glowRef.current = null; }
      group.remove(flashes.object);
      flashes.dispose();
      flashesRef.current = null;
      group.parent?.remove(group);
      tracerRef.current?.dispose();
      tracerRef.current = tracer ?? null;
      publishLegend(LEGEND_KEY, null);
      readiness = { ready: true };
    };
  }, [active, globeRef, tracer]);

  // The cusps, traced for the moment shown from the drivers read.
  useEffect(() => {
    if (!active || !reading) return undefined;
    let current = true;
    const group = groupRef.current;
    const ut = moment / 1000;
    readiness = { ready: false, why: 'the cusps were still being traced' };
    tracerRef.current ??= createFieldLineTracer();
    tracerRef.current.traceCusps({ ut, drivers: reading.drivers }).then((cusps) => {
      if (!current) return;
      const frame = recalc(ut);
      windRef.current.frame = frame;
      if (glowRef.current) { group.remove(glowRef.current.object); glowRef.current.dispose(); }
      glowRef.current = createFieldLineGlow(fieldLineSegments(cusps.lines, 'open', frame), DATA_SCALES.cusps.line, 'cusp-lines', CUSP_PX);
      group.add(glowRef.current.object);
      publishLegend(LEGEND_KEY, {
        layerId: 'SpaceWeather',
        layer: 'Cusps',
        when: `T96 for ${formatUtcDateTime(moment)}: ${Math.abs(cusps.latitude.north).toFixed(1)}° and ${Math.abs(cusps.latitude.south).toFixed(1)}° magnetic`,
        shapeMeans: 'glowing lines over each pole\'s noon side, pulses running down them; bursts at the magnetopause while the IMF points south',
        colorMeans: 'the cusps, where the solar wind reaches the atmosphere; the bursts, where its field joins the Earth\'s',
        swatches: [
          { color: DATA_SCALES.cusps.line, label: 'cusp', shape: 'line' },
          { color: DATA_SCALES.cusps.flash, label: 'reconnection', shape: 'glow' },
        ],
      });
      readiness = { ready: true };
      setState({ drawn: true, loading: false, error: null, cusps });
    }, (error: Error) => {
      if (!current) return;
      log.warn(`The cusps could not be traced: ${error.message}`);
      readiness = { ready: true };
      setState((s) => ({ ...s, loading: false, error: error.message }));
    });
    return () => { current = false; };
  }, [active, reading, moment]);

  return state;
}
