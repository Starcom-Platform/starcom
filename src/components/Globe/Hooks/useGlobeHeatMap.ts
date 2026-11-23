/**
 * useGlobeHeatMap: the temperature heat map on the globe (decision D-W, WX1).
 *
 * While Earth Weather shows temperature, NOAA GFS 2 m temperature colours the
 * ground, blended by a shader (weather/heatMap.ts), in place of the station
 * dots. The data comes through the GFS client, which keeps to the protocol:
 * NOAA's bucket on AWS, PacIOOS only as the fallback, one request at a time,
 * nothing fetched twice, a reload within the hour asking nothing.
 *
 * It says what it draws everywhere a reader looks: the key (the ramp's stops,
 * what colour means, and the moment), the card's sources (the model and the
 * moment), the hover (the value under the pointer), and whenReady, which
 * waits for the field so a card is never cut before it is drawn.
 *
 * The moment is Earth Weather's (step 5a): the shared time cursor's while it
 * is paused, now while it is live, kept moving with the clock each minute.
 * It is drawn as the model's two steps around it, blended (WX10): a moment
 * that moves between the same steps moves a weight, and one that leaves them
 * loads the next two.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import { GfsClient, type GfsBlend, type GfsField, type GfsStatus } from '../../../services/weather/gfs/gfsClient';
import { gfsCacheStore } from '../../../services/weather/gfs/gfsCacheStore';
import { blendCovers } from '../../../services/weather/gfs/gfsBlend';
import { createHeatMapShell, temperatureColor, type HeatMapShell, type TemperatureUnit } from '../weather/heatMap';
import { noteDrawn, forgetDrawn } from '../weather/weatherDrawn';
import { weatherWhen, WEATHER_CLOCK_MS } from '../weather/weatherMoment';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { publishLegend, cssColorOf } from '../../../services/globe/globeLegendStore';
import { createLogger } from '@utils/logger';
import { groundField } from '../../../globe-engine/shellLift';
import { thenOf, useLayerRoot } from '../../../globe-engine/compareLayers';

const log = createLogger({ prefix: 'Globe:HeatMap' });

const LEGEND_KEY = 'EarthWeather:temperature';
const SCENE_POLL_MS = 100;
const SCENE_POLL_MAX_ATTEMPTS = 100;
/** How often a shown field asks whether a nearer hour or a newer run is out; the client keeps it cheap. */
const RECHECK_MS = 15 * 60e3;
/** The stops the key shows, as a weather report's scale does. */
const KEY_STOPS = [-40, -20, 0, 20, 40];

let sharedClient: GfsClient | null = null;
/** One client per page, so its one-request-at-a-time rule holds across every layer that uses GFS. */
export function gfsClient(): GfsClient {
  sharedClient ??= new GfsClient({
    fetch: (input, init) => fetch(input, init),
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: Math.random,
    cache: gfsCacheStore(),
  });
  return sharedClient;
}

/** What whenReady asks of the heat map: false while it is on and its field has not been drawn. */
// The globe's own, and a comparison's other moment's (D-CM, CM5): each copy its own wait.
const readinessOf: Record<'main' | 'then', { ready: boolean; why?: string }> = { main: { ready: true }, then: { ready: true } };
export function heatMapReadiness(): { ready: boolean; why?: string } {
  return readinessOf.main;
}
/** The same, for a comparison's other moment (D-CM, CM5). */
export function heatMapThenReadiness(): { ready: boolean; why?: string } {
  return readinessOf.then;
}

/** What a blended field is drawn for: where it came from, the moment, and the two hours blended (one for one step). */
export interface DrawnBlend {
  source: GfsField['source'];
  at: Date;
  hours: [Date, Date];
}

export const drawnBlend = (blend: GfsBlend, at: number): DrawnBlend => ({
  source: blend.before.source,
  at: new Date(at),
  hours: [blend.before.valid, blend.after.valid],
});

export interface HeatMapState {
  loading: boolean;
  error: string | null;
  /** The field drawn, when one is, and the moment it is drawn for. */
  field: DrawnBlend | null;
  /** What the client is doing, for the loader to say. */
  status: GfsStatus | null;
}

function unitLabel(celsius: number, unit: TemperatureUnit): string {
  if (unit === 'fahrenheit') return `${Math.round(celsius * 1.8 + 32)} °F`;
  if (unit === 'kelvin') return `${Math.round(celsius + 273.15)} K`;
  return `${celsius} °C`;
}

function publishHeatMapLegend(at: number, unit: TemperatureUnit): void {
  const color = new THREE.Color();
  publishLegend(LEGEND_KEY, {
    layerId: 'EarthWeather',
    // Named by what it shows, as Earth Weather draws more than one thing.
    layer: 'Temperature',
    when: weatherWhen(at, Date.now()),
    shapeMeans: 'the coloured ground',
    colorMeans: 'air temperature 2 m above the ground, NOAA GFS model',
    swatches: KEY_STOPS.map((c) => ({ color: cssColorOf(temperatureColor(c, color).getHex()), label: unitLabel(c, unit) })),
  });
}

interface UseGlobeHeatMapOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  /** Earth Weather is on and shows temperature. */
  active: boolean;
  unit?: TemperatureUnit;
  /** Earth Weather's moment: the shared cursor's while paused; null (or absent) while live, for now. */
  moment?: number | null;
  /** A comparison's other moment (D-CM, CM5): a copy of its own, named `EarthWeather@then`, its own wait, no key. */
  instance?: 'main' | 'then';
}

export function useGlobeHeatMap({ globeRef, active, unit = 'celsius', moment = null, instance = 'main' }: UseGlobeHeatMapOptions): HeatMapState {
  const main = instance === 'main';
  const [state, setState] = useState<HeatMapState>({ loading: false, error: null, field: null, status: null });
  // Drawn with the ground fields, under a raised territories shell (globe-engine/shellLift.ts).
  const groupRef = useRef(groundField(new THREE.Group()));
  const shellRef = useRef<HeatMapShell | null>(null);
  const blendRef = useRef<GfsBlend | null>(null);
  const unitRef = useRef(unit);
  unitRef.current = unit;
  const momentRef = useRef(moment);
  momentRef.current = moment;
  /** Set by the effect below while it runs: what to do when the moment moves. */
  const moveRef = useRef<(() => void) | null>(null);

  // Its objects, for a comparison side by side (D-CM, CM1).
  useLayerRoot(main ? 'EarthWeather' : thenOf('EarthWeather'), groupRef.current);
  useEffect(() => registerTooltipGroup(groupRef.current), []);

  useEffect(() => gfsClient().onStatus((status) => setState((s) => ({ ...s, status }))), []);

  // The unit changes the hover and the key, never the colours.
  useEffect(() => {
    shellRef.current?.setUnit(unit);
    if (main && active && blendRef.current) publishHeatMapLegend(momentRef.current ?? Date.now(), unit);
  }, [unit, active]);

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
      if (main) forgetDrawn('heat');
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
    readinessOf[instance] = covered() ? { ready: true } : { ready: false, why: 'the temperature field was still loading' };

    /** The moment's weight on the steps in hand, said in the key and the card's sources. */
    const show = () => {
      const blend = blendRef.current;
      if (!blend) return;
      shellRef.current?.setMoment(at());
      // What a clip sweeping the hours waits on, frame by frame (D-W, step 5c).
      if (main && shellRef.current) noteDrawn('heat', at());
      if (main) publishHeatMapLegend(at(), unitRef.current);
      setState((s) => ({ ...s, loading: false, error: null, field: drawnBlend(blend, at()) }));
    };

    let loading = false;
    let again = false;
    /** The two steps around the moment; again, if the moment left them while they loaded. */
    const load = async () => {
      if (loading) { again = true; return; }
      loading = true;
      setState((s) => ({ ...s, loading: !blendRef.current, error: null }));
      try {
        do {
          again = false;
          const target = at();
          const blend = await gfsClient().loadAround('tmp2m', target);
          if (disposed) return;
          blendRef.current = blend;
          if (shellRef.current) shellRef.current.setBlend(blend, at());
          else {
            shellRef.current = createHeatMapShell(blend, { unit: unitRef.current, at: at() });
            group.add(shellRef.current.mesh);
          }
          if (!covered()) again = true;
        } while (again);
        readinessOf[instance] = { ready: true };
        show();
      } catch (error) {
        if (disposed) return;
        const message = (error as Error).message;
        log.warn('Temperature field not loaded', message);
        // A card may be cut without the field once it has failed: the card's sources say why.
        readinessOf[instance] = { ready: true };
        setState((s) => ({ ...s, loading: false, error: message }));
      } finally {
        loading = false;
      }
    };

    moveRef.current = () => {
      if (covered()) { show(); return; }
      readinessOf[instance] = { ready: false, why: 'the temperature field for the moment shown was still loading' };
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
      if (++attempts >= SCENE_POLL_MAX_ATTEMPTS) { log.warn('Globe scene never became available; heat map not added'); return; }
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

  // Gone with the globe: the shell, its textures and its key.
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
