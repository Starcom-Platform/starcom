/**
 * useGlobeAurora: the aurora on the globe from NOAA's OVATION forecast (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW3).
 *
 * While Space Weather shows the aurora, the forecast is fetched at the cadence
 * the panel sets and drawn where it puts the aurora, in both hemispheres
 * (spaceWeather/aurora.ts): a glowing band by the chance, and on the night side
 * a curtain of light rising from the oval, unless the panel asks for the band
 * alone. It replaces the near-circle modelled
 * from Kp alone, which stands in only while the forecast cannot be read: this
 * hook says whether it drew, and why not.
 *
 * It says what it draws where a reader looks: the key (the chances and the
 * forecast's moment), and whenReady, which waits for the forecast so a card is
 * never cut before it is drawn. A still lights the curtains for its own moment
 * and holds their rays, so the same shot makes the same picture.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import { auroraOval, fetchOvation, type OvationGrid } from '../../../services/spaceWeather/ovation';
import { auroraRgb, createAurora, curtainPath, type AuroraDrawing } from '../spaceWeather/aurora';
import { publishLegend, cssColorOf } from '../../../services/globe/globeLegendStore';
import { onStill } from '../../../globe-engine/captureClock';
import { subsolarDirectionWorld } from '../../../globe-engine/globeLighting';
import { ridesShell } from '../../../globe-engine/shellLift';
import { TERRITORY_FILLS_ORDER } from '../../../geopolitical/theme/applyTerritoryLook';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { createLogger } from '@utils/logger';
import { useLayerRoot } from '../../../globe-engine/compareLayers';

const log = createLogger({ prefix: 'Globe:Aurora' });

const LEGEND_KEY = 'SpaceWeather:aurora';
const SCENE_POLL_MS = 100;
const SCENE_POLL_MAX_ATTEMPTS = 100;
/** Over the fills and the e-field, which draws at the next order down. */
const AURORA_ORDER = TERRITORY_FILLS_ORDER + 2;
const KEY_STOPS = [10, 30, 50, 90];

const FORECAST_NOTE = 'The aurora is NOAA\'s OVATION forecast: the chance of seeing it overhead, for its moment about an hour after its observations.';
const CURTAIN_NOTE = 'The curtain is drawn on the night side to show it; its height stands for the chance, not a measure.';

/** What a card's sources say of the aurora: the curtain named only while it is drawn. */
export function auroraNotes(curtain: boolean): { note: string; noteShort: string } {
  return curtain
    ? { note: `${FORECAST_NOTE} ${CURTAIN_NOTE}`, noteShort: 'The aurora is OVATION\'s forecast; its night curtain is drawn to show it.' }
    : { note: FORECAST_NOTE, noteShort: 'The aurora is OVATION\'s forecast.' };
}

let readiness: { ready: boolean; why?: string } = { ready: true };
/** What whenReady asks of the aurora: false while it is on and its forecast has not been drawn. */
export function auroraReadiness(): { ready: boolean; why?: string } {
  return readiness;
}

export interface AuroraState {
  /** The forecast is drawn. */
  drawn: boolean;
  loading: boolean;
  /** Why the forecast could not be read: the Kp model stands in. */
  error: string | null;
  observed: string | null;
  forecast: string | null;
}

interface UseGlobeAuroraOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  /** Space Weather is on and shows the aurora. */
  active: boolean;
  /** Toward the Sun, in the scene's frame, for the moment the globe shows: where the curtains are lit. */
  sunDirection: THREE.Vector3;
  /** How often the forecast is fetched again, minutes; 0 for once (SW2). */
  refreshMinutes: number;
  /** The night curtain drawn over the band, or the band alone (SW2); drawn unless said. */
  curtain?: boolean;
  fetchImpl?: typeof fetch;
  /** Whose it is side by side (D-CM): Space Weather's when that layer shows it; none when only the Psi shield does. */
  compareLayer?: 'SpaceWeather' | null;
}

const pathsOf = (grid: OvationGrid) => ({ north: curtainPath(auroraOval(grid, 'north')), south: curtainPath(auroraOval(grid, 'south')) });
const hexOf = (rgb: readonly number[]) => parseInt(rgb.map((b) => b.toString(16).padStart(2, '0')).join(''), 16);

/** The key for a forecast drawn: its moment, and only the shapes drawn. */
function publishKey(grid: OvationGrid, curtain: boolean): void {
  publishLegend(LEGEND_KEY, {
    layerId: 'SpaceWeather',
    layer: 'Aurora',
    when: `OVATION's forecast for ${formatUtcDateTime(Date.parse(grid.forecast))}`,
    shapeMeans: curtain ? 'a glowing band; on the night side, a curtain of light' : 'a glowing band',
    colorMeans: 'the chance of seeing aurora overhead, NOAA SWPC OVATION',
    swatches: KEY_STOPS.map((p) => ({ color: cssColorOf(hexOf(auroraRgb(p))), label: `${p}%`, shape: 'area' })),
  });
}

export function useGlobeAurora({ globeRef, active, sunDirection, refreshMinutes, curtain = true, fetchImpl, compareLayer = 'SpaceWeather' }: UseGlobeAuroraOptions): AuroraState {
  const [state, setState] = useState<AuroraState>({ drawn: false, loading: false, error: null, observed: null, forecast: null });
  const groupRef = useRef((() => {
    const group = ridesShell(new THREE.Group());
    group.renderOrder = AURORA_ORDER;
    return group;
  })());
  // Space Weather's, side by side (D-CM): the layer is tagged whole, every piece of it.
  useLayerRoot(compareLayer ?? 'SpaceWeather', compareLayer ? groupRef.current : null);
  const drawingRef = useRef<AuroraDrawing | null>(null);
  const sunRef = useRef(sunDirection);
  sunRef.current = sunDirection;
  const curtainRef = useRef(curtain);
  curtainRef.current = curtain;
  const gridRef = useRef<OvationGrid | null>(null);
  // Read when a fetch is made: a new function from a caller's render is not a reason to fetch again.
  const fetchRef = useRef(fetchImpl);
  fetchRef.current = fetchImpl;

  useEffect(() => { drawingRef.current?.setSun(sunDirection); }, [sunDirection]);

  useEffect(() => {
    if (!drawingRef.current) return;
    drawingRef.current.setCurtain(curtain);
    if (gridRef.current) publishKey(gridRef.current, curtain);
  }, [curtain]);

  useEffect(() => {
    if (!active) {
      readiness = { ready: true };
      publishLegend(LEGEND_KEY, null);
      setState({ drawn: false, loading: false, error: null, observed: null, forecast: null });
      return undefined;
    }
    const group = groupRef.current;
    let disposed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let refresh: ReturnType<typeof setInterval> | null = null;
    let frame: number | null = null;
    let leaveStill: (() => void) | null = null;

    const draw = (grid: OvationGrid) => {
      const paths = pathsOf(grid);
      if (drawingRef.current) drawingRef.current.setGrid(grid, paths);
      else {
        drawingRef.current = createAurora(grid, paths);
        drawingRef.current.setSun(sunRef.current);
        drawingRef.current.setCurtain(curtainRef.current);
        group.add(drawingRef.current.object);
      }
      gridRef.current = grid;
      publishKey(grid, curtainRef.current);
      readiness = { ready: true };
      setState({ drawn: true, loading: false, error: null, observed: grid.observed, forecast: grid.forecast });
    };

    const load = async () => {
      try {
        const grid = await fetchOvation(fetchRef.current);
        if (!disposed) draw(grid);
      } catch (error) {
        if (disposed) return;
        const message = (error as Error).message;
        log.warn(`The aurora forecast could not be read: ${message}`);
        // A forecast already drawn stays; with none, the Kp model stands in, and a card is not held for it.
        if (!drawingRef.current) {
          readiness = { ready: true };
          setState((s) => ({ ...s, loading: false, error: message }));
        }
      }
    };

    const attach = (scene: THREE.Scene) => {
      if (!scene.children.includes(group)) scene.add(group);
      // The rays' clock runs on its own while a still holds it, and the light, at the still's moment.
      let held = false;
      const animate = (now: number) => {
        if (disposed) return;
        if (!held) drawingRef.current?.setTime((now / 1000) % 1000);
        frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
      leaveStill = onStill({
        still: (atMs) => {
          held = true;
          drawingRef.current?.setTime((atMs / 1000) % 1000);
          drawingRef.current?.setSun(subsolarDirectionWorld(new Date(atMs)));
        },
        release: () => {
          held = false;
          drawingRef.current?.setSun(sunRef.current);
        },
      });
      void load();
      if (refreshMinutes > 0) refresh = setInterval(() => { void load(); }, refreshMinutes * 60_000);
    };

    readiness = { ready: false, why: 'the aurora forecast was still loading' };
    setState((s) => ({ ...s, loading: true, error: null }));
    let attempts = 0;
    const poll = () => {
      if (disposed) return;
      const scene = globeRef.current?.scene?.();
      if (scene) { attach(scene); return; }
      if (++attempts >= SCENE_POLL_MAX_ATTEMPTS) { log.warn('Globe scene never became available; aurora not added'); readiness = { ready: true }; return; }
      pollTimer = setTimeout(poll, SCENE_POLL_MS);
    };
    poll();

    return () => {
      disposed = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (refresh) clearInterval(refresh);
      if (frame !== null) cancelAnimationFrame(frame);
      leaveStill?.();
      if (drawingRef.current) { group.remove(drawingRef.current.object); drawingRef.current.dispose(); drawingRef.current = null; }
      gridRef.current = null;
      group.parent?.remove(group);
      publishLegend(LEGEND_KEY, null);
      readiness = { ready: true };
    };
  }, [active, globeRef, refreshMinutes]);

  return state;
}
