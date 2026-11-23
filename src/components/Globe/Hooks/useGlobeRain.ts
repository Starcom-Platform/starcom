/**
 * useGlobeRain: rain colours the ground (decision D-W, WX4; WX8).
 *
 * While Earth Weather's colour is rain, GFS's mean rain everywhere and
 * RainViewer's radar where radar reaches are drawn as one field
 * (weather/rainField.ts), in place of the heat map and the Open-Meteo rain
 * particles. Each comes through its own client, keeping its protocol.
 *
 * It says what it draws: the key (the scale, radar and model apart), the
 * card's sources (RainViewer's credit and link, NOAA's, and each one's time),
 * the hover (the rate, rain or snow, radar or model), and whenReady. Without
 * radar the model's rain is drawn alone and the card says the radar did not
 * load: rain is never held back for want of radar.
 *
 * It follows Earth Weather's moment as the heat map does (step 5a): the
 * model's two steps around it, blended (WX10). Radar is drawn only within
 * half an hour of its newest frame; at any other moment the model's rain
 * stands alone, and the card says why.
 */
import { sourceAllowed } from '../../../legal/buildProfile';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import type { GfsBlend } from '../../../services/weather/gfs/gfsClient';
import { gfsCacheStore } from '../../../services/weather/gfs/gfsCacheStore';
import { blendCovers, blendWeight } from '../../../services/weather/gfs/gfsBlend';
import { RainViewerClient, type RadarFrame } from '../../../services/weather/rainviewer/rainViewerClient';
import { drawnBlend, gfsClient, type DrawnBlend } from './useGlobeHeatMap';
import { composeRain, createRainShell, rainAt, rainPart, rainRgb, type RainFields, type RainShell } from '../weather/rainField';
import { gfsSourceLine } from '../weather/heatMap';
import { noteDrawn, forgetDrawn } from '../weather/weatherDrawn';
import { weatherWhen, WEATHER_CLOCK_MS } from '../weather/weatherMoment';
import { formatUtcTime } from '../../../utils/utcTime';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { publishLegend, cssColorOf } from '../../../services/globe/globeLegendStore';
import { createLogger } from '@utils/logger';
import { groundField } from '../../../globe-engine/shellLift';
import { thenOf, useLayerRoot } from '../../../globe-engine/compareLayers';

const log = createLogger({ prefix: 'Globe:Rain' });

const LEGEND_KEY = 'EarthWeather:rain';
const SCENE_POLL_MS = 100;
const SCENE_POLL_MAX_ATTEMPTS = 100;
/** Radar frames come every ten minutes: look for a newer one as often. */
const RECHECK_MS = 10 * 60e3;
const KEY_STOPS_MM = [0.1, 1, 5, 20, 70];
/** Radar is drawn for moments this close to its newest frame, and no others. */
const RADAR_NEAR_MS = 30 * 60e3;
/** RainViewer keeps two hours of frames: further from now than this, radar is not asked for. */
const RADAR_KEPT_MS = 2 * 3600e3;

export const RAIN_NOTE = 'Rain is radar where radar reaches, as of its time, and the GFS model\'s mean rain elsewhere, for the hour stated.';
export const RAIN_NOTE_SHORT = 'Radar rain where radar reaches; the model\'s elsewhere.';
export const RAIN_MODEL_NOTE = 'Rain is the GFS model\'s mean rain, for the hour stated. Radar is drawn only within half an hour of its newest frame.';
export const RAIN_MODEL_NOTE_SHORT = 'Rain is the model\'s; radar is drawn only near its newest frame.';

let sharedRadar: RainViewerClient | null = null;
function radarClient(): RainViewerClient {
  sharedRadar ??= new RainViewerClient({
    fetch: (input, init) => fetch(input, init),
    now: () => Date.now(),
    cache: gfsCacheStore(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  return sharedRadar;
}

// The globe's own, and a comparison's other moment's (D-CM, CM5): each copy its own wait.
const readinessOf: Record<'main' | 'then', { ready: boolean; why?: string }> = { main: { ready: true }, then: { ready: true } };
/** What whenReady asks of the rain: false while it is on and has not been drawn. */
export function rainReadiness(): { ready: boolean; why?: string } {
  return readinessOf.main;
}
/** The same, for a comparison's other moment (D-CM, CM5). */
export function rainThenReadiness(): { ready: boolean; why?: string } {
  return readinessOf.then;
}

export interface RainState {
  loading: boolean;
  /** The model's failure; the rain is not drawn without it. */
  error: string | null;
  /** The radar's failure; the model's rain is drawn alone. */
  radarError: string | null;
  /** The model's rain drawn, and the moment it is drawn for. */
  model: DrawnBlend | null;
  /** The radar frame drawn; null when none is. */
  radarTime: Date | null;
  /** The moment is not within half an hour of radar's newest frame, so the model's rain stands alone. */
  radarNotForMoment: boolean;
}

interface UseGlobeRainOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  /** Earth Weather is on and its colour is rain. */
  active: boolean;
  /** Earth Weather's moment: the shared cursor's while paused; null (or absent) while live, for now. */
  moment?: number | null;
  /** A comparison's other moment (D-CM, CM5): a copy of its own, named `EarthWeather@then`, its own wait, no key. */
  instance?: 'main' | 'then';
}

export function useGlobeRain({ globeRef, active, moment = null, instance = 'main' }: UseGlobeRainOptions): RainState {
  const main = instance === 'main';
  const [state, setState] = useState<RainState>({ loading: false, error: null, radarError: null, model: null, radarTime: null, radarNotForMoment: false });
  // Drawn with the ground fields, under a raised territories shell (globe-engine/shellLift.ts).
  const groupRef = useRef(groundField(new THREE.Group()));
  const shellRef = useRef<RainShell | null>(null);
  const blendRef = useRef<GfsBlend | null>(null);
  const fieldsRef = useRef<RainFields | null>(null);
  const radarRef = useRef<{ frame: RadarFrame | null; error: string | null }>({ frame: null, error: null });
  const drawnKeyRef = useRef('');
  const momentRef = useRef(moment);
  momentRef.current = moment;
  /** Set by the effect below while it runs: what to do when the moment moves. */
  const moveRef = useRef<(() => void) | null>(null);

  // Its objects, for a comparison side by side (D-CM, CM1).
  useLayerRoot(main ? 'EarthWeather' : thenOf('EarthWeather'), groupRef.current);
  useEffect(() => registerTooltipGroup(groupRef.current), []);

  // The moment moved: with the cursor, or, while live, with the clock each minute.
  useEffect(() => { moveRef.current?.(); }, [moment]);
  useEffect(() => {
    if (!active || moment !== null) return undefined;
    const clock = setInterval(() => moveRef.current?.(), WEATHER_CLOCK_MS);
    return () => clearInterval(clock);
  }, [active, moment]);

  useEffect(() => {
    const group = groupRef.current;
    if (!active) {
      group.visible = false;
      shellRef.current?.setShown(false);
      readinessOf[instance] = { ready: true };
      if (main) forgetDrawn('rain');
      if (main) publishLegend(LEGEND_KEY, null);
      return;
    }

    let disposed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let recheck: ReturnType<typeof setInterval> | null = null;
    group.visible = true;
    shellRef.current?.setShown(true);
    const at = () => momentRef.current ?? Date.now();
    const covered = () => blendRef.current !== null && blendCovers(blendRef.current, at());
    /** The radar frame in hand, when the moment is within half an hour of it. */
    const radarForMoment = () => {
      const frame = radarRef.current.frame;
      return frame && Math.abs(at() - frame.time.getTime()) <= RADAR_NEAR_MS ? frame : null;
    };
    readinessOf[instance] = covered() ? { ready: true } : { ready: false, why: 'the rain was still loading' };

    const read = (lat: number, lng: number) => {
      const blend = blendRef.current, fields = fieldsRef.current;
      if (!blend || !fields) return null;
      const { rate, source } = rainAt(fields, blendWeight(blend, at()), lat, lng);
      return rainPart(rate, source, radarForMoment()?.time ?? null, gfsSourceLine(blend, at()));
    };

    /**
     * Both steps' fields, each with the radar when it is for the moment, and
     * the moment's weight on them. Composed again only when the steps or the
     * radar drawn change: a moment moving between the same steps moves a weight.
     */
    const draw = () => {
      const blend = blendRef.current;
      if (!blend) return;
      const radar = radarForMoment();
      const key = `${blend.before.valid.toISOString()}|${blend.after.valid.toISOString()}|${radar?.time.toISOString() ?? 'none'}`;
      if (key !== drawnKeyRef.current || !shellRef.current) {
        const first = composeRain(blend.before, radar);
        const fields = { first, second: blend.after === blend.before ? first : composeRain(blend.after, radar) };
        fieldsRef.current = fields;
        if (shellRef.current) shellRef.current.setFields(fields.first, fields.second);
        else {
          shellRef.current = createRainShell({ ...fields, weight: blendWeight(blend, at()) }, read);
          group.add(shellRef.current.mesh);
        }
        drawnKeyRef.current = key;
      }
      shellRef.current.setWeight(blendWeight(blend, at()));
      // What a clip sweeping the hours waits on, frame by frame (D-W, step 5c).
      if (main) noteDrawn('rain', at());
      const when = weatherWhen(at(), Date.now());
      if (main) publishLegend(LEGEND_KEY, {
        layerId: 'EarthWeather',
        layer: 'Rain',
        when: radar ? `${when} (radar ${formatUtcTime(radar.time.getTime())})` : when,
        colorMeans: radar
          ? 'rain an hour: RainViewer radar where radar reaches, the NOAA GFS model elsewhere'
          : radarRef.current.error ? 'rain an hour, the NOAA GFS model (radar did not load)' : 'rain an hour, the NOAA GFS model',
        swatches: KEY_STOPS_MM.map((mm) => ({ color: cssColorOf(`#${rainRgb(mm).map((v) => v.toString(16).padStart(2, '0')).join('')}`), label: `${mm} mm/h` })),
      });
      setState({
        loading: false, error: null, radarError: radarRef.current.error, model: drawnBlend(blend, at()),
        // No radar, and none failed: the moment is not radar's.
        radarTime: radar?.time ?? null, radarNotForMoment: !radar && !radarRef.current.error,
      });
    };

    let loading = false;
    let again = false;
    /** The model's two steps around the moment, and radar's newest frame when it may be for the moment. */
    const load = async () => {
      if (loading) { again = true; return; }
      loading = true;
      setState((s) => ({ ...s, loading: !blendRef.current, error: null }));
      try {
        do {
          again = false;
          const target = at();
          const blend = await gfsClient().loadAround('prate', target);
          // RainViewer keeps two hours: a moment further from now than that is never radar's.
          // A commercial build has no radar: RainViewer's terms allow personal and educational use (D-CS, CS1).
          if (sourceAllowed('rainViewer') && Math.abs(target - Date.now()) <= RADAR_KEPT_MS) {
            try {
              radarRef.current = { frame: await radarClient().load(), error: null };
            } catch (e) {
              radarRef.current = { frame: null, error: (e as Error).message };
              log.warn('Radar not loaded; drawing the model\'s rain alone', radarRef.current.error);
            }
          } else {
            // Not asked for: no failure to report for this moment.
            radarRef.current = { ...radarRef.current, error: null };
          }
          if (disposed) return;
          blendRef.current = blend;
          if (!covered()) again = true;
        } while (again);
        readinessOf[instance] = { ready: true };
        draw();
      } catch (error) {
        if (disposed) return;
        const message = (error as Error).message;
        log.warn('Rain not loaded', message);
        readinessOf[instance] = { ready: true };
        setState((s) => ({ ...s, loading: false, error: message }));
      } finally {
        loading = false;
      }
    };

    moveRef.current = () => {
      if (covered()) { draw(); return; }
      readinessOf[instance] = { ready: false, why: 'the rain for the moment shown was still loading' };
      void load();
    };

    const attach = (scene: THREE.Scene) => {
      if (!scene.children.includes(group)) scene.add(group);
      void load();
      recheck = setInterval(() => { void load(); }, RECHECK_MS);
    };

    let attempts = 0;
    const poll = () => {
      if (disposed) return;
      const scene = globeRef.current?.scene?.();
      if (scene) { attach(scene); return; }
      if (++attempts >= SCENE_POLL_MAX_ATTEMPTS) { log.warn('Globe scene never became available; rain not added'); return; }
      pollTimer = setTimeout(poll, SCENE_POLL_MS);
    };
    poll();

    return () => {
      disposed = true;
      moveRef.current = null;
      if (pollTimer) clearTimeout(pollTimer);
      if (recheck) clearInterval(recheck);
    };
  }, [active, globeRef]);

  // Gone with the globe: the shell, its reader and its key.
  useEffect(() => () => {
    const group = groupRef.current;
    group.parent?.remove(group);
    shellRef.current?.dispose();
    shellRef.current = null;
    readinessOf[instance] = { ready: true };
    if (main) publishLegend(LEGEND_KEY, null);
  }, []);

  return state;
}
