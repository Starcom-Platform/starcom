/**
 * useGlobeTailSheet: the magnetotail's current sheet on the globe (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW5).
 *
 * From the field lines' drivers (T96's, read by useGlobeFieldLines), the sheet is found in the worker
 * for the moment shown, to the quarter hour (spaceWeather/tailSheet.ts), and drawn as a shimmering
 * surface down the tail (spaceWeather/tailSheetMesh.ts). A still holds the shimmer at its own moment.
 *
 * It says what it draws: the key, whenReady (which waits for the sheet), and the notes a card's
 * sources carry (tailSheetNotes): T96's place for it, and a shimmer that is an illustration.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import type { T96DriverReading } from '../../../services/spaceWeather/t96Drivers';
import { recalc } from '../../../services/spaceWeather/geopack/geopack';
import type { TailSheet } from '../spaceWeather/tailSheet';
import { createTailSheetMesh, type TailSheetMesh } from '../spaceWeather/tailSheetMesh';
import { createFieldLineTracer, type FieldLineTracer } from '../spaceWeather/fieldLineTracer';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import { DATA_SCALES } from '../../../styles/tokens';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { onStill, phaseSeconds } from '../../../globe-engine/captureClock';
import { createLogger } from '@utils/logger';
import { useLayerRoot } from '../../../globe-engine/compareLayers';

const log = createLogger({ prefix: 'Globe:TailSheet' });

const LEGEND_KEY = 'SpaceWeather:tailSheet';
const SCENE_POLL_MS = 100;
const SCENE_POLL_MAX_ATTEMPTS = 100;
const TRACE_STEP_MS = 15 * 60_000;

let readiness: { ready: boolean; why?: string } = { ready: true };
/** What whenReady asks of the sheet: false while it is on and not yet found. */
export function tailSheetReadiness(): { ready: boolean; why?: string } {
  return readiness;
}

/** What a card's sources say of the sheet. */
export const TAIL_SHEET_NOTES = {
  note: 'The tail\'s current sheet is where T96\'s field turns from earthward, in the northern lobe, to tailward, in the southern, brighter where the lobes\' field is stronger and the sheet carries more current; its shimmer, running dawn to dusk as the current does, is an illustration.',
  noteShort: 'Tail sheet: T96\'s place for it; the shimmer is an illustration.',
};

export interface TailSheetState {
  drawn: boolean;
  loading: boolean;
  error: string | null;
  sheet: TailSheet | null;
}

interface UseGlobeTailSheetOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  active: boolean;
  /** The moment the globe shows, ms. */
  atMs: number;
  /** T96's drivers, as the field lines read them; nothing is found until there are some. */
  reading: T96DriverReading | null;
  tracer?: FieldLineTracer;
}

export function useGlobeTailSheet({ globeRef, active, atMs, reading, tracer }: UseGlobeTailSheetOptions): TailSheetState {
  const [state, setState] = useState<TailSheetState>({ drawn: false, loading: false, error: null, sheet: null });
  const groupRef = useRef((() => { const g = new THREE.Group(); g.name = 'tail-sheet-layer'; return g; })());
  // Space Weather's, side by side (D-CM): the layer is tagged whole, every piece of it.
  useLayerRoot('SpaceWeather', groupRef.current);
  const tracerRef = useRef<FieldLineTracer | null>(tracer ?? null);
  const meshRef = useRef<TailSheetMesh | null>(null);
  const moment = Math.floor(atMs / TRACE_STEP_MS) * TRACE_STEP_MS;

  // The group in the scene, the shimmer running, while on.
  useEffect(() => {
    if (!active) {
      readiness = { ready: true };
      publishLegend(LEGEND_KEY, null);
      setState({ drawn: false, loading: false, error: null, sheet: null });
      return undefined;
    }
    const group = groupRef.current;
    let disposed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let frame: number | null = null;
    readiness = { ready: false, why: 'the tail\'s current sheet was still being found' };
    setState((s) => ({ ...s, loading: true, error: null }));
    let held = false;
    const animate = (now: number) => {
      if (disposed) return;
      if (!held) meshRef.current?.setTime(now / 1000);
      frame = requestAnimationFrame(animate);
    };
    const leaveStill = onStill({
      still: (atMs) => { held = true; meshRef.current?.setTime(phaseSeconds(atMs)); },
      release: () => { held = false; },
    });
    let attempts = 0;
    const poll = () => {
      if (disposed) return;
      const scene = globeRef.current?.scene?.();
      if (scene) { if (!scene.children.includes(group)) scene.add(group); frame = requestAnimationFrame(animate); return; }
      if (++attempts >= SCENE_POLL_MAX_ATTEMPTS) { log.warn('Globe scene never became available; tail sheet not added'); readiness = { ready: true }; return; }
      pollTimer = setTimeout(poll, SCENE_POLL_MS);
    };
    poll();
    return () => {
      disposed = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (frame !== null) cancelAnimationFrame(frame);
      leaveStill();
      if (meshRef.current) { group.remove(meshRef.current.object); meshRef.current.dispose(); meshRef.current = null; }
      group.parent?.remove(group);
      tracerRef.current?.dispose();
      tracerRef.current = tracer ?? null;
      publishLegend(LEGEND_KEY, null);
      readiness = { ready: true };
    };
  }, [active, globeRef, tracer]);

  // The sheet, found for the moment shown from the drivers read.
  useEffect(() => {
    if (!active || !reading) return undefined;
    let current = true;
    const group = groupRef.current;
    const ut = moment / 1000;
    readiness = { ready: false, why: 'the tail\'s current sheet was still being found' };
    tracerRef.current ??= createFieldLineTracer();
    tracerRef.current.traceTailSheet({ ut, drivers: reading.drivers }).then((sheet) => {
      if (!current) return;
      if (meshRef.current) { group.remove(meshRef.current.object); meshRef.current.dispose(); }
      meshRef.current = createTailSheetMesh(sheet, recalc(ut), DATA_SCALES.tailSheet);
      group.add(meshRef.current.object);
      publishLegend(LEGEND_KEY, {
        layerId: 'SpaceWeather',
        layer: 'Tail current sheet',
        when: `T96 for ${formatUtcDateTime(moment)}`,
        shapeMeans: 'a shimmering sheet down the night side, where the field turns from earthward to tailward',
        colorMeans: 'brighter where the lobes\' field either side is stronger: the current it carries',
        swatches: [{ color: DATA_SCALES.tailSheet, label: 'current sheet', shape: 'area' }],
      });
      readiness = { ready: true };
      setState({ drawn: true, loading: false, error: null, sheet });
    }, (error: Error) => {
      if (!current) return;
      log.warn(`The tail's current sheet could not be found: ${error.message}`);
      readiness = { ready: true };
      setState((s) => ({ ...s, loading: false, error: error.message }));
    });
    return () => { current = false; };
  }, [active, reading, moment]);

  return state;
}
