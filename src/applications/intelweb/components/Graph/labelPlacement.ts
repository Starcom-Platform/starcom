/**
 * Which labels IntelWeb draws (decision D-IW, IW10).
 *
 * - **Which may be drawn:** hubs (a country, a tag, a publisher) and collapsed clusters always; a
 *   note, a stub, a mission package or an entity on hover, when selected, or zoomed in close.
 * - **Which are drawn:** in order, what the reader pointed at, then clusters, then hubs by how many
 *   nodes they join, then the rest; each kept only where it overlaps no label already kept and no
 *   cluster's name. Left out, never stacked: labels collided wherever notes gathered.
 *
 * Boxes are in the graph's own units, so whether two overlap does not change with the zoom. Pure,
 * so the engine and its tests agree.
 */
import type { IntelNode } from './IntelGraph';
import type { IntelNodeType } from './nodeTypes';

/** Zoomed in this close or closer, every node's label may be drawn. */
export const ZOOM_FOR_NOTES = 1.5;

const ALWAYS: ReadonlySet<IntelNodeType> = new Set(['country', 'tag', 'publisher', 'cluster']);
const HUBS: ReadonlySet<IntelNodeType> = new Set(['country', 'tag', 'publisher']);

/** A label's box: its middle, its size, and how much it matters. */
export interface LabelBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
}

export function labelCandidates(
  nodes: readonly IntelNode[],
  at: { k: number; hovered: string | null; selected: ReadonlySet<string>; degree?: ReadonlyMap<string, number> },
): Array<{ id: string; priority: number }> {
  const out: Array<{ id: string; priority: number }> = [];
  for (const node of nodes) {
    const pointed = node.id === at.hovered ? 4e6 : at.selected.has(node.id) ? 3e6 : 0;
    if (!pointed && !ALWAYS.has(node.type) && at.k < ZOOM_FOR_NOTES) continue;
    const degree = at.degree?.get(node.id) ?? 0;
    const kind = node.type === 'cluster' ? 2e6 + Number(node.metadata?.notes ?? 0) : HUBS.has(node.type) ? 1e6 : 0;
    out.push({ id: node.id, priority: pointed + kind + degree });
  }
  return out;
}

/** The box of a label drawn below its node, in 10 px type: about six units a character. */
export function labelBox(at: { id: string; x: number; y: number }, text: string, radius: number, priority: number): LabelBox {
  // A size the scale could not read is no size: a NaN box overlaps nothing, so it would always be kept.
  const r = Number.isFinite(radius) ? radius : 0;
  return { id: at.id, x: at.x, y: at.y + r + 8, width: Math.max(12, text.length * 6), height: 12, priority };
}

const CELL = 48;

/** The labels kept, by priority, each overlapping none kept before it and none of `blocked`. */
export function placeLabels(boxes: readonly LabelBox[], blocked: readonly LabelBox[]): Set<string> {
  const grid = new Map<string, LabelBox[]>();
  const cells = (b: LabelBox): string[] => {
    const keys: string[] = [];
    for (let cx = Math.floor((b.x - b.width / 2) / CELL); cx <= Math.floor((b.x + b.width / 2) / CELL); cx++) {
      for (let cy = Math.floor((b.y - b.height / 2) / CELL); cy <= Math.floor((b.y + b.height / 2) / CELL); cy++) keys.push(`${cx},${cy}`);
    }
    return keys;
  };
  const overlaps = (a: LabelBox, b: LabelBox) =>
    Math.abs(a.x - b.x) * 2 < a.width + b.width && Math.abs(a.y - b.y) * 2 < a.height + b.height;
  const hold = (b: LabelBox) => { for (const key of cells(b)) grid.set(key, [...(grid.get(key) ?? []), b]); };
  for (const b of blocked) hold(b);
  const kept = new Set<string>();
  const ordered = [...boxes].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  for (const b of ordered) {
    if (cells(b).some((key) => (grid.get(key) ?? []).some((other) => overlaps(b, other)))) continue;
    kept.add(b.id);
    hold(b);
  }
  return kept;
}
