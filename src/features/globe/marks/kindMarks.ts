/**
 * A point layer's items as marks, in the style its rail chose (critique-2026-11-01, OR2, OR13, OR14; plan A4):
 *   - Icon: the item's kind's icon on its frame, ringed in its kind's colour (kindAtlas.ts);
 *   - Dot: a dot of its kind's colour;
 *   - Pin: a stalk from the ground to its icon, raised above it, as Earthquake3D draws an event;
 *   - Spike: a bar standing from the ground, its height the log of its magnitude, so a magnitude-7 quake and ten deaths
 *     both read; the key's scale gives the values at three heights.
 * Severity is brightness, never hue. Icons, dots and pins' heads fold where they crowd (glyphDeclutter.ts): the most
 * severe is drawn with a count of what falls under it, and a click lists them all. Spikes are lines and answer a hover.
 */
import * as THREE from 'three';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';
import { buildGlyphSprites, type GlyphSpriteMark } from '../../../components/Globe/intelReportSprites';
import { declutterSprites } from '../../../components/Globe/glyphDeclutter';
import { buildLineBatches, type LineLook } from '../../../geopolitical/geometry/lineBatches';
import { drawAboveSurfaceLayers } from '../../../components/Globe/screenPoints';
import { REPORT_SPRITES, SURFACE_LINES } from '../../../components/Globe/globeAltitudes';
import { GUNMETAL } from '../../../styles/tokens';
import type { GlobeNoteSet } from '../noteDetail/globeNoteStore';
import { KIND_ATLAS_ROWS, KIND_ATLAS_ROW_COUNT, kindColour, type KindAtlas } from './kindAtlas';

export const MARK_STYLES = ['icon', 'dot', 'pin', 'spike'] as const;
export type MarkStyle = (typeof MARK_STYLES)[number];

const GLOBE_RADIUS_UNITS = 100;
/** A mark's on-screen diameter, as an Intel Report's (useGlobeIntelSprites REPORT_SPRITE_PX). */
export const KIND_MARK_PX = 34;
/** A dot's, a little over half an icon's. */
const DOT_PX = 18;
/** A pin's height above the ground, as a share of the globe's radius: about 450 km. */
export const PIN_HEIGHT = 0.07;
/** A spike's least and greatest height, as shares of the radius. */
export const SPIKE_MIN = 0.012;
export const SPIKE_MAX = 0.3;

export interface KindMarkItem {
  id: string;
  lat: number;
  lng: number;
  /** Its kind in the lexicon (kindLexicon.ts): its icon, its frame and its colour. */
  kind: string;
  /** What a spike's height stands for, and a pile's order: a count, a magnitude, a toll. */
  magnitude?: number;
  /** How severe, 0 to 1: its brightness, and which is drawn on top where marks crowd. Default 1. */
  severity?: number;
  tooltip?: string;
  opens?: GlobeNoteSet | null;
  /** When it appears in a replay, ms since the epoch. */
  timeMs?: number | null;
}

export interface KindMarksOptions {
  style: MarkStyle;
  atlas: KindAtlas | null;
  /** How the layer's object is found by a probe or a test. */
  type: string;
  /** The layer's name, for its hover. */
  label: string;
  /** The count badges' atlas (bakeBadgeAtlas): crowded marks fold under a count. Without it they still fold. */
  badges?: THREE.Texture | null;
  /** Fold crowded marks. Default true. */
  cluster?: boolean;
  /** The magnitude a spike reaches its greatest height at; default the largest given. */
  maxMagnitude?: number;
}

export interface KindMarks {
  group: THREE.Group;
  /** The icons, dots or pins' heads; null for spikes, or nothing to draw. */
  sprites: THREE.Points | null;
  /** The kinds drawn, most marks first, for the key. */
  kindsDrawn: string[];
  /** For spikes: the values at three heights, for the key's scale. */
  scale: Array<{ value: number; height: number }> | null;
}

/** A spike's height for a magnitude, on a log scale up to `max`: SPIKE_MIN for nothing, SPIKE_MAX at `max` and beyond. */
export function spikeHeight(magnitude: number, max: number): number {
  if (!(magnitude > 0)) return SPIKE_MIN;
  const t = Math.log10(1 + magnitude) / Math.log10(1 + Math.max(max, 1));
  return SPIKE_MIN + (SPIKE_MAX - SPIKE_MIN) * Math.min(1, t);
}

/** Three round values under `max`, a decade apart, with their heights: what the key's scale says. */
export function spikeScale(max: number): Array<{ value: number; height: number }> {
  if (!(max > 0)) return [];
  const top = 10 ** Math.floor(Math.log10(max));
  return [top, top / 10, top / 100].filter((v) => v >= 1).map((value) => ({ value, height: spikeHeight(value, max) }));
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const hex = (css: string) => parseInt(css.slice(1), 16);
const STALK: LineLook = { opacity: 0.95, linewidth: 2.4, dashed: false, dashSize: 1, gapSize: 1, dashScale: 1, renderOrder: 118 };
const SPIKE: LineLook = { opacity: 0.92, linewidth: 4, dashed: false, dashSize: 1, gapSize: 1, dashScale: 1, renderOrder: 118 };

/** The sprite shader's five plain-shape fills: the atlas's first five kinds' colours, padded with the first. */
export function plainFills(atlas: KindAtlas | null): THREE.Color[] {
  const colours = (atlas?.kinds ?? []).slice(0, 5).map((k) => new THREE.Color(kindColour(k)));
  const pad = colours[0] ?? new THREE.Color(GUNMETAL[300]);
  while (colours.length < 5) colours.push(pad.clone());
  return colours;
}

/** What a crowd's drawn mark says and opens: its own, with every mark under it. */
function pileSay(items: readonly KindMarkItem[], top: number, under: readonly number[]): { tooltip?: string; opens?: GlobeNoteSet | null } {
  const all = [top, ...under].map((i) => items[i]);
  const notes = all.flatMap((it) => it.opens?.notes ?? []);
  const more = under.length;
  return {
    tooltip: [items[top].tooltip ?? '', `With ${more} more here: a click lists all ${all.length}.`].filter(Boolean).join('\n'),
    opens: notes.length ? { heading: items[top].opens?.heading ?? `${all.length} here`, notes } : items[top].opens ?? null,
  };
}

export function buildKindMarks(items: readonly KindMarkItem[], options: KindMarksOptions): KindMarks {
  const { style, atlas, type, label, badges = null, cluster = true } = options;
  const group = drawAboveSurfaceLayers(new THREE.Group());
  group.userData = { type, style };
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
  const kindsDrawn = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
  if (!items.length) return { group, sprites: null, kindsDrawn, scale: null };

  if (style === 'spike') {
    const max = options.maxMagnitude ?? Math.max(0, ...items.map((it) => it.magnitude ?? 0));
    const lines = buildLineBatches(items.map((it) => {
      const foot = latLngToGlobeWorld(it.lat, it.lng, GLOBE_RADIUS_UNITS * SURFACE_LINES);
      const top = latLngToGlobeWorld(it.lat, it.lng, GLOBE_RADIUS_UNITS * (1 + spikeHeight(it.magnitude ?? 0, max)));
      return {
        id: `${type}:${it.id}`,
        positions: [foot.x, foot.y, foot.z, top.x, top.y, top.z],
        color: hex(kindColour(it.kind)),
        look: { ...SPIKE, opacity: SPIKE.opacity * (0.55 + 0.45 * clamp01(it.severity ?? 1)) },
        tooltip: it.tooltip,
        opens: it.opens ?? null,
      };
    }));
    lines.userData = { type: `${type}:spikes` };
    group.add(lines);
    return { group, sprites: null, kindsDrawn, scale: spikeScale(max) };
  }

  const raised = style === 'pin' ? 1 + PIN_HEIGHT : REPORT_SPRITES;
  const marks: GlyphSpriteMark[] = items.map((it) => ({
    position: latLngToGlobeWorld(it.lat, it.lng, GLOBE_RADIUS_UNITS * raised),
    sizePx: style === 'dot' ? DOT_PX : KIND_MARK_PX,
    cell: atlas?.cellOf(it.kind) ?? 0,
    row: style === 'dot' ? KIND_ATLAS_ROWS.dot : KIND_ATLAS_ROWS.icon,
    opacity: 0.55 + 0.45 * clamp01(it.severity ?? 1),
    tooltip: it.tooltip,
    ...(it.opens ? { opens: it.opens } : {}),
    timeMs: it.timeMs ?? null,
  }));
  const sprites = buildGlyphSprites(marks, atlas?.texture ?? null, {
    cellCount: atlas?.kinds.length ?? 1,
    rowCount: KIND_ATLAS_ROW_COUNT,
    type,
    // Without a canvas to bake on, each kind's colour as a plain shape, so the layer still draws: the sprite shader
    // holds exactly five fills (intelReportSprites shapeFills[5]), the first five cells' kinds, the rest padded.
    shapes: { fills: plainFills(atlas), outline: new THREE.Color(GUNMETAL[950]) },
  }, { userData: { layer: label, layers: items.map(() => label), ids: items.map((it) => it.id) } });
  if (sprites) {
    if (cluster) {
      // The most severe first, then the largest: it is the one drawn where marks crowd.
      const order = items.map((_, i) => i).sort((a, b) => (items[b].severity ?? 1) - (items[a].severity ?? 1) || (items[b].magnitude ?? 0) - (items[a].magnitude ?? 0) || a - b);
      const priority = new Array<number>(items.length);
      order.forEach((i, rank) => { priority[i] = rank; });
      declutterSprites(sprites, { priority, counts: items.map(() => 1), badges, pileOf: (top, under) => pileSay(items, top, under) });
    }
    group.add(sprites);
  }
  if (style === 'pin') {
    const stalks = buildLineBatches(items.map((it) => {
      const foot = latLngToGlobeWorld(it.lat, it.lng, GLOBE_RADIUS_UNITS * SURFACE_LINES);
      const head = latLngToGlobeWorld(it.lat, it.lng, GLOBE_RADIUS_UNITS * raised);
      return { id: `${type}:${it.id}:stalk`, positions: [foot.x, foot.y, foot.z, head.x, head.y, head.z], color: hex(kindColour(it.kind)), look: STALK };
    }));
    stalks.userData = { type: `${type}:stalks` };
    group.add(stalks);
  }
  return { group, sprites, kindsDrawn, scale: null };
}

/** Lets go of what buildKindMarks made: geometries and materials, not the shared atlases. */
export function disposeKindMarks(group: THREE.Object3D): void {
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    for (const m of material ? (Array.isArray(material) ? material : [material]) : []) m.dispose();
  });
  group.clear();
}
