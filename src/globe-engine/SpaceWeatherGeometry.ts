// SpaceWeatherGeometry.ts
// Geometry/material helpers for magnetopause, bow shock, and auroral overlays.
// MVP focuses on lightweight meshes with low vertex counts and simple materials.

import * as THREE from 'three';
import { classifyGeomagneticActivity, type AuroraPayload, type BowShockPayload, type GeomagneticIndexPayload, type LatLng, type MagnetopausePayload } from '../services/SpaceWeatherModeling';
import { latLngToGlobeWorld } from '../utils/globeCoordinates';
import { stilledAt } from './captureClock';
import { createLogger } from '@utils/logger';
import { buildLineBatch } from '../geopolitical/geometry/lineBatches';
import { FONTS, ROLES } from '../styles/tokens';
const log = createLogger({ prefix: 'SpaceWeatherGeometry' });

const SHELL_WIDTH_SEGMENTS = 48; // keep under 5k verts with sphere geometry
const SHELL_HEIGHT_SEGMENTS = 32;
const GLOBE_RADIUS_UNITS = 100; // Matches Globe.gl sphere radius used across app
const DEFAULT_AURORA_ALTITUDE_RE = 1.02; // Earth-radii altitude multiplier
const BLACKOUT_ALTITUDE_RE = 1.015; // Earth-radii altitude multiplier
// Deliberately outside the aurora oval/blackout band (1.015-1.02) so the two
// don't z-fight when both overlays are on, and well inside magnetopause/bow
// shock's 5-25 Re range so it doesn't read as a competing "boundary."
const GEOMAGNETIC_INDEX_ALTITUDE_RE = 1.05;
const SHELL_VERTEX_CAP = 5000;
export const AURORA_POINT_CAP = 512;
// Equator still carries a faint hint of the current index rather than
// going fully invisible; the poles reach full brightness. >1 exponent
// concentrates the bright band toward high latitudes instead of a linear
// ramp, echoing (not reusing — no shared math) where the aurora oval and
// its underlying electrojets actually sit.
const GEOMAGNETIC_POLE_WEIGHT_FLOOR = 0.15;
const GEOMAGNETIC_POLE_WEIGHT_EXPONENT = 1.6;

const COLORS = {
  magnetopause: new THREE.Color('#20d0e8'),
  bowShock: new THREE.Color('#ff9f43'),
  aurora: new THREE.Color('#00ff80'),
  blackout: new THREE.Color('#0a0a0a'),
  // Mirrors classifyGeomagneticActivity's tiers (SpaceWeatherModeling.ts)
  // exactly — one shared classifier, so the shell's color and the HUD
  // panel's activity label can never disagree about what "minor_storm"
  // means. Blue -> green -> yellow -> orange -> red -> magenta; the last
  // matches NOAA's own G5 (extreme storm) designation.
  geomagneticQuiet: new THREE.Color('#38bdf8'),
  geomagneticUnsettled: new THREE.Color('#22c55e'),
  geomagneticActive: new THREE.Color('#eab308'),
  geomagneticMinorStorm: new THREE.Color('#f97316'),
  geomagneticMajorStorm: new THREE.Color('#ef4444'),
  geomagneticSevereStorm: new THREE.Color('#d946ef')
};

function geomagneticIndexColor(kp: number): THREE.Color {
  switch (classifyGeomagneticActivity(kp)) {
    case 'quiet': return COLORS.geomagneticQuiet;
    case 'unsettled': return COLORS.geomagneticUnsettled;
    case 'active': return COLORS.geomagneticActive;
    case 'minor_storm': return COLORS.geomagneticMinorStorm;
    case 'major_storm': return COLORS.geomagneticMajorStorm;
    case 'severe_storm': return COLORS.geomagneticSevereStorm;
  }
}

/**
 * Same plain sphere as buildShell, but colored per-vertex so brightness
 * ramps up toward the poles instead of a single flat color everywhere.
 * Real geomagnetic disturbance isn't uniform across the globe — it's
 * concentrated at high latitudes (the same underlying reason the aurora
 * oval sits where it does) — so a uniform glow was conveying "how much"
 * but nothing about "where." Material color is left white (vertexColors
 * multiplies against it) so the vertex colors alone carry the gradient.
 */
function buildLatitudeWeightedShell(radius: number, color: THREE.Color, opacity: number): THREE.Mesh {
  const radiusUnits = radius * GLOBE_RADIUS_UNITS;
  const geometry = new THREE.SphereGeometry(radiusUnits, SHELL_WIDTH_SEGMENTS, SHELL_HEIGHT_SEGMENTS);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    // |y|/radius is exactly |sin(latitude)| for a sphere centered at the
    // origin — 0 at the equator, 1 at the poles — no trig needed.
    const latWeight = Math.min(1, Math.abs(position.getY(i)) / radiusUnits);
    const weight = GEOMAGNETIC_POLE_WEIGHT_FLOOR
      + (1 - GEOMAGNETIC_POLE_WEIGHT_FLOOR) * Math.pow(latWeight, GEOMAGNETIC_POLE_WEIGHT_EXPONENT);
    colors[i * 3] = color.r * weight;
    colors[i * 3 + 1] = color.g * weight;
    colors[i * 3 + 2] = color.b * weight;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  if (position.count > SHELL_VERTEX_CAP) {
    log.warn('[SpaceWeather] geomagnetic index shell exceeded vertex cap', {
      vertices: position.count,
      cap: SHELL_VERTEX_CAP
    });
  }
  return mesh;
}

function computeDeformedShellRadiusRe(
  fallbackRadiusRe: number,
  theta: number,
  phi: number,
  deformation: MagnetopausePayload['deformation'] | BowShockPayload['deformation']
): number {
  if (!deformation) {
    return fallbackRadiusRe;
  }

  const noseRe = Math.max(1, deformation.noseRe || fallbackRadiusRe);
  const alpha = THREE.MathUtils.clamp(deformation.alpha || 0.6, 0.3, 1.2);
  const denominator = Math.max(0.02, 1 + Math.cos(theta));
  const shue = noseRe * Math.pow(2 / denominator, alpha);

  const flankReference = noseRe * Math.pow(2 / (1 + Math.cos(Math.PI / 2)), alpha);
  const flankTarget = Math.max(noseRe, deformation.flankRe || flankReference);
  const flankScale = flankReference > 0 ? flankTarget / flankReference : 1;
  const flankWeight = Math.pow(Math.sin(theta), 2);

  const tailTarget = Math.max(flankTarget, deformation.tailRe || flankTarget * 1.4);
  const tailWeight = THREE.MathUtils.clamp((theta - Math.PI / 2) / (Math.PI / 2), 0, 1);
  const tailBlend = Math.pow(tailWeight, 1.35);

  let radius = shue * THREE.MathUtils.lerp(1, flankScale, flankWeight);
  radius = THREE.MathUtils.lerp(radius, tailTarget, tailBlend);

  const lateralWeight = Math.sin(theta);
  const dawnDuskTerm = (deformation.dawnDuskSkew || 0) * Math.sin(phi) * lateralWeight * 0.2;
  const northSouthTerm = (deformation.northSouthSkew || 0) * Math.cos(phi) * lateralWeight * 0.16;
  radius *= 1 + dawnDuskTerm + northSouthTerm;

  return THREE.MathUtils.clamp(radius, 1, 80);
}

function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  return latLngToGlobeWorld(lat, lng, radius);
}

function downsamplePolyline(points: LatLng[], cap: number, label: string): LatLng[] {
  if (points.length <= cap) return points;

  const result: LatLng[] = [];
  const step = (points.length - 1) / (cap - 1);
  for (let i = 0; i < cap - 1; i++) {
    const idx = Math.floor(i * step);
    result.push(points[idx]);
  }
  result.push(points[points.length - 1]);

  log.warn(`[SpaceWeather] downsampling ${label} polyline`, {
    original: points.length,
    cap,
    used: result.length
  });
  return result;
}

function buildAuroraLine(points: LatLng[], color: THREE.Color, opacity: number, altitudeRe = DEFAULT_AURORA_ALTITUDE_RE): THREE.Line {
  const usable = downsamplePolyline(points, AURORA_POINT_CAP, 'aurora-line');
  const altitudeUnits = altitudeRe * GLOBE_RADIUS_UNITS;
  const positions: number[] = [];
  usable.forEach((p) => {
    const v = latLngToVector3(p.lat, p.lng, altitudeUnits);
    positions.push(v.x, v.y, v.z);
  });
  const geometry = new THREE.BufferGeometry();
  const positionAttr = new Float32Array(positions);
  geometry.setAttribute('position', new THREE.BufferAttribute(positionAttr, 3));
  geometry.computeBoundingSphere();
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    linewidth: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true
  });
  const line = new THREE.LineLoop(geometry, material);
  line.renderOrder = 1;
  return line;
}

function buildBlackoutBand(points: LatLng[], gradient: { inner: number; outer: number }): THREE.Mesh {
  // Build a triangle strip band between inner/outer altitude offsets using provided polyline.
  const usable = downsamplePolyline(points, AURORA_POINT_CAP, 'aurora-blackout');
  const innerAlt = (BLACKOUT_ALTITUDE_RE + gradient.inner * 0.02) * GLOBE_RADIUS_UNITS;
  const outerAlt = (BLACKOUT_ALTITUDE_RE + gradient.outer * 0.04) * GLOBE_RADIUS_UNITS;
  const vertices: number[] = [];
  const indices: number[] = [];

  usable.forEach((p) => {
    const inner = latLngToVector3(p.lat, p.lng, innerAlt);
    const outer = latLngToVector3(p.lat, p.lng, outerAlt);
    vertices.push(inner.x, inner.y, inner.z);
    vertices.push(outer.x, outer.y, outer.z);
  });

  // Close loop by repeating first segment
  const inner0 = latLngToVector3(usable[0].lat, usable[0].lng, innerAlt);
  const outer0 = latLngToVector3(usable[0].lat, usable[0].lng, outerAlt);
  vertices.push(inner0.x, inner0.y, inner0.z);
  vertices.push(outer0.x, outer0.y, outer0.z);

  // Build triangle indices for strip (two vertices per segment)
  const pairs = vertices.length / 3 / 2; // number of point pairs
  for (let i = 0; i < pairs - 1; i++) {
    const iInner = i * 2;
    const iOuter = i * 2 + 1;
    const nextInner = (i + 1) * 2;
    const nextOuter = (i + 1) * 2 + 1;
    indices.push(iInner, iOuter, nextOuter);
    indices.push(iInner, nextOuter, nextInner);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    color: COLORS.blackout,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 0.5;
  return mesh;
}

export function countVertices(object: THREE.Object3D): number {
  let total = 0;
  object.traverse((child) => {
    const geometry = (child as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    const position = geometry?.getAttribute('position');
    if (position) total += position.count;
  });
  return total;
}

const defaultVertexLogger = (label: string, total: number) => {
  log.info(`[SpaceWeather] ${label} vertices=${total}`);
};

export function logVertexCount(
  label: string,
  object: THREE.Object3D,
  logger: (label: string, total: number) => void = defaultVertexLogger
): number {
  const total = countVertices(object);
  logger(label, total);
  return total;
}

/*
 * ─── THE BOUNDARIES AS CONTOUR LINES (SW26; the owner, 2026-10-24, critique C31) ──
 *
 * The magnetopause and the bow shock were filled, Fresnel-lit surfaces, which the owner found unappealing and
 * which hid the Earth behind them. Each is drawn now as a few thin lines on the same deformed Shue surface: rings
 * round the Sun-Earth axis, lines running back from the nose, and its name by the nose. Built in the shell's own
 * frame, +x toward the Sun, as the surfaces were, so Globe's alignment turns them the same way.
 */
/** The rings, by angle from the nose, degrees; the lines back from the nose, how many and how far round they run. */
export const CONTOUR_RING_ANGLES_DEG = [30, 60, 90, 120] as const;
export const CONTOUR_MERIDIANS = 8;
const CONTOUR_MERIDIAN_TO_DEG = 130;
const CONTOUR_RING_POINTS = 96;
const CONTOUR_MERIDIAN_POINTS = 48;
const CONTOUR_LINE_PX = 1.4;
/** How a probe or a test finds a boundary's lines. */
export const BOUNDARY_CONTOURS_TYPE = 'boundaryContours';

let canDraw: boolean | undefined;
/** Whether there is a canvas to draw a label on (none in tests): asked once, as the solar system's labels ask. */
function canDrawLabels(): boolean {
  if (canDraw === undefined) canDraw = typeof document !== 'undefined' && Boolean(document.createElement('canvas').getContext('2d'));
  return canDraw;
}

function boundaryLabel(name: string, color: THREE.Color): THREE.Sprite | null {
  if (!canDrawLabels()) return null;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;
  const px = 12;
  const scale = 2;
  context.font = `${px * scale}px ${FONTS.text}`;
  const width = Math.ceil(context.measureText(name).width / scale) + 6;
  canvas.width = width * scale;
  canvas.height = (px + 6) * scale;
  context.scale(scale, scale);
  context.font = `${px}px ${FONTS.text}`;
  context.textBaseline = 'middle';
  context.lineWidth = 3;
  context.strokeStyle = ROLES.surface.globe;
  context.strokeText(name, 3, (px + 6) / 2);
  context.fillStyle = `#${color.getHexString()}`;
  context.fillText(name, 3, (px + 6) / 2);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
  sprite.center.set(0, 0.5);
  // A fixed size on screen: a sprite of scale s spans s × P[1][1] × height / 2 pixels when its size does not attenuate.
  const size = new THREE.Vector2();
  sprite.onBeforeRender = (renderer, _scene, camera) => {
    renderer.getSize(size);
    const perPx = 2 / (Math.max(size.y, 1) * (camera.projectionMatrix.elements[5] || 1));
    sprite.scale.set(width * perPx, (px + 6) * perPx, 1);
  };
  sprite.renderOrder = 3;
  return sprite;
}

function buildBoundaryContours(
  name: string,
  radiusRe: number,
  color: THREE.Color,
  opacity: number,
  deformation?: MagnetopausePayload['deformation'] | BowShockPayload['deformation'],
  label = name,
): THREE.Group {
  const at = (theta: number, phi: number): [number, number, number] => {
    const r = computeDeformedShellRadiusRe(radiusRe, theta, phi, deformation) * GLOBE_RADIUS_UNITS;
    return [r * Math.cos(theta), r * Math.sin(theta) * Math.cos(phi), r * Math.sin(theta) * Math.sin(phi)];
  };
  const hex = color.getHex();
  const paths: Array<{ id: string; positions: number[]; color: number }> = [];
  for (const deg of CONTOUR_RING_ANGLES_DEG) {
    const theta = THREE.MathUtils.degToRad(deg);
    const positions: number[] = [];
    for (let k = 0; k <= CONTOUR_RING_POINTS; k += 1) positions.push(...at(theta, (k / CONTOUR_RING_POINTS) * Math.PI * 2));
    paths.push({ id: `${name}:ring:${deg}`, positions, color: hex });
  }
  for (let m = 0; m < CONTOUR_MERIDIANS; m += 1) {
    const phi = (m / CONTOUR_MERIDIANS) * Math.PI * 2;
    const positions: number[] = [];
    for (let k = 0; k <= CONTOUR_MERIDIAN_POINTS; k += 1) {
      positions.push(...at(THREE.MathUtils.degToRad((k / CONTOUR_MERIDIAN_POINTS) * CONTOUR_MERIDIAN_TO_DEG), phi));
    }
    paths.push({ id: `${name}:line:${m}`, positions, color: hex });
  }
  const group = new THREE.Group();
  group.name = name;
  group.userData = { type: BOUNDARY_CONTOURS_TYPE, boundary: name };
  group.renderOrder = 2;
  // Turned by the solar wind's aberration, as the surfaces were.
  group.rotation.y = THREE.MathUtils.degToRad(-(deformation?.aberrationDeg || 0));
  const lines = buildLineBatch(paths, { opacity, linewidth: CONTOUR_LINE_PX, dashed: false, dashSize: 1, gapSize: 0, dashScale: 1, renderOrder: 2 });
  if (lines) group.add(lines);
  // Its name a little sunward of the nose, where the lines meet.
  const sprite = boundaryLabel(label, color);
  if (sprite) {
    const [x] = at(0, 0);
    sprite.position.set(x + 30, 0, 0);
    group.add(sprite);
  }
  return group;
}

/** Whether a CME's sheath, modelled, pushes the boundary in at a moment ahead (SW30; boundaryWind.ts). */
const pushedIn = (payload: MagnetopausePayload | BowShockPayload): boolean =>
  Boolean(((payload.meta as { wind?: { pushedBy?: unknown } } | undefined)?.wind?.pushedBy));

export function createMagnetopauseContours(payload: MagnetopausePayload): THREE.Group {
  return buildBoundaryContours('Magnetopause', payload.standoffRe, COLORS.magnetopause, payload.quality === 'live' ? 0.85 : 0.6, payload.deformation,
    pushedIn(payload) ? 'Magnetopause, pushed in (modelled)' : 'Magnetopause');
}

export function createBowShockContours(payload: BowShockPayload): THREE.Group {
  return buildBoundaryContours('Bow shock', payload.radiusRe, COLORS.bowShock, payload.quality === 'live' ? 0.75 : 0.55, payload.deformation,
    pushedIn(payload) ? 'Bow shock (modelled)' : 'Bow shock');
}

/**
 * A latitude-weighted shell colored/faded by Kp — quiet conditions are
 * nearly invisible, a storm is prominent, and brightness concentrates
 * toward the poles rather than reading as a uniform glow. Unlike
 * magnetopause/bow-shock, there's no directional deformation model for a
 * planetary index, so this has no buildDeformedShell equivalent.
 */
export function createGeomagneticIndexMesh(payload: GeomagneticIndexPayload): THREE.Mesh {
  const color = geomagneticIndexColor(payload.kp);
  const intensity = THREE.MathUtils.clamp(payload.kp / 9, 0, 1);
  const baseOpacity = payload.quality === 'live' ? 0.1 : 0.06;
  const opacity = baseOpacity + intensity * 0.3;
  return buildLatitudeWeightedShell(GEOMAGNETIC_INDEX_ALTITUDE_RE, color, opacity);
}

export function createAuroraLines(payload: AuroraPayload): { north: THREE.Line; south: THREE.Line } {
  const baseOpacity = payload.quality === 'live' ? 0.55 : 0.4;
  const pulseEnabled = Boolean((payload.meta as Record<string, unknown> | undefined)?.pulse);
  const applyPulse = (line: THREE.Line) => {
    if (!pulseEnabled) return;
    line.onBeforeRender = (_renderer, _scene, _camera, _geometry, material) => {
      const m = material as THREE.LineBasicMaterial;
      // A capture holds the pulse at rest (IM23), so the same shot makes the same picture.
      if (stilledAt() !== null) {
        m.opacity = baseOpacity;
        return;
      }
      const t = performance.now() * 0.002;
      const amp = 0.12;
      const osc = Math.sin(t) * amp;
      m.opacity = THREE.MathUtils.clamp(baseOpacity + osc, 0.15, 0.85);
    };
  };

  const north = buildAuroraLine(payload.oval.north, COLORS.aurora, baseOpacity);
  const south = buildAuroraLine(payload.oval.south, COLORS.aurora, baseOpacity);
  applyPulse(north);
  applyPulse(south);
  return { north, south };
}

export function createAuroraBlackoutMesh(payload: AuroraPayload): THREE.Mesh {
  // Use north oval path for blackout band approximation; share gradient from payload
  return buildBlackoutBand(payload.oval.north, payload.blackout.gradient);
}

export function disposeObject(obj: THREE.Object3D | null | undefined) {
  if (!obj) return;
  obj.traverse((child) => {
    if ((child as THREE.Mesh).geometry) {
      (child as THREE.Mesh).geometry.dispose();
    }
    const mat = (child as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) {
      mat.forEach((m) => m.dispose());
    } else if (mat) {
      mat.dispose();
    }
  });
}
