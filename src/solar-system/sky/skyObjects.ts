/**
 * What Sky from a place draws (critique-2026-11-01, OR32, OR41; plan D5): the stars of the Yale Bright Star Catalogue
 * to magnitude 6, the IAU's figures and the 88 names, on a sphere far beyond Neptune in the catalogue's J2000 axes (the
 * object turned into the globe's frame by skyFrame, as the planets are), and a dome round the observer coloured by
 * how high the Sun stands. The ground is the globe itself, so what is below the horizon is hidden by the Earth.
 */
import * as THREE from 'three';
import { CYAN, FONTS } from '../../styles/tokens';

/** The baked sky (scripts/sky/bake-sky.mjs): stars [ra°, dec°, V, B−V | null], constellations with their figures. */
export interface SkyData {
  v: 1;
  sources: { stars: string; lines: string };
  magLimit: number;
  stars: Array<[number, number, number, number | null]>;
  constellations: Array<{ abbr: string; name: string; ra: number; dec: number; lines: Array<[number, number, number, number, number]> }>;
}

/** How far out the sky is drawn: beyond Neptune (30 AU, 70 million units) and inside the far plane at True. */
export const SKY_RADIUS = 120_000_000;

/** A place in the catalogue's axes (J2000, as astronomy-engine's EQJ vectors): x to the equinox, z to the pole. */
export function eqjUnit(raDeg: number, decDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const ra = THREE.MathUtils.degToRad(raDeg);
  const dec = THREE.MathUtils.degToRad(decDeg);
  return out.set(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
}

/** A star's colour from its B−V index: blue-white to orange, a little paler than the catalogue's own, as eyes see them. */
const BV_COLOURS: Array<[number, [number, number, number]]> = [
  [-0.4, [0.66, 0.74, 1.0]], [0.0, [0.82, 0.87, 1.0]], [0.4, [1.0, 0.97, 0.94]], [0.8, [1.0, 0.91, 0.79]],
  [1.2, [1.0, 0.83, 0.64]], [1.6, [1.0, 0.75, 0.5]], [2.0, [1.0, 0.68, 0.42]],
];
export function starColour(bv: number | null): [number, number, number] {
  if (bv === null) return [1, 1, 1];
  if (bv <= BV_COLOURS[0][0]) return BV_COLOURS[0][1];
  for (let i = 1; i < BV_COLOURS.length; i++) {
    const [b1, c1] = BV_COLOURS[i];
    if (bv <= b1) {
      const [b0, c0] = BV_COLOURS[i - 1];
      const t = (bv - b0) / (b1 - b0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return BV_COLOURS[BV_COLOURS.length - 1][1];
}

/** A star's size on screen, CSS pixels, from its magnitude: Sirius about 8, a sixth-magnitude star 1.2. */
export const starPixels = (vmag: number): number => THREE.MathUtils.clamp(1.2 + (6 - vmag) * 0.9, 1.2, 8);

/** How bright the night is, 0 by day to 1 in full darkness, by the Sun's altitude at the observer, degrees. */
export const nightOf = (sunAltDeg: number): number => 1 - THREE.MathUtils.smoothstep(sunAltDeg, -15, -2);

const STAR_VERTEX = /* glsl */ `
  attribute float size;
  attribute vec3 colour;
  uniform float pixelRatio;
  uniform float widen;
  varying vec3 vColour;
  void main() {
    vColour = colour;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * pixelRatio * widen;
  }
`;
const STAR_FRAGMENT = /* glsl */ `
  uniform float opacity;
  varying vec3 vColour;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float a = 1.0 - smoothstep(0.18, 0.5, d);
    if (a <= 0.0) discard;
    gl_FragColor = vec4(vColour * a * opacity, a * opacity);
  }
`;

export type StarsMaterial = THREE.ShaderMaterial & {
  uniforms: { pixelRatio: { value: number }; widen: { value: number }; opacity: { value: number } };
};

/** The stars, brightest first, as points of their own size and colour. */
export function createStars(data: SkyData): THREE.Points<THREE.BufferGeometry, StarsMaterial> {
  const n = data.stars.length;
  const positions = new Float32Array(n * 3);
  const sizes = new Float32Array(n);
  const colours = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  data.stars.forEach(([ra, dec, vmag, bv], i) => {
    eqjUnit(ra, dec, v).multiplyScalar(SKY_RADIUS);
    positions.set([v.x, v.y, v.z], i * 3);
    sizes[i] = starPixels(vmag);
    colours.set(starColour(bv), i * 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('colour', new THREE.BufferAttribute(colours, 3));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SKY_RADIUS);
  const material = new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: 1 }, widen: { value: 1 }, opacity: { value: 0 } },
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }) as StarsMaterial;
  const points = new THREE.Points(geometry, material);
  points.name = 'sky-stars';
  points.matrixAutoUpdate = false;
  points.frustumCulled = false;
  points.visible = false;
  return points;
}

/** The IAU's figures: faint lines between the stars, bolder for the figure's main lines. */
export function createFigures(data: SkyData): THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> {
  const segments = data.constellations.flatMap((c) => c.lines);
  const positions = new Float32Array(segments.length * 6);
  const colours = new Float32Array(segments.length * 6);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  // Starcom's cyan, as strong as the line is bold: the figures stay behind the stars.
  const cyan = new THREE.Color(CYAN[300]);
  segments.forEach(([ra1, dec1, ra2, dec2, weight], i) => {
    eqjUnit(ra1, dec1, a).multiplyScalar(SKY_RADIUS * 0.999);
    eqjUnit(ra2, dec2, b).multiplyScalar(SKY_RADIUS * 0.999);
    positions.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    const strength = weight === 2 ? 0.5 : weight === 1 ? 0.36 : 0.22;
    colours.set([cyan.r * strength, cyan.g * strength, cyan.b * strength, cyan.r * strength, cyan.g * strength, cyan.b * strength], i * 6);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SKY_RADIUS);
  const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = 'sky-figures';
  lines.matrixAutoUpdate = false;
  lines.frustumCulled = false;
  lines.visible = false;
  return lines;
}

/** The 88 names, each a flat label at its constellation's middle, a fixed size on screen. */
export function createNames(data: SkyData): THREE.Group {
  const group = new THREE.Group();
  group.name = 'sky-names';
  group.matrixAutoUpdate = false;
  group.visible = false;
  const v = new THREE.Vector3();
  for (const c of data.constellations) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    // The headings' face (tokens.ts): the names are the sky's headings.
    const font = `600 26px ${FONTS.display}`;
    ctx.font = font;
    const width = Math.ceil(ctx.measureText(c.name.toUpperCase()).width) + 12;
    canvas.width = width;
    canvas.height = 36;
    ctx.font = font;
    // Starcom's pale cyan (tokens.ts), a little see-through.
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = CYAN[200];
    ctx.textBaseline = 'middle';
    ctx.fillText(c.name.toUpperCase(), 6, 18);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, sizeAttenuation: false, opacity: 0 }));
    sprite.position.copy(eqjUnit(c.ra, c.dec, v).multiplyScalar(SKY_RADIUS * 0.998));
    sprite.userData = { aspect: width / 36, abbr: c.abbr };
    sprite.frustumCulled = false;
    group.add(sprite);
  }
  return group;
}

/** Sizes each name for a viewport `height` CSS pixels tall: the letters 13 px high. */
export function sizeNames(names: THREE.Group, height: number, opacity: number): void {
  const h = (2 * 18) / Math.max(1, height);
  for (const child of names.children) {
    const sprite = child as THREE.Sprite;
    sprite.scale.set(h * (sprite.userData.aspect as number), h, 1);
    (sprite.material as THREE.SpriteMaterial).opacity = opacity;
  }
}

const DOME_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const DOME_FRAGMENT = /* glsl */ `
  uniform vec3 up;
  uniform vec3 sun;
  uniform float day;
  uniform float twilight;
  varying vec3 vDir;
  void main() {
    vec3 dir = normalize(vDir);
    float h = dot(dir, up);
    if (h < -0.02) discard;
    float above = clamp(h, 0.0, 1.0);
    vec3 zenith = vec3(0.16, 0.37, 0.66);
    vec3 horizon = vec3(0.56, 0.72, 0.88);
    vec3 dayColour = mix(horizon, zenith, pow(above, 0.5));
    // Toward the Sun, low down, the twilight's warmth.
    float toward = max(dot(dir, sun), 0.0);
    vec3 warm = vec3(0.85, 0.5, 0.27) * pow(toward, 4.0) * (1.0 - above);
    vec3 colour = dayColour * day + warm * twilight;
    float alpha = clamp(day * 0.95 + twilight * pow(toward, 4.0) * (1.0 - above) * 0.8, 0.0, 1.0);
    gl_FragColor = vec4(colour, alpha);
  }
`;

export type DomeMaterial = THREE.ShaderMaterial & {
  uniforms: { up: { value: THREE.Vector3 }; sun: { value: THREE.Vector3 }; day: { value: number }; twilight: { value: number } };
};

/** The sky's colour round the observer: blue by day, warm low toward the Sun at twilight, clear at night. */
export function createDome(): THREE.Mesh<THREE.SphereGeometry, DomeMaterial> {
  const material = new THREE.ShaderMaterial({
    uniforms: { up: { value: new THREE.Vector3(0, 1, 0) }, sun: { value: new THREE.Vector3(1, 0, 0) }, day: { value: 0 }, twilight: { value: 0 } },
    vertexShader: DOME_VERTEX,
    fragmentShader: DOME_FRAGMENT,
    side: THREE.BackSide,
    // In the opaque pass, first (renderOrder), so the globe drawn after it covers it below the horizon; added to the
    // dark behind it, as the sky's light is.
    transparent: false,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  }) as DomeMaterial;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), material);
  dome.name = 'sky-dome';
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  dome.visible = false;
  return dome;
}

/** The day's share and the twilight's, by the Sun's altitude in degrees. */
export function daylightOf(sunAltDeg: number): { day: number; twilight: number } {
  return {
    day: THREE.MathUtils.smoothstep(sunAltDeg, -6, 6),
    twilight: THREE.MathUtils.smoothstep(sunAltDeg, -18, -4) * (1 - THREE.MathUtils.smoothstep(sunAltDeg, 2, 12)),
  };
}
