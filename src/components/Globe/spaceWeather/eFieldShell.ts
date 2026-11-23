/**
 * The geoelectric field as a colour field (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW1, SW2).
 *
 * Every cell of NOAA's 0.5° grid (eFieldGrid.ts) is one texel, and a patch of the
 * sphere over the grid looks each pixel's own place up in it, as the temperature
 * heat map does (weather/heatMap.ts): no geometry per sample and no dots. The
 * strength colours it on a log scale of mV/km, since a quiet field runs to a few
 * and a storm's to thousands; thin lines at each decade (1, 10, 100, 1000) give it
 * a weather map's shape. Where no model holds a cell the field fades out, never to
 * zero: the texture holds each cell's east and north premultiplied by whether a
 * model holds it, and that coverage as its own channel, so the GPU's blending
 * between texels thins the field at its edge rather than drawing it weaker.
 *
 * The scale is absolute by default, so a colour means the same strength every
 * day; relative (SW2) stretches it over the field drawn now.
 */
import * as THREE from 'three';
import type { EFieldGrid } from '../../../services/spaceWeather/eFieldGrid';
import { DATA_SCALES } from '../../../styles/tokens';
import type { EFieldLook } from '../../../hooks/useEcoNaturalSettings';

const STOPS = DATA_SCALES.eFieldMvKm.map(([mvkm, color]) => ({ log: Math.log10(mvkm), rgb: [1, 3, 5].map((k) => parseInt(color.slice(k, k + 2), 16)) }));
/** The absolute scale's two ends, as log10 of mV/km. */
export const E_FIELD_RANGE: [number, number] = [STOPS[0].log, STOPS[STOPS.length - 1].log];
const RAMP_TEXELS = 256;

/** The ramp's colour at a strength in mV/km, as sRGB bytes, blended between its stops in log. Not through THREE.Color (heatMap.ts says why). */
export function eFieldRgb(mvkm: number): [number, number, number] {
  const l = Math.min(Math.max(Math.log10(Math.max(mvkm, 1e-9)), E_FIELD_RANGE[0]), E_FIELD_RANGE[1]);
  let i = 0;
  while (i < STOPS.length - 2 && l > STOPS[i + 1].log) i++;
  const a = STOPS[i], b = STOPS[i + 1];
  const t = (l - a.log) / (b.log - a.log);
  return [0, 1, 2].map((k) => Math.round(a.rgb[k] + (b.rgb[k] - a.rgb[k]) * t)) as [number, number, number];
}

const WHEEL = DATA_SCALES.eFieldDirection.map(([deg, color]) => ({ deg, rgb: [1, 3, 5].map((k) => parseInt(color.slice(k, k + 2), 16)) }));

/** The way a field points, degrees clockwise from north, from its east and north components. */
export function azimuthOf(east: number, north: number): number {
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}

/** The relief look's colour for a direction (SW1): the wheel's four hues, blended round between them, as sRGB bytes. */
export function eFieldDirectionRgb(azimuthDeg: number): [number, number, number] {
  const a = ((azimuthDeg % 360) + 360) % 360;
  let i = WHEEL.length - 1;
  while (i > 0 && a < WHEEL[i].deg) i--;
  const from = WHEEL[i], to = WHEEL[(i + 1) % WHEEL.length];
  const span = (to.deg - from.deg + 360) % 360 || 360;
  const t = (a - from.deg) / span;
  return [0, 1, 2].map((k) => Math.round(from.rgb[k] + (to.rgb[k] - from.rgb[k]) * t)) as [number, number, number];
}

/** How far the relief look raises the strongest field, as a share of the globe's radius: about 190 km, to be seen. */
export const RELIEF_MAX = 0.03;

/** The relief's height for a strength, on the colours' log scale: nothing at its weak end, RELIEF_MAX at its strong one. */
export function reliefHeight(mvkm: number): number {
  const l = Math.min(Math.max(Math.log10(Math.max(mvkm, 1e-9)), E_FIELD_RANGE[0]), E_FIELD_RANGE[1]);
  return (RELIEF_MAX * (l - E_FIELD_RANGE[0])) / (E_FIELD_RANGE[1] - E_FIELD_RANGE[0]);
}

/** The direction wheel as a strip of sRGB bytes from north round to north. */
function wheelTexture(): THREE.DataTexture {
  const data = new Uint8Array(RAMP_TEXELS * 4);
  for (let i = 0; i < RAMP_TEXELS; i++) data.set([...eFieldDirectionRgb((360 * i) / RAMP_TEXELS), 255], i * 4);
  const tex = new THREE.DataTexture(data, RAMP_TEXELS, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** How the field shows its direction (SW1): the code each look has in the shader. */
export const LOOK_CODE: Record<EFieldLook, number> = { streaks: 0, arrows: 1, ripples: 2, relief: 3 };

/** The ramp as a strip of sRGB bytes over the absolute range, weakest first; a relative range samples part of it. */
function rampTexture(): THREE.DataTexture {
  const data = new Uint8Array(RAMP_TEXELS * 4);
  for (let i = 0; i < RAMP_TEXELS; i++) {
    const l = E_FIELD_RANGE[0] + ((E_FIELD_RANGE[1] - E_FIELD_RANGE[0]) * i) / (RAMP_TEXELS - 1);
    data.set([...eFieldRgb(10 ** l), 255], i * 4);
  }
  const tex = new THREE.DataTexture(data, RAMP_TEXELS, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Each cell as east, north (mV/km, premultiplied by coverage), coverage (1 where a model holds it), 0; rows from the south. */
export function eFieldTextureData(grid: EFieldGrid): Float32Array {
  const data = new Float32Array(grid.cols * grid.rows * 4);
  for (let c = 0; c < grid.model.length; c++) {
    if (!grid.model[c]) continue;
    data.set([grid.east[c], grid.north[c], 1, 0], c * 4);
  }
  return data;
}

/** The grid as the shell and the streaks sample it: half floats, blended linearly between cells. */
export function eFieldTexture(grid: EFieldGrid): THREE.DataTexture {
  // Half floats blend linearly on every WebGL2 GPU; a storm's thousands of mV/km sit well inside their range.
  const half = Uint16Array.from(eFieldTextureData(grid), (v) => THREE.DataUtils.toHalfFloat(v));
  const tex = new THREE.DataTexture(half, grid.cols, grid.rows, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** The strengths drawn now, their 2nd to 98th percentile in log10 mV/km, at least a decade wide; the absolute range when empty. */
export function relativeRange(grid: EFieldGrid): [number, number] {
  const mags: number[] = [];
  for (let c = 0; c < grid.model.length; c++) if (grid.model[c]) mags.push(Math.hypot(grid.east[c], grid.north[c]));
  if (!mags.length) return [...E_FIELD_RANGE];
  mags.sort((a, b) => a - b);
  const at = (q: number) => {
    const r = q * (mags.length - 1);
    const lo = Math.floor(r);
    return mags[lo] + (mags[Math.min(lo + 1, mags.length - 1)] - mags[lo]) * (r - lo);
  };
  let lo = Math.log10(Math.max(at(0.02), 1e-3)), hi = Math.log10(Math.max(at(0.98), 1e-3));
  if (hi - lo < 1) {
    const mid = (lo + hi) / 2;
    lo = mid - 0.5;
    hi = mid + 0.5;
  }
  return [lo, hi];
}

/** Two vertices a cell each way, so the patch follows the sphere; half a cell beyond the grid's edge cells. */
const SEGMENTS_PER_CELL = 2;

/** The patch's vertices in the scene's frame (x = cos φ sin λ, y = sin φ, z = cos φ cos λ), row by row from the south. */
export function patchPositions(grid: EFieldGrid, radius: number): Float32Array {
  const nx = grid.cols * SEGMENTS_PER_CELL, ny = grid.rows * SEGMENTS_PER_CELL;
  const west = grid.lon0 - grid.step / 2, south = grid.lat0 - grid.step / 2;
  const out = new Float32Array((nx + 1) * (ny + 1) * 3);
  for (let j = 0; j <= ny; j++) {
    const lat = ((south + (j * grid.step) / SEGMENTS_PER_CELL) * Math.PI) / 180;
    for (let i = 0; i <= nx; i++) {
      const lng = ((west + (i * grid.step) / SEGMENTS_PER_CELL) * Math.PI) / 180;
      out.set([radius * Math.cos(lat) * Math.sin(lng), radius * Math.sin(lat), radius * Math.cos(lat) * Math.cos(lng)], (j * (nx + 1) + i) * 3);
    }
  }
  return out;
}

function patchGeometry(grid: EFieldGrid, radius: number): THREE.BufferGeometry {
  const nx = grid.cols * SEGMENTS_PER_CELL, ny = grid.rows * SEGMENTS_PER_CELL;
  const geometry = new THREE.BufferGeometry();
  const positions = patchPositions(grid, radius);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  // The sphere's normal is the direction from its centre.
  const normals = new Float32Array(positions.length);
  for (let k = 0; k < positions.length; k += 3) {
    const len = Math.hypot(positions[k], positions[k + 1], positions[k + 2]) || 1;
    normals.set([positions[k] / len, positions[k + 1] / len, positions[k + 2] / len], k);
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  const index: number[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    index.push(a, b, c, b, d, c);
  }
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

const SAMPLE_FIELD = /* glsl */ `
  uniform sampler2D field;
  uniform vec2 origin;     // lon0, lat0: the south-west cell's centre
  uniform float step;      // degrees a cell
  uniform vec2 gridSize;   // columns, rows
  // The field at a place: east and north in mV/km, and how far a model holds it (0 to 1).
  vec3 fieldAt(vec2 lngLat) {
    vec2 uv = vec2(((lngLat.x - origin.x) / step + 0.5) / gridSize.x, ((lngLat.y - origin.y) / step + 0.5) / gridSize.y);
    vec4 s = texture2D(field, uv);
    return s.b > 0.02 ? vec3(s.rg / s.b, s.b) : vec3(0.0);
  }
  vec2 lngLatOf(vec3 p) {
    vec3 d = normalize(p);
    return vec2(degrees(atan(d.x, d.z)), degrees(asin(clamp(d.y, -1.0, 1.0))));
  }
  float log10Of(float v) { return log(max(v, 1e-4)) / log(10.0); }
  // How fast a field of this strength moves, a decade of mV/km at a time, as the streaks do.
  float paceOf(float mvkm) { return 0.3 + log(1.0 + mvkm) / log(10.0); }
`;

const vertexShader = /* glsl */ `
  uniform float look;      // 0 streaks, 1 arrows, 2 ripples, 3 relief
  uniform vec2 rampRange;  // log10 mV/km at the scale's two ends
  uniform float reliefMax; // the relief's greatest height, a share of the radius
  ${SAMPLE_FIELD}
  varying vec3 vDir;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;
  void main() {
    vDir = normalize(position);
    vec3 placed = position;
    if (look > 2.5) {
      // The relief: raised along the radius by the strength, on the colours' log scale.
      vec3 f = fieldAt(lngLatOf(position));
      float t = clamp((log10Of(length(f.xy)) - rampRange.x) / (rampRange.y - rampRange.x), 0.0, 1.0);
      placed = position * (1.0 + reliefMax * t * smoothstep(0.25, 0.65, f.z));
    }
    vViewNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(placed, 1.0);
    vViewPosition = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D ramp;
  uniform sampler2D wheel;
  uniform vec2 rampRange;  // log10 mV/km at the ramp's two ends
  uniform vec2 drawRange;  // log10 mV/km the colours span: the absolute range, or the field's own
  uniform float opacity;
  uniform float look;      // 0 streaks, 1 arrows, 2 ripples, 3 relief
  uniform float time;      // seconds, for the ripples
  ${SAMPLE_FIELD}
  varying vec3 vDir;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;

  // Degrees east and north, east shrunk by the latitude, so a step is about as long either way.
  vec2 flatOf(vec2 lngLat) { return vec2(lngLat.x * cos(radians(lngLat.y)), lngLat.y); }

  // How much of an arrow covers this place (SW1): arrows on a grid of cells, each pointing the way the
  // field at its cell's centre points, longer where stronger; drawn by distance, smooth at any zoom.
  float arrowAt(vec2 lngLat) {
    float cell = step * 3.0;
    vec2 p = flatOf(lngLat);
    vec2 centre = (floor(p / cell) + 0.5) * cell;
    vec2 centreLngLat = vec2(centre.x / max(cos(radians(centre.y)), 0.05), centre.y);
    vec3 f = fieldAt(centreLngLat);
    float mag = length(f.xy);
    if (f.z < 0.5 || mag < 1e-4) return 0.0;
    vec2 along = f.xy / mag;
    vec2 q = p - centre;
    float u = dot(q, along), v = dot(q, vec2(-along.y, along.x));
    float len = cell * 0.45 * clamp(0.25 + 0.25 * paceOf(mag), 0.3, 1.0);
    float shaft = max(abs(v) - cell * 0.035, max(-len - u, u - len * 0.25));
    float head = max(max(len * 0.1 - u, u - len), abs(v) - (len - u) * 0.6);
    float d = min(shaft, head);
    return 1.0 - smoothstep(0.0, max(fwidth(d), 1e-5) * 1.2, d);
  }

  // The field's broad flow round a place: five samples two cells apart, weighted by coverage. Cell to
  // cell, the field's direction can turn sharply; crests drawn along that break into speckle.
  vec2 broadField(vec2 lngLat) {
    vec2 sum = vec2(0.0);
    vec2 o = vec2(step * 2.0, 0.0);
    vec3 f = fieldAt(lngLat); sum += f.xy * f.z;
    f = fieldAt(lngLat + o); sum += f.xy * f.z;
    f = fieldAt(lngLat - o); sum += f.xy * f.z;
    f = fieldAt(lngLat + o.yx); sum += f.xy * f.z;
    f = fieldAt(lngLat - o.yx); sum += f.xy * f.z;
    return sum / 5.0;
  }

  // The ripples' crests (SW1): bands across the field running the way it points, faster where stronger.
  // Drawn as flow tiles: each tile of three degrees draws crests across its own broad flow, measured from
  // its own centre, and the four tiles round a place are blended by nearness, so no seam shows. Crests
  // measured across the whole map turn with every small turn of the field, and broke up (2026-10-10).
  float rippleAt(vec2 lngLat) {
    float cell = step * 6.0;
    vec2 p = flatOf(lngLat);
    vec2 g = p / cell - 0.5;
    vec2 base = floor(g);
    vec2 frac = g - base;
    float sum = 0.0;
    float wsum = 0.0;
    for (int i = 0; i <= 1; i++) for (int j = 0; j <= 1; j++) {
      vec2 c = (base + vec2(float(i), float(j)) + 0.5) * cell;
      vec2 b = broadField(vec2(c.x / max(cos(radians(c.y)), 0.05), c.y));
      float mag = length(b);
      if (mag < 1e-4) continue;
      float phase = dot(p - c, b / mag) / (cell * 0.5) - time * 0.35 * paceOf(mag);
      float crest = fract(phase);
      float band = smoothstep(0.6, 0.85, crest) * (1.0 - smoothstep(0.85, 1.0, crest));
      float w = (i == 0 ? 1.0 - frac.x : frac.x) * (j == 0 ? 1.0 - frac.y : frac.y);
      sum += band * w;
      wsum += w;
    }
    return wsum > 0.0 ? sum / wsum : 0.0;
  }

  void main() {
    vec2 lngLat = lngLatOf(vDir);
    vec3 f = fieldAt(lngLat);
    float coverage = f.z;
    if (coverage < 0.02) discard;
    vec2 e = f.xy;
    float logMag = log10Of(length(e));

    // Where the strength sits on the scale drawn, then where that colour is on the ramp.
    float t = clamp((logMag - drawRange.x) / (drawRange.y - drawRange.x), 0.0, 1.0);
    float r = (mix(drawRange.x, drawRange.y, t) - rampRange.x) / (rampRange.y - rampRange.x);
    vec3 color = texture2D(ramp, vec2(clamp(r, 0.0, 1.0), 0.5)).rgb;
    if (look > 2.5) {
      // The relief, coloured by the way the field points, brighter where it is stronger.
      float azimuth = mod(degrees(atan(e.x, e.y)) + 360.0, 360.0);
      color = texture2D(wheel, vec2(azimuth / 360.0, 0.5)).rgb * (0.55 + 0.45 * t);
    }

    // A thin line at each decade of mV/km, only where the field is smooth enough at this zoom to
    // contour: where it changes by much of a decade a pixel, the lines would widen into a wash
    // over the colours (seen on a card of a quiet day, 2026-10-10).
    float w = max(fwidth(logMag), 1e-4);
    float iso = (1.0 - smoothstep(0.0, 1.2 * w, abs(fract(logMag - 0.5) - 0.5))) * (1.0 - smoothstep(0.08, 0.25, w));
    color = mix(color, vec3(1.0), iso * 0.3);

    // The direction, by the look chosen; the streaks are their own mesh (eFieldFlow.ts).
    if (look > 0.5 && look < 1.5) color = mix(color, vec3(0.92, 0.94, 0.95), arrowAt(lngLat) * 0.85);
    if (look > 1.5 && look < 2.5) color = mix(color, vec3(0.92, 0.94, 0.95), rippleAt(lngLat) * (0.3 + 0.3 * t));

    // Firmer where stronger; thinned at the grid's edge; softened toward the limb.
    float facing = dot(normalize(vViewNormal), normalize(-vViewPosition));
    float alpha = opacity * (0.6 + 0.4 * t) * smoothstep(0.25, 0.65, coverage) * smoothstep(0.0, 0.3, facing);
    gl_FragColor = vec4(color, alpha);
  }
`;

export type EFieldScale = 'absolute' | 'relative';

export interface EFieldShell {
  mesh: THREE.Mesh;
  /** A newer grid: its texture and its patch. */
  setGrid(grid: EFieldGrid): void;
  setOpacity(opacity: number): void;
  setScale(scale: EFieldScale): void;
  /** How it shows its direction (SW1); streaks are a mesh of their own, so here they draw the field alone. */
  setLook(look: EFieldLook): void;
  /** Seconds, for the ripples: the clock live, a still's own moment for a card. */
  setTime(seconds: number): void;
  /** The strengths the colours span now, log10 mV/km: for the key. */
  drawRange(): [number, number];
  dispose(): void;
}

export function createEFieldShell(initial: EFieldGrid, options: { radius: number; opacity?: number; scale?: EFieldScale; look?: EFieldLook }): EFieldShell {
  let grid = initial;
  let scale: EFieldScale = options.scale ?? 'absolute';
  const ramp = rampTexture();
  const wheel = wheelTexture();
  let texture = eFieldTexture(grid);
  const rangeOf = () => (scale === 'relative' ? relativeRange(grid) : [...E_FIELD_RANGE] as [number, number]);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      field: { value: texture },
      ramp: { value: ramp },
      origin: { value: new THREE.Vector2(grid.lon0, grid.lat0) },
      step: { value: grid.step },
      gridSize: { value: new THREE.Vector2(grid.cols, grid.rows) },
      rampRange: { value: new THREE.Vector2(...E_FIELD_RANGE) },
      drawRange: { value: new THREE.Vector2(...rangeOf()) },
      opacity: { value: options.opacity ?? 0.8 },
      wheel: { value: wheel },
      look: { value: LOOK_CODE[options.look ?? 'streaks'] },
      time: { value: 0 },
      reliefMax: { value: RELIEF_MAX },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(patchGeometry(grid, options.radius), material);
  mesh.name = 'e-field';
  // Before its streaks, within the group that sets where both draw (useGlobeEField).
  mesh.renderOrder = -1;
  // Raised by the relief in the shader: three.js cannot bound it from the patch alone.
  mesh.frustumCulled = false;

  return {
    mesh,
    setGrid(next) {
      const reshaped = next.cols !== grid.cols || next.rows !== grid.rows || next.lon0 !== grid.lon0 || next.lat0 !== grid.lat0;
      grid = next;
      texture.dispose();
      texture = eFieldTexture(grid);
      material.uniforms.field.value = texture;
      material.uniforms.origin.value.set(grid.lon0, grid.lat0);
      material.uniforms.step.value = grid.step;
      material.uniforms.gridSize.value.set(grid.cols, grid.rows);
      material.uniforms.drawRange.value.set(...rangeOf());
      if (reshaped) {
        mesh.geometry.dispose();
        mesh.geometry = patchGeometry(grid, options.radius);
      }
    },
    setOpacity(next) { material.uniforms.opacity.value = next; },
    setScale(next) {
      scale = next;
      material.uniforms.drawRange.value.set(...rangeOf());
    },
    setLook(next) { material.uniforms.look.value = LOOK_CODE[next]; },
    setTime(seconds) { material.uniforms.time.value = seconds; },
    drawRange: rangeOf,
    dispose() {
      mesh.geometry.dispose();
      texture.dispose();
      ramp.dispose();
      wheel.dispose();
      material.dispose();
    },
  };
}
