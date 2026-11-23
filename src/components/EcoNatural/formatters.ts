import { type NaturalEvent } from '../../hooks/useGeoEvents';
import { numbered } from '../../i18n/app/i18n';

const formatUtcIso = (timestamp?: string): string => {
  if (!timestamp) return 'Time: unknown';
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return 'Time: unknown';
  return new Date(parsed).toISOString();
};

const formatMagnitude = (magnitude?: number): string | null => {
  if (typeof magnitude !== 'number' || !Number.isFinite(magnitude)) return null;
  return `M${magnitude.toFixed(1)}`;
};

/** NOAA's deaths for a quake: its count, or its order where only that is known (D-EQ, EQ4). */
export function deathsWords(deaths: number | null, order: number | null): string | null {
  if (typeof deaths === 'number' && deaths > 0) return `${numbered(deaths)} ${deaths === 1 ? 'death' : 'deaths'}`;
  const ORDERS: Record<number, string> = { 1: 'under 50 deaths', 2: '51 to 100 deaths', 3: '101 to 1,000 deaths', 4: 'over 1,000 deaths' };
  return typeof order === 'number' && ORDERS[order] ? ORDERS[order] : null;
}

export const formatEcoDisasterTooltip = (event: NaturalEvent): string => {
  const parts: string[] = [];
  const magnitude = formatMagnitude(event.magnitude);
  if (magnitude) parts.push(magnitude);

  if (event.type) parts.push(event.type);

  if (event.severityBucket) parts.push(`Severity: ${event.severityBucket}`);

  // Real USGS fields, previously fetched and discarded without ever reaching the UI.
  if (typeof event.depthKm === 'number' && Number.isFinite(event.depthKm)) {
    parts.push(`Depth: ${event.depthKm.toFixed(1)}km`);
  }
  // USGS's flag on the event, and no more: USGS is not a tsunami warning centre, and the
  // flag is not a warning (this said "Tsunami warning issued" until 2026-10-16).
  if (event.tsunami) {
    parts.push('USGS tsunami flag set');
  }

  // A quake from the history, as precisely as its record dates it: NOAA's atlas reaches back to 2150 BC.
  if (event.dateWords) parts.push(event.dateWords);
  else parts.push(`UTC ${formatUtcIso(event.timestamp)}`);
  if (event.atlas) {
    const deaths = deathsWords(event.atlas.deaths, event.atlas.deathsOrder);
    if (deaths) parts.push(deaths);
    if (event.atlas.tsunami) parts.push('a tsunami came of it');
  }

  if (event.isMock || event.source === 'volcano-mock') {
    parts.push('Mock volcano data');
  } else if (event.reportedBy?.length) {
    // Each agency that reported it, where USGS's and EMSC's were folded into one (D-EQ, EQ2).
    parts.push(`Reported by ${event.reportedBy.join(' and ')}`);
  } else if (event.source) {
    parts.push(`Source: ${event.source}`);
  }

  return parts.join(' • ');
};

export const formatEcoDisasterLabel = (event: NaturalEvent): string => {
  const magnitude = formatMagnitude(event.magnitude);
  const base = [magnitude, event.type].filter(Boolean).join(' ') || event.description || event.type || 'Event';
  if (event.isMock || event.source === 'volcano-mock') return `${base} (mock)`;
  return base;
};

// True green/orange/red — matches GDACS's own Green/Orange/Red alert-level
// convention exactly, which severityOverride already threads through into this same
// minor/major/catastrophic bucket for floods/droughts/hurricanes (see
// GeoEventsDataProvider.ts's GDACS_ALERT_TO_SEVERITY). Previously yellow for
// minor/default, which didn't read as the GO-R scheme it was already semantically
// using — earthquakes/wildfires/volcanoes get the same three colors via the exact
// same function, so the legend is unified everywhere this is called, not just for
// GDACS-sourced events.
export const colorForSeverity = (bucket?: string): string => {
  switch (bucket) {
    case 'catastrophic':
      return '#ff4d4f';
    case 'major':
      return '#fa8c16';
    default:
      return '#52c41a';
  }
};

// One distinct color per real hazard type, so the 6 real categories (earthquake,
// wildfire, volcano, flood, drought, hurricane) read apart from each other at a
// glance — the point of the "color by hazard type" presentation option, as opposed
// to "color by severity" (colorForSeverity above), which was the only mode before.
const HAZARD_TYPE_COLORS: Record<string, string> = {
  earthquake: '#ff4d4f', // red
  wildfire: '#fa8c16',   // orange
  volcano: '#9254de',    // purple
  flood: '#1890ff',      // blue
  drought: '#ad6800',    // ochre/brown
  hurricane: '#13c2c2'   // teal
};

export const colorForHazardType = (type?: string): string => (type && HAZARD_TYPE_COLORS[type]) || '#ffffff';

// {type, label, color} for each real hazard type, in the same order as
// HAZARD_TYPE_COLORS — for legend UI that needs to render swatches with matching
// human-readable labels (see EcoDisastersLegend.tsx's hazard-type mode).
export const HAZARD_TYPE_LEGEND: Array<{ type: string; label: string; color: string }> = [
  { type: 'earthquake', label: 'Earthquake', color: HAZARD_TYPE_COLORS.earthquake },
  { type: 'wildfire', label: 'Wildfire', color: HAZARD_TYPE_COLORS.wildfire },
  { type: 'volcano', label: 'Volcano', color: HAZARD_TYPE_COLORS.volcano },
  { type: 'flood', label: 'Flood', color: HAZARD_TYPE_COLORS.flood },
  { type: 'drought', label: 'Drought', color: HAZARD_TYPE_COLORS.drought },
  { type: 'hurricane', label: 'Hurricane', color: HAZARD_TYPE_COLORS.hurricane }
];

export const sizeForSeverity = (bucket?: string): number => {
  switch (bucket) {
    case 'catastrophic':
      return 0.85;
    case 'major':
      return 0.65;
    default:
      return 0.45;
  }
};

// Impact-radius ring size in degrees of arc on the globe surface — a stylized,
// severity-scaled visual affordance, NOT a claim about a specific event's real
// physical impact area (no real per-event impact-radius dataset exists here).
export const ringRadiusForSeverity = (bucket?: string): number => {
  switch (bucket) {
    case 'catastrophic':
      return 4;
    case 'major':
      return 2.5;
    default:
      return 1.5;
  }
};

// Wildfire footprint radius from REAL acreage (event.intensity for wildfires — see
// GeoEventsDataProvider's EONET mapping), unlike sizeForSeverity above: wildfire
// severity always defaults to the same bucket (no real magnitude field exists for
// this hazard type), so every fire previously rendered at one identical size
// regardless of whether it was 50 acres or 500,000. sqrt-scaled (fire area, not
// linear radius) and clamped so a single megafire doesn't dominate the whole globe.
const MIN_WILDFIRE_SIZE = 0.3;
const MAX_WILDFIRE_SIZE = 1.2;
const WILDFIRE_SIZE_SCALE = 0.0017; // tuned so a ~500,000-acre megafire lands near MAX_WILDFIRE_SIZE

export const sizeForWildfireAcreage = (acres?: number): number => {
  if (typeof acres !== 'number' || !Number.isFinite(acres) || acres <= 0) {
    return sizeForSeverity(undefined);
  }
  const scaled = MIN_WILDFIRE_SIZE + Math.sqrt(acres) * WILDFIRE_SIZE_SCALE;
  return Math.max(MIN_WILDFIRE_SIZE, Math.min(MAX_WILDFIRE_SIZE, scaled));
};

// react-globe.gl's pointAltitude is a fraction of the FULL globe radius (its
// point cylinders scale to altitude*GLOBE_RADIUS — confirmed directly against
// three-globe's own source, GLOBE_RADIUS=100). This is a real, previously
// broken value: eco-disaster markers used to pass their RADIUS-intended
// `size` (sizeForSeverity/sizeForWildfireAcreage, 0.25-1.2) straight through
// as altitude, producing cylinders 25-120 world units tall — markers
// rendered as giant spikes shooting off the globe instead of small surface
// markers, ever since this feature was first built. Kept small and separate
// from size on purpose; see Globe.tsx's new pointRadius prop for where size
// actually belongs.
export const BASE_ALTITUDE = 0.01;
export const MAX_DEPTH_ALTITUDE_BONUS = 0.02;

// Real USGS depth (km) becomes a small altitude offset on top of the base
// height: shallow/dangerous quakes sit close to the surface (negligible
// offset), deep quakes appear to "float" slightly further out. Same relative
// shape as the original (broken-scale) formula — reaches its cap at 150km
// real depth — just rescaled to real altitude units.
export function altitudeForEcoEvent(type: string, depthKm?: number | null): number {
  if (type !== 'earthquake' || typeof depthKm !== 'number' || !Number.isFinite(depthKm)) {
    return BASE_ALTITUDE;
  }
  return BASE_ALTITUDE + Math.min(MAX_DEPTH_ALTITUDE_BONUS, (Math.max(0, depthKm) / 300) * MAX_DEPTH_ALTITUDE_BONUS / 0.5);
}

// A distinct "just happened" flash color for the earthquake shockwave pulse —
// deliberately not reusing any severity or hazard-type color, since it's meant to
// read as an urgent, time-sensitive overlay independent of severity/type color-coding.
export const ALERT_FLASH_COLOR = '#ffffff';

// Tsunami rings get their own color (real-world tsunami-warning UIs conventionally
// use blue/cyan for water hazards) AND a distinct pulse timing (see Globe.tsx's
// ringPropagationSpeed/ringRepeatPeriod, keyed on ring kind) — not color alone,
// since a single shared white "alert" ring made a tsunami warning and a routine
// earthquake shockwave pulse visually indistinguishable except by ring radius.
export const TSUNAMI_ALERT_COLOR = '#22d3ee';

export type AlertRingKind = 'tsunami' | 'shockwave';

export interface AlertRingVisuals {
  kind: AlertRingKind;
  color: string;
  maxR: number;
}

// A quake that's both a tsunami source and a recent shockwave renders as the
// more urgent, broader tsunami warning — real USGS tsunami flag wins.
export function alertRingVisualsFor(tsunami: boolean): AlertRingVisuals {
  return tsunami
    ? { kind: 'tsunami', color: TSUNAMI_ALERT_COLOR, maxR: 5 }
    : { kind: 'shockwave', color: ALERT_FLASH_COLOR, maxR: 2 };
}

export const formatUtcIsoShort = (timestamp?: string | number | null): string => {
  if (!timestamp && timestamp !== 0) return '—';
  const value = typeof timestamp === 'number' ? timestamp : Date.parse(String(timestamp));
  if (!Number.isFinite(value)) return '—';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
};

export const EcoNaturalFormatters = {
  formatUtcIso,
  formatMagnitude,
  formatEcoDisasterTooltip,
  formatEcoDisasterLabel,
  formatUtcIsoShort,
  colorForSeverity,
  colorForHazardType,
  HAZARD_TYPE_LEGEND,
  sizeForSeverity,
  sizeForWildfireAcreage,
  ringRadiusForSeverity,
  ALERT_FLASH_COLOR,
  TSUNAMI_ALERT_COLOR,
  alertRingVisualsFor,
  altitudeForEcoEvent
};

export default EcoNaturalFormatters;