/**
 * useGlobeWaterGauges — real NOAA CO-OPS tide gauges + USGS Water Data API
 * streamflow gauges. Both follow EarthWeatherService.ts's established pattern
 * (service + this hook + a settings toggle) and both are point-marker layers, so
 * they're rendered here as two InstancedMesh sub-layers within one hook — the same
 * "several coexisting layers in one hook" structure useGlobeEarthWeather.ts already
 * uses for its weather sphere/iceberg/wind/rain layers.
 *
 * Real, bounded, curated subsets, not nationwide/global coverage — see each
 * service's own file header for why. Even curated, the real USGS streamflow set
 * (2,116 gauges heard from within a day across 6 states on 2026-10-07, California
 * alone 475) is too dense to render unthinned at every zoom — thinned by useCameraDetailTier the
 * same way useGlobeVolcanoCatalog.ts thins its 1,214-point catalog, here ranked
 * by real discharge magnitude (highest first) instead of recency.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import { noaaWaterLevelService, type NOAAWaterLevelReading } from '../../../services/NOAAWaterLevelService';
import { usgsStreamflowService, type USGSStreamflowReading } from '../../../services/USGSStreamflowService';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';
import { collectGeometryStats } from '../../../utils/threeResourceMetrics';
import { visualizationResourceMonitor } from '../../../services/visualization/VisualizationResourceMonitor';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { buildScreenPoints, drawAboveSurfaceLayers, disposeScreenPoints, screenPointCount, setScreenPointsStyle } from '../screenPoints';
import { resolveMarkerStyle, type MarkerStyle, type MarkerStyleChoices } from '../markerStyles';
import { SURFACE_MARKS } from '../globeAltitudes';
import { publishLegend, cssColorOf, type LegendSwatch } from '../../../services/globe/globeLegendStore';
import { useCameraDetailTier, type DetailTier } from './useCameraDetailTier';
import { CREDITS } from '../../../features/globe/capture/sourceCredits';
import type { FeedProvenance } from '../../../features/globe/capture/shareCardProvenance';
import { createLogger } from '@utils/logger';
import { ridesShell } from '../../../globe-engine/shellLift';
import { useLayerRoot } from '../../../globe-engine/compareLayers';

const log = createLogger({ prefix: 'Globe:WaterGauges' });
const MODE_KEY = 'EcoNatural.EarthWeather' as const;

const GLOBE_RADIUS_UNITS = 100;
const TIDE_COLOR = 0x33aaff;
/**
 * A tide gauge reads at one station: every mark the same size, in pixels.
 *
 * Was a SphereGeometry of 0.45 scene units on a 100-unit Earth — a pixel and a bit at
 * the share-card view, in a group under the country fills.
 */
const TIDE_MARK_PX = 8;
const STREAMFLOW_COLOR = 0x33dd88;
/** The pixel span a river gauge's discharge maps onto. */
const STREAMFLOW_MIN_PX = 7;
const STREAMFLOW_MAX_PX = 18;
/**
 * The discharge the largest mark stands for, in cubic feet per second.
 *
 * The Mississippi at its mouth runs around 600,000 cfs, which is the biggest thing
 * this feed reports; a million is a round number above it, so nothing real is clipped.
 */
const STREAMFLOW_MAX_CFS = 1_000_000;


// Global zoom can't usefully show all ~2,300 real streamflow sites at once —
// thin to the highest real discharge first (a real, meaningful ranking, same
// "most significant first" reasoning as selectVolcanoesForTier, ranked there
// by recency instead since that's the meaningful axis for volcanoes). Tide
// gauges (38 real stations, curated single-digit-per-region) never need this.
const STREAMFLOW_TIER_LIMITS: Record<DetailTier, number> = {
  0: 300,
  1: 750,
  2: Infinity
};

/**
 * A river gauge's on-screen diameter in CSS pixels, from its real discharge.
 *
 * ─── WHY THE OLD SCALE IS NOT SIMPLY RE-UNITED ─────────────────────────────
 *
 * These were unit spheres scaled per instance by sizeForDischarge: sqrt(cfs) * 0.03
 * above a floor, capped at 1.2. The cap is reached at about 1,000 cfs — so every
 * river from a modest one to the Mississippi at 600,000 cfs drew at exactly the same
 * size, and the mark's size stopped meaning anything across most of the range it was
 * there to show. (At 1 unit of a 100-unit Earth it was also about two pixels on a
 * card, which is the reason for the conversion.)
 *
 * Log10 of the discharge instead, over the span the feed actually reports, so the
 * orders of magnitude that separate a creek from a great river are what the size
 * shows. Same direction as before — more water, bigger mark — over the whole range.
 */
export function streamflowMarkPx(cfs: number): number {
  const flow = Number.isFinite(cfs) && cfs > 0 ? cfs : 0;
  const t = Math.log10(1 + flow) / Math.log10(1 + STREAMFLOW_MAX_CFS);
  return STREAMFLOW_MIN_PX + Math.max(0, Math.min(1, t)) * (STREAMFLOW_MAX_PX - STREAMFLOW_MIN_PX);
}

export function buildTideTooltip(reading: NOAAWaterLevelReading): string {
  return `${reading.station.name} • ${reading.waterLevelM.toFixed(2)}m • ${reading.timestamp} UTC`;
}

export function buildStreamflowTooltip(reading: USGSStreamflowReading): string {
  return `${reading.siteName} • ${reading.dischargeCfs.toFixed(1)} ft³/s`;
}

/**
 * Real, meaningful thinning order (highest real discharge first — a missing/
 * non-finite reading sorts last, not first) and cap for a given detail tier.
 * Exported for direct unit testing.
 */
export function selectStreamflowForTier(readings: USGSStreamflowReading[], tier: DetailTier): USGSStreamflowReading[] {
  const limit = STREAMFLOW_TIER_LIMITS[tier];
  if (!Number.isFinite(limit) || readings.length <= limit) return readings;

  const ranked = [...readings].sort((a, b) => {
    const ad = Number.isFinite(a.dischargeCfs) ? a.dischargeCfs : -Infinity;
    const bd = Number.isFinite(b.dischargeCfs) ? b.dischargeCfs : -Infinity;
    return bd - ad;
  });
  return ranked.slice(0, limit);
}

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

/** One network as a card reports it: still loading, why it could not be read, or when it last reported. */
export interface GaugeNetworkState {
  loading: boolean;
  error: string | null;
  /** The newest reading drawn, ISO 8601; null before one is. */
  newest: string | null;
}
const LOADING: GaugeNetworkState = { loading: true, error: null, newest: null };

/** NOAA CO-OPS time, asked for in GMT ("2026-08-14 21:24"), as ISO 8601 UTC; null when it is not that. */
export function tideTimeIso(t: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(t);
  return m ? `${m[1]}T${m[2]}:00Z` : null;
}

const newestOf = (times: Array<string | null>): string | null => times.reduce<string | null>(
  (best, t) => (t !== null && Number.isFinite(Date.parse(t)) && (best === null || Date.parse(t) > Date.parse(best)) ? t : best), null);

/**
 * The gauges' lines among a card's sources (record D-L, owed): each network named,
 * credited as its terms ask, with when it last reported. Without them a card drawing
 * USGS and NOAA marks credited neither.
 */
export function waterGaugeFeeds(tide: GaugeNetworkState, rivers: GaugeNetworkState): FeedProvenance[] {
  return [
    { name: 'NOAA tide gauges', credits: [CREDITS.noaaCoops], lastUpdated: tide.newest, error: tide.error, loading: tide.loading },
    { name: 'USGS river gauges', credits: [CREDITS.usgs], lastUpdated: rivers.newest, error: rivers.error, loading: rivers.loading },
  ];
}

interface UseGlobeWaterGaugesOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  isLayerActive: (id: string) => boolean;
  enabled: boolean; // weatherLayers.waterGauges
  /**
   * How the gauge marks are drawn. The gauges gate on EarthWeather, so they take
   * EarthWeather's choice (decision D-F, step 6.3) — a layer half on rings and
   * half on discs would be a layer the person did not choose.
   */
  markerStyles?: MarkerStyleChoices;
}

/*
 * One key for both gauge networks, from whichever are drawn. Tide marks are all
 * one size — a station is a station — so only the river marks' size carries a
 * quantity, and the key says which.
 *
 * At module level so the restyle effect can republish it without reaching into
 * the load effect's closure.
 */
function publishGaugeLegendFor(tide: boolean, streamflow: boolean, shape: MarkerStyle): void {
  const swatches: LegendSwatch[] = [];
  if (tide) swatches.push({ color: cssColorOf(TIDE_COLOR), label: 'tide gauge (NOAA)' });
  if (streamflow) swatches.push({ color: cssColorOf(STREAMFLOW_COLOR), label: 'river gauge (USGS)' });
  publishLegend('EarthWeather:waterGauges', swatches.length ? {
    layerId: 'EarthWeather:waterGauges',
    layer: 'Water gauges',
    shapeMeans: shape,
    sizeMeans: 'discharge, for a river gauge',
    colorMeans: 'which network the gauge belongs to',
    swatches,
  } : null);
}

export function useGlobeWaterGauges({ globeRef, isLayerActive, enabled, markerStyles }: UseGlobeWaterGaugesOptions) {
  // Above the country fills; this group drew at order 0, underneath them.
  const groupRef = useRef<THREE.Group>(ridesShell(drawAboveSurfaceLayers(new THREE.Group())));
  const tideMeshRef = useRef<THREE.Points | null>(null);
  const streamflowMeshRef = useRef<THREE.Points | null>(null);
  const animationFrameRef = useRef<number>();
  const lastRefreshTimeRef = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  // Resolved to a string and read through a ref: not a dependency of the load,
  // for the reason set out beside useGlobeEarthWeather's styleRef.
  const style = resolveMarkerStyle(markerStyles, 'EarthWeather');
  const styleRef = useRef(style);
  styleRef.current = style;
  // Raw (unthinned) readings from the last real fetch, cached so a detail-tier
  // change can re-thin and rebuild the streamflow mesh without a redundant
  // real network request — the tick() loop below still owns real periodic
  // refresh on its own schedule, untouched by tier changes.
  const rawTideReadingsRef = useRef<NOAAWaterLevelReading[]>([]);
  const rawStreamflowReadingsRef = useRef<USGSStreamflowReading[]>([]);
  const hasLoadedOnceRef = useRef(false);
  // What a card says about each network: loading, why it failed, or when it last reported.
  const [networks, setNetworks] = useState<{ tide: GaugeNetworkState; rivers: GaugeNetworkState }>({ tide: LOADING, rivers: LOADING });

  const active = isLayerActive('EarthWeather') && enabled;
  const detailTier = useCameraDetailTier(undefined, active);

  // Its objects, for a comparison side by side (D-CM, CM1).
  useLayerRoot('EarthWeather', groupRef.current);
  useEffect(() => registerTooltipGroup(groupRef.current), []);

  // Restyle in place when the choice changes: the material alone, so the gauges
  // stay where they are and neither network is fetched again.
  useEffect(() => {
    const tide = tideMeshRef.current;
    const streamflow = streamflowMeshRef.current;
    if (tide) setScreenPointsStyle(tide, style);
    if (streamflow) setScreenPointsStyle(streamflow, style);
    if (tide || streamflow) publishGaugeLegendFor(tide !== null, streamflow !== null, style);
  }, [style]);

  useEffect(() => {
    if (!globeRef.current) return;
    const globeObj = globeRef.current as unknown as { scene: () => THREE.Scene };
    const scene = globeObj?.scene();
    const group = groupRef.current;
    if (!scene || !group) return;

    let cancelled = false;

    const disposeMaterial = (mat: THREE.Material | THREE.Material[] | undefined) => {
      if (!mat) return;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    };
    const removeAndDispose = (mesh: THREE.Points | null) => {
      if (!mesh) return;
      group.remove(mesh);
      mesh.geometry?.dispose();
      disposeMaterial(mesh.material as THREE.Material | THREE.Material[] | undefined);
    };

    const publishGaugeLegend = () =>
      publishGaugeLegendFor(tideMeshRef.current !== null, streamflowMeshRef.current !== null, styleRef.current);
    const clearGroup = () => {
      removeAndDispose(tideMeshRef.current);
      tideMeshRef.current = null;
      removeAndDispose(streamflowMeshRef.current);
      streamflowMeshRef.current = null;
    };
    const teardown = () => {
      clearGroup();
      if (scene.children.includes(group)) scene.remove(group);
      publishLegend('EarthWeather:waterGauges', null);
      visualizationResourceMonitor.clearMode(MODE_KEY);
    };

    const buildTideMesh = (readings: NOAAWaterLevelReading[]) => {
      rawTideReadingsRef.current = readings;
      removeAndDispose(tideMeshRef.current);
      tideMeshRef.current = null;
      if (readings.length === 0) return;

      const mesh = buildScreenPoints(readings.map((reading) => ({
        position: latLngToGlobeWorld(reading.station.lat, reading.station.lng, GLOBE_RADIUS_UNITS * SURFACE_MARKS),
        sizePx: TIDE_MARK_PX,
        color: TIDE_COLOR,
        tooltip: buildTideTooltip(reading),
      })), {
        rim: 'dark',
        opacity: 0.85,
        style: styleRef.current,
        userData: {
          type: 'noaaTideGauge',
          layer: 'Water gauges',
          points: readings.map((r) => ({ lat: r.station.lat, lng: r.station.lng })),
        },
      });

      if (cancelled) {
        disposeScreenPoints(mesh);
        return;
      }
      group.add(mesh);
      // Kept before the key is told: the key reads the refs, and ran one build behind.
      tideMeshRef.current = mesh;
      publishGaugeLegend();
      log.debug(`🌊 Rendered ${readings.length} real NOAA tide gauge readings`);
    };

    const buildStreamflowMesh = (readings: USGSStreamflowReading[]) => {
      rawStreamflowReadingsRef.current = readings;
      removeAndDispose(streamflowMeshRef.current);
      streamflowMeshRef.current = null;
      if (readings.length === 0) return;

      const selected = selectStreamflowForTier(readings, detailTier);
      if (selected.length === 0) return;

      const mesh = buildScreenPoints(selected.map((reading) => ({
        position: latLngToGlobeWorld(reading.lat, reading.lng, GLOBE_RADIUS_UNITS * SURFACE_MARKS),
        sizePx: streamflowMarkPx(reading.dischargeCfs),
        color: STREAMFLOW_COLOR,
        tooltip: buildStreamflowTooltip(reading),
      })), {
        rim: 'dark',
        opacity: 0.85,
        style: styleRef.current,
        userData: {
          type: 'usgsStreamflowGauge',
          layer: 'Water gauges',
          points: selected.map((r) => ({ lat: r.lat, lng: r.lng })),
        },
      });

      if (cancelled) {
        disposeScreenPoints(mesh);
        return;
      }
      group.add(mesh);
      streamflowMeshRef.current = mesh;
      publishGaugeLegend();
      log.debug(`🏞️ Rendered ${selected.length} of ${readings.length} real USGS streamflow gauge readings (tier ${detailTier})`);
    };

    // Re-registered (not just defined once inside load()) so getDetailTier()
    // stays accurate across tier-only rebuilds too, which rebuild meshes
    // directly without going through load().
    const registerDebugHook = () => {
      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        (window as unknown as { __waterGaugesDebug?: unknown }).__waterGaugesDebug = {
          getTideMesh: () => tideMeshRef.current,
          getTideCount: () => screenPointCount(tideMeshRef.current),
          getStreamflowMesh: () => streamflowMeshRef.current,
          getStreamflowCount: () => screenPointCount(streamflowMeshRef.current),
          getRawStreamflowCount: () => rawStreamflowReadingsRef.current.length,
          getDetailTier: () => detailTier
        };
      }
    };

    const load = async () => {
      const [tideResult, streamflowResult] = await Promise.allSettled([
        noaaWaterLevelService.getCurrentReadings(),
        usgsStreamflowService.getCurrentReadings()
      ]);
      if (cancelled) return;

      const failure = (result: PromiseSettledResult<{ error: string | null }>) => (result.status === 'fulfilled'
        ? result.value.error ?? 'no readings came back'
        : (result.reason instanceof Error ? result.reason.message : String(result.reason)));
      setNetworks({
        tide: tideResult.status === 'fulfilled' && tideResult.value.success && tideResult.value.data
          ? { loading: false, error: null, newest: newestOf(tideResult.value.data.map((r) => tideTimeIso(r.timestamp))) }
          : { loading: false, error: failure(tideResult), newest: null },
        rivers: streamflowResult.status === 'fulfilled' && streamflowResult.value.success && streamflowResult.value.data
          ? { loading: false, error: null, newest: newestOf(streamflowResult.value.data.map((r) => r.timestamp)) }
          : { loading: false, error: failure(streamflowResult), newest: null },
      });

      if (tideResult.status === 'fulfilled' && tideResult.value.success && tideResult.value.data) {
        buildTideMesh(tideResult.value.data);
      } else {
        removeAndDispose(tideMeshRef.current);
        tideMeshRef.current = null;
      }

      if (streamflowResult.status === 'fulfilled' && streamflowResult.value.success && streamflowResult.value.data) {
        buildStreamflowMesh(streamflowResult.value.data);
      } else {
        rawStreamflowReadingsRef.current = [];
        removeAndDispose(streamflowMeshRef.current);
        streamflowMeshRef.current = null;
      }

      hasLoadedOnceRef.current = true;

      const stats = collectGeometryStats(group);
      visualizationResourceMonitor.recordGeometry(MODE_KEY, stats);
      registerDebugHook();
    };

    const tick = () => {
      if (!cancelled && isLayerActive('EarthWeather') && enabledRef.current && !(typeof document !== 'undefined' && document.hidden)) {
        const now = performance.now();
        if (now - lastRefreshTimeRef.current >= REFRESH_INTERVAL_MS) {
          lastRefreshTimeRef.current = now;
          load();
        }
      }
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    if (isLayerActive('EarthWeather') && enabled) {
      if (!scene.children.includes(group)) scene.add(group);
      if (hasLoadedOnceRef.current) {
        // A detail-tier change re-runs this effect (teardown + re-add) without
        // a real data change — re-thin and rebuild from the cached raw reading
        // arrays instead of hitting NOAA/USGS again; tick() below still owns
        // real periodic refresh on its own untouched schedule.
        buildTideMesh(rawTideReadingsRef.current);
        buildStreamflowMesh(rawStreamflowReadingsRef.current);
        const stats = collectGeometryStats(group);
        visualizationResourceMonitor.recordGeometry(MODE_KEY, stats);
        registerDebugHook();
      } else {
        lastRefreshTimeRef.current = performance.now();
        load();
      }
      animationFrameRef.current = requestAnimationFrame(tick);
    } else {
      // Deactivating (not a tier change) — force a real refetch, not a stale
      // cache replay, the next time this layer becomes active again.
      hasLoadedOnceRef.current = false;
      teardown();
    }

    return () => {
      cancelled = true;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      teardown();
    };
  }, [globeRef, isLayerActive, enabled, detailTier]);

  return { groupRef, ...networks };
}
