/**
 * Marks that would cover one another on screen: one is drawn, and the rest fold under it (D-GV GV6, W1).
 *
 * War & Conflict's notes crowd where the news is. Over Israel, Lebanon, Gaza and Syria a war card's glyphs lay
 * on each other until none of them could be read. Each frame the marks are placed on screen in order of
 * importance. One that would touch a mark already placed is not drawn, and the mark it falls under counts it on
 * a badge, and hovers and opens it too. As in MapLibre's symbol placement, a mark already shown keeps its place
 * until it truly touches another, and a hidden one comes back only with a clear gap, so a turning globe does not
 * flicker. A still card is placed afresh, so the same shot makes the same picture, whatever came before it.
 */
import * as THREE from 'three';
import { badgeCellOf, buildPlaceBadges } from './intelReportSprites';
import { buildMarkPings, buildMarkRings, ringRadiusPx } from './glyphOverlays';
import { clipUnderWay, stilledAt } from '../../globe-engine/captureClock';
import type { GlobeNoteSet } from '../../features/globe/noteDetail/globeNoteStore';

/** A mark where it is drawn this frame, in CSS px; null for one not on screen. */
export interface DeclutterCircle {
  x: number;
  y: number;
  radius: number;
}

/** The clear gap a hidden mark needs before it is drawn again, in CSS px. A shown one stays until it touches. */
export const DECLUTTER_ENTER_GAP_PX = 6;

/**
 * How much of a mark's square its backing fills, as a radius: the discs are drawn at a radius of 29 to 31.5
 * in a 64 px cell, the glow fading to nothing at its edge.
 */
export const DECLUTTER_RADIUS_FRACTION = 0.46;

/** How long a mark takes to fade in or out on screen, in ms. A capture never fades: it is placed and drawn. */
export const DECLUTTER_FADE_MS = 160;

export interface DeclutterResult {
  /** Whether each mark is drawn. */
  shown: boolean[];
  /** For each hidden mark, the drawn one it falls under; -1 for a drawn mark or one not on screen. */
  under: number[];
}

/**
 * Places the marks, most important first (`priority`, lower first; the earlier mark on a tie). A mark is drawn
 * when it touches none already placed: with `DECLUTTER_ENTER_GAP_PX` to spare, unless `previous` says it was
 * drawn last frame, when touching is enough. A hidden mark falls under the most important mark it touches.
 */
export function declutterGlyphs(
  circles: ReadonlyArray<DeclutterCircle | null>,
  priority: readonly number[],
  previous: readonly boolean[] | null = null,
): DeclutterResult {
  const count = circles.length;
  const shown = new Array<boolean>(count).fill(false);
  const under = new Array<number>(count).fill(-1);
  let largest = 0;
  for (const circle of circles) if (circle && circle.radius > largest) largest = circle.radius;
  // No two marks farther apart than this can touch, so each looks only in its own cell and the eight around it.
  const cell = Math.max(2 * largest + DECLUTTER_ENTER_GAP_PX, 1);
  const grid = new Map<string, number[]>();
  const rank = new Array<number>(count).fill(Infinity);
  const order = circles.map((_, i) => i)
    .filter((i) => circles[i] !== null)
    .sort((a, b) => (priority[a] ?? 0) - (priority[b] ?? 0) || a - b);

  order.forEach((i, placedAt) => {
    const circle = circles[i]!;
    const gap = previous?.[i] ? 0 : DECLUTTER_ENTER_GAP_PX;
    const cx = Math.floor(circle.x / cell);
    const cy = Math.floor(circle.y / cell);
    let blocker = -1;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const j of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          const other = circles[j]!;
          const apart = Math.hypot(circle.x - other.x, circle.y - other.y);
          if (apart >= circle.radius + other.radius + gap) continue;
          if (blocker === -1 || rank[j] < rank[blocker]) blocker = j;
        }
      }
    }
    if (blocker !== -1) {
      under[i] = blocker;
      return;
    }
    shown[i] = true;
    rank[i] = placedAt;
    const key = `${cx},${cy}`;
    const here = grid.get(key);
    if (here) here.push(i);
    else grid.set(key, [i]);
  });
  // Only drawn marks are in the grid, so a hidden mark always falls under a drawn one.
  return { shown, under };
}

/** What the drawn mark of a pile hovers and opens: its own, with what fell under it. */
export interface PileSay {
  tooltip?: string;
  opens?: GlobeNoteSet | null;
}

export interface SpriteDeclutter {
  /** Each mark's importance, lower first. */
  priority: readonly number[];
  /** What each mark stands for, counted on a badge with what falls under it. */
  counts: readonly number[];
  /** The count badges' atlas (bakeBadgeAtlas); without it no badge is drawn, and the marks still declutter. */
  badges?: THREE.Texture | null;
  /** The hover and click of a drawn mark with marks under it, asked each time its pile changes. */
  pileOf?: (shown: number, under: readonly number[]) => PileSay;
  /**
   * A ring round each drawn mark sized by a magnitude on a square-root scale (glyphOverlays.ts): a pile's the
   * largest of what it holds, never a sum. `pxPerRoot` is the radius per square root of the value; a ring smaller
   * than `minPx` is not drawn, the mark's own rim saying as much.
   */
  rings?: { values: readonly number[]; color: THREE.Color; pxPerRoot: number; minPx: number };
  /**
   * A ping on each drawn mark that is new: `since` is when it became new, in seconds on `clock`, or -1; a pile pings
   * from its newest. Never in a capture.
   */
  pings?: { since: readonly number[]; color: THREE.Color; clock: () => number };
}

const world = new THREE.Vector3();
const eye = new THREE.Vector3();
const toEye = new THREE.Vector3();
const viewport = new THREE.Vector2();

/** Whether two piles hold the same marks. */
function samePiles(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((j, i) => j === b[i]);
}

/**
 * Declutters a glyph layer (buildGlyphSprites) as it draws: its `markShown` set each frame, a badge on each
 * drawn mark that stands for more than one thing, and the drawn mark of a pile hovering and opening all of it.
 * The badges are the object's child, and are disposed with it (disposeIntelSprites).
 */
export function declutterSprites(points: THREE.Points, config: SpriteDeclutter): void {
  const geometry = points.geometry;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const sizes = geometry.getAttribute('pointSize') as THREE.BufferAttribute;
  const opacities = geometry.getAttribute('markOpacity') as THREE.BufferAttribute;
  const times = geometry.getAttribute('markTime') as THREE.BufferAttribute;
  const shownAttr = geometry.getAttribute('markShown') as THREE.BufferAttribute;
  const material = points.material as THREE.ShaderMaterial;
  const count = position.count;

  const badges = buildPlaceBadges(
    Array.from({ length: count }, (_, i) => ({
      position: new THREE.Vector3().fromBufferAttribute(position, i),
      count: config.counts[i] ?? 1,
      opacity: opacities.getX(i),
    })),
    config.badges ?? null,
    { everyPlace: true },
  );
  if (badges) points.add(badges);
  const positions = position.array as ArrayLike<number>;
  const rings = config.rings ? buildMarkRings(positions, count, config.rings.color) : null;
  if (rings) points.add(rings.mesh);
  const pings = config.pings ? buildMarkPings(positions, count, config.pings.color) : null;
  if (pings) points.add(pings.mesh);
  const badgeCells = badges?.geometry.getAttribute('badgeCell') as THREE.BufferAttribute | undefined;
  const badgeOpacities = badges?.geometry.getAttribute('markOpacity') as THREE.BufferAttribute | undefined;

  const baseTooltips = [...((points.userData.tooltips as string[] | undefined) ?? [])];
  const baseOpens = [...((points.userData.opens as Array<GlobeNoteSet | null> | undefined) ?? [])];
  const circles = new Array<DeclutterCircle | null>(count).fill(null);
  const levels = new Float32Array(count).fill(1);
  let previous: boolean[] | null = null;
  let piles: number[][] = Array.from({ length: count }, () => []);
  let lastAt: number | null = null;

  const base = points.onBeforeRender;
  points.onBeforeRender = function declutterStep(renderer, scene, camera, ...rest) {
    base.call(this, renderer, scene, camera, ...rest);
    renderer.getSize(viewport);
    eye.setFromMatrixPosition(camera.matrixWorld);
    const u = material.uniforms;
    const scale = (u.sizeScale?.value as number | undefined) ?? 1;
    const revealAt = u.revealAt.value as number;
    const replaying = revealAt < 1e29;
    for (let i = 0; i < count; i += 1) {
      circles[i] = null;
      if (opacities.getX(i) <= 0) continue;
      // Not yet arrived in a replay, or outside its span: drawn nowhere, so in nobody's way (the shader's own test).
      const t = times.getX(i);
      if (t > -1e8 && (revealAt - t <= 0 || (replaying && (t < u.revealFrom.value || t > u.revealUntil.value)))) continue;
      world.fromBufferAttribute(position, i).applyMatrix4(points.matrixWorld);
      // Beyond the horizon: behind the planet.
      if (world.dot(toEye.copy(eye).sub(world)) <= 0) continue;
      world.project(camera);
      if (world.z < -1 || world.z > 1) continue;
      const radius = sizes.getX(i) * scale * DECLUTTER_RADIUS_FRACTION;
      const x = ((world.x + 1) / 2) * viewport.x;
      const y = ((1 - world.y) / 2) * viewport.y;
      // Outside the picture: a card never counts what it does not show.
      if (x < -radius || y < -radius || x > viewport.x + radius || y > viewport.y + radius) continue;
      circles[i] = { x, y, radius };
    }
    // A still card is placed afresh; a clip's frames and the live globe keep their places (hysteresis).
    const capturing = stilledAt() !== null;
    const card = capturing && !clipUnderWay();
    const { shown, under } = declutterGlyphs(circles, config.priority, card ? null : previous);
    previous = shown;

    // Fade on screen; a capture is drawn as placed.
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const stepBy = capturing || lastAt === null ? 1 : Math.min(1, (now - lastAt) / DECLUTTER_FADE_MS);
    lastAt = capturing ? null : now;
    let moved = false;
    for (let i = 0; i < count; i += 1) {
      const target = shown[i] ? 1 : 0;
      const level = levels[i] + Math.sign(target - levels[i]) * Math.min(Math.abs(target - levels[i]), stepBy);
      if (level === levels[i]) continue;
      levels[i] = level;
      shownAttr.setX(i, level);
      moved = true;
    }
    if (moved) shownAttr.needsUpdate = true;

    // The piles: what falls under each drawn mark.
    const next: number[][] = Array.from({ length: count }, () => []);
    under.forEach((j, i) => { if (j !== -1) next[j].push(i); });
    let hidden = 0;
    for (let i = 0; i < count; i += 1) if (!shown[i] && circles[i]) hidden += 1;
    points.userData.marksUnderOthers = hidden;

    if (badgeCells && badgeOpacities) {
      let changed = false;
      for (let i = 0; i < count; i += 1) {
        const total = next[i].reduce((sum, j) => sum + (config.counts[j] ?? 1), config.counts[i] ?? 1);
        const cellOf = shown[i] ? badgeCellOf(total) ?? -1 : -1;
        const opacity = cellOf === -1 ? 0 : levels[i] * opacities.getX(i);
        if (badgeCells.getX(i) !== cellOf) { badgeCells.setX(i, cellOf); changed = true; }
        if (badgeOpacities.getX(i) !== opacity) { badgeOpacities.setX(i, opacity); changed = true; }
      }
      if (changed) { badgeCells.needsUpdate = true; badgeOpacities.needsUpdate = true; }
    }

    // What rides on the drawn marks: a pile's largest magnitude, and its newest arrival.
    if (rings && config.rings) {
      const { values, pxPerRoot, minPx } = config.rings;
      for (let i = 0; i < count; i += 1) {
        const value = shown[i] ? next[i].reduce((most, j) => Math.max(most, values[j] ?? 0), values[i] ?? 0) : 0;
        const r = ringRadiusPx(value, pxPerRoot, minPx);
        rings.set(i, r, r > 0 ? levels[i] * opacities.getX(i) : 0);
      }
      rings.commit();
    }
    if (pings && config.pings) {
      const { since } = config.pings;
      for (let i = 0; i < count; i += 1) {
        const newest = shown[i] ? next[i].reduce((latest, j) => Math.max(latest, since[j] ?? -1), since[i] ?? -1) : -1;
        pings.set(i, sizes.getX(i) * scale * DECLUTTER_RADIUS_FRACTION, newest >= 0 ? levels[i] * opacities.getX(i) : 0, newest);
      }
      pings.commit();
      pings.tick(config.pings.clock());
    }

    if (config.pileOf && next.some((pile, i) => !samePiles(pile, piles[i]))) {
      next.forEach((pile, i) => {
        if (samePiles(pile, piles[i])) return;
        const say = pile.length ? config.pileOf!(i, pile) : {};
        // In point order, as buildGlyphSprites keeps them; made here for a layer whose marks gave none.
        if (say.tooltip !== undefined) points.userData.tooltips ??= Array.from({ length: count }, (_, k) => baseTooltips[k] ?? '');
        if (say.opens) points.userData.opens ??= Array.from({ length: count }, (_, k) => baseOpens[k] ?? null);
        const tooltips = points.userData.tooltips as string[] | undefined;
        const opens = points.userData.opens as Array<GlobeNoteSet | null> | undefined;
        if (tooltips) tooltips[i] = say.tooltip ?? baseTooltips[i] ?? '';
        if (opens) opens[i] = say.opens ?? baseOpens[i] ?? null;
      });
    }
    piles = next;
  };
}
