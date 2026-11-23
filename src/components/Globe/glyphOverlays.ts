/**
 * What rides on a glyph layer's marks besides the glyphs (D-GV GV6, W4): a ring sized by a magnitude, and a ping on a
 * mark that is new. Each a quad per mark in screen pixels round the mark's place, so a ring of any size draws on every
 * device (a point sprite is capped at the GPU's largest point size, 64 px on some phones).
 *
 * Both read what glyphDeclutter.ts decides each frame: a mark folded under another draws neither, and the mark drawn
 * over a pile rings for the largest magnitude in it and pings when anything in it is new.
 */
import * as THREE from 'three';
import { zoomOutFadeFor } from './zoomOutFade';
import { SCREEN_POINTS_RENDER_ORDER } from './screenPoints';
import { captureUnderWay } from '../../globe-engine/captureClock';

/** The widest a magnitude ring is drawn, in CSS px: past it the ring says "at least this". */
export const RING_MAX_PX = 72;
/** A ring's line, in CSS px. */
const RING_LINE_PX = 2;
/** How long a new mark pings, in seconds, and how long one ping takes. */
export const PING_SECONDS = 60;
const PING_PERIOD_S = 2.4;
/** How far a ping spreads past the mark's own radius, as a multiple of it. */
const PING_SPREAD = 2.2;

const OVERLAY_VERTEX = /* glsl */`
  attribute vec2 corner;
  attribute float radiusPx;
  attribute float level;
  attribute float since;
  uniform vec2 viewport;
  uniform float spread;
  varying vec2 vOffset;
  varying float vRadius;
  varying float vLevel;
  varying float vSince;

  void main() {
    vRadius = radiusPx;
    vLevel = level;
    vSince = since;
    // The quad reaches past the ring by its line, and a ping's quad past where it spreads to.
    float reach = radiusPx * spread + 3.0;
    vOffset = corner * reach;
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    clip.xy += vOffset * 2.0 / max(viewport, vec2(1.0)) * clip.w;
    gl_Position = level <= 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : clip;
  }
`;

const RING_FRAGMENT = /* glsl */`
  uniform vec3 color;
  uniform float lineWidth;
  uniform float zoomFade;
  varying vec2 vOffset;
  varying float vRadius;
  varying float vLevel;

  void main() {
    float d = length(vOffset);
    float a = 1.0 - smoothstep(lineWidth * 0.5, lineWidth * 0.5 + 1.0, abs(d - vRadius));
    if (a <= 0.01 || vLevel <= 0.0) discard;
    gl_FragColor = sRGBTransferOETF(vec4(color, a * 0.8 * vLevel * zoomFade));
  }
`;

const PING_FRAGMENT = /* glsl */`
  uniform vec3 color;
  uniform float time;
  uniform float period;
  uniform float duration;
  uniform float spread;
  uniform float hidden;
  uniform float zoomFade;
  varying vec2 vOffset;
  varying float vRadius;
  varying float vLevel;
  varying float vSince;

  void main() {
    float age = time - vSince;
    if (hidden > 0.5 || vSince < 0.0 || age < 0.0 || age > duration || vLevel <= 0.0) discard;
    float phase = fract(age / period);
    float r = vRadius * mix(1.0, spread, phase);
    float d = length(vOffset);
    float a = (1.0 - smoothstep(1.0, 2.5, abs(d - r))) * (1.0 - phase) * (1.0 - phase);
    if (a <= 0.01) discard;
    gl_FragColor = sRGBTransferOETF(vec4(color, a * 0.9 * vLevel * zoomFade));
  }
`;

/*
 * The briefing tour's ping (critique C34: "something that draws the eye to the item"): a ring round the item a stop
 * holds, and three pings outward from it as the stop lands. Drawn in clips too: there it follows the clip's own
 * timeline (tourMarker.ts), so the same clip draws the same pings.
 */
const TOUR_PING_FRAGMENT = /* glsl */`
  uniform vec3 color;
  uniform float heldMs;
  uniform float period;
  uniform float pings;
  uniform float spread;
  varying vec2 vOffset;
  varying float vRadius;
  varying float vLevel;
  void main() {
    if (vLevel <= 0.0) discard;
    float d = length(vOffset);
    // The ring, clear of the mark's own rim, and four ticks outside it, north, east, south and west: crosshairs.
    float ring = 1.0 - smoothstep(1.0, 2.2, abs(d - vRadius));
    vec2 o = abs(vOffset);
    float along = max(o.x, o.y);
    float tick = (1.0 - smoothstep(0.9, 1.8, min(o.x, o.y))) * step(vRadius + 5.0, along) * step(along, vRadius + 14.0);
    // The pings, outward from the ring as the stop lands, fading as they spread.
    float ping = 0.0;
    if (heldMs < period * pings) {
      float phase = fract(heldMs / period);
      float r = vRadius * mix(1.0, spread, phase);
      ping = (1.0 - smoothstep(1.2, 3.2, abs(d - r))) * pow(1.0 - phase, 1.5);
    }
    float a = max(max(ring, tick) * 0.95, ping * 0.9);
    if (a <= 0.01) discard;
    gl_FragColor = sRGBTransferOETF(vec4(color, a));
  }
`;
/** The tour ping's ring, in CSS px, how far its pings spread past it, and their number and length. */
export const TOUR_RING_PX = 28;
const TOUR_PING_SPREAD = 3.2;
export const TOUR_PINGS = 3;
export const TOUR_PING_PERIOD_MS = 1400;
/** How a probe or a test finds it. */
export const TOUR_PING_TYPE = 'tourPing';

const viewport = new THREE.Vector2();
const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1];

/** One overlay: a quad for each mark, and how to set what each draws. */
export interface MarkOverlay {
  mesh: THREE.Mesh;
  /** Each mark's radius in CSS px (a ring's own; a ping's starting one), and how solid it is now (0 draws nothing). */
  set(i: number, radiusPx: number, level: number, since?: number): void;
  /** The changes made since the last call reach the GPU. */
  commit(): void;
}

function overlay(positions: ArrayLike<number>, count: number, fragment: string, uniforms: Record<string, THREE.IUniform>, type: string): MarkOverlay {
  const geometry = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 12);
  const corner = new Float32Array(count * 8);
  const index: number[] = [];
  for (let i = 0; i < count; i += 1) {
    for (let k = 0; k < 4; k += 1) pos.set([positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]], i * 12 + k * 3);
    corner.set(CORNERS, i * 8);
    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  const radius = new THREE.BufferAttribute(new Float32Array(count * 4), 1);
  const level = new THREE.BufferAttribute(new Float32Array(count * 4), 1);
  const since = new THREE.BufferAttribute(new Float32Array(count * 4).fill(-1), 1);
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
  geometry.setAttribute('radiusPx', radius);
  geometry.setAttribute('level', level);
  geometry.setAttribute('since', since);
  geometry.setIndex(index);
  const material = new THREE.ShaderMaterial({
    uniforms: { viewport: { value: new THREE.Vector2(1, 1) }, zoomFade: { value: 1 }, spread: { value: 1 }, ...uniforms },
    vertexShader: OVERLAY_VERTEX,
    fragmentShader: fragment,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData = { type };
  mesh.frustumCulled = false;
  // Never a pick target: the mark under it hovers and opens.
  mesh.raycast = () => {};
  mesh.onBeforeRender = (renderer, _scene, camera) => {
    renderer.getSize(viewport);
    (material.uniforms.viewport.value as THREE.Vector2).copy(viewport);
    material.uniforms.zoomFade.value = zoomOutFadeFor(renderer, camera, mesh);
  };
  let changed = false;
  return {
    mesh,
    set(i, r, l, s = -1) {
      if (radius.getX(i * 4) === r && level.getX(i * 4) === l && since.getX(i * 4) === s) return;
      for (let k = 0; k < 4; k += 1) { radius.setX(i * 4 + k, r); level.setX(i * 4 + k, l); since.setX(i * 4 + k, s); }
      changed = true;
    },
    commit() {
      if (!changed) return;
      radius.needsUpdate = true; level.needsUpdate = true; since.needsUpdate = true;
      changed = false;
    },
  };
}

/** The magnitude rings' type, as a probe or a test finds them. */
export const MARK_RINGS_TYPE = 'markMagnitudeRings';
/** The pings' type. */
export const MARK_PINGS_TYPE = 'markNewPings';

/** Rings round the marks, drawn behind them, in `color`. */
export function buildMarkRings(positions: ArrayLike<number>, count: number, color: THREE.Color): MarkOverlay {
  const ring = overlay(positions, count, RING_FRAGMENT, { color: { value: color }, lineWidth: { value: RING_LINE_PX } }, MARK_RINGS_TYPE);
  ring.mesh.renderOrder = SCREEN_POINTS_RENDER_ORDER - 1;
  return ring;
}

/**
 * Pings on new marks, in `color`: from a mark's rim outward, for PING_SECONDS from its `since` (seconds on the layer's
 * own clock). Never in a capture: a card has no "since your last visit", and the same shot makes the same picture.
 */
export function buildMarkPings(positions: ArrayLike<number>, count: number, color: THREE.Color): MarkOverlay & { tick(nowS: number): void } {
  const uniforms = {
    color: { value: color }, time: { value: 0 }, period: { value: PING_PERIOD_S }, duration: { value: PING_SECONDS }, hidden: { value: 0 },
  };
  const ping = overlay(positions, count, PING_FRAGMENT, uniforms, MARK_PINGS_TYPE);
  const material = ping.mesh.material as THREE.ShaderMaterial;
  material.uniforms.spread.value = PING_SPREAD;
  ping.mesh.renderOrder = SCREEN_POINTS_RENDER_ORDER - 1;
  return {
    ...ping,
    tick(nowS) {
      material.uniforms.time.value = nowS;
      material.uniforms.hidden.value = captureUnderWay() ? 1 : 0;
    },
  };
}

/** The briefing tour's ping, over every mark: `show` puts it on a place, held so long, or takes it away with null. */
export function buildTourPing(color: THREE.Color): { mesh: THREE.Mesh; show(position: THREE.Vector3 | null, heldForMs: number): void } {
  const uniforms = {
    color: { value: color }, heldMs: { value: 0 }, period: { value: TOUR_PING_PERIOD_MS }, pings: { value: TOUR_PINGS },
  };
  const ping = overlay([0, 0, 0], 1, TOUR_PING_FRAGMENT, uniforms, TOUR_PING_TYPE);
  const material = ping.mesh.material as THREE.ShaderMaterial;
  material.uniforms.spread.value = TOUR_PING_SPREAD;
  // Over everything, the glyphs' squares included: a held item is always on the near side, framed above the caption.
  material.depthTest = false;
  ping.mesh.renderOrder = SCREEN_POINTS_RENDER_ORDER + 1000;
  const corners = ping.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  return {
    mesh: ping.mesh,
    show(position, heldForMs) {
      if (position) {
        for (let k = 0; k < 4; k += 1) corners.setXYZ(k, position.x, position.y, position.z);
        corners.needsUpdate = true;
      }
      ping.set(0, TOUR_RING_PX, position ? 1 : 0);
      ping.commit();
      material.uniforms.heldMs.value = heldForMs;
    },
  };
}

/** A ring's radius in CSS px for a magnitude on a square-root scale, so its area grows with the figure; 0 for none. */
export function ringRadiusPx(value: number, pxPerRoot: number, minPx: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const r = pxPerRoot * Math.sqrt(value);
  return r < minPx ? 0 : Math.min(r, RING_MAX_PX);
}

/** Release an overlay's GPU memory. */
export function disposeOverlay(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
}
