/**
 * Hero Watch's marks (decision D-HW, step 3; HW5, HW9).
 *
 * A lifebuoy at each RNLI lifeboat station Mecha Jono publishes, drawn through the same sprite builder as Intel Reports and
 * Raver Watch (buildGlyphSprites): a dark disc rimmed in Hero Watch's rescue orange, and the lifebuoy
 * light with a dark outline over it, so it reads over sea and land alike. Its size says its launches in
 * the year the RNLI counted (2025), on one fixed scale so a card compares across views: area follows the
 * count, from 0.4 of a report's size to a report's own at a hundred launches, held at 1.1 above that
 * (Tower, on the Thames, launched 439 times). Smaller than a report, as 118 stations line one coast: at
 * a report's size they merged into one orange shore on the build. A station the RNLI's records do not
 * count is rimmed in grey at the smallest size, so "not counted" never reads as "few launches".
 *
 * Relief (HW4) is its glyph, a package, at a country's middle, on the same disc and rim, a report's size, with a pill
 * right of it naming the country and counting its operations and organisations ("Ethiopia · 1 op ·
 * 144 orgs"). The pill is a quad, not a point: a point sprite is square and capped in size on some
 * phones, and the words are wider than tall. It is placed in clip space, so it keeps its size on screen
 * as the camera moves, and the country names keep clear of it (nameObstacles.ts), which is why it
 * carries the country's name.
 *
 * Field missions (HW6) are a clipboard at the middle of the state or country with open missions, on the
 * same disc and rim, with a pill naming the place and counting them ("New Mexico · 1 mission"). Every
 * pill of the mode is one object, from one atlas.
 *
 * The lifebuoy and relief's package are the rail's own glyphs for Lifeboats and Relief (uiSymbols.ts),
 * so one meaning has one icon wherever it is drawn; relief's was a tent until glyph round 5
 * (2026-10-11). The clipboard is Lucide's clipboard-check, kept on the globe when the rail took a pin:
 * a pin at a state's middle would say the mission is at that point. All on Lucide's 24-unit grid (ISC
 * licence; Copyright (c) Lucide Contributors 2022), as SVG strings because the atlas is baked through
 * an Image under the CSP, which admits `data:`.
 */
import * as THREE from 'three';
import { bakeSvgAtlas, type GlyphSpriteLayout, type GlyphSpriteMark } from './intelReportSprites';
import { REPORT_SPRITE_PX } from './Hooks/useGlobeIntelSprites';
import { DATA_SCALES, FONTS, GUNMETAL } from '../../styles/tokens';
import { SCREEN_POINTS_RENDER_ORDER } from './screenPoints';
import { earthRadiusOnScreen, zoomOutFadeFor } from './zoomOutFade';
import type { LifeboatStation } from '../../services/heroWatch/heroWatch';
import { GLYPHS } from '../../symbols/uiSymbols';

/** How this layer's object is found by a probe, a test, or the picking code. */
export const HERO_WATCH_SPRITE_TYPE = 'heroWatchSprites';

/** The atlas's cells, in its one row. */
export const HERO_WATCH_CELLS = ['lifeboat', 'lifeboat-uncounted', 'relief', 'mission'] as const;
export type HeroWatchCell = (typeof HERO_WATCH_CELLS)[number];

export const HERO_WATCH_LAYOUT: GlyphSpriteLayout = {
  cellCount: HERO_WATCH_CELLS.length,
  rowCount: 1,
  type: HERO_WATCH_SPRITE_TYPE,
};

/*
 * Seen from far out (HW15): all 238 stations made one orange mass of Britain and Ireland from Europe
 * height, so lifeboats shrink as the camera rises. How large the Earth looks decides, as it does the
 * zoom-out fade (zoomOutFade.ts): whole while its radius on screen is at least LIFEBOAT_FULL_PX, a
 * third of their size at LIFEBOAT_DOT_PX and below, so the coasts read as a dotted line. Never gone:
 * the zoom-out fade takes them, as every layer's, when the Earth is smaller still.
 */
export const LIFEBOAT_FULL_PX = 1000;
export const LIFEBOAT_DOT_PX = 400;
export const LIFEBOAT_DOT_SCALE = 0.35;

/** A lifeboat's size for a view, as a share of its own, by the Earth's radius on screen in CSS px. */
export function lifeboatScaleAt(earthRadiusPx: number): number {
  const t = THREE.MathUtils.clamp((earthRadiusPx - LIFEBOAT_DOT_PX) / (LIFEBOAT_FULL_PX - LIFEBOAT_DOT_PX), 0, 1);
  return LIFEBOAT_DOT_SCALE + (1 - LIFEBOAT_DOT_SCALE) * t;
}

const eyeAt = new THREE.Vector3();
const centreAt = new THREE.Vector3();
const sizeAt = new THREE.Vector2();

/** The lifeboats' size for the view a renderer draws through a camera: the sprites' `sizeScaleFor`. */
export function lifeboatSizeFor(renderer: THREE.WebGLRenderer, camera: THREE.Camera, object: THREE.Object3D): number {
  const perspective = camera as THREE.PerspectiveCamera;
  if (!perspective.isPerspectiveCamera) return 1;
  centreAt.setFromMatrixPosition(object.matrixWorld);
  eyeAt.setFromMatrixPosition(perspective.matrixWorld);
  renderer.getSize(sizeAt);
  return lifeboatScaleAt(earthRadiusOnScreen(eyeAt.distanceTo(centreAt), perspective.fov, sizeAt.y));
}

/** A station's size, as a share of a report's, by its launches in the year counted. */
export function lifeboatSizeScale(launches: number | undefined): number {
  if (launches === undefined) return 0.4;
  return Math.min(1.1, 0.4 + 0.6 * Math.sqrt(Math.max(launches, 0) / 100));
}

/** What the RNLI's station types are, in words: the four Mecha Jono's sheet lists. */
const STATION_TYPE: Record<string, string> = {
  ALB: 'all-weather lifeboat', ILB: 'inshore lifeboat', 'ALB/ILB': 'all-weather and inshore lifeboats', HOV: 'hovercraft',
};

/** A station type in words, or null for one not known here. */
export function stationTypeInWords(type: string | undefined): string | null {
  return type ? STATION_TYPE[type] ?? null : null;
}

/** What a station's hover says: its name, its boats, and its launches as the RNLI counted them. */
export function describeLifeboat(station: LifeboatStation): string {
  const name = station.title.split(':')[0].trim();
  const kind = stationTypeInWords(station.stationType);
  const boats = kind ? ` (${kind})` : '';
  return station.launches === undefined
    ? `${name}${boats}: its launches are not counted in the RNLI's records.`
    : `${name}${boats}: ${station.launches} launch${station.launches === 1 ? '' : 'es'} in ${station.year}, the RNLI's count.`;
}

/** A station's mark at a place on the globe. */
export function lifeboatMark(station: LifeboatStation, position: THREE.Vector3): GlyphSpriteMark {
  return {
    position,
    sizePx: REPORT_SPRITE_PX * lifeboatSizeScale(station.launches),
    cell: HERO_WATCH_CELLS.indexOf(station.launches === undefined ? 'lifeboat-uncounted' : 'lifeboat'),
    row: 0,
    motion: 0,
    tooltip: describeLifeboat(station),
  };
}

/** A country's relief mark at its middle: the Relief glyph, a report's size; its hover says what `tooltip` says. */
export function reliefMark(position: THREE.Vector3, tooltip: string): GlyphSpriteMark {
  return { position, sizePx: REPORT_SPRITE_PX, cell: HERO_WATCH_CELLS.indexOf('relief'), row: 0, motion: 0, tooltip };
}

/** A place's field missions mark at its middle: a clipboard, a report's size; its hover says what `tooltip` says. */
export function missionMark(position: THREE.Vector3, tooltip: string): GlyphSpriteMark {
  return { position, sizePx: REPORT_SPRITE_PX, cell: HERO_WATCH_CELLS.indexOf('mission'), row: 0, motion: 0, tooltip };
}

// The palette's darkest and lightest, as the glyph's outline and ink; its muted grey for "not counted".
const OUTLINE = GUNMETAL[950];
const GLYPH_COLOR = GUNMETAL[100];
const UNCOUNTED = GUNMETAL[400];
/** A registry glyph's elements as SVG markup, for the atlas. */
const markupOf = (icon: ReadonlyArray<readonly [string, Readonly<Record<string, unknown>>]>) =>
  icon.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${String(v)}"`).join(' ')}/>`).join('');
const LIFE_BUOY = markupOf(GLYPHS['layer:Lifeboats'].icon);
const RELIEF = markupOf(GLYPHS['layer:Relief'].icon);
const CLIPBOARD_CHECK = [
  '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>',
  '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  '<path d="m9 14 2 2 4-4"/>',
].join('');

function cellSvg(cell: HeroWatchCell): string {
  const rim = cell === 'lifeboat-uncounted' ? UNCOUNTED : DATA_SCALES.heroWatch;
  const glyph = cell === 'relief' ? RELIEF : cell === 'mission' ? CLIPBOARD_CHECK : LIFE_BUOY;
  const frame = 'transform="translate(14 14) scale(1.5)" fill="none" stroke-linecap="round" stroke-linejoin="round"';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">'
    + `<circle cx="32" cy="32" r="29" fill="${OUTLINE}" fill-opacity="0.78" stroke="${rim}" stroke-width="3.5"/>`
    + `<g ${frame} stroke="${OUTLINE}" stroke-width="4.5">${glyph}</g>`
    + `<g ${frame} stroke="${GLYPH_COLOR}" stroke-width="2.25">${glyph}</g>`
    + '</svg>';
}

/** The atlas's one row of cells, as SVG. */
export function heroWatchAtlasRows(): string[][] {
  return [HERO_WATCH_CELLS.map(cellSvg)];
}

let atlas: Promise<THREE.Texture | null> | null = null;

export function heroWatchAtlas(): Promise<THREE.Texture | null> {
  atlas ??= bakeSvgAtlas(heroWatchAtlasRows());
  return atlas;
}

/*
 * ─── THE PILL ─────────────────────────────────────────────────────────────
 * Beside a relief mark or a field missions clipboard: the place, and its counts. Placed each frame
 * in the order given, a pill that would overlap one already placed waits (declutterPills): seen
 * whole, the United States' pills piled into one another.
 */

/** How the pills are found by a probe or a test. Never picked. */
export const HERO_WATCH_PILL_TYPE = 'heroWatchPills';
/** A pill's height on screen, in CSS px. */
export const PILL_HEIGHT_PX = 18;
/** Its left edge, right of the mark's centre, in CSS px: just past the mark's rim. */
export const PILL_OFFSET_PX = Math.round(REPORT_SPRITE_PX / 2) + 3;
const PILL_PAD_PX = 7;
const PILL_FONT_PX = 11;
/** The space between pills in the atlas, in CSS px, so a pill's edge never samples its neighbour's. */
const PILL_GAP_PX = 2;

/** Where a pill's words are in the atlas, in uv; its width on screen in CSS px. */
export interface PillCell { u0: number; v0: number; u1: number; v1: number; widthPx: number }
export interface PillAtlas { texture: THREE.Texture; cells: ReadonlyMap<string, PillCell> }

/** A pill's width on screen for words `textWidthPx` wide. */
export function pillWidthPx(textWidthPx: number): number {
  return Math.ceil(textWidthPx) + 2 * PILL_PAD_PX;
}

/**
 * Every pill's words drawn once, a row each, at `scale` device px to the CSS px so they are crisp on a
 * dense screen; or null where there is no 2D canvas. Not flipped: v0 is a row's top.
 */
export async function bakeHeroWatchPills(labels: readonly string[], scale = 2, rim: string = DATA_SCALES.heroWatch): Promise<PillAtlas | null> {
  if (typeof document === 'undefined' || labels.length === 0) return null;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;
  const font = `600 ${PILL_FONT_PX * scale}px ${FONTS.text}`;
  context.font = font;
  const widths = labels.map((label) => pillWidthPx(context.measureText(label).width / scale));
  const rowPx = PILL_HEIGHT_PX + PILL_GAP_PX;
  canvas.width = Math.ceil(Math.max(...widths) * scale);
  canvas.height = Math.ceil(labels.length * rowPx * scale);
  // A canvas resized is cleared, its font with it.
  context.font = font;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const cells = new Map<string, PillCell>();
  labels.forEach((label, i) => {
    const w = widths[i] * scale;
    const h = PILL_HEIGHT_PX * scale;
    const top = i * rowPx * scale;
    const r = h / 2;
    const line = 1.5 * scale;
    context.beginPath();
    context.moveTo(r, top + line / 2);
    context.arcTo(w - line / 2, top + line / 2, w - line / 2, top + h - line / 2, r - line / 2);
    context.arcTo(w - line / 2, top + h - line / 2, line / 2, top + h - line / 2, r - line / 2);
    context.arcTo(line / 2, top + h - line / 2, line / 2, top + line / 2, r - line / 2);
    context.arcTo(line / 2, top + line / 2, w - line / 2, top + line / 2, r - line / 2);
    context.closePath();
    context.globalAlpha = 0.85;
    context.fillStyle = OUTLINE;
    context.fill();
    context.globalAlpha = 1;
    context.lineWidth = line;
    context.strokeStyle = rim;
    context.stroke();
    context.fillStyle = GLYPH_COLOR;
    context.fillText(label, w / 2, top + h / 2 + scale * 0.5);
    cells.set(label, { u0: 0, v0: top / canvas.height, u1: w / canvas.width, v1: (top + h) / canvas.height, widthPx: widths[i] });
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { texture, cells };
}

/** A pill's box on screen, in CSS px. */
export interface PillBox { x: number; y: number; width: number; height: number }

/**
 * Which pills are placed, first come, first placed: one that would overlap a placed one waits. Null is a
 * pill not on screen (behind the planet), never placed and never in another's way. Touching is not
 * overlapping.
 */
export function declutterPills(boxes: ReadonlyArray<PillBox | null>): boolean[] {
  const placed: PillBox[] = [];
  return boxes.map((box) => {
    if (!box) return false;
    const clear = placed.every((other) => box.x >= other.x + other.width || other.x >= box.x + box.width
      || box.y >= other.y + other.height || other.y >= box.y + box.height);
    if (clear) placed.push(box);
    return clear;
  });
}

const PILL_VERTEX = /* glsl */`
  attribute vec2 corner;
  attribute float shown;
  uniform vec2 viewport;
  varying vec2 vUv;
  varying float vShown;

  void main() {
    vUv = uv;
    vShown = shown;
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // CSS pixels to clip space, scaled by w so the shift survives the perspective divide.
    clip.xy += corner * 2.0 / max(viewport, vec2(1.0)) * clip.w;
    gl_Position = clip;
  }
`;

const PILL_FRAGMENT = /* glsl */`
  uniform sampler2D atlas;
  uniform float zoomFade;
  varying vec2 vUv;
  varying float vShown;

  void main() {
    if (vShown < 0.5) discard;
    vec4 texel = texture2D(atlas, vUv);
    if (texel.a < 0.04) discard;
    // The atlas decoded to linear, back to the screen's colour, as the glyph sprites do (D-EQ, EQ13).
    gl_FragColor = sRGBTransferOETF(vec4(texel.rgb, texel.a * zoomFade));
  }
`;

const anchor = new THREE.Vector3();
const eye = new THREE.Vector3();
const toEye = new THREE.Vector3();
const viewportSize = new THREE.Vector2();

/** One object for every pill, in the order they are placed, or null when there is none to draw. */
export function buildHeroWatchPills(
  pills: ReadonlyArray<{ position: THREE.Vector3; label: string }>,
  atlas: PillAtlas | null,
  /** How a probe finds them: Hero Watch's, or AI Watch's, which draws its pills the same way (D-AW). */
  type: string = HERO_WATCH_PILL_TYPE,
): THREE.Mesh | null {
  const baked = atlas ? pills.filter((pill) => atlas.cells.has(pill.label)) : [];
  if (!atlas || baked.length === 0) return null;
  const half = PILL_HEIGHT_PX / 2;
  const positions = new Float32Array(baked.length * 12);
  const corners = new Float32Array(baked.length * 8);
  const uvs = new Float32Array(baked.length * 8);
  const index: number[] = [];
  baked.forEach((pill, i) => {
    const cell = atlas.cells.get(pill.label)!;
    const left = PILL_OFFSET_PX;
    const right = PILL_OFFSET_PX + cell.widthPx;
    // Bottom left, bottom right, top right, top left: y up on screen, v down the atlas.
    corners.set([left, -half, right, -half, right, half, left, half], i * 8);
    uvs.set([cell.u0, cell.v1, cell.u1, cell.v1, cell.u1, cell.v0, cell.u0, cell.v0], i * 8);
    for (let k = 0; k < 4; k += 1) positions.set([pill.position.x, pill.position.y, pill.position.z], i * 12 + k * 3);
    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('corner', new THREE.BufferAttribute(corners, 2));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  const shown = new THREE.BufferAttribute(new Float32Array(baked.length * 4).fill(1), 1);
  geometry.setAttribute('shown', shown);
  geometry.setIndex(index);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      atlas: { value: atlas.texture },
      viewport: { value: new THREE.Vector2(1, 1) },
      zoomFade: { value: 1 },
    },
    vertexShader: PILL_VERTEX,
    fragmentShader: PILL_FRAGMENT,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  // A country's name never covers a placed pill (nameObstacles.ts): each a box right of its place.
  const rects = baked.map((pill) => ({
    at: [pill.position.x, pill.position.y, pill.position.z] as [number, number, number],
    offsetXPx: PILL_OFFSET_PX,
    widthPx: atlas.cells.get(pill.label)!.widthPx,
    heightPx: PILL_HEIGHT_PX,
  }));
  mesh.userData = { type, labels: baked.map((pill) => pill.label), nameObstacleRects: rects };
  mesh.onBeforeRender = (renderer, _scene, camera) => {
    renderer.getSize(material.uniforms.viewport.value as THREE.Vector2);
    material.uniforms.zoomFade.value = zoomOutFadeFor(renderer, camera, mesh);
    // Placed for this frame, in the order given: each pill's box where it is drawn, or null on the far side.
    renderer.getSize(viewportSize);
    eye.setFromMatrixPosition(camera.matrixWorld);
    const placed = declutterPills(rects.map((rect) => {
      anchor.set(rect.at[0], rect.at[1], rect.at[2]).applyMatrix4(mesh.matrixWorld);
      if (anchor.dot(toEye.copy(eye).sub(anchor)) <= 0) return null;
      anchor.project(camera);
      if (anchor.z < -1 || anchor.z > 1) return null;
      return {
        x: ((anchor.x + 1) / 2) * viewportSize.x + rect.offsetXPx,
        y: ((1 - anchor.y) / 2) * viewportSize.y - rect.heightPx / 2,
        width: rect.widthPx,
        height: rect.heightPx,
      };
    }));
    let changed = false;
    placed.forEach((on, i) => {
      if ((shown.getX(i * 4) === 1) === on) return;
      for (let k = 0; k < 4; k += 1) shown.setX(i * 4 + k, on ? 1 : 0);
      changed = true;
    });
    if (changed) {
      shown.needsUpdate = true;
      mesh.userData.nameObstacleRects = rects.filter((_, i) => placed[i]);
    }
  };
  mesh.frustumCulled = false;
  // Over the mark it belongs to.
  mesh.renderOrder = SCREEN_POINTS_RENDER_ORDER + 1;
  // Never a pick target: a hit on the words must not stand in for the mark's hover.
  mesh.raycast = () => {};
  return mesh;
}

/** Release a pill object's GPU memory. Its atlas is the caller's, and is NOT disposed. */
export function disposeHeroWatchPills(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  (mesh.material as THREE.ShaderMaterial).dispose();
}
