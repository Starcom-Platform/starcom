/**
 * useGlobeVanAllenBelts: the Van Allen belts on the globe (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW5).
 *
 * While Space Weather shows them, the ≥2 MeV electron flux GOES measures is read, and the belts are
 * drawn round the dipole's axis for the hour shown (spaceWeather/vanAllenBelts.ts): the outer belt
 * brightened by that flux, the inner at a typical brightness. They fade in as the camera draws back,
 * so they never fog the globe from inside.
 *
 * It says what it draws where a reader looks: the key, whenReady (which waits for the first reading,
 * or its failure), and the notes a card's sources carry (vanAllenNotes): a dipole's shape, and what
 * brightened it.
 */
import { useEffect, useRef, useState } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import { recalc } from '../../../services/spaceWeather/geopack/geopack';
import { createVanAllenBelts, GOES_ELECTRONS_URL, outerBeltGain, parseGoesElectrons, type GoesElectrons, type VanAllenBelts } from '../spaceWeather/vanAllenBelts';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import { DATA_SCALES } from '../../../styles/tokens';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { createLogger } from '@utils/logger';
import { registerLayerRoot } from '../../../globe-engine/compareLayers';

const log = createLogger({ prefix: 'Globe:VanAllen' });

const LEGEND_KEY = 'SpaceWeather:vanAllen';
const SCENE_POLL_MS = 100;
const SCENE_POLL_MAX_ATTEMPTS = 100;
/** The dipole's axis turns over years; an hour is close enough. */
const AXIS_STEP_MS = 3_600_000;
/** GOES is read no more often than this, minutes: a reading every five. */
const MIN_REFRESH_MINUTES = 15;
/** The outer belt's brightness when GOES cannot be read: a typical flux, pfu. */
const TYPICAL_PFU = 300;

let readiness: { ready: boolean; why?: string } = { ready: true };
/** What whenReady asks of the belts: false while they are on and GOES has not yet answered. */
export function vanAllenReadiness(): { ready: boolean; why?: string } {
  return readiness;
}

/** What a card's sources say of the belts, for the electrons read (or none). */
export function vanAllenNotes(electrons: GoesElectrons | null): { note: string; noteShort: string } {
  const outer = electrons
    ? `the outer is brightened by the flux of ≥2 MeV electrons GOES-${electrons.satellite} measured at geostationary orbit, its outer edge (${Math.round(electrons.flux)} pfu at ${formatUtcDateTime(Date.parse(electrons.at))})`
    : 'the outer is drawn at a typical brightness: GOES could not be read';
  return {
    note: `The Van Allen belts are drawn in a dipole's shape round the magnetic axis; ${outer}; the inner at a typical brightness. They show where the belts are, not a measure of them.`,
    noteShort: electrons ? 'Van Allen belts: a dipole\'s shape, the outer brightened by GOES\'s electrons.' : 'Van Allen belts: a dipole\'s shape, at a typical brightness.',
  };
}

export interface VanAllenState {
  drawn: boolean;
  loading: boolean;
  error: string | null;
  electrons: GoesElectrons | null;
}

interface UseGlobeVanAllenBeltsOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  /** Space Weather is on and shows the belts. */
  active: boolean;
  /** The moment the globe shows, ms. */
  atMs: number;
  /** Steps marched a pixel: fewer on a weaker device (SW10). */
  steps: number;
  /** How often GOES is read again, minutes, no more often than every 15; 0 for once. */
  refreshMinutes: number;
  fetchImpl?: typeof fetch;
}

async function readElectrons(fetchImpl: typeof fetch): Promise<GoesElectrons> {
  const res = await fetchImpl(GOES_ELECTRONS_URL);
  if (!res.ok) throw new Error(`GOES answered ${res.status}`);
  const reading = parseGoesElectrons(await res.json());
  if (!reading) throw new Error('GOES held no ≥2 MeV reading');
  return reading;
}

export function useGlobeVanAllenBelts({ globeRef, active, atMs, steps, refreshMinutes, fetchImpl }: UseGlobeVanAllenBeltsOptions): VanAllenState {
  const [state, setState] = useState<VanAllenState>({ drawn: false, loading: false, error: null, electrons: null });
  const beltsRef = useRef<VanAllenBelts | null>(null);
  const fetchRef = useRef(fetchImpl);
  fetchRef.current = fetchImpl;
  const hour = Math.floor(atMs / AXIS_STEP_MS) * AXIS_STEP_MS;
  const hourRef = useRef(hour);
  hourRef.current = hour;

  // The belts in the scene, and GOES read, while on.
  useEffect(() => {
    if (!active) {
      readiness = { ready: true };
      publishLegend(LEGEND_KEY, null);
      setState({ drawn: false, loading: false, error: null, electrons: null });
      return undefined;
    }
    const belts = createVanAllenBelts({ steps });
    // Space Weather's, side by side (D-CM), while it stands.
    const untag = registerLayerRoot('SpaceWeather', belts.object);
    beltsRef.current = belts;
    belts.setAxis(recalc(hourRef.current / 1000).axis);
    let disposed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    readiness = { ready: false, why: 'GOES\'s electron flux was still being read' };
    setState((s) => ({ ...s, loading: true, error: null }));

    const key = (electrons: GoesElectrons | null) => publishLegend(LEGEND_KEY, {
      layerId: 'SpaceWeather',
      layer: 'Van Allen belts',
      when: electrons ? `GOES-${electrons.satellite}'s ≥2 MeV electrons, ${formatUtcDateTime(Date.parse(electrons.at))}` : 'a typical brightness',
      shapeMeans: 'a glow round the magnetic equator, seen as the camera draws back',
      colorMeans: 'the outer belt, electrons, brightened by the flux GOES measures; the inner, protons, at a typical brightness',
      swatches: [
        { color: DATA_SCALES.vanAllen.outer, label: 'outer belt', shape: 'glow' },
        { color: DATA_SCALES.vanAllen.inner, label: 'inner belt', shape: 'glow' },
      ],
    });
    const read = async () => {
      try {
        const electrons = await readElectrons(fetchRef.current ?? fetch);
        if (disposed) return;
        belts.setOuterGain(outerBeltGain(electrons.flux));
        key(electrons);
        setState({ drawn: true, loading: false, error: null, electrons });
      } catch (error) {
        if (disposed) return;
        log.warn(`GOES's electrons could not be read: ${(error as Error).message}`);
        belts.setOuterGain(outerBeltGain(TYPICAL_PFU));
        key(null);
        setState({ drawn: true, loading: false, error: (error as Error).message, electrons: null });
      }
      readiness = { ready: true };
    };
    let attempts = 0;
    const poll = () => {
      if (disposed) return;
      const scene = globeRef.current?.scene?.();
      if (scene) { scene.add(belts.object); void read(); return; }
      if (++attempts >= SCENE_POLL_MAX_ATTEMPTS) { log.warn('Globe scene never became available; belts not added'); readiness = { ready: true }; return; }
      pollTimer = setTimeout(poll, SCENE_POLL_MS);
    };
    poll();
    const minutes = refreshMinutes > 0 ? Math.max(refreshMinutes, MIN_REFRESH_MINUTES) : 0;
    const timer = minutes > 0 ? setInterval(() => { void read(); }, minutes * 60_000) : null;
    return () => {
      disposed = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (timer) clearInterval(timer);
      untag();
      belts.object.parent?.remove(belts.object);
      belts.dispose();
      beltsRef.current = null;
      publishLegend(LEGEND_KEY, null);
      readiness = { ready: true };
    };
  }, [active, globeRef, steps, refreshMinutes]);

  // The dipole's axis for the hour shown.
  useEffect(() => {
    beltsRef.current?.setAxis(recalc(hour / 1000).axis);
  }, [hour]);

  return state;
}
