/**
 * useGlobeEField: the geoelectric field on the globe (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW1, SW2).
 *
 * Every sample NOAA serves, both of its models on their shared 0.5° grid
 * (eFieldGrid.ts), as a continuous colour field by strength (eFieldShell.ts),
 * with its direction shown as streaks drifting along it (eFieldFlow.ts). It
 * replaces the 500 strongest samples drawn as dots, which showed no direction.
 *
 * It says what it draws where a reader looks: the key (the scale's stops, what the
 * colour and the streaks mean, and when the files were made), and whenReady, which
 * waits for the field so a card is never cut before it is drawn. A still settles
 * the streaks from its own moment, so the same shot draws the same streaks.
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import { eFieldGrid, type EFieldGrid, type EFieldGrids } from '../../../services/spaceWeather/eFieldGrid';
import { createEFieldShell, eFieldDirectionRgb, eFieldRgb, eFieldTexture, type EFieldScale, type EFieldShell } from '../spaceWeather/eFieldShell';
import { createEFieldFlow, EFieldFlowUnsupported, type EFieldFlow } from '../spaceWeather/eFieldFlow';
import type { ProcessedElectricFieldData } from '../../../types/data/spaceWeather';
import type { EFieldLook } from '../../../hooks/useEcoNaturalSettings';
import { publishLegend, cssColorOf } from '../../../services/globe/globeLegendStore';
import { getGlobeQuality, subscribeGlobeQuality } from '../../../services/globe/globeQuality';
import { onStill } from '../../../globe-engine/captureClock';
import { ridesShell } from '../../../globe-engine/shellLift';
import { TERRITORY_FILLS_ORDER } from '../../../geopolitical/theme/applyTerritoryLook';
import { WEATHER_FIELDS, WIND_FLOW } from '../globeAltitudes';
import { GUNMETAL } from '../../../styles/tokens';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { createLogger } from '@utils/logger';
import { useLayerRoot } from '../../../globe-engine/compareLayers';

const log = createLogger({ prefix: 'Globe:EField' });

const LEGEND_KEY = 'SpaceWeather:e-field';
/**
 * Over the country fills, unlike the weather's ground fields: the field is what this layer
 * is about, and under even Quiet's pale fill it read as a grey wash (a card of 2026-10-10).
 * It rides the territories' shell as the marks do, and draws just after the fills.
 */
const E_FIELD_ORDER = TERRITORY_FILLS_ORDER + 1;
const SCENE_POLL_MS = 100;
const SCENE_POLL_MAX_ATTEMPTS = 100;
/** Particles per side of the state texture, by quality step, at full density: 9,216 down to 3,136, over a twelfth of the sphere. */
const SIDE_BY_STEP = [96, 80, 64, 56];
/** How long a still lets the particles run from their seed before it is drawn, so streaks have formed. */
const STILL_SETTLE_STEPS = 45;
/** The key's stops, a decade apart, as the field's own contour lines are. */
const KEY_STOPS = [1, 10, 100, 1000];

export const E_FIELD_NOTE = 'The geoelectric field is NOAA\'s model of it at the ground, from magnetometers and the Earth\'s conductivity: InterMag EarthScope (3-D) over the contiguous US, US-Canada 1D beyond. Where neither reaches, nothing is drawn.';
export const E_FIELD_NOTE_SHORT = 'The e-field is NOAA\'s model from magnetometers; where it does not reach, nothing is drawn.';
export const E_FIELD_STREAK_NOTE = 'The e-field\'s streaks are sped up for viewing; their direction and relative strength are the model\'s.';

/** What a card says of the look drawn, beyond the field itself (SW11): the motion is sped up, the relief raised. */
export function eFieldLookNote(look: EFieldLook): string {
  if (look === 'streaks') return E_FIELD_STREAK_NOTE;
  if (look === 'ripples') return 'The e-field\'s ripples are sped up for viewing; their direction and relative strength are the model\'s.';
  if (look === 'relief') return 'The e-field\'s relief stands for its strength on a log scale, raised to be seen; its colour is the way it points.';
  return '';
}

/** What each look draws for the field's direction, as the key says it (SW1). */
const LOOK_KEY: Record<EFieldLook, { shapeMeans: string; mark?: string }> = {
  streaks: { shapeMeans: 'the coloured ground; streaks move the way the field points', mark: 'a streak: the field\'s direction' },
  arrows: { shapeMeans: 'the coloured ground; arrows point the way the field points, longer where stronger', mark: 'an arrow: the field\'s direction' },
  ripples: { shapeMeans: 'the coloured ground; ripples run the way the field points', mark: 'a ripple: the field\'s direction' },
  relief: { shapeMeans: 'a surface raised by the field\'s strength' },
};
const COMPASS: ReadonlyArray<[number, string]> = [[0, 'toward north'], [90, 'toward east'], [180, 'toward south'], [270, 'toward west']];
const hexOf = (rgb: readonly number[]) => parseInt(rgb.map((b) => b.toString(16).padStart(2, '0')).join(''), 16);

let readiness: { ready: boolean; why?: string } = { ready: true };
/** What whenReady asks of the e-field: false while it is on and has data that has not been drawn. */
export function eFieldReadiness(): { ready: boolean; why?: string } {
  return readiness;
}

const mvkm = (v: number) => (v >= 1000 ? `${v / 1000} V/km` : `${v} mV/km`);

interface UseGlobeEFieldOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  /** The Space Weather layer is on and shows the e-field. */
  active: boolean;
  /** Still fetching its files. */
  loading: boolean;
  interMag: ProcessedElectricFieldData | null;
  usCanada: ProcessedElectricFieldData | null;
  grids: EFieldGrids;
  look: EFieldLook;
  scale: EFieldScale;
  /** 0 to 1. */
  opacity: number;
  /** Shares of the streaks' default pace and number. */
  flowSpeed: number;
  flowDensity: number;
}

export function useGlobeEField(options: UseGlobeEFieldOptions): { grid: EFieldGrid | null } {
  const { globeRef, active, loading, interMag, usCanada, grids, look, scale, opacity, flowSpeed, flowDensity } = options;
  const grid = useMemo(() => eFieldGrid({ interMag, usCanada }, grids), [interMag, usCanada, grids]);
  const groupRef = useRef((() => {
    const group = ridesShell(new THREE.Group());
    group.renderOrder = E_FIELD_ORDER;
    return group;
  })());
  // Space Weather's, side by side (D-CM): the layer is tagged whole, every piece of it.
  useLayerRoot('SpaceWeather', groupRef.current);
  const shellRef = useRef<EFieldShell | null>(null);
  const flowRef = useRef<EFieldFlow | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const settingsRef = useRef({ look, scale, opacity, flowSpeed, flowDensity });
  settingsRef.current = { look, scale, opacity, flowSpeed, flowDensity };
  /** Set by the effect below while it runs: draw the grid and the settings as they now are. */
  const redrawRef = useRef<(() => void) | null>(null);
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  useEffect(() => {
    if (!active) {
      readiness = { ready: true };
      publishLegend(LEGEND_KEY, null);
      return undefined;
    }
    const group = groupRef.current;
    let disposed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let frame: number | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let builtSide = 0;
    let unsubscribeQuality: (() => void) | null = null;
    let leaveStill: (() => void) | null = null;
    let drawnGrid: EFieldGrid | null = null;

    const dropFlow = () => {
      if (!flowRef.current) return;
      group.remove(flowRef.current.object);
      flowRef.current.dispose();
      flowRef.current = null;
      builtSide = 0;
    };

    /** The streaks at the quality step's size and the density chosen, built again when either changes it. */
    const buildFlow = (g: EFieldGrid, texture: THREE.Texture) => {
      const s = settingsRef.current;
      if (s.look !== 'streaks' || !renderer) { dropFlow(); return; }
      const base = SIDE_BY_STEP[Math.min(getGlobeQuality().step, SIDE_BY_STEP.length - 1)];
      const side = Math.max(16, Math.round(base * Math.sqrt(Math.min(Math.max(s.flowDensity, 0.1), 1))));
      if (flowRef.current && side === builtSide) {
        flowRef.current.setGrid(g, texture);
        flowRef.current.setSpeed(s.flowSpeed);
        return;
      }
      dropFlow();
      try {
        const flow = createEFieldFlow(renderer, { grid: g, texture }, { side, radiusFraction: WIND_FLOW, speed: s.flowSpeed });
        group.add(flow.object);
        flowRef.current = flow;
        builtSide = side;
      } catch (error) {
        log.warn(error instanceof EFieldFlowUnsupported ? error.message : `The e-field's streaks could not be built: ${(error as Error).message}`);
      }
    };

    const publish = (g: EFieldGrid, shell: EFieldShell) => {
      const [lo, hi] = shell.drawRange();
      const stops = settingsRef.current.scale === 'relative'
        ? [lo, (lo + hi) / 2, hi].map((l) => Number((10 ** l).toPrecision(2)))
        : KEY_STOPS;
      const look = settingsRef.current.look;
      const { shapeMeans, mark } = LOOK_KEY[look];
      publishLegend(LEGEND_KEY, {
        layerId: 'SpaceWeather',
        layer: 'Geoelectric field',
        ...(g.timestamp ? { when: `NOAA's files of ${formatUtcDateTime(Date.parse(g.timestamp))}` } : {}),
        shapeMeans,
        // The relief's colours are its direction; its strength is its height.
        colorMeans: look === 'relief' ? 'the way the field points' : 'the field\'s strength at the ground, NOAA SWPC\'s geoelectric models',
        swatches: look === 'relief'
          ? COMPASS.map(([deg, label]) => ({ color: cssColorOf(hexOf(eFieldDirectionRgb(deg))), label, shape: 'area' }))
          : [
            ...stops.map((v) => ({ color: cssColorOf(hexOf(eFieldRgb(v))), label: mvkm(v), shape: 'area' })),
            ...(mark ? [{ color: cssColorOf(parseInt(GUNMETAL[100].slice(1), 16)), label: mark, shape: 'line' }] : []),
          ],
      });
    };

    const redraw = () => {
      if (disposed) return;
      const g = gridRef.current;
      const s = settingsRef.current;
      if (!g) {
        // Nothing to draw: still loading, or NOAA had no files.
        if (shellRef.current) { group.remove(shellRef.current.mesh); shellRef.current.dispose(); shellRef.current = null; }
        dropFlow();
        publishLegend(LEGEND_KEY, null);
        readiness = loadingRef.current ? { ready: false, why: 'the geoelectric field was still loading' } : { ready: true };
        return;
      }
      if (g !== drawnGrid) {
        textureRef.current?.dispose();
        textureRef.current = eFieldTexture(g);
        if (shellRef.current) shellRef.current.setGrid(g);
        else {
          shellRef.current = createEFieldShell(g, { radius: 100 * WEATHER_FIELDS, opacity: s.opacity, scale: s.scale, look: s.look });
          group.add(shellRef.current.mesh);
        }
        drawnGrid = g;
      }
      const shell = shellRef.current!;
      shell.setOpacity(s.opacity);
      shell.setScale(s.scale);
      shell.setLook(s.look);
      buildFlow(g, textureRef.current!);
      publish(g, shell);
      readiness = { ready: true };
    };
    redrawRef.current = redraw;

    const attach = (scene: THREE.Scene) => {
      renderer = (globeRef.current as unknown as { renderer?: () => THREE.WebGLRenderer } | undefined)?.renderer?.() ?? null;
      if (!scene.children.includes(group)) scene.add(group);
      unsubscribeQuality = subscribeGlobeQuality(() => { if (drawnGrid && textureRef.current) buildFlow(drawnGrid, textureRef.current); });
      let last = performance.now();
      // The ripples' clock runs on its own while a still holds it at the still's moment.
      let held = false;
      const animate = (now: number) => {
        if (disposed) return;
        flowRef.current?.step((now - last) / 1000);
        if (!held) shellRef.current?.setTime((now / 1000) % 1000);
        last = now;
        frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
      // A still settles the streaks and stops the ripples at its own moment: the same shot, the same picture (IM19, IM23).
      leaveStill = onStill({
        still: (atMs) => {
          held = true;
          flowRef.current?.settle(atMs / 1000, STILL_SETTLE_STEPS);
          shellRef.current?.setTime((atMs / 1000) % 1000);
        },
        release: () => { held = false; },
      });
      redraw();
    };

    readiness = { ready: false, why: 'the geoelectric field was still being drawn' };
    let attempts = 0;
    const poll = () => {
      if (disposed) return;
      const scene = globeRef.current?.scene?.();
      if (scene) { attach(scene); return; }
      if (++attempts >= SCENE_POLL_MAX_ATTEMPTS) { log.warn('Globe scene never became available; e-field not added'); readiness = { ready: true }; return; }
      pollTimer = setTimeout(poll, SCENE_POLL_MS);
    };
    poll();

    return () => {
      disposed = true;
      redrawRef.current = null;
      if (pollTimer) clearTimeout(pollTimer);
      if (frame !== null) cancelAnimationFrame(frame);
      unsubscribeQuality?.();
      leaveStill?.();
      dropFlow();
      if (shellRef.current) { group.remove(shellRef.current.mesh); shellRef.current.dispose(); shellRef.current = null; }
      textureRef.current?.dispose();
      textureRef.current = null;
      group.parent?.remove(group);
      publishLegend(LEGEND_KEY, null);
      readiness = { ready: true };
    };
    // The grid and the settings reach a running effect through redraw, not by tearing it down.
  }, [active, globeRef]);

  useEffect(() => { redrawRef.current?.(); }, [grid, loading, look, scale, opacity, flowSpeed, flowDensity]);

  return { grid };
}
