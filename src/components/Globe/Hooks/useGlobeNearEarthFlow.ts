/**
 * useGlobeNearEarthFlow: the solar wind streaming past the magnetosphere, now (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW6, SW7, SW17).
 *
 * From the wind T96 is driven by (read by useGlobeFieldLines): particles stream from the Sun past the
 * Earth along streamlines parting round the magnetosphere, which stands off at T96's own magnetopause
 * nose for the wind's pressure (spaceWeather/nearEarthFlow.ts); at the wind's measured speed, sped up,
 * in the colour of the IMF's measured polarity, brighter in the magnetosheath. Not the hindcast: the
 * wind now. A still replays the flow at its own moment.
 *
 * It says what it draws: the key, whenReady (which waits for the drivers' first reading), and the notes
 * a card's sources carry (nearEarthFlowNotes): the wind measured now, the flow's shape a model.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import type { T96DriverReading } from '../../../services/spaceWeather/t96Drivers';
import { recalc } from '../../../services/spaceWeather/geopack/geopack';
import { polarityOf } from '../../../services/spaceWeather/heliosphere';
import { magnetopauseNoseRe } from '../spaceWeather/cusps';
import { createNearEarthFlowParticles, flowPaths, flowReSecond, type NearEarthFlowParticles } from '../spaceWeather/nearEarthFlowParticles';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import { DATA_SCALES } from '../../../styles/tokens';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { onStill, phaseSeconds } from '../../../globe-engine/captureClock';
import { createLogger } from '@utils/logger';
import { useLayerRoot } from '../../../globe-engine/compareLayers';

const log = createLogger({ prefix: 'Globe:NearEarthFlow' });

const LEGEND_KEY = 'SpaceWeather:nearEarthFlow';
const SCENE_POLL_MS = 100;
const SCENE_POLL_MAX_ATTEMPTS = 100;
const FRAME_STEP_MS = 15 * 60_000;
/** How far the nose must move before the streamlines are worked out again, Re. */
const RESHAPE_RE = 0.3;
const QUIET_WIND_KM_S = 400;

let readiness: { ready: boolean; why?: string } = { ready: true };
/** What whenReady asks of the flow: false while it is on and the wind has not been read. */
export function nearEarthFlowReadiness(): { ready: boolean; why?: string } {
  return readiness;
}

/** What a card's sources say of the flow near the Earth. */
export function nearEarthFlowNotes(reading: T96DriverReading): { note: string; noteShort: string } {
  const at = reading.wind ? ` measured at ${formatUtcDateTime(Date.parse(reading.wind.observed))}` : '';
  return {
    note: `The solar wind near the Earth is the wind${at}, at its speed sped up about 64 times, coloured by its field's polarity; the way it parts round the magnetosphere is a model (potential flow round T96's magnetopause), and its brightening, the magnetosheath behind the bow shock.`,
    noteShort: 'Solar wind near the Earth: the wind now; its flow round the magnetosphere a model.',
  };
}

export interface NearEarthFlowState { drawn: boolean; standoffRe: number | null }

interface UseGlobeNearEarthFlowOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  active: boolean;
  /** The moment the globe shows, ms: GSM's turn into the scene. */
  atMs: number;
  /** The wind, as the field lines read it; nothing is drawn until there is some. */
  reading: T96DriverReading | null;
}

export function useGlobeNearEarthFlow({ globeRef, active, atMs, reading }: UseGlobeNearEarthFlowOptions): NearEarthFlowState {
  const [state, setState] = useState<NearEarthFlowState>({ drawn: false, standoffRe: null });
  const particlesRef = useRef<NearEarthFlowParticles | null>(null);
  const groupRef = useRef((() => { const g = new THREE.Group(); g.name = 'near-earth-flow-layer'; return g; })());
  // Space Weather's, side by side (D-CM): the layer is tagged whole, every piece of it.
  useLayerRoot('SpaceWeather', groupRef.current);
  const paceRef = useRef(flowReSecond(QUIET_WIND_KM_S));
  paceRef.current = flowReSecond(reading?.wind?.speed ?? QUIET_WIND_KM_S);
  const moment = Math.floor(atMs / FRAME_STEP_MS) * FRAME_STEP_MS;
  const standoff = reading ? magnetopauseNoseRe(reading.drivers.pdyn) : null;
  // The nose, to RESHAPE_RE: a small change in the wind keeps the streamlines.
  const shape = standoff === null ? null : Math.round(standoff / RESHAPE_RE) * RESHAPE_RE;
  const color = reading?.wind ? DATA_SCALES.solarWind[polarityOf(reading.wind.bx, reading.wind.by) > 0 ? 'away' : 'toward'] : DATA_SCALES.solarWind.away;

  // The group in the scene, the flow running, while on.
  useEffect(() => {
    if (!active) {
      readiness = { ready: true };
      publishLegend(LEGEND_KEY, null);
      setState({ drawn: false, standoffRe: null });
      return undefined;
    }
    const group = groupRef.current;
    let disposed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let frame: number | null = null;
    let held = false;
    readiness = { ready: false, why: 'the solar wind near the Earth was still being read' };
    const animate = (now: number) => {
      if (disposed) return;
      if (!held) particlesRef.current?.place(now / 1000, paceRef.current);
      frame = requestAnimationFrame(animate);
    };
    const leaveStill = onStill({
      still: (at) => { held = true; particlesRef.current?.place(phaseSeconds(at), paceRef.current); },
      release: () => { held = false; },
    });
    let attempts = 0;
    const poll = () => {
      if (disposed) return;
      const scene = globeRef.current?.scene?.();
      if (scene) { if (!scene.children.includes(group)) scene.add(group); frame = requestAnimationFrame(animate); return; }
      if (++attempts >= SCENE_POLL_MAX_ATTEMPTS) { log.warn('Globe scene never became available; near-Earth flow not added'); readiness = { ready: true }; return; }
      pollTimer = setTimeout(poll, SCENE_POLL_MS);
    };
    poll();
    return () => {
      disposed = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (frame !== null) cancelAnimationFrame(frame);
      leaveStill();
      if (particlesRef.current) { group.remove(particlesRef.current.object); particlesRef.current.dispose(); particlesRef.current = null; }
      group.parent?.remove(group);
      publishLegend(LEGEND_KEY, null);
      readiness = { ready: true };
    };
  }, [active, globeRef]);

  // The streamlines for the nose the wind sets.
  useEffect(() => {
    if (!active || shape === null) return;
    const group = groupRef.current;
    if (particlesRef.current) { group.remove(particlesRef.current.object); particlesRef.current.dispose(); }
    particlesRef.current = createNearEarthFlowParticles(flowPaths(shape), color);
    particlesRef.current.setFrame(recalc(moment / 1000));
    particlesRef.current.place(performance.now() / 1000, paceRef.current);
    group.add(particlesRef.current.object);
    readiness = { ready: true };
    setState({ drawn: true, standoffRe: shape });
    // The frame and colour are kept current by the effects below; the streamlines only by the nose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, shape]);

  useEffect(() => { particlesRef.current?.setFrame(recalc(moment / 1000)); }, [moment, state.drawn]);
  useEffect(() => { particlesRef.current?.setColor(color); }, [color, state.drawn]);

  // The key, while drawn.
  useEffect(() => {
    if (!active || !state.drawn || !reading) return;
    publishLegend(LEGEND_KEY, {
      layerId: 'SpaceWeather',
      layer: 'Solar wind near the Earth',
      when: reading.wind ? `measured ${formatUtcDateTime(Date.parse(reading.wind.observed))}` : 'quiet values',
      shapeMeans: 'particles streaming past the magnetosphere, parting round it, brighter in the magnetosheath behind the bow shock',
      colorMeans: 'the IMF\'s direction now: away from the Sun, or toward it',
      swatches: [
        { color: DATA_SCALES.solarWind.away, label: 'away', shape: 'glow' },
        { color: DATA_SCALES.solarWind.toward, label: 'toward', shape: 'glow' },
      ],
    });
  }, [active, state.drawn, reading]);

  return state;
}
