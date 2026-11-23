/**
 * The mini-globe drawn on a 2D canvas, where the quality governor steps a device down (decision D-MG,
 * mini-globe.md, MG1): no second WebGL context, and the same look as the WebGL minimap.
 *
 * Seen as the WebGL minimap sees it: from 3 globe radii (its altitude, 2) through a 50° lens, so the
 * disc is the cap 70.5° round the pose and its limb falls where the WebGL one's does. North up, east to
 * the right. Each pixel is a ray, met with the sphere. Each skin is shaded as its shader shades it (GlobeMaterialManager.ts),
 * in linear light, from the same textures read at a small size: Cyber Earth's land, water, coasts,
 * graticule, amber city lights and rim; Terrain's greys; Day and night's day map over its city lights;
 * Blue Marble lit as three.js lights its Phong material, by the Sun and the night-side ambient. The
 * relief a bump map adds is left out: at 110 px it is under a pixel.
 *
 * Pure: the component reads the textures and puts the pixels on a canvas.
 */
import type { GlobeSkin } from '../../services/globe/globeAppearance';
import type { Pose } from './minimapOrbit';

/** An image's pixels, RGBA, row by row from the top: an ImageData's shape. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type MinimapTextureName = 'earthDay' | 'earthNight' | 'blueMarble' | 'earthDark' | 'earthWater';

/** The textures each skin is drawn from here: its shader's, less the bump and specular maps. */
export const MINIMAP_SKIN_TEXTURES: Record<GlobeSkin, readonly MinimapTextureName[]> = {
  cyberEarth: ['earthDark', 'earthWater', 'earthNight'],
  dayNight: ['earthDay', 'earthNight'],
  blueMarble: ['blueMarble'],
  terrain: ['earthDay', 'earthWater'],
};

/** Masks, read as numbers; every other texture is a picture, decoded from sRGB. */
export const MINIMAP_DATA_MAPS: ReadonlySet<MinimapTextureName> = new Set(['earthWater']);

/** How small the textures are read: about 0.7° a pixel, finer than the minimap's 2° a pixel. */
export const MINIMAP_TEXTURE_SIZE = { width: 512, height: 256 } as const;

export interface MinimapLight {
  /** Where the Sun is overhead. */
  sun: { lat: number; lng: number };
  /** How much of the day still reads on the night side (DEFAULT_NIGHT_FILL). */
  nightFill: number;
}

const DEG = Math.PI / 180;
type Vec = [number, number, number];

/** A place as a unit vector: x toward 0°N 0°E, y toward 0°N 90°E, z toward the north pole. */
function unit(lat: number, lng: number): Vec {
  const c = Math.cos(lat * DEG);
  return [c * Math.cos(lng * DEG), c * Math.sin(lng * DEG), Math.sin(lat * DEG)];
}

/** The pose's east, north and out, the disc's right, up and toward the viewer. */
function basis(pose: Pose): { east: Vec; north: Vec; out: Vec } {
  const sLat = Math.sin(pose.lat * DEG), cLat = Math.cos(pose.lat * DEG);
  const sLng = Math.sin(pose.lng * DEG), cLng = Math.cos(pose.lng * DEG);
  return { east: [-sLng, cLng, 0], north: [-sLat * cLng, -sLat * sLng, cLat], out: [cLat * cLng, cLat * sLng, sLat] };
}

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The camera's distance from the centre, in globe radii: the WebGL minimap's altitude, 2, plus one. */
const CAMERA_DISTANCE = 3;
/** react-globe.gl's lens: 50° top to bottom. */
const HALF_FOV = 25 * DEG;
/** The sphere's silhouette, as the tangent of its half-angle from the camera. */
const SILHOUETTE_TAN = Math.tan(Math.asin(1 / CAMERA_DISTANCE));

/** The disc's radius in a square canvas of `size` px, as the WebGL minimap draws it: about 0.38 of it. */
export const discRadius = (size: number) => (size / 2) * (SILHOUETTE_TAN / Math.tan(HALF_FOV));

/** Where a ray through a point of the disc (x, y in disc radii, y up) meets the sphere, or null. */
function hit(x: number, y: number, b: { east: Vec; north: Vec; out: Vec }): Vec | null {
  const d: Vec = [0, 1, 2].map((i) => x * SILHOUETTE_TAN * b.east[i] + y * SILHOUETTE_TAN * b.north[i] - b.out[i]) as Vec;
  const length = Math.hypot(d[0], d[1], d[2]);
  d[0] /= length; d[1] /= length; d[2] /= length;
  // |O + t d| = 1, with O = out × D: t² + 2t(O·d) + D² − 1 = 0, the nearer root.
  const od = CAMERA_DISTANCE * dot(b.out, d);
  const disc = od * od - (CAMERA_DISTANCE * CAMERA_DISTANCE - 1);
  if (disc < 0) return null;
  const t = -od - Math.sqrt(disc);
  return [0, 1, 2].map((i) => CAMERA_DISTANCE * b.out[i] + t * d[i]) as Vec;
}

/** Where a place falls on the minimap, and whether it faces the camera. */
export function projectToMinimap(lat: number, lng: number, pose: Pose, size: number): { x: number; y: number; front: boolean } {
  const p = unit(lat, lng);
  const b = basis(pose);
  const w: Vec = [0, 1, 2].map((i) => p[i] - CAMERA_DISTANCE * b.out[i]) as Vec;
  const depth = -dot(w, b.out);
  const r = discRadius(size);
  return {
    x: size / 2 + (dot(w, b.east) / depth / SILHOUETTE_TAN) * r,
    y: size / 2 - (dot(w, b.north) / depth / SILHOUETTE_TAN) * r,
    // Facing the camera: the surface turned toward it, not away.
    front: dot(p, w) < 0,
  };
}

/** The place under a point on the minimap, or null off the disc: click-to-fly's. */
export function pickMinimap(x: number, y: number, size: number, pose: Pose): { lat: number; lng: number } | null {
  const r = discRadius(size);
  const p = hit((x - size / 2) / r, (size / 2 - y) / r, basis(pose));
  if (!p) return null;
  return { lat: Math.asin(Math.max(-1, Math.min(1, p[2]))) / DEG, lng: Math.atan2(p[1], p[0]) / DEG };
}

// ─── Colour: sRGB bytes to linear light and back, as the GPU decodes a picture and three.js writes one ──
const TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const OUT_STEPS = 4096;
const TO_SRGB = new Uint8ClampedArray(OUT_STEPS + 1);
for (let i = 0; i <= OUT_STEPS; i++) {
  const c = i / OUT_STEPS;
  TO_SRGB[i] = Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
}
const srgb = (linear: number) => TO_SRGB[Math.round(Math.max(0, Math.min(1, linear)) * OUT_STEPS)];

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
/** The terminator every shader draws: day from 0.2 past it to 0.25 short of it. */
const dayAt = (cosSun: number) => smoothstep(-0.2, 0.25, cosSun);

/** Blue Marble's lights (globeLighting.ts): the Sun at 2.4 and the night side's ambient, 0xbfd4ff. */
const SUN_INTENSITY = 2.4;
const AMBIENT: Vec = [TO_LINEAR[0xbf], TO_LINEAR[0xd4], TO_LINEAR[0xff]];

/**
 * The minimap's pixels for a pose and a Sun, into `out`, a square of `out.width` px: every pixel off the
 * disc transparent. Throws for a texture the skin needs and was not given.
 */
export function drawMinimapPixels(
  out: Pixels,
  skin: GlobeSkin,
  textures: Partial<Record<MinimapTextureName, Pixels>>,
  pose: Pose,
  light: MinimapLight,
): void {
  for (const name of MINIMAP_SKIN_TEXTURES[skin]) {
    if (!textures[name]) throw new Error(`The ${skin} minimap needs ${name}, which was not read.`);
  }
  const size = out.width;
  const r = discRadius(size);
  const b = basis(pose);
  const sun = unit(light.sun.lat, light.sun.lng);
  const fill = light.nightFill;
  const data = out.data;
  data.fill(0);

  /** A texture's value at a place, nearest pixel: a picture's channel in linear light, a mask's as read. */
  const sampler = (name: MinimapTextureName) => {
    const t = textures[name]!;
    const linear = !MINIMAP_DATA_MAPS.has(name);
    return (u: number, v: number, channel: number) => {
      const x = Math.min(t.width - 1, Math.floor(u * t.width));
      const y = Math.min(t.height - 1, Math.floor(v * t.height));
      const byte = t.data[(y * t.width + x) * 4 + channel];
      return linear ? TO_LINEAR[byte] : byte / 255;
    };
  };
  const day = textures.earthDay ? sampler('earthDay') : null;
  const night = textures.earthNight ? sampler('earthNight') : null;
  const dark = textures.earthDark ? sampler('earthDark') : null;
  const water = textures.earthWater ? sampler('earthWater') : null;
  const marble = textures.blueMarble ? sampler('blueMarble') : null;

  for (let py = 0; py < size; py++) {
    const ny = (size / 2 - (py + 0.5)) / r;
    for (let px = 0; px < size; px++) {
      const nx = (px + 0.5 - size / 2) / r;
      if (nx * nx + ny * ny > 1) continue;
      const p = hit(nx, ny, b);
      if (!p) continue;
      const [p0, p1, p2] = p;
      // How square on the surface is to the camera: Cyber Earth's rim is where it turns away.
      const e0 = CAMERA_DISTANCE * b.out[0] - p0, e1 = CAMERA_DISTANCE * b.out[1] - p1, e2 = CAMERA_DISTANCE * b.out[2] - p2;
      const facing = Math.max(0, (p0 * e0 + p1 * e1 + p2 * e2) / Math.hypot(e0, e1, e2));
      const lat = Math.asin(Math.max(-1, Math.min(1, p2)));
      const lng = Math.atan2(p1, p0);
      const u = (lng / DEG + 180) / 360;
      const v = (90 - lat / DEG) / 180;
      const cosSun = p0 * sun[0] + p1 * sun[1] + p2 * sun[2];
      const lit = dayAt(cosSun);
      let cr: number, cg: number, cb: number;

      if (skin === 'cyberEarth') {
        const ocean = water!(u, v, 0);
        const relief = dark!(u, v, 0);
        cr = 0.05 + (0.35 - 0.05) * relief; cg = 0.55 + (0.95 - 0.55) * relief; cb = 0.55 + (0.85 - 0.55) * relief;
        cr += (0.02 - cr) * ocean; cg += (0.09 - cg) * ocean; cb += (0.16 - cb) * ocean;
        const coast = Math.max(0, 1 - Math.abs(ocean - 0.5) * 2) ** 3;
        cg += 0.45 * coast; cb += 0.5 * coast;
        const gx = Math.abs((u * 24) % 1 - 0.5), gy = Math.abs((v * 12) % 1 - 0.5);
        const line = 1 - smoothstep(0, 0.03, Math.min(gx, gy));
        cg += 0.2 * line; cb += 0.24 * line;
        const shade = 0.25 + fill + (1 - (0.25 + fill)) * lit;
        cr *= shade; cg *= shade; cb *= shade;
        const glow = (1 - lit) * 0.9;
        cr += night!(u, v, 0) * glow; cg += night!(u, v, 1) * 0.72 * glow; cb += night!(u, v, 2) * 0.35 * glow;
        const rim = (1 - facing) ** 2.5 * 0.8;
        cr += 0.1 * rim; cg += 0.75 * rim; cb += 0.85 * rim;
      } else if (skin === 'terrain') {
        const ar = day!(u, v, 0), ag = day!(u, v, 1), ab = day!(u, v, 2);
        const lum = 0.2126 * ar + 0.7152 * ag + 0.0722 * ab;
        const ocean = water!(u, v, 0);
        cr = 0.16 + (0.78 - 0.16) * lum; cg = 0.155 + (0.77 - 0.155) * lum; cb = 0.145 + (0.74 - 0.145) * lum;
        cr += (0.1 - cr) * ocean; cg += (0.12 - cg) * ocean; cb += (0.15 - cb) * ocean;
        const shade = 0.2 + fill + (1 - (0.2 + fill)) * lit;
        cr *= shade; cg *= shade; cb *= shade;
      } else if (skin === 'blueMarble') {
        // three.js's Lambert under Phong: albedo/π times each light's irradiance.
        const direct = (SUN_INTENSITY * Math.max(0, cosSun)) / Math.PI;
        cr = marble!(u, v, 0) * (direct + fill * AMBIENT[0]);
        cg = marble!(u, v, 1) * (direct + fill * AMBIENT[1]);
        cb = marble!(u, v, 2) * (direct + fill * AMBIENT[2]);
      } else {
        const dr = day!(u, v, 0), dg = day!(u, v, 1), db = day!(u, v, 2);
        const keep = fill * (1 - lit);
        cr = night!(u, v, 0) + (dr - night!(u, v, 0)) * lit + dr * keep;
        cg = night!(u, v, 1) + (dg - night!(u, v, 1)) * lit + dg * keep;
        cb = night!(u, v, 2) + (db - night!(u, v, 2)) * lit + db * keep;
      }
      const i = (py * size + px) * 4;
      data[i] = srgb(cr); data[i + 1] = srgb(cg); data[i + 2] = srgb(cb); data[i + 3] = 255;
    }
  }
}

/** The Sun's place from its direction in the scene's frame (latLngToGlobeWorld's: x east of 0°, y north, z toward 0°). */
export function sunPlaceOf(direction: { x: number; y: number; z: number }): { lat: number; lng: number } {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  return { lat: Math.asin(direction.y / length) / DEG, lng: Math.atan2(direction.x, direction.z) / DEG };
}
