/**
 * Earthquakes as Earthquake 3D draws them, done sharper (D-EQ, EQ10, EQ11): a line up from each epicentre to a flag
 * that says its magnitude, the line and flag coloured by magnitude (tokens DATA_SCALES.quakeMagnitude) or, as the rail
 * chooses, by how deep the quake began (DATA_SCALES.quakeDepthKm; EQ5). Where quakes crowd on
 * screen their flags stack on the strongest one's line, the strongest on top, up to FLAG_STACK_LIMIT, the rest counted
 * on a "+N" chip under them; a hover names each, a click opens it. Round each quake of magnitude RING_FROM_MAGNITUDE or
 * more, the area it reached (EQ11): USGS's own ShakeMap contours where USGS made one, in USGS's colours for how
 * strongly the ground shook, over a dark halo so they read on land and sea; elsewhere a dashed ring, an indication
 * from its magnitude alone. The flags are baked at twice their size on screen and mipmapped, so they stay sharp.
 */
import * as THREE from 'three';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';
import { buildGlyphSprites, type GlyphSpriteMark } from '../../../components/Globe/intelReportSprites';
import { buildLineBatch, buildLineBatches, type LineLook } from '../../../geopolitical/geometry/lineBatches';
import type { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { drawAboveSurfaceLayers } from '../../../components/Globe/screenPoints';
import { SURFACE_LINES } from '../../../components/Globe/globeAltitudes';
import { DATA_SCALES, FONTS, GUNMETAL, KIND_COLOURS, SEMANTIC, TINT_NEUTRAL } from '../../../styles/tokens';
import type { GlobeNoteSet } from '../noteDetail/globeNoteStore';
import type { ShakeContour } from '../../../services/ShakeMapService';
import { PIN_HEIGHT } from './kindMarks';
import type { QuakeReplayMoment } from '../timebar/playClock';

export interface QuakeFlagItem {
  id: string;
  lat: number;
  lng: number;
  /** Null for an atlas quake NOAA's record gives no magnitude: its flag says "?", grey, with no ring. */
  magnitude: number | null;
  tooltip?: string;
  opens?: GlobeNoteSet | null;
  /** When it appears in a replay, ms since the epoch. */
  timeMs?: number | null;
  /** USGS's ShakeMap contours, where it made one and they are read (ShakeMapService). */
  shaking?: readonly ShakeContour[] | null;
  /** How deep it began, km, as the feed states it. */
  depthKm?: number | null;
  /** NOAA's atlas record of a significant quake (EQ16): its flag gets a badge for deaths and a tsunami. */
  atlas?: { deaths: number | null; deathsOrder: number | null; tsunami: boolean } | null;
}

/** What a quake's line, flag and ring are coloured by (EQ5). */
export type QuakeColourBy = 'magnitude' | 'depth';

const GLOBE_RADIUS_UNITS = 100;
/** A flag sprite's square on screen, CSS px: the flag fills its upper-right quarter, off the top of its line. */
export const QUAKE_FLAG_PX = 64;
/** How many flags a stack shows; the rest are counted on its chip. */
export const FLAG_STACK_LIMIT = 4;
/** How far apart a stack's flags are, CSS px: a flag's height and a gap. */
export const FLAG_PITCH_PX = 21;
/** Flags whose lines' tops are closer than this on screen share a stack: past a flag's width, so neighbouring stacks never overlap. */
export const STACK_RADIUS_PX = 34;
/**
 * A line's height for the camera's height over the ground, both as shares of the globe's radius: about the same
 * length on screen at every zoom, up to a pin's (PIN_HEIGHT), so close in a flag stays over its own quake.
 */
export const STALK_PER_ALTITUDE = 0.15;
export const stalkHeightFor = (altitude: number): number => Math.min(PIN_HEIGHT, Math.max(0.004, STALK_PER_ALTITUDE * altitude));

/** Quakes from this magnitude get a ring: smaller ones would draw rings too small to see. */
export const RING_FROM_MAGNITUDE = 4;

// The atlas: a flag for every magnitude to a tenth, 0.0 to 9.9, then the chips "+1" to "+99", then the badges.
const CELL_PX = 128;
const GUTTER_PX = 8;
const STRIDE_PX = CELL_PX + 2 * GUTTER_PX;
const COLUMNS = 16;
const MAGNITUDE_CELLS = 100;
const CHIP_CELLS = 99;
/**
 * An atlas quake's badge (EQ16): its deaths as the least power of ten NOAA's count reaches ("†" some, "†10+", up
 * to "†100k+"), a wave where a tsunami came of it; the exact count is in its hover and its note. Classes 0 (none) to
 * 6, each with and without the wave: 13 cells, none for neither.
 */
export const DEATHS_CLASS_LABELS = ['', '†', '†10+', '†100+', '†1k+', '†10k+', '†100k+'] as const;
const BADGE_BASE = MAGNITUDE_CELLS + CHIP_CELLS;
const BADGE_CELLS = DEATHS_CLASS_LABELS.length * 2 - 1;
/** The flag of a quake of no recorded magnitude (an atlas quake from before instruments): "?". */
export const UNKNOWN_MAGNITUDE_CELL = BADGE_BASE + BADGE_CELLS;
export const FLAG_ATLAS_ROWS = Math.ceil((MAGNITUDE_CELLS + CHIP_CELLS + BADGE_CELLS + 1) / COLUMNS);

/** The class of a quake's deaths: from NOAA's count, else from its order (1 under 50 … 4 over 1,000); 0 for none. */
export function deathsClass(deaths: number | null | undefined, order: number | null | undefined): number {
  if (typeof deaths === 'number' && deaths > 0) return Math.min(6, Math.floor(Math.log10(deaths)) + 1);
  if (typeof order === 'number' && order >= 1 && order <= 4) return order;
  return 0;
}

/** A badge's cell, or -1 for a quake with neither deaths nor a tsunami. */
export function badgeIndex(atlas: QuakeFlagItem['atlas']): number {
  if (!atlas) return -1;
  const c = deathsClass(atlas.deaths, atlas.deathsOrder);
  if (c === 0 && !atlas.tsunami) return -1;
  return BADGE_BASE + c * 2 + (atlas.tsunami ? 1 : 0) - 1;
}

/** A magnitude as its flag says it, to a tenth. */
export const magnitudeLabel = (m: number): string => (magnitudeIndex(m) / 10).toFixed(1);
/** A magnitude's cell among the flags: its tenths, 0 to 99. */
export const magnitudeIndex = (m: number): number => Math.round(Math.max(0, Math.min(9.9, Number.isFinite(m) ? m : 0)) * 10);
/** A quake's flag cell: its magnitude's, or "?" where none is recorded. */
export const flagCellOf = (m: number | null): number => (typeof m === 'number' && Number.isFinite(m) ? magnitudeIndex(m) : UNKNOWN_MAGNITUDE_CELL);
/** A chip's cell, for "+n" (n from 1; past 99 it says +99). */
export const chipIndex = (n: number): number => MAGNITUDE_CELLS + Math.min(CHIP_CELLS, Math.max(1, Math.round(n))) - 1;
/** Where an atlas index sits: its column and row. */
export const atlasCellOf = (index: number): { cell: number; row: number } => ({ cell: index % COLUMNS, row: Math.floor(index / COLUMNS) });

/** A magnitude's colour: the band it reaches (DATA_SCALES.quakeMagnitude). */
export function magnitudeColour(m: number): string {
  let colour: string = DATA_SCALES.quakeMagnitude[0][1];
  for (const [from, band] of DATA_SCALES.quakeMagnitude) if (m >= from) colour = band;
  return colour;
}

/** A depth's colour: the USGS band it reaches (DATA_SCALES.quakeDepthKm); a quake of no stated depth, grey. */
export function depthColour(km: number | null | undefined): string {
  if (typeof km !== 'number' || !Number.isFinite(km)) return DEPTH_UNKNOWN;
  let colour: string = DATA_SCALES.quakeDepthKm[0][1];
  for (const [from, band] of DATA_SCALES.quakeDepthKm) if (km >= from) colour = band;
  return colour;
}
export const DEPTH_UNKNOWN = GUNMETAL[300];
/** A quake of no recorded magnitude, grey, as one of no stated depth. */
export const MAGNITUDE_UNKNOWN = GUNMETAL[300];
const hasMagnitude = (m: number | null | undefined): m is number => typeof m === 'number' && Number.isFinite(m);

/** The lower bound of the band a value falls in, on a scale of [from, colour] steps. */
export function bandOf(value: number, scale: ReadonlyArray<readonly [number, string]>): number {
  let from = scale[0][0];
  for (const [lower] of scale) if (value >= lower) from = lower;
  return from;
}

/**
 * Whether a quake is in the bands chosen on the rail (EQ6): its magnitude's band and its depth's, each named by its
 * lower bound. A quake of no stated magnitude or depth is in only while every band of that scale is chosen.
 */
export function quakeInBands(
  magnitude: number | null | undefined,
  depthKm: number | null | undefined,
  magnitudes: readonly string[],
  depths: readonly string[],
): boolean {
  const inScale = (value: number | null | undefined, chosen: readonly string[], scale: ReadonlyArray<readonly [number, string]>) =>
    (typeof value === 'number' && Number.isFinite(value) ? chosen.includes(String(bandOf(value, scale))) : chosen.length >= scale.length);
  return inScale(magnitude, magnitudes, DATA_SCALES.quakeMagnitude) && inScale(depthKm, depths, DATA_SCALES.quakeDepthKm);
}

/**
 * The bands chosen, in words, neighbouring bands run together: "4 and over", "under 3; 5 to 7", "0 to 70 km".
 * Null when every band is chosen: nothing is left out.
 */
export function bandsChosenWords(chosen: readonly string[], scale: ReadonlyArray<readonly [number, string]>, unit = ''): string | null {
  const bounds = scale.map(([from]) => from);
  if (bounds.every((b) => chosen.includes(String(b)))) return null;
  const runs: Array<[number, number]> = [];
  bounds.forEach((b, i) => {
    if (!chosen.includes(String(b))) return;
    const last = runs[runs.length - 1];
    if (last && last[1] === i - 1) last[1] = i; else runs.push([i, i]);
  });
  if (!runs.length) return 'none';
  return runs.map(([a, b]) => {
    const from = bounds[a];
    const to = bounds[b + 1];
    if (to === undefined) return unit ? `${from}${unit} or deeper` : `${from} and over`;
    if (a === 0 && !unit) return `under ${to}`;
    return `${from} to ${to}${unit}`;
  }).join('; ');
}

/** How strongly the ground shook, as USGS colours it (DATA_SCALES.shakingMmi): the whole step it reaches. */
export function shakingColour(mmi: number): string {
  let colour: string = DATA_SCALES.shakingMmi[0][1];
  for (const [from, band] of DATA_SCALES.shakingMmi) if (mmi >= from) colour = band;
  return colour;
}

/**
 * How far a quake was likely felt, km, from its magnitude alone: 10^(0.33 M + 0.3), about 40 km at 4, 90 at 5, 190
 * at 6, 410 at 7 and 870 at 8. An indication for the eye, never a measured area: the key says so.
 */
export const indicativeRingKm = (m: number): number => 10 ** (0.33 * m + 0.3);

/** On play, how long a flag takes to rise up its line, and how long it glows, in seconds of play (EQ18). */
export const RISE_S = 0.35;
export const GLOW_S = 0.6;

export interface ReplayLook {
  /** Its line's height, as a share of a line's full height. */
  height: number;
  opacity: number;
  /** How much it glows, 1 as it happens, 0 after. */
  glow: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * A quake's look a time after it happened in a replay (EQ17, EQ18): its flag rises up its line with a glow, stands, then
 * sinks and fades, gone when the decay has passed; null before it happens and after. Rise and glow last a set time of
 * play, never more than a share of the decay.
 */
export function replayLook(ageMs: number, moment: QuakeReplayMoment): ReplayLook | null {
  if (!(ageMs >= 0) || !(ageMs < moment.decayMs)) return null;
  const a = ageMs / moment.decayMs;
  const riseMs = Math.min(RISE_S * moment.msPerSecond, 0.3 * moment.decayMs);
  const glowMs = Math.min(GLOW_S * moment.msPerSecond, 0.5 * moment.decayMs);
  const r = Math.min(1, ageMs / Math.max(riseMs, 1e-9));
  const rise = 1 - (1 - r) ** 3;
  return { height: rise * (1 - smooth(0.45, 1, a)), opacity: 1 - smooth(0.55, 1, a), glow: 1 - Math.min(1, ageMs / Math.max(glowMs, 1e-9)) };
}

export interface FlagStacks {
  /** Each flag's place in its stack, 0 the strongest; -1 for one not shown. */
  slot: number[];
  /** Each flag's stack, by its strongest flag; -1 for a flag not on screen. */
  host: number[];
  /** Each shown flag's step above its line's top, 0 the lowest. */
  height: number[];
  /** For each stack's strongest flag, how many of its stack are not shown (its chip says so); 0 for none. */
  more: number[];
}

// A flag's box in its cell, baked px, from the cell's centre (the line's top); on screen at QUAKE_FLAG_PX / CELL_PX.
const FLAG_LEFT = 3;
const FLAG_TOP = 44;
const FLAG_W = CELL_PX / 2 - 6;
const FLAG_H = 40;
const ON_SCREEN = QUAKE_FLAG_PX / CELL_PX;
/** Room kept between neighbouring stacks, CSS px. */
const COLUMN_GAP_PX = 3;

export interface Column { x0: number; x1: number; y0: number; y1: number }

/** How far right of its flag an atlas quake's badge stands, CSS px: a flag's width and a hair (EQ16). */
export const BADGE_OFFSET_PX = (FLAG_W + 2) * ON_SCREEN;

/**
 * A stack's column on screen, CSS px: `steps` flags (its chip one of them) over a line's top at `p`, wider by a badge
 * where one of its flags has one.
 */
export function columnOf(p: { x: number; y: number }, steps: number, badged = false): Column {
  return {
    x0: p.x + FLAG_LEFT * ON_SCREEN,
    x1: p.x + (FLAG_LEFT + FLAG_W) * ON_SCREEN + (badged ? BADGE_OFFSET_PX : 0),
    y0: p.y - FLAG_TOP * ON_SCREEN - (steps - 1) * FLAG_PITCH_PX,
    y1: p.y - (FLAG_TOP - FLAG_H) * ON_SCREEN,
  };
}

const meet = (a: Column, b: Column) =>
  a.x0 < b.x1 + COLUMN_GAP_PX && b.x0 < a.x1 + COLUMN_GAP_PX && a.y0 < b.y1 + COLUMN_GAP_PX && b.y0 < a.y1 + COLUMN_GAP_PX;
// A grid cell's key: screen px may run past the viewport either way.
const keyOf = (cx: number, cy: number) => (cx + 4096) * 8192 + (cy + 4096);

/**
 * Stacks the flags on screen, strongest first: each joins the nearest stack whose strongest flag is within
 * `radiusPx`, else starts one. Then each stack, the strongest first, stands as tall as it can without reaching into a
 * stronger one's column: up to its `limit` strongest flags, the strongest highest, the rest counted on a chip at the
 * lowest step. A stack with no room at all joins the stronger one it would cover, counted on that one's chip.
 * `obstacles`, the boxes of other marks on screen (the other hazards' pins), are kept clear the same way, but nothing
 * joins them: a stack with no room beside one stands its lowest anyway. A stack holding a flag with a badge
 * (`badged`, EQ16) stands wider by the badge.
 */
export function stackFlags(
  screen: ReadonlyArray<{ x: number; y: number } | null>,
  magnitudes: readonly number[],
  radiusPx = STACK_RADIUS_PX,
  limit = FLAG_STACK_LIMIT,
  obstacles: readonly Column[] = [],
  badged: readonly boolean[] = [],
): FlagStacks {
  const n = screen.length;
  const slot = new Array<number>(n).fill(-1);
  const host = new Array<number>(n).fill(-1);
  const height = new Array<number>(n).fill(0);
  const more = new Array<number>(n).fill(0);
  const strength = (i: number) => magnitudes[i] ?? 0;
  const stronger = (a: number, b: number) => strength(b) - strength(a) || a - b;
  const order = Array.from({ length: n }, (_, i) => i).sort(stronger);
  // Stacks by grid cell of their strongest flag: one looks only in its own cell and the eight round it.
  const grid = new Map<number, number[]>();
  const members = new Map<number, number[]>();
  for (const i of order) {
    const p = screen[i];
    if (!p) continue;
    const cx = Math.floor(p.x / radiusPx);
    const cy = Math.floor(p.y / radiusPx);
    let nearest = -1;
    let best = Infinity;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const k of grid.get(keyOf(cx + dx, cy + dy)) ?? []) {
          const q = screen[k] as { x: number; y: number };
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d <= radiusPx && d < best) { best = d; nearest = k; }
        }
      }
    }
    if (nearest === -1) {
      const key = keyOf(cx, cy);
      const cell = grid.get(key);
      if (cell) cell.push(i); else grid.set(key, [i]);
      members.set(i, [i]);
    } else {
      members.get(nearest)?.push(i);
    }
  }

  // The columns standing, by grid cell, so a stack looks only at those it could reach.
  const CELL = 32;
  const stood = new Map<number, { list: number[]; steps: number; column: Column }>();
  const columnsAt = new Map<number, number[]>();
  const cellsOf = (c: Column, each: (key: number) => void) => {
    for (let cx = Math.floor((c.x0 - COLUMN_GAP_PX) / CELL); cx <= Math.floor((c.x1 + COLUMN_GAP_PX) / CELL); cx += 1) {
      for (let cy = Math.floor((c.y0 - COLUMN_GAP_PX) / CELL); cy <= Math.floor((c.y1 + COLUMN_GAP_PX) / CELL); cy += 1) each(keyOf(cx, cy));
    }
  };
  // The obstacles, by grid cell too, as -2, -3, …: never a stack's id, never joined.
  const blocks = new Map<number, Column>();
  obstacles.forEach((box, k) => {
    const id = -2 - k;
    blocks.set(id, box);
    cellsOf(box, (key) => {
      const list = columnsAt.get(key);
      if (!list) columnsAt.set(key, [id]); else list.push(id);
    });
  });
  const columnOfId = (h: number) => (h < -1 ? blocks.get(h) : stood.get(h)?.column) as Column;
  // What a column would meet: the strongest stack, which a stack with no room joins; else an obstacle.
  const blockerOf = (c: Column, self: number): number => {
    let stack = -1;
    let obstacle = -1;
    cellsOf(c, (key) => {
      for (const h of columnsAt.get(key) ?? []) {
        if (h === self) continue;
        if (h < -1) { if (obstacle === -1 && meet(c, columnOfId(h))) obstacle = h; continue; }
        if (stack !== -1 && stronger(stack, h) <= 0) continue;
        if (meet(c, columnOfId(h))) stack = h;
      }
    });
    return stack !== -1 ? stack : obstacle;
  };
  const wide = (list: readonly number[]) => badged.length > 0 && list.some((i) => badged[i]);
  const stand = (h: number, steps: number) => {
    const column = columnOf(screen[h] as { x: number; y: number }, steps, wide(stood.get(h)?.list ?? members.get(h) ?? []));
    const had = stood.get(h);
    if (had) { had.steps = steps; had.column = column; } else stood.set(h, { list: members.get(h) as number[], steps, column });
    cellsOf(column, (key) => {
      const list = columnsAt.get(key);
      if (!list) columnsAt.set(key, [h]); else if (!list.includes(h)) list.push(h);
    });
  };
  const wanted = (count: number) => (count <= limit ? count : limit + 1);
  for (const [strongest, list] of members) {
    const p = screen[strongest] as { x: number; y: number };
    const least = list.length === 1 ? 1 : 2;
    let steps = wanted(list.length);
    let blocker = -1;
    for (; steps >= least; steps -= 1) {
      blocker = blockerOf(columnOf(p, steps, wide(list)), strongest);
      if (blocker === -1) break;
    }
    if (steps >= least) { stand(strongest, steps); continue; }
    // No room beside another mark: it stands its lowest anyway, as nothing can take its flags.
    if (blocker < -1) { stand(strongest, least); continue; }
    // No room: its flags join the stronger stack it would cover, which grows if it has room to.
    const into = stood.get(blocker) as { list: number[]; steps: number };
    into.list.push(...list);
    into.list.sort(stronger);
    const before = into.steps;
    let grown = Math.max(before, 2);
    for (let s = wanted(into.list.length); s > grown; s -= 1) {
      if (blockerOf(columnOf(screen[blocker] as { x: number; y: number }, s, wide(into.list)), blocker) === -1) { grown = s; break; }
    }
    if (grown !== before) stand(blocker, grown);
  }

  for (const [strongest, { list, steps }] of stood) {
    const shownCount = Math.min(limit, list.length <= steps ? list.length : steps - 1);
    const hidden = list.length - shownCount;
    more[strongest] = hidden;
    const base = hidden > 0 ? 1 : 0;
    list.forEach((i, s) => {
      host[i] = strongest;
      if (s >= shownCount) return;
      slot[i] = s;
      height[i] = base + (shownCount - 1 - s);
    });
  }
  return { slot, host, height, more };
}

let baked: Promise<THREE.Texture | null> | null = null;

/** The flags and chips, baked once on a canvas at twice their size on screen; null with no canvas to bake on. */
export function bakeFlagAtlas(): Promise<THREE.Texture | null> {
  baked ??= (async () => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = STRIDE_PX * COLUMNS;
    canvas.height = STRIDE_PX * FLAG_ATLAS_ROWS;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const font = `700 27px ${FONTS.data}`;
    try { await document.fonts?.load(font); } catch { /* the stack's next face */ }
    const draw = (index: number, text: string, fill: string, ink: string) => {
      const { cell, row } = atlasCellOf(index);
      // The cell's centre is the line's top: the flag stands above and to the right of it.
      const cx = cell * STRIDE_PX + GUTTER_PX + CELL_PX / 2;
      const cy = row * STRIDE_PX + GUTTER_PX + CELL_PX / 2;
      const x = cx + FLAG_LEFT;
      const y = cy - FLAG_TOP;
      const w = FLAG_W;
      const h = FLAG_H;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 7);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = GUNMETAL[950];
      ctx.stroke();
      ctx.font = font;
      ctx.fillStyle = ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + w / 2, y + h / 2 + 1, w - 6);
    };
    const drawBadge = (index: number, deaths: string, tsunami: boolean) => {
      const { cell, row } = atlasCellOf(index);
      const x = cell * STRIDE_PX + GUTTER_PX + CELL_PX / 2 + FLAG_LEFT;
      const y = row * STRIDE_PX + GUTTER_PX + CELL_PX / 2 - FLAG_TOP;
      ctx.beginPath();
      ctx.roundRect(x, y, FLAG_W, FLAG_H, 7);
      ctx.fillStyle = GUNMETAL[900];
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = GUNMETAL[950];
      ctx.stroke();
      ctx.font = font;
      ctx.textBaseline = 'middle';
      const wave = tsunami ? '≈' : '';
      const gap = deaths && wave ? 4 : 0;
      const width = ctx.measureText(deaths).width + gap + ctx.measureText(wave).width;
      const scale = Math.min(1, (FLAG_W - 8) / Math.max(1, width));
      ctx.save();
      ctx.translate(x + FLAG_W / 2, y + FLAG_H / 2 + 1);
      ctx.scale(scale, 1);
      ctx.textAlign = 'left';
      ctx.fillStyle = SEMANTIC.danger;
      ctx.fillText(deaths, -width / 2, 0);
      ctx.fillStyle = KIND_COLOURS.weather;
      ctx.fillText(wave, -width / 2 + ctx.measureText(deaths).width + gap, 0);
      ctx.restore();
    };
    // White, so each flag takes its quake's colour from its tint (intelReportSprites, GlyphSpriteMark.tint).
    for (let i = 0; i < MAGNITUDE_CELLS; i += 1) draw(i, (i / 10).toFixed(1), TINT_NEUTRAL, GUNMETAL[950]);
    for (let n = 1; n <= CHIP_CELLS; n += 1) draw(chipIndex(n), `+${n}`, GUNMETAL[700], GUNMETAL[100]);
    draw(UNKNOWN_MAGNITUDE_CELL, '?', TINT_NEUTRAL, GUNMETAL[950]);
    // The badges: deaths in the danger red, a wave in the weather blue, on the flags' dark.
    DEATHS_CLASS_LABELS.forEach((label, c) => {
      for (const tsunami of [false, true]) if (c > 0 || tsunami) drawBadge(BADGE_BASE + c * 2 + (tsunami ? 1 : 0) - 1, label, tsunami);
    });
    const texture = new THREE.CanvasTexture(canvas);
    // As every glyph atlas here (bakeSvgAtlas): no flip, so the canvas's top row is row 0; sRGB, decoded as it is
    // sampled and encoded again by the sprites' shader (EQ13); mipmapped, so the numbers never shimmer as they shrink.
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.userData.atlasInset = GUTTER_PX / STRIDE_PX;
    texture.needsUpdate = true;
    return texture;
  })();
  return baked;
}

const hex = (css: string) => parseInt(css.slice(1), 16);
const STALK: LineLook = { opacity: 0.9, linewidth: 1.8, dashed: false, dashSize: 1, gapSize: 1, dashScale: 1, renderOrder: 118 };
// Dashed: an indication, never a measured line. Dash lengths in globe units, a few dashes round even a small ring.
const RING: LineLook = { opacity: 0.8, linewidth: 1.6, dashed: true, dashSize: 0.5, gapSize: 0.35, dashScale: 1, renderOrder: 117 };
const SHAKE_HALO: LineLook = { opacity: 0.7, linewidth: 3.6, dashed: false, dashSize: 1, gapSize: 1, dashScale: 1, renderOrder: 115 };
const SHAKE_LINE: LineLook = { opacity: 0.95, linewidth: 1.6, dashed: false, dashSize: 1, gapSize: 1, dashScale: 1, renderOrder: 116 };
const RING_SEGMENTS = 72;
const EARTH_RADIUS_KM = 6371;

/** A circle of `km` round a place on the surface, as a closed line of positions. */
export function ringPositions(lat: number, lng: number, km: number, radiusUnits = GLOBE_RADIUS_UNITS * SURFACE_LINES): number[] {
  const centre = latLngToGlobeWorld(lat, lng, 1).normalize();
  // Two directions across the surface at the centre, and the circle's angle from it.
  const helper = Math.abs(centre.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(centre, helper).normalize();
  const v = new THREE.Vector3().crossVectors(centre, u).normalize();
  const angle = km / EARTH_RADIUS_KM;
  const out: number[] = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= RING_SEGMENTS; i += 1) {
    const t = (i / RING_SEGMENTS) * Math.PI * 2;
    p.copy(centre).multiplyScalar(Math.cos(angle))
      .addScaledVector(u, Math.sin(angle) * Math.cos(t))
      .addScaledVector(v, Math.sin(angle) * Math.sin(t))
      .multiplyScalar(radiusUnits);
    out.push(p.x, p.y, p.z);
  }
  return out;
}

export interface QuakeFlags {
  group: THREE.Group;
  flags: THREE.Points | null;
  /** The bands drawn, magnitude's or depth's as coloured, as their lower bounds, for the key. */
  bandsDrawn: number[];
  /** In depth's colours: whether a quake of no stated depth is drawn, grey. */
  depthUnknown: boolean;
  /** In magnitude's colours: whether a quake of no recorded magnitude is drawn, grey, its flag "?". */
  magnitudeUnknown: boolean;
  /** How many quakes got a ring from their magnitude. */
  rings: number;
  /** How many quakes' ShakeMaps are drawn, and the whole steps of intensity their lines stand at, lowest first. */
  shaken: number;
  mmiDrawn: number[];
  /** How many atlas quakes carry a badge (EQ16). */
  badges: number;
  /** Keeps the stacks clear of another layer's marks on screen (the other hazards' pins), from the next frame. */
  avoid: (marks: THREE.Points | null) => void;
}

/** The quakes' lines, flags, chips and rings, the flags stacked afresh each frame as they crowd on screen. */
export function buildQuakeFlags(
  items: readonly QuakeFlagItem[],
  atlas: THREE.Texture | null,
  options: {
    type: string; label: string; colourBy?: QuakeColourBy;
    /** Rings round the quakes of RING_FROM_MAGNITUDE or more: none in a replay, which has its bursts (EQ18). Default true. */
    rings?: boolean;
    /** Where a replay stands each frame (playClock's quakeReplayNow): each quake shown from its moment, fading (EQ7). */
    replay?: (() => QuakeReplayMoment | null) | null;
  },
): QuakeFlags {
  const group = drawAboveSurfaceLayers(new THREE.Group());
  group.userData = { type: options.type };
  const byDepth = options.colourBy === 'depth';
  const colourOf = (it: QuakeFlagItem) => (byDepth ? depthColour(it.depthKm) : hasMagnitude(it.magnitude) ? magnitudeColour(it.magnitude) : MAGNITUDE_UNKNOWN);
  const known = (it: QuakeFlagItem) => typeof it.depthKm === 'number' && Number.isFinite(it.depthKm);
  const bands = [...new Set(items.filter((it) => (byDepth ? known(it) : hasMagnitude(it.magnitude))).map((it) => (byDepth
    ? bandOf(it.depthKm as number, DATA_SCALES.quakeDepthKm)
    : bandOf(it.magnitude as number, DATA_SCALES.quakeMagnitude))))].sort((a, b) => a - b);
  const depthUnknown = byDepth && items.some((it) => !known(it));
  const magnitudeUnknown = !byDepth && items.some((it) => !hasMagnitude(it.magnitude));
  const avoiding: { marks: THREE.Points | null } = { marks: null };
  const avoid = (marks: THREE.Points | null) => { avoiding.marks = marks; };
  if (!items.length) return { group, flags: null, bandsDrawn: [], depthUnknown: false, magnitudeUnknown: false, rings: 0, shaken: 0, mmiDrawn: [], badges: 0, avoid };

  // Built at a pin's height, the most a line stands; each frame they stand as high as the camera's height asks.
  const heads = items.map((it) => latLngToGlobeWorld(it.lat, it.lng, GLOBE_RADIUS_UNITS * (1 + PIN_HEIGHT)));
  const stalks = buildLineBatch(items.map((it, i) => {
    const foot = latLngToGlobeWorld(it.lat, it.lng, GLOBE_RADIUS_UNITS * SURFACE_LINES);
    return {
      id: `${options.type}:${it.id}:stalk`,
      positions: [foot.x, foot.y, foot.z, heads[i].x, heads[i].y, heads[i].z],
      color: hex(colourOf(it)),
      tooltip: it.tooltip,
      opens: it.opens ?? null,
    };
  }), STALK);
  if (stalks) {
    stalks.userData = { ...stalks.userData, type: `${options.type}:stalks` };
    group.add(stalks);
  }

  const shaken = items.filter((it) => (it.shaking?.length ?? 0) > 0);
  // By whole step, as the key names and colours them: a ShakeMap's lone 2.5 line is drawn in II's colour, keyed as II.
  const mmiDrawn = [...new Set(shaken.flatMap((it) => (it.shaking ?? []).map((c) => Math.floor(c.mmi))))].sort((a, b) => a - b);
  if (shaken.length) {
    const radius = GLOBE_RADIUS_UNITS * SURFACE_LINES;
    const paths = shaken.flatMap((it) => (it.shaking ?? []).flatMap((contour) => contour.lines.map((line, k) => {
      const positions: number[] = [];
      for (const [lng, lat] of line) {
        const p = latLngToGlobeWorld(lat, lng, radius);
        positions.push(p.x, p.y, p.z);
      }
      return { id: `${options.type}:${it.id}:mmi${contour.mmi}:${k}`, positions, color: hex(shakingColour(contour.mmi)) };
    })));
    const contours = buildLineBatches([
      ...paths.map((path) => ({ ...path, id: `${path.id}:halo`, color: hex(GUNMETAL[950]), look: SHAKE_HALO })),
      ...paths.map((path) => ({ ...path, look: SHAKE_LINE })),
    ]);
    contours.userData = { type: `${options.type}:shaking` };
    group.add(contours);
  }

  const ringed = options.rings === false ? [] : items.filter((it) => hasMagnitude(it.magnitude) && it.magnitude >= RING_FROM_MAGNITUDE && !(it.shaking?.length));
  if (ringed.length) {
    const rings = buildLineBatches(ringed.map((it) => ({
      id: `${options.type}:${it.id}:ring`,
      positions: ringPositions(it.lat, it.lng, indicativeRingKm(it.magnitude as number)),
      color: hex(colourOf(it)),
      look: RING,
    })));
    rings.userData = { type: `${options.type}:rings` };
    group.add(rings);
  }

  // Each quake's flag, then a chip per quake, shown only on a stack's strongest when the stack holds more.
  const flagMarks: GlyphSpriteMark[] = items.map((it, i) => ({
    position: heads[i].clone(),
    sizePx: QUAKE_FLAG_PX,
    ...atlasCellOf(flagCellOf(it.magnitude)),
    tint: colourOf(it),
    tooltip: it.tooltip,
    ...(it.opens ? { opens: it.opens } : {}),
    timeMs: it.timeMs ?? null,
  }));
  const chipMarks: GlyphSpriteMark[] = items.map((it, i) => ({
    position: heads[i].clone(),
    sizePx: QUAKE_FLAG_PX,
    ...atlasCellOf(chipIndex(1)),
    tooltip: 'More quakes crowd here: zoom in to part them.',
    timeMs: it.timeMs ?? null,
  }));
  const layout = {
    cellCount: COLUMNS,
    rowCount: FLAG_ATLAS_ROWS,
    type: `${options.type}:flags`,
    // The shader's five plain fills (intelReportSprites shapeFills[5]), for a page with no canvas to bake on.
    shapes: { fills: Array.from({ length: 5 }, () => new THREE.Color(GUNMETAL[300])), outline: new THREE.Color(GUNMETAL[950]) },
  };
  const userData = { layer: options.label, layers: items.map(() => options.label), ids: items.map((it) => it.id) };
  const flags = buildGlyphSprites(flagMarks, atlas, layout, { userData, animate: false });
  // The chips and badges stand beside the flags: never counted or listed as marks of their own (drawnMarks.ts).
  const chips = buildGlyphSprites(chipMarks, atlas, { ...layout, type: `${options.type}:chips` }, { userData: { ...userData, ids: items.map((it) => `${it.id}:more`), repeats: true }, animate: false });
  // An atlas quake's badge (EQ16): beside its flag, wherever the flag stands in its stack.
  const badgeCells = items.map((it) => badgeIndex(it.atlas ?? null));
  const badged = badgeCells.map((c) => c >= 0);
  const badgeCount = badged.filter(Boolean).length;
  const badgeMarks: GlyphSpriteMark[] = items.map((it, i) => ({
    position: heads[i].clone(),
    sizePx: QUAKE_FLAG_PX,
    ...atlasCellOf(Math.max(BADGE_BASE, badgeCells[i])),
    tooltip: it.tooltip,
    ...(it.opens ? { opens: it.opens } : {}),
    timeMs: it.timeMs ?? null,
  }));
  const badges = badgeCount
    ? buildGlyphSprites(badgeMarks, atlas, { ...layout, type: `${options.type}:badges` }, { userData: { ...userData, ids: items.map((it) => `${it.id}:badge`), repeats: true }, animate: false })
    : null;
  if (!flags) return { group, flags: null, bandsDrawn: bands, depthUnknown, magnitudeUnknown, rings: ringed.length, shaken: shaken.length, mmiDrawn, badges: 0, avoid };
  // Over the other hazards' pins, where a stack has no room beside one: the quakes are this view's subject.
  flags.renderOrder += 2;
  group.add(flags);
  if (chips) { chips.renderOrder += 2; group.add(chips); }
  if (badges) { badges.renderOrder += 2; group.add(badges); }
  const replay = options.replay
    ? { now: options.replay, times: items.map((it) => (typeof it.timeMs === 'number' ? it.timeMs : NaN)) }
    : null;
  // A quake of no recorded magnitude stacks under every one that has one.
  stackEachFrame(flags, chips, stalks, heads, items.map((it) => (hasMagnitude(it.magnitude) ? it.magnitude : -1)), avoiding, badges, badged, replay);
  return { group, flags, bandsDrawn: bands, depthUnknown, magnitudeUnknown, rings: ringed.length, shaken: shaken.length, mmiDrawn, badges: badgeCount, avoid };
}

/** Each frame, the flags stacked as they stand on screen (stackFlags), and each stack's chip shown with its count. */
function stackEachFrame(
  flags: THREE.Points,
  chips: THREE.Points | null,
  stalks: LineSegments2 | null,
  heads: THREE.Vector3[],
  magnitudes: readonly number[],
  avoiding: { marks: THREE.Points | null },
  badges: THREE.Points | null = null,
  badged: readonly boolean[] = [],
  replay: { now: () => QuakeReplayMoment | null; times: readonly number[] } | null = null,
): void {
  const count = heads.length;
  const ups = heads.map((head) => head.clone().normalize());
  // The lines' tops: the second point of each segment (LineSegmentsGeometry's instanceEnd).
  const tops = stalks?.geometry.getAttribute('instanceEnd') as THREE.InterleavedBufferAttribute | undefined;
  const centre = new THREE.Vector3();
  const eyeAt = new THREE.Vector3();
  let standing = PIN_HEIGHT;
  // In a replay, each quake's look this frame (replayLook), null for one play has not reached or has left behind.
  const looks: Array<ReplayLook | null> = new Array(count).fill(null);
  let replaying = false;
  let lookedAt = -1;
  const footAt = GLOBE_RADIUS_UNITS * SURFACE_LINES;
  // The lines' height for this camera; the lines and the heads moved when it changes by more than a hair. In a
  // replay, every frame, each quake's own (EQ18): rising as it happens, sinking as it fades, at its foot while unseen.
  const raise = (object: THREE.Object3D, camera: THREE.Camera, frame: number) => {
    centre.setFromMatrixPosition(object.matrixWorld);
    const radius = GLOBE_RADIUS_UNITS * object.matrixWorld.getMaxScaleOnAxis();
    const height = stalkHeightFor(eyeAt.setFromMatrixPosition(camera.matrixWorld).distanceTo(centre) / radius - 1);
    if (replay) {
      if (frame === lookedAt) return;
      lookedAt = frame;
      const moment = replay.now();
      replaying = moment !== null;
      for (let i = 0; i < count; i += 1) {
        const t = replay.times[i];
        looks[i] = moment && Number.isFinite(t) ? replayLook(moment.atMs - t, moment) : null;
        const shown = moment === null || !Number.isFinite(t) ? 1 : looks[i]?.height ?? -1;
        heads[i].copy(ups[i]).multiplyScalar(shown < 0 ? footAt : GLOBE_RADIUS_UNITS * (1 + height * shown));
        tops?.setXYZ(i, heads[i].x, heads[i].y, heads[i].z);
      }
      standing = height;
      if (tops) tops.data.needsUpdate = true;
      return;
    }
    if (Math.abs(height - standing) <= standing * 0.01) return;
    standing = height;
    for (let i = 0; i < count; i += 1) {
      heads[i].copy(ups[i]).multiplyScalar(GLOBE_RADIUS_UNITS * (1 + height));
      tops?.setXYZ(i, heads[i].x, heads[i].y, heads[i].z);
    }
    if (tops) tops.data.needsUpdate = true;
  };
  if (stalks) {
    // LineSegments2's own step sets its lines' resolution; three's types give it the renderer alone.
    const line: THREE.Object3D = stalks;
    const own = line.onBeforeRender;
    line.onBeforeRender = function raiseStep(renderer, scene, camera, ...rest) {
      own.call(this, renderer, scene, camera, ...rest);
      raise(this, camera, renderer.info.render.frame);
    };
  }
  // A replay's glow and fade, on the flags' own tint and opacity (EQ18).
  const flagTint = flags.geometry.getAttribute('markTint') as THREE.BufferAttribute;
  const flagOpacity = flags.geometry.getAttribute('markOpacity') as THREE.BufferAttribute;
  const badgeOpacity = badges?.geometry.getAttribute('markOpacity') as THREE.BufferAttribute | undefined;
  const baseTints = replay ? Float32Array.from(flagTint.array as Float32Array) : null;
  const flagPos = flags.geometry.getAttribute('position') as THREE.BufferAttribute;
  const flagShown = flags.geometry.getAttribute('markShown') as THREE.BufferAttribute;
  const chipPos = chips?.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  const chipCell = chips?.geometry.getAttribute('atlasCell') as THREE.BufferAttribute | undefined;
  const chipRow = chips?.geometry.getAttribute('atlasRow') as THREE.BufferAttribute | undefined;
  // Hidden by markShown, which a pick honours too (pickRadius.visibleHits): a chip not drawn never answers a hover.
  const chipShown = chips?.geometry.getAttribute('markShown') as THREE.BufferAttribute | undefined;
  if (chipShown) { for (let i = 0; i < chipShown.count; i += 1) chipShown.setX(i, 0); chipShown.needsUpdate = true; }
  const viewport = new THREE.Vector2();
  const eye = new THREE.Vector3();
  const up = new THREE.Vector3();
  const world = new THREE.Vector3();
  const toEye = new THREE.Vector3();
  const local = new THREE.Vector3();
  const inverse = new THREE.Matrix4();
  const right = new THREE.Vector3();
  const beside = new THREE.Vector3();
  const badgePos = badges?.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  const badgeShown = badges?.geometry.getAttribute('markShown') as THREE.BufferAttribute | undefined;
  if (badgeShown) { for (let i = 0; i < badgeShown.count; i += 1) badgeShown.setX(i, 0); badgeShown.needsUpdate = true; }
  const screen: Array<{ x: number; y: number } | null> = new Array(count).fill(null);
  const base = flags.onBeforeRender;
  flags.onBeforeRender = function stackStep(renderer, scene, camera, ...rest) {
    base.call(this, renderer, scene, camera, ...rest);
    raise(this, camera, renderer.info.render.frame);
    renderer.getSize(viewport);
    eye.setFromMatrixPosition(camera.matrixWorld);
    // The screen's up, in the world: a stack climbs straight up the screen wherever it stands on the globe.
    up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 50;
    const perPxAt = (distance: number) => (2 * distance * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / Math.max(1, viewport.y);
    for (let i = 0; i < count; i += 1) {
      screen[i] = null;
      world.copy(heads[i]).applyMatrix4(flags.matrixWorld);
      // A quake the replay has not reached, or has left behind, takes no place in a stack.
      if (replaying && Number.isFinite(replay?.times[i] ?? NaN) && !looks[i]) continue;
      if (world.dot(toEye.copy(eye).sub(world)) <= 0) continue;
      local.copy(world).project(camera);
      if (local.z < -1 || local.z > 1) continue;
      screen[i] = { x: ((local.x + 1) / 2) * viewport.x, y: ((1 - local.y) / 2) * viewport.y };
    }
    // The other marks' boxes: the middle four-fifths of each one's square, as its glyph fills it.
    const boxes: Column[] = [];
    const other = avoiding.marks;
    if (other?.visible && other.parent) {
      const at = other.geometry.getAttribute('position');
      const size = other.geometry.getAttribute('pointSize');
      const shownAt = other.geometry.getAttribute('markShown');
      for (let k = 0; k < at.count; k += 1) {
        if (shownAt && shownAt.getX(k) < 0.5) continue;
        world.set(at.getX(k), at.getY(k), at.getZ(k)).applyMatrix4(other.matrixWorld);
        if (world.dot(toEye.copy(eye).sub(world)) <= 0) continue;
        local.copy(world).project(camera);
        if (local.z < -1 || local.z > 1) continue;
        const x = ((local.x + 1) / 2) * viewport.x;
        const y = ((1 - local.y) / 2) * viewport.y;
        const half = (size ? size.getX(k) : 28) * 0.4;
        boxes.push({ x0: x - half, x1: x + half, y0: y - half, y1: y + half });
      }
    }
    const { slot, host, height, more } = stackFlags(screen, magnitudes, STACK_RADIUS_PX, FLAG_STACK_LIMIT, boxes, badged);
    inverse.copy(flags.matrixWorld).invert();
    // The screen's right, in the world: a badge stands beside its flag wherever the flag stands.
    right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    for (let i = 0; i < count; i += 1) {
      // A stack rises from its strongest flag's line, so its flags stand in one column.
      world.copy(heads[host[i] >= 0 ? host[i] : i]).applyMatrix4(flags.matrixWorld);
      const step = perPxAt(world.distanceTo(eye)) * FLAG_PITCH_PX;
      local.copy(world).addScaledVector(up, height[i] * step);
      if (badgePos && badgeShown) {
        beside.copy(local).addScaledVector(right, (step / FLAG_PITCH_PX) * BADGE_OFFSET_PX).applyMatrix4(inverse);
        badgePos.setXYZ(i, beside.x, beside.y, beside.z);
        badgeShown.setX(i, slot[i] >= 0 && badged[i] ? 1 : 0);
      }
      local.applyMatrix4(inverse);
      flagPos.setXYZ(i, local.x, local.y, local.z);
      flagShown.setX(i, slot[i] >= 0 ? 1 : 0);
      if (baseTints) {
        // Glowing toward white as it happens, then its own colour; fading as it decays.
        const look = replaying ? looks[i] : null;
        const glow = look ? 0.85 * look.glow : 0;
        const opacity = look ? look.opacity : 1;
        flagTint.setXYZ(i, ...[0, 1, 2].map((k) => baseTints[i * 3 + k] + (1 - baseTints[i * 3 + k]) * glow) as [number, number, number]);
        flagOpacity.setX(i, opacity);
        badgeOpacity?.setX(i, opacity);
      }
      if (chipPos && chipShown && chipCell && chipRow) {
        // The chip under a stack's flags, at its line's top, saying how many are not shown.
        chipPos.setXYZ(i, ...(heads[i].toArray() as [number, number, number]));
        chipShown.setX(i, more[i] > 0 ? 1 : 0);
        if (more[i] > 0) {
          const { cell, row } = atlasCellOf(chipIndex(more[i]));
          chipCell.setX(i, cell);
          chipRow.setX(i, row);
        }
      }
    }
    flagPos.needsUpdate = true;
    flagShown.needsUpdate = true;
    if (baseTints) {
      flagTint.needsUpdate = true;
      flagOpacity.needsUpdate = true;
      if (badgeOpacity) badgeOpacity.needsUpdate = true;
    }
    if (badgePos && badgeShown) { badgePos.needsUpdate = true; badgeShown.needsUpdate = true; }
    if (chipPos && chipShown && chipCell && chipRow) {
      chipPos.needsUpdate = true;
      chipShown.needsUpdate = true;
      chipCell.needsUpdate = true;
      chipRow.needsUpdate = true;
    }
  };
}
