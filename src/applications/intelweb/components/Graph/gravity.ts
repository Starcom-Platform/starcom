import * as d3 from 'd3';
import type { IntelNode } from './IntelGraph';
import type { GraphClusters } from './GraphEngine2D';

/**
 * The Gravity slider's forces: a pull toward the centre, as strong as the
 * slider says. Nothing read the slider before (critique audit of 2026-10-01,
 * section 7), so a graph of unconnected reports drifted into an even disc.
 */
export function gravityForces(gravity: number, width: number, height: number) {
  return {
    x: d3.forceX<IntelNode>(width / 2).strength(gravity),
    y: d3.forceY<IntelNode>(height / 2).strength(gravity),
  };
}

/** The room a cluster takes, per square root of its nodes, in px: a node's width with space around it. */
const CLUSTER_ROOM = 12;

/**
 * Where each cluster gathers (decision D-IW, IW8): the largest at the middle, the rest on a sunflower
 * spiral around it, spread across the pane, or further where the largest needs the room; the view
 * zooms out to fit once the layout settles. Packed into the pane alone, 27 countries' clusters ran
 * into one ball on the build.
 */
export function clusterCentres(sizes: ReadonlyMap<string, number>, width: number, height: number): Map<string, { x: number; y: number }> {
  const keys = [...sizes.keys()].sort((a, b) => sizes.get(b)! - sizes.get(a)! || a.localeCompare(b));
  const largest = keys.length ? sizes.get(keys[0])! : 0;
  const step = keys.length > 1
    ? Math.max((0.4 * Math.min(width, height)) / Math.sqrt(keys.length - 1), 2 * CLUSTER_ROOM * Math.sqrt(largest))
    : 0;
  const golden = Math.PI * (3 - Math.sqrt(5));
  return new Map(keys.map((key, i) => [key, {
    x: width / 2 + step * Math.sqrt(i) * Math.cos(i * golden),
    y: height / 2 + step * Math.sqrt(i) * Math.sin(i * golden),
  }]));
}

/**
 * A pull on each grouped node toward its cluster's place, firmer than the Gravity slider's so the
 * clusters hold apart. A node in no cluster (a hub of another kind, a stub) starts among the places
 * of the clusters its linked nodes are in, and its links keep it there; pulled to the middle, every
 * tag and stub sat on the middle cluster. While grouped, the Charge slider's push is a quarter as
 * strong and reaches only near nodes: at full strength across the pane it pushed notes out of their
 * clusters and the clusters into one another.
 */
export function clusterForces(
  gravity: number, width: number, height: number, clusters: GraphClusters, nodes: readonly IntelNode[],
  links: ReadonlyArray<{ source: string | IntelNode; target: string | IntelNode }> = [],
) {
  const sizes = new Map<string, number>();
  for (const node of nodes) {
    const key = clusters.of.get(node.id);
    if (key !== undefined) sizes.set(key, (sizes.get(key) ?? 0) + 1);
  }
  const centres = clusterCentres(sizes, width, height);
  // A free node's place: the middle of the places of the clusters its linked nodes are in.
  const idOf = (end: string | IntelNode) => (typeof end === 'string' ? end : end.id);
  const near = new Map<string, Array<{ x: number; y: number }>>();
  for (const link of links) {
    const [a, b] = [idOf(link.source), idOf(link.target)];
    for (const [free, other] of [[a, b], [b, a]]) {
      if (clusters.of.has(free)) continue;
      const place = centres.get(clusters.of.get(other) ?? '\0');
      if (place) near.set(free, [...(near.get(free) ?? []), place]);
    }
  }
  const among = new Map([...near].map(([id, places]) => [id, {
    x: places.reduce((s, p) => s + p.x, 0) / places.length,
    y: places.reduce((s, p) => s + p.y, 0) / places.length,
  }]));
  const target = (d: IntelNode) => {
    const key = clusters.of.get(d.id);
    return key === undefined ? undefined : centres.get(key);
  };
  const pull = Math.max(0.3, gravity);
  const placeOf = (d: IntelNode) => target(d) ?? among.get(d.id);
  const strengthOf = (d: IntelNode) => (target(d) ? pull : 0);
  /**
   * Starts each node at its place, spread a little around it, so none has to travel there: on the
   * build, 220 nodes never reached places 200 to 400 px out before the Friction slider's damping
   * cooled the layout. (A node the reader pinned, d3 puts back at its pin.)
   */
  const seed = (all: IntelNode[]) => {
    const golden = Math.PI * (3 - Math.sqrt(5));
    const placed = new Map<string, number>();
    for (const node of all) {
      const place = placeOf(node);
      if (!place) continue;
      const key = clusters.of.get(node.id) ?? `free:${place.x},${place.y}`;
      const k = placed.get(key) ?? 0;
      placed.set(key, k + 1);
      node.x = place.x + 6 * Math.sqrt(k + 0.5) * Math.cos(k * golden);
      node.y = place.y + 6 * Math.sqrt(k + 0.5) * Math.sin(k * golden);
    }
  };
  return {
    centres,
    seed,
    chargeScale: 0.25,
    chargeReach: 0.3 * Math.min(width, height),
    x: d3.forceX<IntelNode>((d) => target(d)?.x ?? width / 2).strength(strengthOf),
    y: d3.forceY<IntelNode>((d) => target(d)?.y ?? height / 2).strength(strengthOf),
  };
}

