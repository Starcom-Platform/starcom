// No changes made; this is a no-op patch.
// SpaceWeatherModeling.ts
// Utility functions to derive magnetopause/bow shock radii and auroral oval geometry
// from solar wind and Kp inputs. Includes safe clamps and simple fallbacks for MVP.

import {
  type BoundaryDeformationProfile,
  computeBowShockDeformation,
  computeMagnetopauseDeformation
} from './SpaceWeatherBoundaryModel';

export type SolarWindSnapshot = {
  speedKmPerSec: number;
  densityPerCm3: number;
  bz?: number;
  timestamp: string;
};

export type KpSnapshot = {
  kp: number;
  timestamp: string;
};

// Kp updates roughly every 3 hours in NOAA's own cadence; 90 minutes gives
// a real margin before treating a reading as stale rather than flagging it
// the moment it's not brand new. Single source of truth for "stale" — was
// previously a private constant only on GlobeEngine (driving the 3D shell's
// dimming), with no equivalent on the HUD panel's data path, so a stale
// reading could show a dimmed shell next to a panel still confidently
// labeled "live."
export const KP_STALE_MS = 90 * 60 * 1000;

export function isKpStale(timestamp: string, now: number = Date.now()): boolean {
  const ageMs = Math.max(0, now - Date.parse(timestamp));
  return ageMs > KP_STALE_MS;
}

// Real-time solar wind (RTSW) updates roughly every minute; 10 minutes is
// the same margin GlobeEngine.ts already used privately for dimming the
// magnetopause/bow-shock 3D shells. Single source of truth, same reasoning
// as KP_STALE_MS above: was previously a private constant only on
// GlobeEngine, with no equivalent on the HUD hooks' data path.
export const SOLAR_WIND_STALE_MS = 10 * 60 * 1000;

export function isSolarWindStale(timestamp: string, now: number = Date.now()): boolean {
  const ageMs = Math.max(0, now - Date.parse(timestamp));
  return ageMs > SOLAR_WIND_STALE_MS;
}

export type MagnetopausePayload = {
  standoffRe: number;
  lastUpdated: string;
  quality: 'live' | 'fallback' | 'stale';
  clamped?: boolean;
  deformation?: BoundaryDeformationProfile;
  meta?: Record<string, unknown>;
};

export type BowShockPayload = {
  radiusRe: number;
  lastUpdated: string;
  quality: 'live' | 'fallback' | 'stale';
  clamped?: boolean;
  deformation?: BoundaryDeformationProfile;
  meta?: Record<string, unknown>;
};

export type LatLng = { lat: number; lng: number };

export type AuroraPayload = {
  oval: { north: LatLng[]; south: LatLng[] };
  kp: number;
  blackout: { thresholdKp: number; gradient: { inner: number; outer: number } };
  lastUpdated: string;
  quality: 'live' | 'fallback' | 'stale';
  meta?: Record<string, unknown>;
};

// Single source of truth for "blackout risk" — was a magic 7 inline inside
// buildAuroralPayload; the aurora HUD readout (useAuroralOvalData.ts) needs
// the exact same threshold to answer "is a blackout a real risk right now,"
// and a second hardcoded 7 would be exactly the kind of drift risk the
// classifyGeomagneticActivity extraction above was meant to close.
export const AURORA_BLACKOUT_KP_THRESHOLD = 7;

// NOAA's own 6-tier geomagnetic activity classification (matches
// NOAAGeomagneticService.classifyActivity, which delegates here — this is
// the single source of truth so the 3D shell's color tiers, the HUD panel's
// activity label, and the service's own disruption-risk-adjacent
// classification can never drift apart into three different scales).
export type GeomagneticActivity = 'quiet' | 'unsettled' | 'active' | 'minor_storm' | 'major_storm' | 'severe_storm';

export function classifyGeomagneticActivity(kp: number): GeomagneticActivity {
  if (kp < 3) return 'quiet';
  if (kp < 4) return 'unsettled';
  if (kp < 5) return 'active';
  if (kp < 6) return 'minor_storm';
  if (kp < 7) return 'major_storm';
  return 'severe_storm';
}

const GEOMAGNETIC_ACTIVITY_LABELS: Record<GeomagneticActivity, string> = {
  quiet: 'Quiet',
  unsettled: 'Unsettled',
  active: 'Active',
  minor_storm: 'Minor Storm',
  major_storm: 'Major Storm',
  severe_storm: 'Severe Storm'
};

// Companion to classifyGeomagneticActivity — every UI surface that shows
// an activity label (the geomagnetic HUD panel, the aurora passive card)
// reads from this one map instead of keeping its own copy, so "Minor
// Storm" means the same thing and is spelled the same way everywhere.
export function formatGeomagneticActivityLabel(activity: GeomagneticActivity): string {
  return GEOMAGNETIC_ACTIVITY_LABELS[activity];
}

// A whole-globe indicator of the current planetary Kp index — unlike
// magnetopause/bow-shock (real physical boundaries at a modeled standoff
// distance) or aurora (a real oval at a real latitude band), Kp itself has
// no associated altitude or shape; this is a deliberately illustrative
// "how disturbed is the magnetosphere right now" shell, not a modeled
// physical structure. See createGeomagneticIndexMesh (SpaceWeatherGeometry.ts)
// for how kp/activity map to color/opacity.
export type GeomagneticIndexPayload = {
  kp: number;
  activity: GeomagneticActivity;
  lastUpdated: string;
  quality: 'live' | 'fallback' | 'stale';
  meta?: Record<string, unknown>;
};

const MIN_STANDOFF_RE = 5;
const MAX_STANDOFF_RE = 25;
const MIN_BOWSHOCK_RE = 7;
const MAX_BOWSHOCK_RE = 35;
const MIN_GAP_RE = 1.0;

// Dynamic pressure in nPa using common approximation: P = 1.6726e-6 * n(cm^-3) * v(km/s)^2
export function computeDynamicPressureNPa(densityPerCm3: number, speedKmPerSec: number): number {
  const n = Math.max(densityPerCm3, 0);
  const v = Math.max(speedKmPerSec, 0);
  return 1.6726e-6 * n * v * v;
}

export function computeMagnetopauseStandoff(pressureNPa: number): { value: number; clamped: boolean } {
  const a = 10.22; // nominal coefficient
  const exponent = -1 / 6;
  const raw = a * Math.pow(Math.max(pressureNPa, 0.1), exponent);
  const clamped = raw < MIN_STANDOFF_RE || raw > MAX_STANDOFF_RE;
  const value = Math.min(MAX_STANDOFF_RE, Math.max(MIN_STANDOFF_RE, raw));
  return { value, clamped };
}

export function computeBowShockRadius(pressureNPa: number, magnetopauseRe: number): { value: number; clamped: boolean } {
  const delta = 2.5;
  const baseCoeff = 14.0;
  const exponent = -1 / 6;
  const raw = baseCoeff * Math.pow(Math.max(pressureNPa, 0.1), exponent);
  const ensuredGap = Math.max(raw, magnetopauseRe + MIN_GAP_RE, magnetopauseRe + delta);
  const clamped = ensuredGap < MIN_BOWSHOCK_RE || ensuredGap > MAX_BOWSHOCK_RE;
  const value = Math.min(MAX_BOWSHOCK_RE, Math.max(MIN_BOWSHOCK_RE, ensuredGap));
  return { value, clamped };
}

function buildOvalPoints(kp: number, hemisphere: 'north' | 'south', segments = 96): LatLng[] {
  const points: LatLng[] = [];
  const clampedKp = Math.min(Math.max(kp, 0), 9);
  const baseLat = hemisphere === 'north' ? 80 : -80;
  const slope = 2.5; // degrees per Kp toward equator
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * 360 - 180; // longitude
    const dayNightFactor = 2 * Math.cos((t * Math.PI) / 180); // modest day-night asymmetry
    const lat = baseLat + (hemisphere === 'north' ? -1 : 1) * (slope * clampedKp + 0.3 * dayNightFactor);
    points.push({ lat, lng: t });
  }
  // close loop
  points.push(points[0]);
  return points;
}

export function buildAuroralPayload(kpSnapshot: KpSnapshot, quality: AuroraPayload['quality']): AuroraPayload {
  const kp = kpSnapshot.kp;
  const north = buildOvalPoints(kp, 'north');
  const south = buildOvalPoints(kp, 'south');
  const blackout = {
    thresholdKp: AURORA_BLACKOUT_KP_THRESHOLD,
    gradient: { inner: 0.35, outer: 0.65 },
  };
  return {
    oval: { north, south },
    kp,
    blackout,
    lastUpdated: kpSnapshot.timestamp,
    quality,
    meta: { source: 'modeled-kp' },
  };
}

export function buildGeomagneticIndexPayload(kpSnapshot: KpSnapshot, quality: GeomagneticIndexPayload['quality']): GeomagneticIndexPayload {
  return {
    kp: kpSnapshot.kp,
    activity: classifyGeomagneticActivity(kpSnapshot.kp),
    lastUpdated: kpSnapshot.timestamp,
    quality,
    meta: { source: 'noaa-kp' }
  };
}

export function buildMagnetopausePayload(sw: SolarWindSnapshot, quality: MagnetopausePayload['quality']): MagnetopausePayload {
  const pressure = computeDynamicPressureNPa(sw.densityPerCm3, sw.speedKmPerSec);
  const { value, clamped } = computeMagnetopauseStandoff(pressure);
  const deformation = computeMagnetopauseDeformation(value, {
    pressureNPa: pressure,
    speedKmPerSec: sw.speedKmPerSec,
    bz: sw.bz
  });
  return {
    standoffRe: value,
    lastUpdated: sw.timestamp,
    quality,
    clamped,
    deformation,
    meta: { pressureNPa: pressure, deformationModel: deformation.modelVersion },
  };
}

export function buildBowShockPayload(sw: SolarWindSnapshot, magnetopauseRe: number, quality: BowShockPayload['quality']): BowShockPayload {
  const pressure = computeDynamicPressureNPa(sw.densityPerCm3, sw.speedKmPerSec);
  const { value, clamped } = computeBowShockRadius(pressure, magnetopauseRe);
  const magnetopauseDeformation = computeMagnetopauseDeformation(magnetopauseRe, {
    pressureNPa: pressure,
    speedKmPerSec: sw.speedKmPerSec,
    bz: sw.bz
  });
  const deformation = computeBowShockDeformation(value, magnetopauseDeformation, {
    pressureNPa: pressure,
    speedKmPerSec: sw.speedKmPerSec,
    bz: sw.bz
  });
  return {
    radiusRe: value,
    lastUpdated: sw.timestamp,
    quality,
    clamped,
    deformation,
    meta: { pressureNPa: pressure, deformationModel: deformation.modelVersion },
  };
}

export function fallbackSolarWindSnapshot(): SolarWindSnapshot {
  return {
    speedKmPerSec: 420,
    densityPerCm3: 6,
    bz: -2,
    timestamp: new Date().toISOString(),
  };
}

export function fallbackKpSnapshot(): KpSnapshot {
  return {
    kp: 3,
    timestamp: new Date().toISOString(),
  };
}
