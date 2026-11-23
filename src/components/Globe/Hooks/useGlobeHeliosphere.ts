/**
 * useGlobeHeliosphere: the solar wind from the Sun to the Earth on the globe, as it was (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW6, SW7, SW16, SW17).
 *
 * While Space Weather shows it, NOAA's 7 days of measured wind are read (hourly), the hindcast moment
 * found, each measured minute made a source on the turning Sun (services/spaceWeather/heliosphere.ts),
 * and their particles drawn streaming out along the spiral (spaceWeather/heliosphereParticles.ts), in
 * the Sun-Earth frame aligned to the Sun as drawn, at the solar system's compressed distances. The flow
 * runs on the clock, sped up; a still holds it at its own moment.
 *
 * It says what it draws: the key, with the hindcast's moment; whenReady, which waits for the wind; and
 * the notes a card's sources carry (heliosphereNotes): a hindcast, its assumptions, and its scale.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import { fetchWindHistory, hindcastMoment, windSources, type WindMinute } from '../../../services/spaceWeather/heliosphere';
import { createHeliosphereParticles, eclipticPoleAt, sunEarthBasis, FLOW_DAYS_PER_SECOND, type HeliosphereParticles } from '../spaceWeather/heliosphereParticles';
import { skyFrame } from '../../../solar-system/bodyPlacement';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import { DATA_SCALES } from '../../../styles/tokens';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { onStill, phaseSeconds } from '../../../globe-engine/captureClock';
import { createLogger } from '@utils/logger';
import { registerLayerRoot } from '../../../globe-engine/compareLayers';

const log = createLogger({ prefix: 'Globe:Heliosphere' });

const LEGEND_KEY = 'SpaceWeather:heliosphere';
const SCENE_POLL_MS = 100;
const SCENE_POLL_MAX_ATTEMPTS = 100;
/** The 7 days of wind (314 KB, gzipped) are read no more often than this, minutes: the hindcast moves by the hour. */
const MIN_REFRESH_MINUTES = 60;

let readiness: { ready: boolean; why?: string } = { ready: true };
/** What whenReady asks of the stream: false while it is on and the 7 days of wind have not been read. */
export function heliosphereReadiness(): { ready: boolean; why?: string } {
  return readiness;
}

/** What a card's sources say of the stream, for its hindcast moment. */
export function heliosphereNotes(moment: number): { note: string; noteShort: string } {
  return {
    note: `The solar wind from the Sun to the Earth is a hindcast: the stream as it was at ${formatUtcDateTime(moment)}, each parcel from the wind NOAA measured at L1 since, traced back to the Sun on two assumptions, that it kept its speed and that the wind's pattern turned with the Sun. Drawn at the solar system's compressed distances, its flow sped up.`,
    noteShort: `Solar wind: a hindcast, as it was at ${formatUtcDateTime(moment)}.`,
  };
}

export interface HeliosphereState {
  drawn: boolean;
  loading: boolean;
  error: string | null;
  /** The hindcast's moment, ms, and when the newest minute of wind reached the Earth. */
  moment: number | null;
  lastArrival: number | null;
}

interface UseGlobeHeliosphereOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  active: boolean;
  /** The moment the globe shows, ms: its sky frame turns the ecliptic into the scene. */
  atMs: number;
  /** Toward the Sun as drawn, in the scene's frame. */
  sunDirection: THREE.Vector3;
  /** How often the wind is read again, minutes, no more often than hourly; 0 for once. */
  refreshMinutes: number;
  fetchImpl?: typeof fetch;
}

export function useGlobeHeliosphere({ globeRef, active, atMs, sunDirection, refreshMinutes, fetchImpl }: UseGlobeHeliosphereOptions): HeliosphereState {
  const [state, setState] = useState<HeliosphereState>({ drawn: false, loading: false, error: null, moment: null, lastArrival: null });
  const particlesRef = useRef<HeliosphereParticles | null>(null);
  const fetchRef = useRef(fetchImpl);
  fetchRef.current = fetchImpl;
  const frameRef = useRef({ atMs, sunDirection });
  frameRef.current = { atMs, sunDirection };
  const hour = Math.floor(atMs / 3_600_000);

  useEffect(() => {
    if (!active) {
      readiness = { ready: true };
      publishLegend(LEGEND_KEY, null);
      setState({ drawn: false, loading: false, error: null, moment: null, lastArrival: null });
      return undefined;
    }
    const group = new THREE.Group();
    // Space Weather's, side by side (D-CM), while it stands.
    const untag = registerLayerRoot('SpaceWeather', group);
    group.name = 'heliosphere';
    let disposed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let frame: number | null = null;
    readiness = { ready: false, why: 'the 7 days of solar wind were still being read' };
    setState((s) => ({ ...s, loading: true, error: null }));
    const align = () => {
      const { atMs: at, sunDirection: sun } = frameRef.current;
      particlesRef.current?.setBasis(sunEarthBasis(sun, eclipticPoleAt(skyFrame(new Date(at)))));
    };
    const draw = (minutes: WindMinute[]) => {
      const moment = hindcastMoment(minutes)!;
      if (particlesRef.current) { group.remove(particlesRef.current.object); particlesRef.current.dispose(); }
      particlesRef.current = createHeliosphereParticles(windSources(minutes, moment), DATA_SCALES.solarWind);
      group.add(particlesRef.current.object);
      align();
      publishLegend(LEGEND_KEY, {
        layerId: 'SpaceWeather',
        layer: 'Solar wind',
        when: `a hindcast: as it was at ${formatUtcDateTime(moment)}`,
        shapeMeans: 'particles streaming out from the Sun along the spiral its turning winds them into, each at the speed measured at L1; seen as the camera draws back to the Sun',
        colorMeans: 'the IMF\'s direction: away from the Sun, or toward it',
        swatches: [
          { color: DATA_SCALES.solarWind.away, label: 'away', shape: 'glow' },
          { color: DATA_SCALES.solarWind.toward, label: 'toward', shape: 'glow' },
        ],
      });
      readiness = { ready: true };
      setState({ drawn: true, loading: false, error: null, moment, lastArrival: minutes[minutes.length - 1].arrive });
    };
    const read = async () => {
      try {
        const minutes = await fetchWindHistory(fetchRef.current ?? fetch);
        if (!disposed) draw(minutes);
      } catch (error) {
        if (disposed) return;
        log.warn(`The 7 days of solar wind could not be read: ${(error as Error).message}`);
        readiness = { ready: true };
        setState((s) => ({ ...s, loading: false, error: (error as Error).message }));
      }
    };
    let held = false;
    const animate = (now: number) => {
      if (disposed) return;
      if (!held) particlesRef.current?.setFlow((now / 1000) * FLOW_DAYS_PER_SECOND);
      frame = requestAnimationFrame(animate);
    };
    const leaveStill = onStill({
      still: (at) => { held = true; particlesRef.current?.setFlow(phaseSeconds(at) * FLOW_DAYS_PER_SECOND); },
      release: () => { held = false; },
    });
    let attempts = 0;
    const poll = () => {
      if (disposed) return;
      const scene = globeRef.current?.scene?.();
      if (scene) { scene.add(group); frame = requestAnimationFrame(animate); void read(); return; }
      if (++attempts >= SCENE_POLL_MAX_ATTEMPTS) { log.warn('Globe scene never became available; solar wind not added'); readiness = { ready: true }; return; }
      pollTimer = setTimeout(poll, SCENE_POLL_MS);
    };
    poll();
    const minutes = refreshMinutes > 0 ? Math.max(refreshMinutes, MIN_REFRESH_MINUTES) : 0;
    const timer = minutes > 0 ? setInterval(() => { void read(); }, minutes * 60_000) : null;
    return () => {
      disposed = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (timer) clearInterval(timer);
      if (frame !== null) cancelAnimationFrame(frame);
      leaveStill();
      if (particlesRef.current) { group.remove(particlesRef.current.object); particlesRef.current.dispose(); particlesRef.current = null; }
      untag();
      group.parent?.remove(group);
      publishLegend(LEGEND_KEY, null);
      readiness = { ready: true };
    };
  }, [active, globeRef, refreshMinutes]);

  // The frame follows the Sun as drawn, and the sky's turn for the hour shown.
  useEffect(() => {
    particlesRef.current?.setBasis(sunEarthBasis(sunDirection, eclipticPoleAt(skyFrame(new Date(hour * 3_600_000)))));
  }, [sunDirection, hour]);

  return state;
}
