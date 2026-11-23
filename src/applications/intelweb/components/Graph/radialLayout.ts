/**
 * IntelWeb's Radial (decision D-IW, IW2, IW14, step 7): the node chosen at the middle; what it links
 * to in a ring one step out, and what those link to in a ring two steps out; each group of the way the
 * notes are grouped a spoke, a sector of the circle as wide as its share of the rings' nodes, the
 * largest first, so a group stands on the same bearing in both rings. Nothing further than two steps
 * is drawn, and how much is left out is counted.
 *
 * Pure, centred on (0, 0), for the engine to draw toward.
 */

/** The rings' radii, one step out and two. */
export const RADIAL_RINGS = [170, 340] as const;

export interface RadialLayout {
  places: Map<string, { x: number; y: number }>;
  /** Each group's spoke, as angles in radians from `from` to `to`, the largest group first. */
  sectors: Array<{ key: string; from: number; to: number }>;
  /** Nodes linked further than two steps out, not drawn. */
  beyond: number;
}

type End = string | { id: string };
const idOf = (end: End) => (typeof end === 'string' ? end : end.id);

/**
 * `trailing`: groups placed after the rest, in that order, whatever their size: by default the notes in
 * no group ('').
 */
export function radialLayout(
  centre: string, edges: ReadonlyArray<{ source: End; target: End }>, groupOf: (id: string) => string, trailing: readonly string[] = [''],
): RadialLayout {
  const near = new Map<string, Set<string>>();
  for (const e of edges) {
    const [a, b] = [idOf(e.source), idOf(e.target)];
    if (a === b) continue;
    if (!near.has(a)) near.set(a, new Set());
    if (!near.has(b)) near.set(b, new Set());
    near.get(a)!.add(b);
    near.get(b)!.add(a);
  }
  // Steps out from the middle, breadth first.
  const step = new Map<string, number>([[centre, 0]]);
  let frontier = [centre];
  let beyond = 0;
  for (let d = 1; frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) for (const n of near.get(id) ?? []) {
      if (step.has(n)) continue;
      step.set(n, d);
      next.push(n);
    }
    if (d > 2) beyond += next.length;
    frontier = next;
  }

  const ringed = [...step].filter(([, d]) => d === 1 || d === 2).map(([id, d]) => ({ id, d, group: groupOf(id) }));
  const counts = new Map<string, number>();
  for (const n of ringed) counts.set(n.group, (counts.get(n.group) ?? 0) + 1);
  const tail = (k: string) => trailing.indexOf(k);
  const keys = [...counts.keys()].sort((a, b) => (tail(a) >= 0 || tail(b) >= 0
    ? (tail(a) < 0 ? -1 : tail(b) < 0 ? 1 : tail(a) - tail(b))
    : counts.get(b)! - counts.get(a)! || a.localeCompare(b)));

  const places = new Map<string, { x: number; y: number }>([[centre, { x: 0, y: 0 }]]);
  const sectors: RadialLayout['sectors'] = [];
  const total = ringed.length;
  let angle = -Math.PI / 2;
  for (const key of keys) {
    const width = (counts.get(key)! / total) * 2 * Math.PI;
    sectors.push({ key, from: angle, to: angle + width });
    for (const ring of [1, 2]) {
      const members = ringed.filter((n) => n.group === key && n.d === ring).sort((a, b) => a.id.localeCompare(b.id));
      members.forEach((n, i) => {
        const a = angle + (width * (i + 0.5)) / members.length;
        places.set(n.id, { x: RADIAL_RINGS[ring - 1] * Math.cos(a), y: RADIAL_RINGS[ring - 1] * Math.sin(a) });
      });
    }
    angle += width;
  }
  return { places, sectors, beyond };
}
