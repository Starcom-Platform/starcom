/**
 * The temperature heat map (decision D-W, WX1): GFS 2 m temperature on its 1°
 * grid, blended smoothly over the planet by a shader. No geometry per point
 * and no dots: the grid's 65,160 values are one texture, and each pixel of the
 * shell looks its own place up in it.
 *
 * Where a pixel is: the shell sits in the scene's frame (latLngToGlobeWorld:
 * x = cos φ sin λ, y = sin φ, z = cos φ cos λ), so the shader inverts that,
 * φ = asin y and λ = atan2(x, z). Getting this wrong draws every value 90° of
 * longitude away, which has happened to two layers here before; the smoke
 * render checks it against the planet (a hot Sahara, a cold Antarctica).
 *
 * The texture holds degrees Celsius as half floats, which the GPU blends
 * linearly between grid points; the hover reads the same grid blended the
 * same way (gfsGrid.valueAt), so the number agrees with the colour beneath it.
 * Thin isotherms every 5 °C, and a stronger one at freezing, give the field
 * the shape a weather report draws.
 *
 * A moment between two of the model's 3-hour steps is drawn as both, blended
 * by how far between them it lies (WX10): two textures and a weight, so a
 * moving moment costs a uniform, not a texture.
 */
import * as THREE from 'three';
import type { GfsBlend, GfsField } from '../../../services/weather/gfs/gfsClient';
import { blendValueAt, blendWeight } from '../../../services/weather/gfs/gfsBlend';
import { formatUtcDateTime, formatUtcTime } from '../../../utils/utcTime';
import { answerHoversAsSphere, setWeatherReader, type WeatherPart } from './weatherReadout';
import { scalarTexture } from './cloudShell';
import { WEATHER_FIELDS } from '../globeAltitudes';
import { DATA_SCALES } from '../../../styles/tokens';

const GLOBE_RADIUS_UNITS = 100;
const KELVIN = 273.15;

/** The ramp, cold to hot: the temperature scale in tokens.ts (no cyan; see there). */
export const TEMPERATURE_STOPS: ReadonlyArray<{ celsius: number; color: string }> =
  DATA_SCALES.temperatureC.map(([celsius, color]) => ({ celsius, color }));
const RAMP_MIN = TEMPERATURE_STOPS[0].celsius;
const RAMP_MAX = TEMPERATURE_STOPS[TEMPERATURE_STOPS.length - 1].celsius;
const RAMP_TEXELS = 256;

const STOP_BYTES = TEMPERATURE_STOPS.map((s) => ({ celsius: s.celsius, rgb: [1, 3, 5].map((k) => parseInt(s.color.slice(k, k + 2), 16)) }));

/**
 * The ramp's colour at a temperature as the screen shows it: sRGB bytes,
 * blended between its stops as they were authored.
 *
 * Not through THREE.Color: its set() turns a hex colour into linear light,
 * and the strip built from that drew every colour darker and redder (188 of
 * green became 131), while a test built the same way agreed with it. Seen on
 * the rendered globe, 2026-10-05.
 */
export function temperatureRgb(celsius: number): [number, number, number] {
  const c = Math.min(Math.max(celsius, RAMP_MIN), RAMP_MAX);
  let i = 0;
  while (i < STOP_BYTES.length - 2 && c > STOP_BYTES[i + 1].celsius) i++;
  const a = STOP_BYTES[i], b = STOP_BYTES[i + 1];
  const t = (c - a.celsius) / (b.celsius - a.celsius);
  return [0, 1, 2].map((k) => Math.round(a.rgb[k] + (b.rgb[k] - a.rgb[k]) * t)) as [number, number, number];
}

/** The same colour as a THREE.Color, for the key: it reads back as the same bytes. */
export function temperatureColor(celsius: number, target = new THREE.Color()): THREE.Color {
  const [r, g, b] = temperatureRgb(celsius);
  return target.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
}

/** The ramp as a 256-texel strip of sRGB bytes, RGBA, coldest first. */
export function rampTextureData(): Uint8Array {
  const data = new Uint8Array(RAMP_TEXELS * 4);
  for (let i = 0; i < RAMP_TEXELS; i++) {
    data.set([...temperatureRgb(RAMP_MIN + ((RAMP_MAX - RAMP_MIN) * i) / (RAMP_TEXELS - 1)), 255], i * 4);
  }
  return data;
}

function rampTexture(): THREE.DataTexture {
  // Bytes as authored (sRGB), sampled raw and written straight out, so the screen shows them as authored.
  const tex = new THREE.DataTexture(rampTextureData(), RAMP_TEXELS, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** The field as the shader samples it: °C as half floats, 360 × 181, wrapping east–west. */
export function fieldTexture(field: Pick<GfsField, 'grid' | 'values'>): THREE.DataTexture {
  return scalarTexture(field, (kelvin) => kelvin - KELVIN);
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
  uniform sampler2D field;
  uniform sampler2D fieldNext;
  uniform float weight;    // how far from field's hour to fieldNext's the moment lies
  uniform sampler2D ramp;
  uniform vec2 gridSize;   // columns, rows
  uniform vec2 rampRange;  // °C at the ramp's two ends
  uniform float opacity;
  varying vec3 vDir;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;

  void main() {
    vec3 d = normalize(vDir);
    float lat = degrees(asin(clamp(d.y, -1.0, 1.0)));
    float lng = degrees(atan(d.x, d.z));
    if (lng < 0.0) lng += 360.0;
    // Texel centres: column i holds longitude i°, row j latitude 90 - j°.
    vec2 uv = vec2((lng + 0.5) / gridSize.x, (90.0 - lat + 0.5) / gridSize.y);
    float celsius = mix(texture2D(field, uv).r, texture2D(fieldNext, uv).r, weight);

    float t = clamp((celsius - rampRange.x) / (rampRange.y - rampRange.x), 0.0, 1.0);
    vec3 color = texture2D(ramp, vec2(t, 0.5)).rgb;

    // Isotherms: a thin line every 5 °C, a firmer one at freezing.
    float band = celsius / 5.0;
    float w = max(fwidth(band), 1e-4);
    float iso = 1.0 - smoothstep(0.0, 1.2 * w, abs(fract(band - 0.5) - 0.5));
    float freezing = 1.0 - smoothstep(0.0, 1.8 * w, abs(band));
    color = mix(color, color * 0.62, iso * 0.55);
    color = mix(color, vec3(1.0), freezing * 0.45);

    // Soften toward the limb, so the field reads as the ground's colour, not a shell.
    float facing = dot(normalize(vViewNormal), normalize(-vViewPosition));
    float alpha = opacity * smoothstep(0.0, 0.35, facing);
    gl_FragColor = vec4(color, alpha);
  }
`;

export type TemperatureUnit = 'celsius' | 'fahrenheit' | 'kelvin';

/** The temperature and its source, as the shared weather readout joins them. */
export function temperaturePart(kelvin: number, source: string, unit: TemperatureUnit): WeatherPart {
  const value = unit === 'kelvin' ? `${kelvin.toFixed(1)} K`
    : unit === 'fahrenheit' ? `${((kelvin - KELVIN) * 1.8 + 32).toFixed(1)} °F`
      : `${(kelvin - KELVIN).toFixed(1)} °C`;
  return { value, source };
}

/**
 * Where a GFS value comes from and the moment it holds for, as every weather
 * reading names it: one step's hour, or the moment and the two hours blended.
 */
export function gfsSourceLine(blend: { before: Pick<GfsField, 'source' | 'valid'>; after: Pick<GfsField, 'valid'> }, at: number): string {
  const source = blend.before.source === 'pacioos' ? 'NOAA GFS model via PacIOOS' : 'NOAA GFS model';
  const first = blend.before.valid.getTime(), second = blend.after.valid.getTime();
  if (first === second) return `${source}, 1° grid, valid ${formatUtcDateTime(first)}`;
  return `${source}, 1° grid, ${formatUtcDateTime(at)}, blended from ${formatUtcTime(first)} and ${formatUtcTime(second)}`;
}

export interface HeatMapShell {
  mesh: THREE.Mesh;
  /** The reading at a point on (or near) the shell, in the scene's frame: every weather field on show there. */
  readAt(point: THREE.Vector3): string | null;
  /** Shown or hidden: a hidden heat map's temperature is not read out by another layer's hover. */
  setShown(shown: boolean): void;
  /** New steps, and the moment to weigh them for. */
  setBlend(blend: GfsBlend, at: number): void;
  /** The moment, moved between the same steps: only the weight changes. */
  setMoment(at: number): void;
  setUnit(unit: TemperatureUnit): void;
  setOpacity(opacity: number): void;
  dispose(): void;
}

export function createHeatMapShell(initial: GfsBlend, options: { unit: TemperatureUnit; at: number; opacity?: number }): HeatMapShell {
  let blend = initial;
  let at = options.at;
  let weight = blendWeight(blend, at);
  let unit = options.unit;
  const radius = GLOBE_RADIUS_UNITS * WEATHER_FIELDS;
  const geometry = new THREE.SphereGeometry(radius, 128, 64);
  const ramp = rampTexture();
  let textures = { first: fieldTexture(blend.before), second: fieldTexture(blend.after) };
  const material = new THREE.ShaderMaterial({
    uniforms: {
      field: { value: textures.first },
      fieldNext: { value: textures.second },
      weight: { value: weight },
      ramp: { value: ramp },
      gridSize: { value: new THREE.Vector2(blend.before.grid.ni, blend.before.grid.nj) },
      rampRange: { value: new THREE.Vector2(RAMP_MIN, RAMP_MAX) },
      opacity: { value: options.opacity ?? 0.85 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'temperature-heat-map';
  // First among the see-through layers: fills, lines and clouds draw over it.
  mesh.renderOrder = -1;

  // The hover meets it as a sphere and reads every weather field on show (weatherReadout.ts).
  answerHoversAsSphere(mesh, radius);
  const reader = (lat: number, lng: number) => {
    const k = blendValueAt(blend, weight, lat, lng);
    return k === null ? null : temperaturePart(k, gfsSourceLine(blend, at), unit);
  };
  setWeatherReader('temperature', reader);

  const weigh = (moment: number) => {
    at = moment;
    weight = blendWeight(blend, at);
    material.uniforms.weight.value = weight;
  };

  return {
    mesh,
    readAt: (point) => mesh.userData.readAt(point),
    setShown(shown) { setWeatherReader('temperature', shown ? reader : null); },
    setBlend(next, moment) {
      blend = next;
      textures.first.dispose();
      textures.second.dispose();
      textures = { first: fieldTexture(next.before), second: fieldTexture(next.after) };
      material.uniforms.field.value = textures.first;
      material.uniforms.fieldNext.value = textures.second;
      material.uniforms.gridSize.value.set(next.before.grid.ni, next.before.grid.nj);
      weigh(moment);
    },
    setMoment: weigh,
    setUnit(next) { unit = next; },
    setOpacity(next) { material.uniforms.opacity.value = next; },
    dispose() {
      setWeatherReader('temperature', null);
      geometry.dispose();
      textures.first.dispose();
      textures.second.dispose();
      ramp.dispose();
      material.dispose();
    },
  };
}
