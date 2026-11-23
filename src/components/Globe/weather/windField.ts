/**
 * Wind from GFS's two components at 10 m (decision D-W, WX3): u toward the
 * east, v toward the north, in m/s. What a hover says, and the texture the
 * particles move by.
 */
import * as THREE from 'three';
import { valueAt, type GriddedValues } from '../../../services/weather/gfs/gfsGrid';
import { blendValueAt } from '../../../services/weather/gfs/gfsBlend';
import { formatWindSpeed } from '../Hooks/useGlobeEarthWeather';

export type WindUnit = 'kmh' | 'mph' | 'ms' | 'knots';

/** Below this the air is called calm, as forecasts do (Beaufort 0 is under 0.5 m/s). */
const CALM_MS = 0.5;
const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** Speed, and the direction the wind comes FROM in degrees clockwise from north. */
export function windAt(u: GriddedValues, v: GriddedValues, lat: number, lng: number): { speedMs: number; fromDeg: number } | null {
  const ue = valueAt(u, lat, lng), vn = valueAt(v, lat, lng);
  if (ue === null || vn === null || Number.isNaN(ue) || Number.isNaN(vn)) return null;
  return windOf(ue, vn);
}

/** The wind at a moment between two steps: each component blended as the particles blend it (WX10). */
export function windAtBlend(
  u: { before: GriddedValues; after: GriddedValues },
  v: { before: GriddedValues; after: GriddedValues },
  weight: number, lat: number, lng: number,
): { speedMs: number; fromDeg: number } | null {
  const ue = blendValueAt(u, weight, lat, lng), vn = blendValueAt(v, weight, lat, lng);
  return ue === null || vn === null ? null : windOf(ue, vn);
}

function windOf(ue: number, vn: number): { speedMs: number; fromDeg: number } {
  const speedMs = Math.hypot(ue, vn);
  if (speedMs === 0) return { speedMs: 0, fromDeg: 0 };
  const from = (Math.atan2(-ue, -vn) * 180) / Math.PI;
  return { speedMs, fromDeg: Math.round((((from % 360) + 360) % 360) * 10) / 10 };
}

/** The sixteen points of the compass a forecast names. */
export function compassPoint(deg: number): string {
  return POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

export function windReading(wind: { speedMs: number; fromDeg: number }, unit: WindUnit): string {
  if (wind.speedMs < CALM_MS) return 'wind calm';
  return `wind ${formatWindSpeed(wind.speedMs * 3.6, unit)} from the ${compassPoint(wind.fromDeg)}`;
}

/** Both components as the particles sample them: half floats, R east and G north, wrapping east–west. */
export function windTexture(u: GriddedValues, v: GriddedValues): THREE.DataTexture {
  const { ni, nj } = u.grid;
  const data = new Uint16Array(ni * nj * 2);
  for (let k = 0; k < ni * nj; k++) {
    data[k * 2] = THREE.DataUtils.toHalfFloat(u.values[k]);
    data[k * 2 + 1] = THREE.DataUtils.toHalfFloat(v.values[k]);
  }
  const tex = new THREE.DataTexture(data, ni, nj, THREE.RGFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
