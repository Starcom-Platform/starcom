/**
 * useGlobeEarthWeather — Real terrestrial weather visualization on the Globe.
 *
 * Was previously a fully-built settings panel wired to nothing: valid mode, full
 * settings UI, sidebar button, but zero presence anywhere in Globe.tsx. This wires it
 * to a real data source (EarthWeatherService, backed by Open-Meteo — see that file for
 * why it samples a coarse global grid rather than fetching per-pixel).
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import { earthWeatherService, type EarthWeatherPoint, type SeaIceEvent } from '../../../services/EarthWeatherService';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';
import { collectGeometryStats } from '../../../utils/threeResourceMetrics';
import { visualizationResourceMonitor } from '../../../services/visualization/VisualizationResourceMonitor';
import { PointParticleGroup, type ParticleEmitterSpec } from '../effects/PointParticleGroup';
import { buildScreenPoints, drawAboveSurfaceLayers, disposeScreenPoints, screenPointCount, setScreenPointsStyle } from '../screenPoints';
import { resolveMarkerStyle, type MarkerStyle, type MarkerStyleChoices } from '../markerStyles';
import { SURFACE_MARKS } from '../globeAltitudes';
import { publishLegend, swatchesFromMarks, cssColorOf, type LegendSwatch } from '../../../services/globe/globeLegendStore';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { createLogger } from '@utils/logger';
import { ridesShell } from '../../../globe-engine/shellLift';
import { useLayerRoot } from '../../../globe-engine/compareLayers';

const log = createLogger({ prefix: 'Globe:EarthWeather' });
const EARTH_WEATHER_MODE_KEY = 'EcoNatural.EarthWeather' as const;

// Matches the convention already established for Satellites/clouds — 100 scene units =
// 1 Earth radius (SpaceWeatherGeometry.ts). Weather points render just above the
// surface, like the cloud layer.
const GLOBE_RADIUS_UNITS = 100;
const SURFACE_OFFSET = 1.01;

/**
 * On-screen diameter of a station's mark, and of a tracked iceberg's.
 *
 * Both were spheres in SCENE units — 0.6 and 0.45 of a 100-unit Earth radius, so a
 * station covered about a pixel and a half at the share-card view and an iceberg
 * rather less. Pixels instead (screenPoints.ts), with the iceberg still the smaller
 * of the two so the two kinds keep reading apart.
 */
const STATION_MARK_PX = 9;
const ICEBERG_MARK_PX = 7;

// Weather changes slowly relative to satellite orbits — refresh on a cadence just
// under EarthWeatherService's own 10-minute cache TTL, not every second.
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

type WeatherLayers = {
  temperature: boolean;
  precipitation: boolean;
  windPatterns: boolean;
  pressure: boolean;
  humidity: boolean;
  clouds: boolean;
  airQuality: boolean;
  seaIce: boolean;
};

type TemperatureUnit = 'celsius' | 'fahrenheit' | 'kelvin';
type WindUnit = 'kmh' | 'mph' | 'ms' | 'knots';
type ColorMode = 'temperature' | 'airQuality';

interface UseGlobeEarthWeatherOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  isLayerActive: (id: string) => boolean;
  weatherLayers?: WeatherLayers;
  temperatureUnit?: TemperatureUnit;
  windUnit?: WindUnit;
  colorMode?: ColorMode;
  /**
   * How the station and iceberg marks are drawn — the person's choice for this
   * layer (decision D-F, step 6.3). NOT a dependency of the load: see the
   * restyle effect below for why that matters.
   */
  markerStyles?: MarkerStyleChoices;
  /**
   * Whether the station marks are shown. False while the temperature heat map
   * (useGlobeHeatMap, decision D-W) colours the ground in their place: the
   * marks are hidden, not removed, so the air-quality colours bring them back
   * at once, and the key describes only what is drawn.
   */
  stationDots?: boolean;
  /**
   * Whether the wind cones are shown. False while the wind flow (useGlobeWindFlow,
   * decision D-W) draws NOAA's wind in their place; hidden, not removed, as the
   * station dots are.
   */
  windCones?: boolean;
  /**
   * Whether the rain particles fall. False while the rain field (useGlobeRain,
   * decision D-W) colours the ground with rain: they are given no emitters and
   * drain away, and come back when the field is put away.
   */
  rainParticles?: boolean;
}

const DEG2RAD = Math.PI / 180;

// Real wind-direction orientation on a curved surface — no precedent anywhere in this
// codebase (checked directly: the closest hit only solved pointing radially outward,
// not a compass heading tangent to the surface).
//
// Rather than building a full local change-of-basis (East/North/Up) rotation matrix,
// this computes the world-space flow direction directly as a linear combination of
// the North and East UNIT TANGENT vectors at (lat, lng) — derived analytically by
// differentiating latLngToGlobeWorld's own spherical parametrization with respect
// to latitude and longitude respectively (and normalizing; the East partial
// derivative's magnitude is cos(lat), which cancels on normalize). Verified
// orthonormal (Up·North = Up·East = North·East = 0, all unit length) by hand for the
// general case, not just spot-checked at one point.
//
// windDirectionDeg follows the real meteorological convention Open-Meteo (and NOAA)
// use: the direction wind is blowing FROM, 0=N, clockwise. An arrow should visually
// point the direction wind blows TOWARD, so this flips by 180 degrees before
// projecting onto the tangent basis.
export function windFlowDirectionWorld(lat: number, lng: number, windDirectionDeg: number, target: THREE.Vector3): THREE.Vector3 {
  const latRad = lat * DEG2RAD;
  const lngRad = lng * DEG2RAD;

  // The local north and east of latLngToGlobeWorld — the scene's frame, where the
  // arrows are drawn. (These were the globe mesh's frame, 90° away, like the
  // positions they were attached to; see globeCoordinates.ts.)
  const northX = -Math.sin(latRad) * Math.sin(lngRad);
  const northY = Math.cos(latRad);
  const northZ = -Math.sin(latRad) * Math.cos(lngRad);

  const eastX = Math.cos(lngRad);
  const eastY = 0;
  const eastZ = -Math.sin(lngRad);

  const flowRad = (windDirectionDeg + 180) * DEG2RAD;
  const cosF = Math.cos(flowRad);
  const sinF = Math.sin(flowRad);

  return target.set(
    northX * cosF + eastX * sinF,
    northY * cosF + eastY * sinF,
    northZ * cosF + eastZ * sinF
  ).normalize();
}

export function formatTemperature(celsius: number, unit: TemperatureUnit): string {
  if (unit === 'fahrenheit') return `${(celsius * 9 / 5 + 32).toFixed(1)}°F`;
  if (unit === 'kelvin') return `${(celsius + 273.15).toFixed(1)}K`;
  return `${celsius.toFixed(1)}°C`;
}

export function formatWindSpeed(kmh: number, unit: WindUnit): string {
  if (unit === 'mph') return `${(kmh / 1.60934).toFixed(1)} mph`;
  if (unit === 'ms') return `${(kmh / 3.6).toFixed(1)} m/s`;
  if (unit === 'knots') return `${(kmh / 1.852).toFixed(1)} kn`;
  return `${kmh.toFixed(1)} km/h`;
}

// Real wind speed drives arrow scale: calm air stays a small, unobtrusive indicator;
// storm-force wind (~80+ km/h) reaches the cap rather than growing unbounded.
const MIN_WIND_ARROW_SCALE = 0.4;
const MAX_WIND_ARROW_SCALE = 1.4;

export function scaleForWindSpeed(kmh: number): number {
  if (!Number.isFinite(kmh) || kmh <= 0) return MIN_WIND_ARROW_SCALE;
  const scaled = MIN_WIND_ARROW_SCALE + kmh / 80;
  return Math.max(MIN_WIND_ARROW_SCALE, Math.min(MAX_WIND_ARROW_SCALE, scaled));
}

// Real rain particles — fast-follow reusing PointParticleGroup (also used by
// useGlobeVolcanoPlumes.ts) rather than a second from-scratch particle system.
// Below RAIN_TRACE_THRESHOLD_MM a grid point isn't considered "raining" for
// particle purposes at all (still shown via the existing tooltip regardless)
// — real precipitation that light is at the edge of meaningful sensor
// resolution. Between the trace and moderate thresholds real light rain
// (previously rendered nothing — an all-or-nothing gate at 0.5mm) gets a
// sparser, smaller particle tier instead of being dropped entirely.
const RAIN_TRACE_THRESHOLD_MM = 0.1;
const RAIN_MODERATE_THRESHOLD_MM = 0.5;
const RAIN_ORIGIN_OFFSET = 1.08; // spawn above the weather-sphere/wind-arrow layers so rain visibly falls toward the surface
const RAIN_COLOR = 0x66aaff;
const RAIN_PARTICLES_PER_POINT = 4;
const RAIN_PARTICLE_SIZE = 0.22;
const RAIN_LIGHT_PARTICLES_PER_POINT = 1;
const RAIN_LIGHT_PARTICLE_SIZE = 0.14;
const RAIN_LIFESPAN_MS = 1400;
const RAIN_SPREAD = 1.0;
const RAIN_FALL_SPEED = 2.0; // world units/sec, inward toward the globe center
const RAIN_MAX_POOL_SIZE = 240;

/**
 * Builds one real particle-emitter spec per weather-grid point currently reporting
 * real rain — exported for direct unit testing. Falls inward (toward the globe
 * center) along the real surface normal at that point, mirroring
 * useGlobeVolcanoPlumes.ts's outward-normal rise, just reversed. Real light rain
 * (RAIN_TRACE_THRESHOLD_MM..RAIN_MODERATE_THRESHOLD_MM) gets a sparser, smaller
 * particle tier rather than nothing.
 */
export function buildRainSpecs(points: EarthWeatherPoint[]): ParticleEmitterSpec[] {
  return points
    .filter((p) => Number.isFinite(p.precipitationMm) && p.precipitationMm > RAIN_TRACE_THRESHOLD_MM)
    .map((point) => {
      const isLight = point.precipitationMm < RAIN_MODERATE_THRESHOLD_MM;
      const origin = latLngToGlobeWorld(point.lat, point.lng, GLOBE_RADIUS_UNITS * RAIN_ORIGIN_OFFSET);
      const drift = origin.clone().normalize().multiplyScalar(-RAIN_FALL_SPEED);
      return {
        id: `rain-${point.lat}-${point.lng}`,
        origin,
        drift,
        color: RAIN_COLOR,
        size: isLight ? RAIN_LIGHT_PARTICLE_SIZE : RAIN_PARTICLE_SIZE,
        count: isLight ? RAIN_LIGHT_PARTICLES_PER_POINT : RAIN_PARTICLES_PER_POINT,
        lifespanMs: RAIN_LIFESPAN_MS,
        spread: RAIN_SPREAD
      };
    });
}

// Cold -> mild -> hot, clamped to a realistic surface-temperature range. Color mapping
// always uses the raw Celsius value regardless of display unit — the unit only affects
// what's shown in the tooltip text.
const COLD_C = -30;
const HOT_C = 45;
const COLOR_COLD = new THREE.Color(0x2277ee);
const COLOR_MID = new THREE.Color(0xffdd44);
const COLOR_HOT = new THREE.Color(0xee3322);

function colorForTemperature(celsius: number, target: THREE.Color): THREE.Color {
  const t = Math.max(0, Math.min(1, (celsius - COLD_C) / (HOT_C - COLD_C)));
  if (t < 0.5) {
    return target.copy(COLOR_COLD).lerp(COLOR_MID, t / 0.5);
  }
  return target.copy(COLOR_MID).lerp(COLOR_HOT, (t - 0.5) / 0.5);
}

// Standard EPA/AirNow US AQI bands — discrete categories, not a smooth gradient,
// because the real index communicates via these named bands (Good/Moderate/
// Unhealthy/...), not a continuum; smoothing them would blur a meaningful boundary
// (e.g. 100 vs 101 is the difference between "Moderate" and a sensitive-groups alert).
const AQI_BANDS: Array<{ max: number; color: number; label: string }> = [
  { max: 50, color: 0x00e400, label: 'Good' },
  { max: 100, color: 0xffff00, label: 'Moderate' },
  { max: 150, color: 0xff7e00, label: 'Unhealthy (Sensitive Groups)' },
  { max: 200, color: 0xff0000, label: 'Unhealthy' },
  { max: 300, color: 0x8f3f97, label: 'Very Unhealthy' },
  { max: Infinity, color: 0x7e0023, label: 'Hazardous' }
];

export function aqiCategory(aqi: number): { color: number; label: string } {
  return AQI_BANDS.find((band) => aqi <= band.max) ?? AQI_BANDS[AQI_BANDS.length - 1];
}

function colorForAqi(aqi: number | undefined, target: THREE.Color): THREE.Color {
  if (aqi === undefined) return target.copy(COLOR_MID); // fetch failed for this point — neutral, not a false "Good"
  return target.setHex(aqiCategory(aqi).color);
}

/**
 * What the station marks mean, from the stations actually drawn.
 *
 * The two colour modes are different KINDS of encoding and the key has to follow:
 * US AQI is a set of named bands (Good, Moderate, ...), so a swatch per band drawn
 * reads exactly right; temperature is a continuous ramp, where a swatch per station
 * would be a hundred near-identical dots, so the two ends drawn stand for it — and
 * they are measured off this globe's own readings, not off the ramp's endpoints,
 * which nothing here need have reached.
 */
export function stationLegendSwatches(
  points: readonly EarthWeatherPoint[],
  colorMode: 'temperature' | 'airQuality',
): LegendSwatch[] {
  const tmp = new THREE.Color();
  if (colorMode === 'airQuality') {
    return swatchesFromMarks(points.map((p) => ({
      color: cssColorOf(colorForAqi(p.usAqi, tmp).getHex()),
      // A point whose air-quality fetch failed is drawn neutral; the key says so
      // rather than letting a grey mark read as "Good".
      category: p.usAqi === undefined ? 'no AQI reported' : aqiCategory(p.usAqi).label,
    })));
  }
  const withTemp = points.filter((p) => Number.isFinite(p.temperatureC));
  if (withTemp.length === 0) return [];
  const coldest = withTemp.reduce((a, b) => (b.temperatureC < a.temperatureC ? b : a));
  const hottest = withTemp.reduce((a, b) => (b.temperatureC > a.temperatureC ? b : a));
  const swatch = (p: EarthWeatherPoint, what: string): LegendSwatch => ({
    color: cssColorOf(colorForTemperature(p.temperatureC, tmp).getHex()),
    label: `${p.temperatureC.toFixed(0)}°C (${what})`,
  });
  return coldest === hottest
    ? [swatch(coldest, 'the only reading')]
    : [swatch(coldest, 'coldest here'), swatch(hottest, 'hottest here')];
}

/**
 * State the key for this layer, or withdraw it. `icebergs` is separate because the
 * sea-ice marks are a different kind of thing from a station reading, and they come
 * and go with their own settings toggle.
 */
function publishEarthWeatherLegend(
  points: readonly EarthWeatherPoint[],
  colorMode: 'temperature' | 'airQuality',
  icebergs: boolean,
  shape: MarkerStyle,
): void {
  const swatches = [
    ...stationLegendSwatches(points, colorMode),
    ...(icebergs ? [{ color: cssColorOf(ICEBERG_COLOR), label: 'tracked iceberg' }] : []),
  ];
  publishLegend('EarthWeather', swatches.length ? {
    layerId: 'EarthWeather',
    layer: 'Earth Weather',
    // Every station mark is the same size: what varies between them is colour, and a
    // key claiming size means something would be inventing an encoding.
    /*
     * Only when stations were drawn: colour is what the STATION marks encode.
     * With the weather source down and only icebergs on the globe, this said
     * "colour: temperature" beside a single white iceberg swatch — an encoding
     * with no mark carrying it. Seen on the running globe during a forced outage.
     */
    colorMeans: points.length === 0 ? undefined : colorMode === 'airQuality' ? 'US AQI band' : 'temperature',
    // The shape the station and iceberg marks were drawn in, so a card says why
    // they are rings (decision D-F, step 6.3).
    shapeMeans: shape,
    swatches,
  } : null);
}

/**
 * When the weather on display was observed, by the source's own clock — the
 * OLDEST reading among the points drawn, since the layer is only as current as
 * its most out-of-date mark. Null when no point says, so a caller reports the
 * layer as untimed rather than inventing "now".
 *
 * Never the fetch time. A cached grid re-read at 17:00 is still weather observed
 * at 16:30, and the feed model's rule is when the source served it, not when the
 * app read it (see SatelliteSourceHealth).
 */
export function weatherObservedAt(points: readonly EarthWeatherPoint[]): number | null {
  let oldest: number | null = null;
  for (const point of points) {
    const at = Date.parse(point.timestamp);
    if (Number.isNaN(at)) continue;
    if (oldest === null || at < oldest) oldest = at;
  }
  return oldest;
}

/** Whether the weather arrived, and how old it is — the same shape Satellites reports. */
export interface EarthWeatherHealth {
  loading: boolean;
  error: string | null;
  /** When the displayed weather was observed, in epoch ms; null if never loaded or untimed. */
  lastLoadedAt: number | null;
  /**
   * True when weather is drawn but no point carries a time that can be read.
   * Without it, lastLoadedAt null reads as "has not loaded" — about a layer
   * plainly on screen.
   */
  untimed: boolean;
}

export function buildWeatherTooltip(point: EarthWeatherPoint, layers: WeatherLayers, tempUnit: TemperatureUnit, windUnit: WindUnit): string {
  const parts: string[] = [];
  if (layers.temperature) parts.push(`Temp: ${formatTemperature(point.temperatureC, tempUnit)}`);
  if (layers.precipitation) parts.push(`Precip: ${point.precipitationMm.toFixed(1)}mm`);
  if (layers.windPatterns) parts.push(`Wind: ${formatWindSpeed(point.windSpeedKmh, windUnit)} @ ${point.windDirectionDeg.toFixed(0)}°`);
  if (layers.humidity) parts.push(`Humidity: ${point.humidityPct.toFixed(0)}%`);
  if (layers.pressure) parts.push(`Pressure: ${point.pressureHpa.toFixed(0)}hPa`);
  if (layers.clouds) parts.push(`Clouds: ${point.cloudCoverPct.toFixed(0)}%`);
  if (layers.airQuality && point.usAqi !== undefined) {
    parts.push(`AQI: ${point.usAqi.toFixed(0)} (${aqiCategory(point.usAqi).label})`);
  }
  return parts.join(' • ') || `Temp: ${formatTemperature(point.temperatureC, tempUnit)}`;
}

/** Tracked icebergs, and the drift trails that fade out of them. One colour. */
const ICEBERG_COLOR = 0xd6f5ff;
const ICEBERG_TRAIL_BASE_COLOR = new THREE.Color(ICEBERG_COLOR);

export interface IcebergTrailGeometryData {
  // 6 numbers per segment: fromX,fromY,fromZ,toX,toY,toZ
  positions: number[];
  // 6 numbers per segment: r,g,b,r,g,b — both endpoints of a segment share one
  // fade value, so each segment still reads as a flat step like the original
  // per-segment THREE.Line version did.
  colors: number[];
  segmentCount: number;
}

/**
 * Real per-segment world positions and fade-baked vertex colors for every
 * iceberg's drift track, flattened into one array pair suitable for a single
 * merged THREE.LineSegments (one draw call instead of one THREE.Line per
 * segment — 571 real segments seen live previously meant 571 draw calls).
 * Exported for direct unit testing.
 */
export function buildIcebergTrailGeometryData(events: SeaIceEvent[]): IcebergTrailGeometryData {
  const positions: number[] = [];
  const colors: number[] = [];
  let segmentCount = 0;

  events.forEach((event) => {
    if (event.track.length < 2) return; // nothing to draw a trail between

    const segments = event.track.length - 1;
    for (let i = 1; i < event.track.length; i++) {
      const prev = event.track[i - 1];
      const point = event.track[i];
      const from = latLngToGlobeWorld(prev.lat, prev.lng, GLOBE_RADIUS_UNITS * SURFACE_OFFSET);
      const to = latLngToGlobeWorld(point.lat, point.lng, GLOBE_RADIUS_UNITS * SURFACE_OFFSET);
      positions.push(from.x, from.y, from.z, to.x, to.y, to.z);

      // Oldest segment faintest, newest (closest to the current position) most
      // opaque. LineBasicMaterial has no per-vertex alpha, so the fade is baked
      // into vertex color brightness (blended toward black) — visually
      // identical to true alpha against this app's near-black space background.
      const t = i / segments;
      const opacity = 0.1 + t * 0.5;
      const r = ICEBERG_TRAIL_BASE_COLOR.r * opacity;
      const g = ICEBERG_TRAIL_BASE_COLOR.g * opacity;
      const b = ICEBERG_TRAIL_BASE_COLOR.b * opacity;
      colors.push(r, g, b, r, g, b);
      segmentCount++;
    }
  });

  return { positions, colors, segmentCount };
}

export function buildIcebergTooltip(event: SeaIceEvent): string {
  const parts = [event.name];
  if (event.sizeNm2 !== undefined) parts.push(`${event.sizeNm2.toFixed(1)} NM²`);
  if (event.lastUpdated) parts.push(`Last tracked: ${event.lastUpdated.slice(0, 10)}`);
  return parts.join(' • ');
}

const DEFAULT_LAYERS: WeatherLayers = {
  temperature: true,
  precipitation: true,
  windPatterns: true,
  pressure: true,
  humidity: true,
  clouds: true,
  airQuality: true,
  seaIce: true
};

export function useGlobeEarthWeather({
  globeRef,
  isLayerActive,
  weatherLayers = DEFAULT_LAYERS,
  temperatureUnit = 'celsius',
  windUnit = 'kmh',
  colorMode = 'temperature',
  markerStyles,
  stationDots = true,
  windCones = true,
  rainParticles = true
}: UseGlobeEarthWeatherOptions) {
  /*
   * Above the surface layers. This group was at order 0 — under the country fills at
   * 95 — so every station mark and iceberg it drew was painted over wherever a fill
   * overlapped it (globeAltitudes.ts says why height alone was not enough).
   */
  const groupRef = useRef<THREE.Group>(ridesShell(drawAboveSurfaceLayers(new THREE.Group())));
  const meshRef = useRef<THREE.Points | null>(null);
  const icebergMeshRef = useRef<THREE.Points | null>(null);
  const icebergTrailGroupRef = useRef<THREE.Group | null>(null);
  const windMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const rainParticlesRef = useRef<PointParticleGroup | null>(null);
  const animationFrameRef = useRef<number>();
  const lastRefreshTimeRef = useRef(0);
  // Last-fetched points, kept so a colorMode change (see the effect below) can
  // recolor the existing mesh in place immediately, without waiting for the next
  // 10-minute refresh tick or spending a network fetch just to change color mapping.
  const lastPointsRef = useRef<EarthWeatherPoint[]>([]);
  // Same idea for wind arrows — only the subset with valid wind direction/speed
  // (buildWindArrows filters the rest out), so this can't just reuse lastPointsRef.
  const lastWindPointsRef = useRef<EarthWeatherPoint[]>([]);
  // Kept current via a ref (not re-triggering the fetch effect) so a settings change
  // updates tooltip content on the next render without forcing a fresh network fetch.
  /*
   * This hook used to return only its group, so the feed Globe.tsx builds for it
   * said "does not report whether its data arrived" — on the share card, and now
   * in the key. It fetches the weather itself; it knew all along.
   */
  const [health, setHealth] = useState<EarthWeatherHealth>({ loading: false, error: null, lastLoadedAt: null, untimed: false });
  const optionsRef = useRef({ weatherLayers, temperatureUnit, windUnit, colorMode, stationDots, windCones, rainParticles });
  optionsRef.current = { weatherLayers, temperatureUnit, windUnit, colorMode, stationDots, windCones, rainParticles };
  /** The stations the key may speak for: none while their marks are hidden. */
  const shownStations = (points: EarthWeatherPoint[]) => (optionsRef.current.stationDots ? points : []);
  /*
   * The style, resolved to a string so it compares by value, and read by the
   * builders through a ref — the same reason as optionsRef. It must not be a
   * dependency of the load effect: that is how choosing a style on Satellites
   * cleared and reloaded its whole catalogue, and how a hook test of it ran the
   * vitest worker out of heap.
   */
  const style = resolveMarkerStyle(markerStyles, 'EarthWeather');
  const styleRef = useRef(style);
  styleRef.current = style;
  // buildRainSpecs allocates a new array/vectors every call — real weather data
  // only changes once per refresh cycle, not every animation frame. Cached and
  // only rebuilt when the underlying points (lastPointsRef's reference) or the
  // precipitation toggle actually changes; PointParticleGroup.sync() only
  // reads specs, never mutates them, so reuse across many calls is safe.
  const rainSpecsCacheRef = useRef<{ points: EarthWeatherPoint[] | null; precipitation: boolean; specs: ParticleEmitterSpec[] }>({
    points: null,
    precipitation: false,
    specs: []
  });

  // Real hover tooltips for this group's InstancedMesh children (weather grid,
  // sea-ice, wind arrows) — see useGlobePointTooltips.ts. groupRef's identity is
  // stable for this hook's whole lifetime, so register once on mount.
  // Its objects, for a comparison side by side (D-CM, CM1).
  useLayerRoot('EarthWeather', groupRef.current);
  useEffect(() => registerTooltipGroup(groupRef.current), []);

  // Recolor (not rebuild) the existing mesh in place when colorMode changes, so the
  // toggle feels immediate rather than waiting for the next natural refresh.
  useEffect(() => {
    const mesh = meshRef.current;
    const points = lastPointsRef.current;
    if (!mesh || points.length === 0) return;

    // In place, as when these were instanced spheres: writing the colour attribute
    // rather than rebuilding the whole set keeps the toggle immediate.
    const attribute = mesh.geometry.getAttribute('pointColor') as THREE.BufferAttribute;
    const tmpColor = new THREE.Color();
    points.forEach((point, i) => {
      const color = colorMode === 'airQuality'
        ? colorForAqi(point.usAqi, tmpColor)
        : colorForTemperature(point.temperatureC, tmpColor);
      attribute.setXYZ(i, color.r, color.g, color.b);
    });
    attribute.needsUpdate = true;
    // And the key changes with it: the two modes encode different things.
    publishEarthWeatherLegend(shownStations(points), colorMode, icebergMeshRef.current !== null, styleRef.current);
  }, [colorMode]);

  // Shown or hidden in place when the wind flow takes the wind over or gives it back.
  useEffect(() => {
    if (windMeshRef.current) windMeshRef.current.visible = windCones;
  }, [windCones]);

  // Shown or hidden in place when the heat map takes temperature over or gives it back.
  useEffect(() => {
    const stations = meshRef.current;
    if (!stations) return;
    stations.visible = stationDots;
    publishEarthWeatherLegend(shownStations(lastPointsRef.current), optionsRef.current.colorMode, icebergMeshRef.current !== null, styleRef.current);
  }, [stationDots]);

  /*
   * Restyle in place when the choice changes, as colorMode recolours in place
   * above: setScreenPointsStyle touches the material alone, so the stations and
   * icebergs stay exactly where they are and nothing is fetched. The wind arrows
   * are not marks — their shape IS their direction — so a style has nothing to
   * say to them.
   */
  useEffect(() => {
    const stations = meshRef.current;
    const icebergs = icebergMeshRef.current;
    if (stations) setScreenPointsStyle(stations, style);
    if (icebergs) setScreenPointsStyle(icebergs, style);
    if (stations || icebergs) {
      publishEarthWeatherLegend(shownStations(lastPointsRef.current), optionsRef.current.colorMode, icebergs !== null, style);
    }
  }, [style]);

  // Same in-place recolor for wind arrows — previously a fixed neutral color
  // regardless of colorMode, inconsistent with the sphere layer they sit beside.
  useEffect(() => {
    const mesh = windMeshRef.current;
    const points = lastWindPointsRef.current;
    if (!mesh || points.length === 0) return;

    const tmpColor = new THREE.Color();
    points.forEach((point, i) => {
      const color = colorMode === 'airQuality'
        ? colorForAqi(point.usAqi, tmpColor)
        : colorForTemperature(point.temperatureC, tmpColor);
      mesh.setColorAt(i, color);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [colorMode]);

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

    // Points for the station and iceberg marks, an InstancedMesh for the wind cones —
    // the release is the same either way.
    const removeAndDispose = (mesh: THREE.InstancedMesh | THREE.Points | null) => {
      if (!mesh) return;
      group.remove(mesh);
      mesh.geometry?.dispose();
      disposeMaterial(mesh.material as THREE.Material | THREE.Material[] | undefined);
    };

    // Weather (10-min cadence) and sea ice (~hourly, its own service-level cache)
    // refresh independently — each gets its own clear so rebuilding one doesn't force
    // an unnecessary rebuild of the other on every weather tick.
    const clearWeatherMesh = () => {
      removeAndDispose(meshRef.current);
      meshRef.current = null;
      lastPointsRef.current = [];
    };
    const clearIcebergTrails = () => {
      const trailGroup = icebergTrailGroupRef.current;
      if (!trailGroup) return;
      group.remove(trailGroup);
      trailGroup.traverse((child) => {
        if (child instanceof THREE.Line) {
          child.geometry?.dispose();
          disposeMaterial(child.material as THREE.Material | THREE.Material[] | undefined);
        }
      });
      icebergTrailGroupRef.current = null;
    };
    const clearIcebergMesh = () => {
      removeAndDispose(icebergMeshRef.current);
      icebergMeshRef.current = null;
      clearIcebergTrails();
    };
    const clearWindMesh = () => {
      removeAndDispose(windMeshRef.current);
      windMeshRef.current = null;
    };
    const clearRainParticles = () => {
      rainParticlesRef.current?.dispose();
      rainParticlesRef.current = null;
    };
    const clearGroup = () => {
      clearWeatherMesh();
      clearIcebergMesh();
      clearWindMesh();
      clearRainParticles();
    };

    const teardown = () => {
      clearGroup();
      if (scene.children.includes(group)) scene.remove(group);
      publishLegend('EarthWeather', null);
      visualizationResourceMonitor.clearMode(EARTH_WEATHER_MODE_KEY);
    };

    const recordGeometry = (target: THREE.Object3D, instanceCount: number) => {
      const stats = collectGeometryStats(target);
      stats.approxGpuBytes += instanceCount * 64;
      visualizationResourceMonitor.recordGeometry(EARTH_WEATHER_MODE_KEY, stats);
    };

    const buildMesh = (points: EarthWeatherPoint[]) => {
      clearWeatherMesh();

      const tmpColor = new THREE.Color();
      const marks = buildScreenPoints(points.map((point) => ({
        position: latLngToGlobeWorld(point.lat, point.lng, GLOBE_RADIUS_UNITS * SURFACE_MARKS),
        sizePx: STATION_MARK_PX,
        color: (optionsRef.current.colorMode === 'airQuality'
          ? colorForAqi(point.usAqi, tmpColor)
          : colorForTemperature(point.temperatureC, tmpColor)).getHex(),
        tooltip: buildWeatherTooltip(point, optionsRef.current.weatherLayers, optionsRef.current.temperatureUnit, optionsRef.current.windUnit),
      })), {
        rim: 'dark',
        opacity: 0.85,
        style: styleRef.current,
        userData: {
          type: 'earthWeatherGrid',
          layer: 'Earth Weather',
          // Kept beside the tooltips the builder writes: the resource monitor and the
          // tier logic read lat/lng off this, and so did the InstancedMesh hover path.
          points: points.map((p) => ({ lat: p.lat, lng: p.lng })),
        },
      });

      if (cancelled) {
        disposeScreenPoints(marks);
        return;
      }

      marks.visible = optionsRef.current.stationDots;
      group.add(marks);
      meshRef.current = marks;
      lastPointsRef.current = points;
      publishEarthWeatherLegend(shownStations(points), optionsRef.current.colorMode, icebergMeshRef.current !== null, styleRef.current);
      recordGeometry(marks, points.length);
      log.debug(`🌦️ Rendered ${points.length} real Earth weather points`);
    };

    // Real wind direction+speed exists on every weather-grid point already fetched by
    // buildMesh() above (windDirectionDeg/windSpeedKmh) and previously drove nothing
    // visual — tooltip text only. Small oriented cones, reusing the same grid data and
    // the same InstancedMesh technique already proven in this file, gated by the
    // "Wind Patterns" settings toggle (which, before this, also did nothing visual).
    const WIND_ALTITUDE_OFFSET = 0.06; // rendered slightly above the weather spheres to avoid z-fighting/overlap
    const buildWindArrows = (points: EarthWeatherPoint[]) => {
      clearWindMesh();
      if (!optionsRef.current.weatherLayers.windPatterns || points.length === 0) return;

      const geom = new THREE.ConeGeometry(0.18, 0.7, 6);
      const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85 });
      const mesh = new THREE.InstancedMesh(geom, mat, points.length);
      const tmpM = new THREE.Matrix4();
      const tmpQuat = new THREE.Quaternion();
      const tmpScale = new THREE.Vector3();
      const tmpDir = new THREE.Vector3();
      const tmpPos = new THREE.Vector3();
      const tmpColor = new THREE.Color();
      // ConeGeometry's apex points along +Y by default — the axis every rotation
      // below is measured relative to.
      const CONE_DEFAULT_AXIS = new THREE.Vector3(0, 1, 0);

      let instanceCount = 0;
      const renderedPoints: EarthWeatherPoint[] = [];
      points.forEach((point) => {
        if (!Number.isFinite(point.windDirectionDeg) || !Number.isFinite(point.windSpeedKmh)) return;

        tmpPos.copy(latLngToGlobeWorld(point.lat, point.lng, GLOBE_RADIUS_UNITS * (SURFACE_OFFSET + WIND_ALTITUDE_OFFSET)));
        windFlowDirectionWorld(point.lat, point.lng, point.windDirectionDeg, tmpDir);
        tmpQuat.setFromUnitVectors(CONE_DEFAULT_AXIS, tmpDir);
        const s = scaleForWindSpeed(point.windSpeedKmh);
        tmpM.compose(tmpPos, tmpQuat, tmpScale.setScalar(s));
        mesh.setMatrixAt(instanceCount, tmpM);
        // Tinted to the active colorMode (temperature/AQI), same as the sphere
        // layer it sits beside — previously always a fixed neutral color.
        const color = optionsRef.current.colorMode === 'airQuality'
          ? colorForAqi(point.usAqi, tmpColor)
          : colorForTemperature(point.temperatureC, tmpColor);
        mesh.setColorAt(instanceCount, color);
        renderedPoints.push(point);
        instanceCount++;
      });

      if (instanceCount === 0 || cancelled) {
        mesh.geometry.dispose();
        disposeMaterial(mesh.material as THREE.Material | THREE.Material[] | undefined);
        return;
      }

      mesh.count = instanceCount;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.userData = {
        type: 'earthWeatherWind',
        points: renderedPoints.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          tooltip: buildWeatherTooltip(p, optionsRef.current.weatherLayers, optionsRef.current.temperatureUnit, optionsRef.current.windUnit)
        }))
      };
      mesh.visible = optionsRef.current.windCones;
      group.add(mesh);
      windMeshRef.current = mesh;
      lastWindPointsRef.current = renderedPoints;
      recordGeometry(mesh, instanceCount);
      log.debug(`💨 Rendered ${instanceCount} real wind-direction arrows`);
    };

    const buildIcebergMesh = (events: SeaIceEvent[]) => {
      clearIcebergMesh();
      if (events.length === 0) return;

      // Distinct from the weather grid's marks: smaller, pale cyan-white, so real
      // tracked icebergs read as a different kind of marker at a glance.
      const mesh = buildScreenPoints(events.map((event) => ({
        position: latLngToGlobeWorld(event.lat, event.lng, GLOBE_RADIUS_UNITS * SURFACE_MARKS),
        sizePx: ICEBERG_MARK_PX,
        color: ICEBERG_COLOR,
        tooltip: buildIcebergTooltip(event),
      })), {
        rim: 'dark',
        opacity: 0.9,
        style: styleRef.current,
        userData: {
          type: 'earthWeatherSeaIce',
          layer: 'Earth Weather',
          points: events.map((e) => ({ lat: e.lat, lng: e.lng })),
        },
      });

      if (cancelled) {
        disposeScreenPoints(mesh);
        return;
      }

      group.add(mesh);
      icebergMeshRef.current = mesh;
      publishEarthWeatherLegend(shownStations(lastPointsRef.current), optionsRef.current.colorMode, true, styleRef.current);
      recordGeometry(mesh, events.length);
      log.debug(`🧊 Rendered ${events.length} real tracked icebergs`);
    };

    // A fading drift trail per iceberg with a real multi-point track — this was
    // real data EONET already reported and getSeaIceEvents() previously kept
    // only the latest point of, discarding the rest. See
    // buildIcebergTrailGeometryData's own comment for why all segments merge
    // into one draw call instead of one THREE.Line per segment.
    const buildIcebergTrails = (events: SeaIceEvent[]) => {
      clearIcebergTrails();

      const { positions, colors, segmentCount } = buildIcebergTrailGeometryData(events);
      if (cancelled || segmentCount === 0) return;

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const mat = new THREE.LineBasicMaterial({ vertexColors: true });
      const lineSegments = new THREE.LineSegments(geom, mat);

      const trailGroup = new THREE.Group();
      trailGroup.add(lineSegments);

      group.add(trailGroup);
      icebergTrailGroupRef.current = trailGroup;
      recordGeometry(trailGroup, 0);
      log.debug(`🧊 Rendered ${segmentCount} real iceberg drift-trail segments in 1 draw call`);
    };

    const loadWeather = async () => {
      setHealth((h) => ({ ...h, loading: true }));
      const result = await earthWeatherService.getCurrentGrid();
      if (cancelled) return;

      if (!result.success || !result.data) {
        log.error('🌦️ Failed to load Earth weather data:', result.error);
        /*
         * A failed refresh is not a failed source while earlier weather is still
         * drawn — the same rule as Satellites: keep lastLoadedAt, so the key shows
         * the drawn weather ageing rather than calling the layer dead.
         */
        setHealth((h) => ({
          loading: false,
          error: h.lastLoadedAt === null && !h.untimed ? (result.error ?? 'the weather did not load') : null,
          lastLoadedAt: h.lastLoadedAt,
          untimed: h.untimed,
        }));
      } else {
        buildMesh(result.data);
        buildWindArrows(result.data);
        const observedAt = weatherObservedAt(result.data);
        setHealth({ loading: false, error: null, lastLoadedAt: observedAt, untimed: observedAt === null });
      }

      if (optionsRef.current.weatherLayers.seaIce) {
        const iceResult = await earthWeatherService.getSeaIceEvents();
        if (cancelled) return;
        if (!iceResult.success || !iceResult.data) {
          log.error('🧊 Failed to load sea ice data:', iceResult.error);
        } else {
          buildIcebergMesh(iceResult.data);
          buildIcebergTrails(iceResult.data);
        }
      } else {
        clearIcebergMesh();
        publishEarthWeatherLegend(shownStations(lastPointsRef.current), optionsRef.current.colorMode, false, styleRef.current);
      }

      if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        (window as unknown as { __earthWeatherDebug?: unknown }).__earthWeatherDebug = {
          getMesh: () => meshRef.current,
          getPointCount: () => result.data?.length ?? 0,
          getIcebergMesh: () => icebergMeshRef.current,
          getIcebergCount: () => screenPointCount(icebergMeshRef.current),
          // Real segment count, not trailGroup.children.length — all segments now
          // live as vertex pairs in one merged LineSegments (one draw call), not
          // one child THREE.Line per segment.
          getIcebergTrailSegmentCount: () => {
            const merged = icebergTrailGroupRef.current?.children[0] as THREE.LineSegments | undefined;
            const positionAttr = merged?.geometry?.getAttribute('position');
            return positionAttr ? positionAttr.count / 2 : 0;
          },
          getWindMesh: () => windMeshRef.current,
          getWindArrowCount: () => windMeshRef.current?.count ?? 0,
          getRainParticleCount: () => rainParticlesRef.current?.getLiveParticleCount() ?? 0
        };
      }
    };

    const tick = () => {
      if (!cancelled && isLayerActive('EarthWeather') && !(typeof document !== 'undefined' && document.hidden)) {
        const now = performance.now();
        if (now - lastRefreshTimeRef.current >= REFRESH_INTERVAL_MS) {
          lastRefreshTimeRef.current = now;
          loadWeather();
        }
        const particles = rainParticlesRef.current;
        if (particles) {
          const currentPoints = lastPointsRef.current;
          const currentPrecipitation = optionsRef.current.weatherLayers.precipitation && optionsRef.current.rainParticles;
          const cache = rainSpecsCacheRef.current;
          if (cache.points !== currentPoints || cache.precipitation !== currentPrecipitation) {
            rainSpecsCacheRef.current = {
              points: currentPoints,
              precipitation: currentPrecipitation,
              specs: currentPrecipitation ? buildRainSpecs(currentPoints) : []
            };
          }
          particles.sync(rainSpecsCacheRef.current.specs, now);
          particles.update(now);
        }
      }
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    if (isLayerActive('EarthWeather')) {
      log.debug('🌦️ EARTH WEATHER MODE ACTIVATED');
      if (!scene.children.includes(group)) {
        scene.add(group);
      }
      if (!rainParticlesRef.current) {
        const particles = new PointParticleGroup(RAIN_MAX_POOL_SIZE);
        group.add(particles.group);
        rainParticlesRef.current = particles;
      }
      lastRefreshTimeRef.current = performance.now();
      loadWeather();
      animationFrameRef.current = requestAnimationFrame(tick);
    } else {
      teardown();
    }

    return () => {
      cancelled = true;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      teardown();
    };
  }, [globeRef, isLayerActive]);

  return { groupRef, ...health };
}
