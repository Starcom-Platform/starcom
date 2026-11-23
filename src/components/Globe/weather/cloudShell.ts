/**
 * Real clouds (decision D-W, WX2 as revised on 2026-10-06; WX7): EUMETSAT's
 * Geostationary Ring infrared mosaic, read as cloud and cloud-top height and
 * shaded in relief by the planet's own sun.
 *
 * What is cloud: in infrared, clear sky shows the ground's own temperature,
 * and a cloud shows its top's, colder. The ring's greys are linear in
 * temperature; measured on 2026-10-06 against GFS 2 m temperature over 62,000
 * cells from 70°S to 70°N, clear sky lies on grey ≈ 102 − 1.39 × T(°C) (the
 * darkest twentieth of each 2 °C band). So a pixel is cloud as far as it
 * reads colder than GFS says its ground is: faint from 8 greys (about 6 °C)
 * colder, opaque by 45 (about 32 °C). The colder the top, the higher, which
 * gives the relief its heights.
 *
 * Beyond the satellites' reach (80° of latitude) the ring is transparent, and
 * the poles take GFS's total cloud cover instead, drawn softer and keyed as
 * the model's, never as seen (WX7).
 */
import * as THREE from 'three';
import { formatUtcDateTime } from '../../../utils/utcTime';
import type { GriddedValues } from '../../../services/weather/gfs/gfsGrid';
import { CLOUDS } from '../globeAltitudes';
import { answerHoversAsSphere, setWeatherReader, type WeatherPart } from './weatherReadout';

const GLOBE_RADIUS_UNITS = 100;

/** Measured: clear sky's grey at 0 °C, and how much the grey falls for each degree warmer. */
const CLEAR_GREY_AT_0C = 102;
const GREY_PER_DEGREE = 1.39;
const FAINT_GREYS = 8;
const OPAQUE_GREYS = 45;

/** The grey clear sky shows over ground at this temperature. */
export function clearSkyGrey(surfaceC: number): number {
  return CLEAR_GREY_AT_0C - GREY_PER_DEGREE * surfaceC;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** How opaque the cloud is where the ring shows this grey over ground at this temperature. */
export function cloudOpacity(grey: number, surfaceC: number): number {
  return smoothstep(FAINT_GREYS, OPAQUE_GREYS, grey - clearSkyGrey(surfaceC));
}

/** A cloud top's temperature from its grey, by the same line. */
export function cloudTopCelsius(grey: number): number {
  return (CLEAR_GREY_AT_0C - grey) / GREY_PER_DEGREE;
}

/** What the hover says at a place: the tops of a cloud seen, or that none is; nothing beyond the satellites. */
export function cloudPart(pixel: { grey: number; covered: boolean }, surfaceC: number, slot: Date): WeatherPart | null {
  if (!pixel.covered) return null;
  const source = `EUMETSAT Geostationary Ring, ${formatUtcDateTime(slot.getTime())}`;
  if (cloudOpacity(pixel.grey, surfaceC) < 0.1) return { value: 'no cloud seen', source };
  return { value: `cloud tops ${Math.round(cloudTopCelsius(pixel.grey))} °C`, source };
}

/** What the hover says where the model's cloud is drawn, at an hour the satellites have not seen: its cover, called the model's. */
export function modelCloudPart(coverPercent: number, source: string): WeatherPart {
  return { value: `cloud cover ${Math.round(coverPercent)}% (model)`, source };
}

/** Any gridded field as the shaders sample it: half floats, transformed, wrapping east–west. */
export function scalarTexture(field: GriddedValues, transform: (v: number) => number): THREE.DataTexture {
  const { ni, nj } = field.grid;
  const data = new Uint16Array(ni * nj);
  for (let k = 0; k < data.length; k++) data[k] = THREE.DataUtils.toHalfFloat(transform(field.values[k]));
  const tex = new THREE.DataTexture(data, ni, nj, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;
  void main() {
    vDir = normalize(position);
    vViewNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D ir;             // the ring: greys, north at v = 0, from 180°W
  uniform sampler2D surface;        // GFS 2 m temperature, °C, column i at i°E
  uniform sampler2D modelCover;     // GFS total cloud cover, 0 to 1, at the step before the moment
  uniform sampler2D modelCoverNext; // and at the step after it
  uniform float coverWeight;        // how far between the two steps the moment lies
  uniform float modelEverywhere;    // 1 at an hour the satellites have not seen (WX11)
  uniform vec2 irTexel;
  uniform vec2 gridTexel;
  uniform vec3 sunDir;
  uniform float opacity;
  uniform float relief;
  uniform float modelRelief;
  varying vec3 vDir;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;

  float coverAt(vec2 uv) { return mix(texture2D(modelCover, uv).r, texture2D(modelCoverNext, uv).r, coverWeight); }

  // How opaque the model's cloud is drawn for its cover. Measured against the satellites on 6 October 2026 at
  // two hours: they show as cloud about a quarter of the planet between 60° N and S, which the model covers
  // almost wholly (its share above 98% matched theirs; the two agreed on 78% of the area). So near-total cover
  // is drawn as cloud, and partial cover as a thin veil, not as the milky sheet a lower threshold drew.
  float modelAlpha(float cover) { return max(smoothstep(0.90, 1.0, cover) * 0.9, smoothstep(0.45, 0.90, cover) * 0.2); }

  // The cover averaged over a cell's neighbours, so a steep threshold on a 1° grid draws round edges rather
  // than its cells' outlines. Smoothing only: no detail is added that the model does not have.
  float coverSoft(vec2 uv) {
    vec2 dx = vec2(gridTexel.x, 0.0), dy = vec2(0.0, gridTexel.y);
    return (4.0 * coverAt(uv)
      + coverAt(uv + dx) + coverAt(uv - dx) + coverAt(uv + dy) + coverAt(uv - dy)
      + coverAt(uv + dx + dy) + coverAt(uv - dx - dy) + coverAt(uv + dx - dy) + coverAt(uv - dx + dy)) / 12.0;
  }

  // Cloud lit as it stands: by day sunlit in relief; by night moonlit, cool and still legible, as infrared sees it.
  vec3 shade(vec3 n, float sun, float a) {
    float day = smoothstep(-0.12, 0.25, sun);
    float lit = mix(0.66 + 0.18 * max(dot(n, -sunDir), 0.0), 0.5 + 0.5 * max(dot(n, sunDir), 0.0), day);
    vec3 tint = mix(vec3(0.80, 0.86, 0.96), vec3(1.0), day);
    return vec3(0.84 + 0.16 * a) * lit * tint;
  }

  void main() {
    vec3 d = normalize(vDir);
    float latR = asin(clamp(d.y, -1.0, 1.0));
    float lngR = atan(d.x, d.z);
    float lat = degrees(latR), lng = degrees(lngR);
    vec2 irUV = vec2((lng + 180.0) / 360.0, (90.0 - lat) / 180.0);
    float lng360 = lng < 0.0 ? lng + 360.0 : lng;
    vec2 gridUV = vec2((lng360 + 0.5) / 360.0, (90.0 - lat + 0.5) / 181.0);
    float sun = dot(d, sunDir);
    vec3 eastDir = vec3(cos(lngR), 0.0, -sin(lngR));
    vec3 northDir = vec3(-sin(latR) * sin(lngR), cos(latR), -sin(latR) * cos(lngR));

    vec4 seen = texture2D(ir, irUV);
    vec3 color;
    float a;
    if (modelEverywhere > 0.5) {
      // An hour the satellites have not seen: the model's cloud everywhere, shaded as seen cloud is, thicker cover standing higher.
      float cover = coverSoft(gridUV);
      a = modelAlpha(cover);
      float east = coverSoft(gridUV + vec2(gridTexel.x, 0.0)) - coverSoft(gridUV - vec2(gridTexel.x, 0.0));
      float north = coverSoft(gridUV - vec2(0.0, gridTexel.y)) - coverSoft(gridUV + vec2(0.0, gridTexel.y));
      color = shade(normalize(d - modelRelief * (east * eastDir + north * northDir)), sun, a);
    } else if (seen.a > 0.5) {
      float surfaceC = texture2D(surface, gridUV).r;
      float grey = seen.r * 255.0;
      float colder = grey - (${CLEAR_GREY_AT_0C.toFixed(1)} - ${GREY_PER_DEGREE.toFixed(2)} * surfaceC);
      a = smoothstep(${FAINT_GREYS.toFixed(1)}, ${OPAQUE_GREYS.toFixed(1)}, colder);
      // Relief: colder is higher. The slope of the greys tilts each top toward or away from the sun.
      float east = texture2D(ir, irUV + vec2(irTexel.x, 0.0)).r - texture2D(ir, irUV - vec2(irTexel.x, 0.0)).r;
      float north = texture2D(ir, irUV - vec2(0.0, irTexel.y)).r - texture2D(ir, irUV + vec2(0.0, irTexel.y)).r;
      color = shade(normalize(d - relief * (east * eastDir + north * northDir)), sun, a);
    } else {
      // Beyond the satellites: the model's cloud, softer, and greyer than seen cloud.
      float cover = coverSoft(gridUV);
      a = modelAlpha(cover) * 0.65;
      color = vec3(0.78) * mix(0.66, 1.0, smoothstep(-0.12, 0.25, sun));
    }
    float facing = dot(normalize(vViewNormal), normalize(-vViewPosition));
    gl_FragColor = vec4(color, a * opacity * smoothstep(0.0, 0.3, facing));
  }
`;

export interface CloudShell {
  mesh: THREE.Mesh;
  setSun(direction: THREE.Vector3): void;
  /** How far between the cover's two steps the moment lies: only a uniform changes. */
  setCoverWeight(weight: number): void;
  /** New steps of the model's cover, the satellite image kept: the caller disposes the old textures. */
  setCover(first: THREE.Texture, second: THREE.Texture): void;
  setShown(shown: boolean): void;
  dispose(): void;
}

export function createCloudShell(options: {
  ir: THREE.Texture;
  irSize: { width: number; height: number };
  surface: THREE.Texture;
  /** GFS total cloud cover, 0 to 1, at the steps before and after the moment, and how far between them it lies. */
  cover: { first: THREE.Texture; second: THREE.Texture; weight: number };
  /** An hour the satellites have not seen, such as any forecast hour: the model's cloud everywhere (WX11). */
  modelEverywhere?: boolean;
  /** What the hover says at a place: the hook reads the ring's pixels on the CPU. */
  read: (lat: number, lng: number) => WeatherPart | null;
  opacity?: number;
}): CloudShell {
  const radius = GLOBE_RADIUS_UNITS * CLOUDS;
  const geometry = new THREE.SphereGeometry(radius, 128, 64);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ir: { value: options.ir },
      surface: { value: options.surface },
      modelCover: { value: options.cover.first },
      modelCoverNext: { value: options.cover.second },
      coverWeight: { value: options.cover.weight },
      modelEverywhere: { value: options.modelEverywhere ? 1 : 0 },
      irTexel: { value: new THREE.Vector2(1 / options.irSize.width, 1 / options.irSize.height) },
      gridTexel: { value: new THREE.Vector2(1 / 360, 1 / 181) },
      sunDir: { value: new THREE.Vector3(0, 0, 1) },
      opacity: { value: options.opacity ?? 0.92 },
      relief: { value: 9.0 },
      modelRelief: { value: 2.5 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'real-clouds';
  answerHoversAsSphere(mesh, radius);
  setWeatherReader('clouds', options.read);
  return {
    mesh,
    setSun(direction) { material.uniforms.sunDir.value.copy(direction).normalize(); },
    setCoverWeight(weight) { material.uniforms.coverWeight.value = weight; },
    setCover(first, second) {
      material.uniforms.modelCover.value = first;
      material.uniforms.modelCoverNext.value = second;
    },
    setShown(shown) { setWeatherReader('clouds', shown ? options.read : null); },
    dispose() {
      setWeatherReader('clouds', null);
      geometry.dispose();
      material.dispose();
    },
  };
}
