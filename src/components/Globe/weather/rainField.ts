/**
 * Rain on the ground (decision D-W, WX4; WX8: one ground colour at a time):
 * one field from GFS's mean rain everywhere and RainViewer's radar where
 * radar reaches, drawn in a weather report's scale.
 *
 * Where radar reaches it decides, rain or none: an observation beats a model.
 * Where it does not (the oceans, most of Africa and Asia), the model's rain
 * stands, and the hover and the card say which is which. Snow seen by radar
 * is given as its water, as forecasts give it.
 *
 * The field is 1024 × 512, a third of a degree a pixel: about radar's own
 * resolution at zoom 2, and finer than the model's degree.
 *
 * A moment between two of the model's steps is drawn as both steps' fields,
 * each with the same radar, blended by how far between them it lies (WX10).
 */
import * as THREE from 'three';
import { valueAt } from '../../../services/weather/gfs/gfsGrid';
import type { GfsField } from '../../../services/weather/gfs/gfsClient';
import { radarAt } from '../../../services/weather/rainviewer/radar';
import type { RadarFrame } from '../../../services/weather/rainviewer/rainViewerClient';
import { DATA_SCALES } from '../../../styles/tokens';
import { WEATHER_FIELDS } from '../globeAltitudes';
import { answerHoversAsSphere, setWeatherReader, type WeatherPart } from './weatherReadout';
import { formatUtcDateTime } from '../../../utils/utcTime';

const GLOBE_RADIUS_UNITS = 100;

/** The rain scale, light to heavy: tokens.ts's (no cyan; see there). */
export const RAIN_STOPS: ReadonlyArray<{ mmPerHour: number; color: string }> =
  DATA_SCALES.rainMmH.map(([mmPerHour, color]) => ({ mmPerHour, color }));
const LOG_MIN = Math.log10(RAIN_STOPS[0].mmPerHour);
const LOG_MAX = Math.log10(RAIN_STOPS[RAIN_STOPS.length - 1].mmPerHour);
/** Below this a place is dry on the map: the scale's first stop. */
const SHOWN_FROM_MM = RAIN_STOPS[0].mmPerHour;

export const RAIN_FIELD_SIZE = { width: 1024, height: 512 } as const;

const STOP_BYTES = RAIN_STOPS.map((s) => ({ log: Math.log10(s.mmPerHour), rgb: [1, 3, 5].map((k) => parseInt(s.color.slice(k, k + 2), 16)) }));

/** A rate's colour as the screen shows it, blended between stops on a log scale (the authored bytes, not THREE.Color's linear light). */
export function rainRgb(mmPerHour: number): [number, number, number] {
  const l = Math.min(Math.max(Math.log10(Math.max(mmPerHour, 1e-6)), LOG_MIN), LOG_MAX);
  let i = 0;
  while (i < STOP_BYTES.length - 2 && l > STOP_BYTES[i + 1].log) i++;
  const a = STOP_BYTES[i], b = STOP_BYTES[i + 1];
  const t = (l - a.log) / (b.log - a.log);
  return [0, 1, 2].map((k) => Math.round(a.rgb[k] + (b.rgb[k] - a.rgb[k]) * t)) as [number, number, number];
}

/** The scale as a 256-texel strip, RGBA, from 0.1 to 100 mm/h on a log scale. */
export function rainRampData(): Uint8Array {
  const d = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) d.set([...rainRgb(10 ** (LOG_MIN + ((LOG_MAX - LOG_MIN) * i) / 255)), 255], i * 4);
  return d;
}

export interface RainField {
  /** mm/h, row by row from the north, columns from 0° east. */
  rate: Float32Array;
  /** Where each value came from: 0 the model, 1 radar rain, 2 radar snow. */
  source: Uint8Array;
}

/** The model everywhere, radar where radar reaches. */
export function composeRain(model: Pick<GfsField, 'grid' | 'values'>, radar: RadarFrame | null): RainField {
  const { width, height } = RAIN_FIELD_SIZE;
  const rate = new Float32Array(width * height), source = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const lat = 90 - ((y + 0.5) * 180) / height;
    for (let x = 0; x < width; x++) {
      const lng = ((x + 0.5) * 360) / width;
      const k = y * width + x;
      const seen = radar ? radarAt(radar.mosaic, lat, lng > 180 ? lng - 360 : lng) : null;
      if (seen?.covered) {
        rate[k] = seen.rate;
        source[k] = seen.snow ? 2 : 1;
      } else {
        rate[k] = Math.max(valueAt(model, lat, lng) ?? 0, 0) * 3600;
      }
    }
  }
  return { rate, source };
}

/** The two steps' fields around a moment: the same field for one step. */
export interface RainFields {
  first: RainField;
  second: RainField;
}

/** The rain at a place for a weight, blended as the shader blends it, and where it came from. */
export function rainAt(fields: RainFields, weight: number, lat: number, lng: number): { rate: number; source: number } {
  const lng360 = ((lng % 360) + 360) % 360;
  const x = Math.min(Math.floor((lng360 / 360) * RAIN_FIELD_SIZE.width), RAIN_FIELD_SIZE.width - 1);
  const y = Math.min(Math.max(Math.floor(((90 - lat) / 180) * RAIN_FIELD_SIZE.height), 0), RAIN_FIELD_SIZE.height - 1);
  const k = y * RAIN_FIELD_SIZE.width + x;
  const a = fields.first.rate[k], b = fields.second.rate[k];
  return { rate: weight === 0 ? a : a + (b - a) * weight, source: fields.first.source[k] };
}

/** What the hover says: the rate, rain or snow, and whether radar or the model (named by its source line) says it. */
export function rainPart(rate: number, source: number, radarTime: Date | null, modelSource: string): WeatherPart {
  const fromRadar = source !== 0;
  const where = fromRadar && radarTime ? `RainViewer radar, ${formatUtcDateTime(radarTime.getTime())}` : modelSource;
  if (rate < SHOWN_FROM_MM) return { value: 'no rain', source: where };
  const amount = `${rate.toFixed(1)} mm/h`;
  return { value: source === 2 ? `snow ${amount} as water (radar)` : `rain ${amount} (${fromRadar ? 'radar' : 'model'})`, source: where };
}

/** The field as the shader samples it: mm/h as half floats, wrapping east–west. */
export function rainTexture(field: RainField): THREE.DataTexture {
  const { width, height } = RAIN_FIELD_SIZE;
  const data = new Uint16Array(width * height);
  for (let k = 0; k < data.length; k++) data[k] = THREE.DataUtils.toHalfFloat(Math.min(field.rate[k], 60000));
  const tex = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.HalfFloatType);
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
  uniform sampler2D field;
  uniform sampler2D fieldNext;
  uniform float weight;    // how far from field's hour to fieldNext's the moment lies
  uniform sampler2D ramp;
  uniform float opacity;
  varying vec3 vDir;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;
  void main() {
    vec3 d = normalize(vDir);
    float lat = degrees(asin(clamp(d.y, -1.0, 1.0)));
    float lng = degrees(atan(d.x, d.z));
    if (lng < 0.0) lng += 360.0;
    vec2 uv = vec2(lng / 360.0, (90.0 - lat) / 180.0);
    float rate = mix(texture2D(field, uv).r, texture2D(fieldNext, uv).r, weight);
    float t = clamp((log(max(rate, 1e-4)) / log(10.0) - (${LOG_MIN.toFixed(4)})) / ${(LOG_MAX - LOG_MIN).toFixed(4)}, 0.0, 1.0);
    vec3 color = texture2D(ramp, vec2(t, 0.5)).rgb;
    // Dry below the scale's first stop, fading in across it rather than cut.
    float wet = smoothstep(${(SHOWN_FROM_MM * 0.6).toFixed(3)}, ${(SHOWN_FROM_MM * 1.6).toFixed(3)}, rate);
    float facing = dot(normalize(vViewNormal), normalize(-vViewPosition));
    gl_FragColor = vec4(color, wet * opacity * smoothstep(0.0, 0.35, facing));
  }
`;

export interface RainShell {
  mesh: THREE.Mesh;
  /** New steps' fields: the one at or before the moment, and the one after. */
  setFields(first: RainField, second: RainField): void;
  /** How far between them the moment lies: only a uniform changes. */
  setWeight(weight: number): void;
  setShown(shown: boolean): void;
  dispose(): void;
}

export function createRainShell(initial: RainFields & { weight: number }, read: (lat: number, lng: number) => WeatherPart | null, options: { opacity?: number } = {}): RainShell {
  const radius = GLOBE_RADIUS_UNITS * WEATHER_FIELDS;
  const geometry = new THREE.SphereGeometry(radius, 128, 64);
  const ramp = new THREE.DataTexture(rainRampData(), 256, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  ramp.magFilter = THREE.LinearFilter;
  ramp.minFilter = THREE.LinearFilter;
  ramp.needsUpdate = true;
  let textures = { first: rainTexture(initial.first), second: rainTexture(initial.second) };
  const material = new THREE.ShaderMaterial({
    uniforms: {
      field: { value: textures.first },
      fieldNext: { value: textures.second },
      weight: { value: initial.weight },
      ramp: { value: ramp },
      opacity: { value: options.opacity ?? 0.88 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'rain-field';
  // The ground's colour, as the heat map is: first among the see-through layers.
  mesh.renderOrder = -1;
  answerHoversAsSphere(mesh, radius);
  setWeatherReader('rain', read);
  return {
    mesh,
    setFields(first, second) {
      textures.first.dispose();
      textures.second.dispose();
      textures = { first: rainTexture(first), second: rainTexture(second) };
      material.uniforms.field.value = textures.first;
      material.uniforms.fieldNext.value = textures.second;
    },
    setWeight(weight) { material.uniforms.weight.value = weight; },
    setShown(shown) { setWeatherReader('rain', shown ? read : null); },
    dispose() {
      setWeatherReader('rain', null);
      geometry.dispose();
      textures.first.dispose();
      textures.second.dispose();
      ramp.dispose();
      material.dispose();
    },
  };
}
