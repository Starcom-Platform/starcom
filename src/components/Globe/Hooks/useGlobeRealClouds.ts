/**
 * useGlobeRealClouds: the sky as satellites see it (decision D-W, WX2 as
 * revised on 2026-10-06; WX7).
 *
 * While Earth Weather shows clouds, EUMETSAT's Geostationary Ring infrared
 * mosaic is drawn as cloud, raised and shaded by the planet's sun
 * (weather/cloudShell.ts), in place of three-globe's example picture. Cloud
 * is told from clear sky against GFS's ground temperature, and the poles,
 * which no geostationary satellite sees, take GFS's cloud cover, keyed as
 * the model's.
 *
 * It says what it draws: the key (seen cloud and model cloud apart), the
 * card's sources (EUMETSAT's credit, its hour, and GFS's), the hover (the
 * tops' temperature), and whenReady.
 *
 * It follows Earth Weather's moment (step 5a). A moment the satellites have
 * seen is drawn from the slot nearest it, lit by the sun of that moment, with
 * the poles' model cover blended for the moment. At an hour they have not
 * seen, any moment still to come, the model's cover is drawn everywhere,
 * shaded as seen cloud is and keyed as the model's forecast (WX11).
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import { GeoRingClient, geoRingSlots } from '../../../services/weather/geoRing';
import { gfsCacheStore } from '../../../services/weather/gfs/gfsCacheStore';
import { valueAt } from '../../../services/weather/gfs/gfsGrid';
import { blendCovers, blendValueAt, blendWeight } from '../../../services/weather/gfs/gfsBlend';
import type { GfsBlend, GfsField } from '../../../services/weather/gfs/gfsClient';
import { drawnBlend, gfsClient, type DrawnBlend } from './useGlobeHeatMap';
import { cloudPart, createCloudShell, modelCloudPart, scalarTexture, type CloudShell } from '../weather/cloudShell';
import { fieldTexture, gfsSourceLine } from '../weather/heatMap';
import { noteDrawn, forgetDrawn } from '../weather/weatherDrawn';
import { weatherWhen, WEATHER_CLOCK_MS } from '../weather/weatherMoment';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { publishLegend, cssColorOf } from '../../../services/globe/globeLegendStore';
import { subsolarDirectionWorld } from '../../../globe-engine/globeLighting';
import { onStill } from '../../../globe-engine/captureClock';
import { GUNMETAL } from '../../../styles/tokens';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { createLogger } from '@utils/logger';
import { groundField } from '../../../globe-engine/shellLift';
import { thenOf, useLayerRoot } from '../../../globe-engine/compareLayers';

const log = createLogger({ prefix: 'Globe:RealClouds' });

const LEGEND_KEY = 'EarthWeather:clouds';
const SCENE_POLL_MS = 100;
const SCENE_POLL_MAX_ATTEMPTS = 100;
/** A newer slot comes every 3 hours: look for one every half hour. */
const RECHECK_MS = 30 * 60e3;

export const CLOUD_NOTE = 'Clouds are as geostationary satellites saw them in infrared, at the hour stated, to 80° of latitude; nearer the poles they are the GFS model\'s.';
export const CLOUD_NOTE_SHORT = 'Satellite clouds to 80°; the model\'s nearer the poles.';
export const CLOUD_MODEL_NOTE = 'Clouds are the GFS model\'s cloud cover, for the hour stated: satellites cannot see an hour still to come.';
export const CLOUD_MODEL_NOTE_SHORT = 'Clouds are the model\'s: satellites cannot see ahead.';

let sharedRing: GeoRingClient | null = null;
function geoRingClient(): GeoRingClient {
  sharedRing ??= new GeoRingClient({ fetch: (input, init) => fetch(input, init), now: () => Date.now(), cache: gfsCacheStore() });
  return sharedRing;
}

// The globe's own, and a comparison's other moment's (D-CM, CM5): each copy its own wait.
const readinessOf: Record<'main' | 'then', { ready: boolean; why?: string }> = { main: { ready: true }, then: { ready: true } };
/** What whenReady asks of the clouds: false while they are on and have not been drawn. */
export function realCloudsReadiness(): { ready: boolean; why?: string } {
  return readinessOf.main;
}
/** The same, for a comparison's other moment (D-CM, CM5). */
export function realCloudsThenReadiness(): { ready: boolean; why?: string } {
  return readinessOf.then;
}

export interface RealCloudsState {
  loading: boolean;
  error: string | null;
  /** The slot the satellite image holds for; null at an hour the satellites have not seen. */
  slot: Date | null;
  /** The model's cover drawn (the poles, or everywhere at a forecast hour), and the moment it is drawn for. */
  cover: DrawnBlend | null;
  /** An hour the satellites have not seen: the model's cloud is drawn everywhere (WX11). */
  forecast: boolean;
}

/** The ring's greys and coverage, on the CPU, for the hover. */
interface RingPixels { width: number; height: number; grey: Uint8Array; covered: Uint8Array }

async function ringPixels(bitmap: ImageBitmap): Promise<RingPixels> {
  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const grey = new Uint8Array(width * height), covered = new Uint8Array(width * height);
  for (let k = 0; k < width * height; k++) { grey[k] = rgba[k * 4]; covered[k] = rgba[k * 4 + 3] > 127 ? 1 : 0; }
  return { width, height, grey, covered };
}

/** One texel, for what a forecast hour does not use: no satellite image, no ground temperature. */
function blankTexture(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.needsUpdate = true;
  return tex;
}

const coverTexture = (field: GfsField) => scalarTexture(field, (pct) => pct / 100);

interface UseGlobeRealCloudsOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  /** Earth Weather is on and shows clouds. */
  active: boolean;
  /** Earth Weather's moment: the shared cursor's while paused; null (or absent) while live, for now. */
  moment?: number | null;
  /** A comparison's other moment (D-CM, CM5): a copy of its own, named `EarthWeather@then`, its own wait, no key. */
  instance?: 'main' | 'then';
}

export function useGlobeRealClouds({ globeRef, active, moment = null, instance = 'main' }: UseGlobeRealCloudsOptions): RealCloudsState {
  const main = instance === 'main';
  const [state, setState] = useState<RealCloudsState>({ loading: false, error: null, slot: null, cover: null, forecast: false });
  // Drawn with the ground fields, under a raised territories shell (globe-engine/shellLift.ts).
  const groupRef = useRef(groundField(new THREE.Group()));
  const shellRef = useRef<CloudShell | null>(null);
  /** The textures the shell draws from, kept across the layer going off and on, disposed with it. */
  const texturesRef = useRef<THREE.Texture[]>([]);
  /**
   * What is drawn: the image (the satellites' slot and the ground temperature
   * it was read against, or "forecast"), and the model's cover around the moment.
   */
  const drawnRef = useRef<{ image: string; slot: Date | null; cover: GfsBlend; forecast: boolean } | null>(null);
  /** The cover's two textures, swapped alone when only the model's steps move. */
  const coverTexturesRef = useRef<{ first: THREE.Texture; second: THREE.Texture } | null>(null);
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
      if (main) forgetDrawn('clouds');
      if (main) publishLegend(LEGEND_KEY, null);
      return;
    }

    let disposed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let recheck: ReturnType<typeof setInterval> | null = null;
    let leaveStill: (() => void) | null = null;
    let still = false;
    group.visible = true;
    shellRef.current?.setShown(true);
    const at = () => momentRef.current ?? Date.now();
    /** A moment still to come: no satellite has seen it. */
    const isForecast = (t: number) => t > Date.now() + WEATHER_CLOCK_MS;
    /** Whether what is drawn answers the moment: the same kind of hour, the same slot, the cover's steps around it. */
    const covered = () => {
      const drawn = drawnRef.current;
      if (!drawn || drawn.forecast !== isForecast(at()) || !blendCovers(drawn.cover, at())) return false;
      return drawn.forecast || drawn.slot?.getTime() === geoRingSlots(at(), Date.now())[0];
    };
    readinessOf[instance] = covered() ? { ready: true } : { ready: false, why: 'the clouds were still loading' };

    /** The moment's weight on the cover, the sun of the moment, and what the key and the card say. */
    const show = () => {
      const drawn = drawnRef.current;
      if (!drawn) return;
      shellRef.current?.setCoverWeight(blendWeight(drawn.cover, at()));
      if (!still) shellRef.current?.setSun(subsolarDirectionWorld(new Date(at())));
      // What a clip sweeping the hours waits on, frame by frame (D-W, step 5c).
      if (main && shellRef.current) noteDrawn('clouds', at());
      if (main) publishLegend(LEGEND_KEY, drawn.forecast
        ? {
          layerId: 'EarthWeather',
          layer: 'Clouds',
          when: weatherWhen(at(), Date.now()),
          shapeMeans: 'the GFS model\'s cloud cover, raised where it is thicker',
          swatches: [{ color: cssColorOf(GUNMETAL[100]), label: 'cloud cover, the GFS model\'s' }],
        }
        : {
          layerId: 'EarthWeather',
          layer: 'Clouds',
          when: `seen ${formatUtcDateTime(drawn.slot!.getTime())}`,
          shapeMeans: 'cloud as satellites see it in infrared, raised where its tops are colder',
          swatches: [
            { color: cssColorOf(GUNMETAL[100]), label: 'cloud seen by EUMETSAT\'s Geostationary Ring' },
            { color: cssColorOf(GUNMETAL[300]), label: 'cloud nearer the poles, the GFS model\'s' },
          ],
        });
      setState({ loading: false, error: null, slot: drawn.slot, cover: drawnBlend(drawn.cover, at()), forecast: drawn.forecast });
    };

    /** Swaps in a new shell with its image's textures, disposing the old shell and image; the cover is takeCover's. */
    const replaceShell = (make: () => CloudShell, textures: THREE.Texture[]) => {
      if (shellRef.current) {
        group.remove(shellRef.current.mesh);
        shellRef.current.dispose();
      }
      for (const t of texturesRef.current.splice(0)) t.dispose();
      texturesRef.current.push(...textures);
      const shell = make();
      group.add(shell.mesh);
      shellRef.current = shell;
    };
    /** The model's cover for new steps: two new textures, the old ones disposed, given to the shell when there is one. */
    const takeCover = (cover: GfsBlend) => {
      const first = coverTexture(cover.before);
      const next = { first, second: cover.after === cover.before ? first : coverTexture(cover.after) };
      shellRef.current?.setCover(next.first, next.second);
      const old = coverTexturesRef.current;
      old?.first.dispose();
      if (old && old.second !== old.first) old.second.dispose();
      coverTexturesRef.current = next;
      return next;
    };
    const sameCover = (a: GfsBlend | undefined, b: GfsBlend) => a !== undefined
      && a.before.valid.getTime() === b.before.valid.getTime() && a.after.valid.getTime() === b.after.valid.getTime();

    let loading = false;
    let again = false;
    const load = async () => {
      if (loading) { again = true; return; }
      loading = true;
      setState((s) => ({ ...s, loading: !drawnRef.current, error: null }));
      try {
        do {
          again = false;
          const target = at();
          const forecast = isForecast(target);
          const cover = await gfsClient().loadAround('tcdc', target);
          if (forecast) {
            if (disposed) return;
            if (drawnRef.current?.image !== 'forecast' || !shellRef.current) {
              const ir = blankTexture(), surface = blankTexture();
              const read = (lat: number, lng: number) => {
                const blend = drawnRef.current?.cover;
                const pct = blend ? blendValueAt(blend, blendWeight(blend, at()), lat, lng) : null;
                return blend && pct !== null ? modelCloudPart(pct, gfsSourceLine(blend, at())) : null;
              };
              const textures = takeCover(cover);
              replaceShell(() => createCloudShell({ ir, irSize: { width: 1, height: 1 }, surface, cover: { ...textures, weight: blendWeight(cover, at()) }, modelEverywhere: true, read }),
                [ir, surface]);
            } else if (!sameCover(drawnRef.current?.cover, cover)) {
              takeCover(cover);
            }
            drawnRef.current = { image: 'forecast', slot: null, cover, forecast: true };
          } else {
            const ring = await geoRingClient().load(target);
            const surface: GfsField = await gfsClient().load('tmp2m', ring.slot.getTime());
            const image = `${ring.slot.toISOString()}|${surface.valid.toISOString()}`;
            if (disposed) return;
            if (image !== drawnRef.current?.image || !shellRef.current) {
              const bitmap = await createImageBitmap(ring.blob, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
              const pixels = await ringPixels(bitmap);
              if (disposed) { bitmap.close(); return; }
              const ir = new THREE.Texture(bitmap as unknown as HTMLImageElement);
              ir.flipY = false;
              ir.colorSpace = THREE.NoColorSpace;
              ir.wrapS = THREE.RepeatWrapping;
              ir.minFilter = THREE.LinearFilter;
              ir.magFilter = THREE.LinearFilter;
              ir.generateMipmaps = false;
              ir.needsUpdate = true;
              const surfaceTex = fieldTexture(surface);
              const read = (lat: number, lng: number) => {
                const x = Math.floor((((lng + 180) % 360 + 360) % 360) / 360 * pixels.width) % pixels.width;
                const y = Math.min(Math.max(Math.floor(((90 - lat) / 180) * pixels.height), 0), pixels.height - 1);
                const k = y * pixels.width + x;
                const kelvin = valueAt(surface, lat, lng);
                if (kelvin === null) return null;
                return cloudPart({ grey: pixels.grey[k], covered: pixels.covered[k] === 1 }, kelvin - 273.15, ring.slot);
              };
              const textures = takeCover(cover);
              replaceShell(() => createCloudShell({ ir, irSize: { width: pixels.width, height: pixels.height }, surface: surfaceTex, cover: { ...textures, weight: blendWeight(cover, at()) }, read }),
                [ir, surfaceTex]);
            } else if (!sameCover(drawnRef.current?.cover, cover)) {
              takeCover(cover);
            }
            drawnRef.current = { image, slot: ring.slot, cover, forecast: false };
          }
          if (!covered()) again = true;
        } while (again);
        readinessOf[instance] = { ready: true };
        show();
      } catch (error) {
        if (disposed) return;
        const message = (error as Error).message;
        log.warn('Real clouds not loaded', message);
        readinessOf[instance] = { ready: true };
        setState((s) => ({ ...s, loading: false, error: message }));
      } finally {
        loading = false;
      }
    };

    moveRef.current = () => {
      if (covered()) { show(); return; }
      readinessOf[instance] = { ready: false, why: 'the clouds for the moment shown were still loading' };
      void load();
    };

    const attach = (scene: THREE.Scene) => {
      if (!scene.children.includes(group)) scene.add(group);
      // A still is lit by the sun at its own moment, as the planet is (IM23).
      leaveStill = onStill({
        still: (atMs) => { still = true; shellRef.current?.setSun(subsolarDirectionWorld(new Date(atMs))); },
        release: () => { still = false; shellRef.current?.setSun(subsolarDirectionWorld(new Date(at()))); },
      });
      void load();
      recheck = setInterval(() => { void load(); }, RECHECK_MS);
    };

    let attempts = 0;
    const poll = () => {
      if (disposed) return;
      const scene = globeRef.current?.scene?.();
      if (scene) { attach(scene); return; }
      if (++attempts >= SCENE_POLL_MAX_ATTEMPTS) { log.warn('Globe scene never became available; real clouds not added'); return; }
      pollTimer = setTimeout(poll, SCENE_POLL_MS);
    };
    poll();

    return () => {
      disposed = true;
      moveRef.current = null;
      if (pollTimer) clearTimeout(pollTimer);
      if (recheck) clearInterval(recheck);
      leaveStill?.();
    };
  }, [active, globeRef]);

  // Gone with the globe: the shell, its reader and its key.
  useEffect(() => () => {
    const group = groupRef.current;
    group.parent?.remove(group);
    shellRef.current?.dispose();
    shellRef.current = null;
    for (const t of texturesRef.current.splice(0)) t.dispose();
    const cover = coverTexturesRef.current;
    cover?.first.dispose();
    if (cover && cover.second !== cover.first) cover.second.dispose();
    coverTexturesRef.current = null;
    readinessOf[instance] = { ready: true };
    if (main) publishLegend(LEGEND_KEY, null);
  }, []);

  return state;
}
