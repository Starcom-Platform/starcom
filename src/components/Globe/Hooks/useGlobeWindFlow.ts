/**
 * useGlobeWindFlow: the wind as flowing streaks (decision D-W, WX3).
 *
 * While Earth Weather shows wind, NOAA GFS 10 m wind moves particles across
 * the globe on the GPU (weather/windFlow.ts), in place of the Open-Meteo wind
 * cones. The components come through the shared GFS client, so the
 * protocol's rules hold: one request at a time, nothing fetched twice.
 *
 * It says what it draws where a reader looks: the key, the card's sources
 * (the model, the hour, NOAA's credit, and that the streaks' pace is sped
 * up), the hover (speed and where the wind comes from, with the temperature
 * when the heat map is on), and whenReady. A still settles the particles
 * from its own moment, so the same shot draws the same streaks.
 *
 * It follows Earth Weather's moment as the heat map does (step 5a): the
 * particles move by the model's two steps around it, blended (WX10).
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import type { GfsBlend, GfsStatus } from '../../../services/weather/gfs/gfsClient';
import { blendCovers, blendWeight } from '../../../services/weather/gfs/gfsBlend';
import { drawnBlend, gfsClient, type DrawnBlend } from './useGlobeHeatMap';
import { createWindFlow, WindFlowUnsupported, type WindFlow } from '../weather/windFlow';
import { windAtBlend, windReading, windTexture, type WindUnit } from '../weather/windField';
import { noteDrawn, forgetDrawn } from '../weather/weatherDrawn';
import { weatherWhen, WEATHER_CLOCK_MS } from '../weather/weatherMoment';
import { gfsSourceLine } from '../weather/heatMap';
import { answerHoversAsSphere, setWeatherReader } from '../weather/weatherReadout';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { publishLegend, cssColorOf } from '../../../services/globe/globeLegendStore';
import { getGlobeQuality, subscribeGlobeQuality } from '../../../services/globe/globeQuality';
import { onStill } from '../../../globe-engine/captureClock';
import { WIND_FLOW } from '../globeAltitudes';
import { GUNMETAL } from '../../../styles/tokens';
import { createLogger } from '@utils/logger';
import { groundField } from '../../../globe-engine/shellLift';
import { thenOf, useLayerRoot } from '../../../globe-engine/compareLayers';

const log = createLogger({ prefix: 'Globe:WindFlow' });

const LEGEND_KEY = 'EarthWeather:wind';
const SCENE_POLL_MS = 100;
const SCENE_POLL_MAX_ATTEMPTS = 100;
const RECHECK_MS = 15 * 60e3;
/** Particles per side of the state texture, by quality step: 16,384 at full detail down to 4,096. */
const SIDE_BY_STEP = [128, 96, 64, 64];
/** How long a still lets the particles run from their seed before it is drawn, so streaks have formed. */
const STILL_SETTLE_STEPS = 45;

export const WIND_STREAK_NOTE = "The wind streaks' pace is sped up for viewing; their direction and relative speed are the model's.";
export const WIND_STREAK_NOTE_SHORT = 'Wind streaks are sped up; their direction is the model\'s.';

// The globe's own, and a comparison's other moment's (D-CM, CM5): each copy its own wait.
const readinessOf: Record<'main' | 'then', { ready: boolean; why?: string }> = { main: { ready: true }, then: { ready: true } };
/** What whenReady asks of the wind: false while it is on and its streaks have not been drawn. */
export function windFlowReadiness(): { ready: boolean; why?: string } {
  return readinessOf.main;
}
/** The same, for a comparison's other moment (D-CM, CM5). */
export function windFlowThenReadiness(): { ready: boolean; why?: string } {
  return readinessOf.then;
}

export interface WindFlowState {
  loading: boolean;
  error: string | null;
  /** The wind drawn, when it is, and the moment it is drawn for. */
  field: DrawnBlend | null;
  status: GfsStatus | null;
}

interface UseGlobeWindFlowOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  /** Earth Weather is on and shows wind. */
  active: boolean;
  unit?: WindUnit;
  /** Earth Weather's moment: the shared cursor's while paused; null (or absent) while live, for now. */
  moment?: number | null;
  /** A comparison's other moment (D-CM, CM5): a copy of its own, named `EarthWeather@then`, its own wait, no key. */
  instance?: 'main' | 'then';
}

export function useGlobeWindFlow({ globeRef, active, unit = 'kmh', moment = null, instance = 'main' }: UseGlobeWindFlowOptions): WindFlowState {
  const main = instance === 'main';
  const [state, setState] = useState<WindFlowState>({ loading: false, error: null, field: null, status: null });
  // Drawn with the ground fields, under a raised territories shell (globe-engine/shellLift.ts).
  const groupRef = useRef(groundField(new THREE.Group()));
  const flowRef = useRef<WindFlow | null>(null);
  const texturesRef = useRef<{ first: THREE.Texture; second: THREE.Texture } | null>(null);
  const blendsRef = useRef<{ u: GfsBlend; v: GfsBlend } | null>(null);
  const unitRef = useRef(unit);
  unitRef.current = unit;
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
      setWeatherReader('wind', null);
      readinessOf[instance] = { ready: true };
      if (main) forgetDrawn('wind');
      if (main) publishLegend(LEGEND_KEY, null);
      return;
    }

    let disposed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let recheck: ReturnType<typeof setInterval> | null = null;
    let frame: number | null = null;
    let leaveStill: (() => void) | null = null;
    let unsubscribeQuality: (() => void) | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let builtSide = 0;
    group.visible = true;
    const at = () => momentRef.current ?? Date.now();
    const covered = () => blendsRef.current !== null && blendCovers(blendsRef.current.u, at());
    readinessOf[instance] = covered() ? { ready: true } : { ready: false, why: 'the wind field was still loading' };

    const reader = (lat: number, lng: number) => {
      const blends = blendsRef.current;
      if (!blends) return null;
      const wind = windAtBlend(blends.u, blends.v, blendWeight(blends.u, at()), lat, lng);
      return wind ? { value: windReading(wind, unitRef.current), source: gfsSourceLine(blends.u, at()) } : null;
    };
    // Back on: what was loaded is read out again at once.
    if (blendsRef.current) setWeatherReader('wind', reader);

    /** The flow at the quality step's size, built again when the step changes it. */
    const build = () => {
      if (!renderer || !texturesRef.current) return;
      const side = SIDE_BY_STEP[Math.min(getGlobeQuality().step, SIDE_BY_STEP.length - 1)];
      if (flowRef.current && side === builtSide) return;
      if (flowRef.current) {
        group.remove(flowRef.current.object);
        flowRef.current.dispose();
        flowRef.current = null;
      }
      try {
        const weight = blendsRef.current ? blendWeight(blendsRef.current.u, at()) : 0;
        const flow = createWindFlow(renderer, { ...texturesRef.current, weight }, { side, radiusFraction: WIND_FLOW });
        answerHoversAsSphere(flow.object, 100 * WIND_FLOW);
        group.add(flow.object);
        flowRef.current = flow;
        builtSide = side;
      } catch (error) {
        const message = error instanceof WindFlowUnsupported ? error.message : `The wind flow could not be built: ${(error as Error).message}`;
        log.warn(message);
        readinessOf[instance] = { ready: true };
        setState((s) => ({ ...s, loading: false, error: message }));
      }
    };

    /** The moment's weight on the steps in hand, said in the key and the card's sources. */
    const show = () => {
      const blends = blendsRef.current;
      if (!blends) return;
      flowRef.current?.setWeight(blendWeight(blends.u, at()));
      // What a clip sweeping the hours waits on, frame by frame (D-W, step 5c).
      if (main && flowRef.current) noteDrawn('wind', at());
      if (main) publishLegend(LEGEND_KEY, {
        layerId: 'EarthWeather',
        layer: 'Wind',
        when: weatherWhen(at(), Date.now()),
        shapeMeans: 'streaks moving with the wind',
        sizeMeans: 'a longer, brighter streak is a stronger wind',
        swatches: [{ color: cssColorOf(GUNMETAL[100]), label: 'wind 10 m above the ground, NOAA GFS model' }],
      });
      setState((s) => ({ ...s, loading: false, error: s.error, field: drawnBlend(blends.u, at()) }));
    };

    let loading = false;
    let again = false;
    /** The two steps around the moment, for both components; again, if the moment left them while they loaded. */
    const load = async () => {
      if (loading) { again = true; return; }
      loading = true;
      setState((s) => ({ ...s, loading: !blendsRef.current, error: null }));
      try {
        do {
          again = false;
          // One moment for both components: the cursor may move between the two loads.
          const target = at();
          const u = await gfsClient().loadAround('u10', target);
          const v = await gfsClient().loadAround('v10', target);
          if (disposed) return;
          if (u.before.valid.getTime() !== v.before.valid.getTime() || u.after.valid.getTime() !== v.after.valid.getTime()) {
            throw new Error('the two wind components came for different hours');
          }
          blendsRef.current = { u, v };
          const old = texturesRef.current;
          const first = windTexture(u.before, v.before);
          texturesRef.current = { first, second: u.after === u.before ? first : windTexture(u.after, v.after) };
          if (old) {
            old.first.dispose();
            if (old.second !== old.first) old.second.dispose();
          }
          if (flowRef.current) flowRef.current.setWind(texturesRef.current.first, texturesRef.current.second);
          else build();
          if (!covered()) again = true;
        } while (again);
        setWeatherReader('wind', reader);
        if (flowRef.current) readinessOf[instance] = { ready: true };
        show();
      } catch (error) {
        if (disposed) return;
        const message = (error as Error).message;
        log.warn('Wind field not loaded', message);
        readinessOf[instance] = { ready: true };
        setState((s) => ({ ...s, loading: false, error: message }));
      } finally {
        loading = false;
      }
    };

    moveRef.current = () => {
      if (covered()) { show(); return; }
      readinessOf[instance] = { ready: false, why: 'the wind field for the moment shown was still loading' };
      void load();
    };

    const attach = (scene: THREE.Scene) => {
      renderer = (globeRef.current as unknown as { renderer?: () => THREE.WebGLRenderer } | undefined)?.renderer?.() ?? null;
      if (!scene.children.includes(group)) scene.add(group);
      unsubscribeQuality = subscribeGlobeQuality(build);
      let last = performance.now();
      const animate = (now: number) => {
        if (disposed) return;
        flowRef.current?.step((now - last) / 1000);
        last = now;
        frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
      // A still settles the particles from its own moment: the same shot, the same streaks (IM19, IM23).
      leaveStill = onStill({
        still: (atMs) => { flowRef.current?.settle(atMs / 1000, STILL_SETTLE_STEPS); },
        release: () => undefined,
      });
      void load();
      recheck = setInterval(() => { void load(); }, RECHECK_MS);
    };

    let attempts = 0;
    const poll = () => {
      if (disposed) return;
      const scene = globeRef.current?.scene?.();
      if (scene) { attach(scene); return; }
      if (++attempts >= SCENE_POLL_MAX_ATTEMPTS) { log.warn('Globe scene never became available; wind flow not added'); return; }
      pollTimer = setTimeout(poll, SCENE_POLL_MS);
    };
    poll();

    return () => {
      disposed = true;
      moveRef.current = null;
      if (pollTimer) clearTimeout(pollTimer);
      if (recheck) clearInterval(recheck);
      if (frame !== null) cancelAnimationFrame(frame);
      leaveStill?.();
      unsubscribeQuality?.();
    };
  }, [active, globeRef]);

  // Gone with the globe: the flow, its texture, its reader and its key.
  useEffect(() => () => {
    const group = groupRef.current;
    group.parent?.remove(group);
    flowRef.current?.dispose();
    flowRef.current = null;
    const textures = texturesRef.current;
    textures?.first.dispose();
    if (textures && textures.second !== textures.first) textures.second.dispose();
    texturesRef.current = null;
    setWeatherReader('wind', null);
    readinessOf[instance] = { ready: true };
    if (main) publishLegend(LEGEND_KEY, null);
  }, []);

  return state;
}
