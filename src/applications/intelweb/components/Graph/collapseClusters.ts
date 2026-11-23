/**
 * Collapsing clusters (decision D-IW, IW9): a cluster of more than 12 notes opens as one node with
 * its count, in the cluster's place; a click opens or closes any. Collapsed, a cluster's notes and
 * its own hub become that node; their links to what is outside the cluster are its links, once
 * each, and their links to one another go.
 *
 * Pure, so what the graph draws and what is tested agree.
 */
import type { GraphClusters } from './GraphEngine2D';
import type { GraphData, IntelEdge, IntelNode } from './IntelGraph';

/** More notes than this and a cluster opens collapsed. */
export const COLLAPSE_OVER = 12;

export const clusterNodeId = (key: string): string => `cluster:${key}`;

/** The clusters that open collapsed: those of more than 12 notes, counting notes only. */
export function collapsedAtFirst(nodes: readonly IntelNode[], clusters: GraphClusters): Set<string> {
  const notes = new Map<string, number>();
  for (const node of nodes) {
    const key = clusters.of.get(node.id);
    if (node.type === 'report' && key !== undefined) notes.set(key, (notes.get(key) ?? 0) + 1);
  }
  return new Set([...notes].filter(([, n]) => n > COLLAPSE_OVER).map(([key]) => key));
}

export function collapseClusters(
  data: GraphData,
  clusters: GraphClusters,
  collapsed: ReadonlySet<string>,
  title: (key: string, notes: number) => string,
): { data: GraphData; clusters: GraphClusters } {
  if (!collapsed.size) return { data, clusters };
  const into = (id: string): string => {
    const key = clusters.of.get(id);
    return key !== undefined && collapsed.has(key) ? clusterNodeId(key) : id;
  };
  const notes = new Map<string, number>();
  const nodes: IntelNode[] = [];
  for (const node of data.nodes) {
    if (into(node.id) === node.id) nodes.push(node);
    else if (node.type === 'report') notes.set(clusters.of.get(node.id)!, (notes.get(clusters.of.get(node.id)!) ?? 0) + 1);
  }
  const of = new Map(clusters.of);
  for (const key of collapsed) {
    if (![...clusters.of.values()].includes(key)) continue;
    const n = notes.get(key) ?? 0;
    nodes.push({
      id: clusterNodeId(key), type: 'cluster', confidence: 1, title: title(key, n), tags: [],
      metadata: { cluster: key, notes: n },
    });
    of.set(clusterNodeId(key), key);
  }
  for (const [id] of clusters.of) if (into(id) !== id) of.delete(id);

  const edges: IntelEdge[] = [];
  const seen = new Set<string>();
  const end = (e: string | IntelNode) => (typeof e === 'string' ? e : e.id);
  for (const edge of data.edges) {
    const [source, target] = [into(end(edge.source)), into(end(edge.target))];
    if (source === target) continue;
    const pair = source < target ? `${source}\0${target}` : `${target}\0${source}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    edges.push(source === end(edge.source) && target === end(edge.target)
      ? edge
      : { ...edge, id: `${source}->${target}`, source, target });
  }
  return { data: { nodes, edges }, clusters: { of, names: clusters.names } };
}
