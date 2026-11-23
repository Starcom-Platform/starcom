/**
 * Collapsing clusters (decision D-IW, IW9): a cluster of more than 12 notes opens as one node with
 * its count; a click opens or closes any. Pure, so what the graph draws and what is tested agree.
 */
import { describe, expect, it } from 'vitest';
import { clusterNodeId, collapseClusters, collapsedAtFirst } from '../collapseClusters';
import type { GraphClusters } from '../GraphEngine2D';
import type { IntelEdge, IntelNode } from '../IntelGraph';

const node = (id: string, type: IntelNode['type'] = 'report'): IntelNode => ({ id, type, confidence: 0.8, title: id, tags: [], metadata: {} });
const edge = (source: string, target: string): IntelEdge => ({ id: `${source}-${target}`, source, target, type: 'reference', weight: 0.5, confidence: 0.8, metadata: {} });
const title = (key: string, n: number) => `${key} · ${n}`;

// Yemen: 13 notes and its hub; Saudi Arabia: 2 notes; a tag hub outside both.
const ye = Array.from({ length: 13 }, (_, i) => node(`ye${i}`));
const sa = [node('sa0'), node('sa1')];
const nodes = [...ye, ...sa, node('countries/ye.md', 'country'), node('tags/war_map.md', 'tag')];
const clusters: GraphClusters = {
  of: new Map([...ye.map((n) => [n.id, 'ye'] as const), ...sa.map((n) => [n.id, 'sa'] as const), ['countries/ye.md', 'ye']]),
  names: new Map([['ye', 'Yemen'], ['sa', 'Saudi Arabia']]),
};

describe('which clusters open collapsed', () => {
  it('those of more than 12 notes, counting notes only', () => {
    expect([...collapsedAtFirst(nodes, clusters)]).toEqual(['ye']);
  });

  it('none at 12', () => {
    const twelve = nodes.filter((n) => n.id !== 'ye12');
    expect([...collapsedAtFirst(twelve, clusters)]).toEqual([]);
  });
});

describe('a collapsed cluster', () => {
  const edges = [edge('ye0', 'tags/war_map.md'), edge('ye1', 'tags/war_map.md'), edge('ye2', 'countries/ye.md'), edge('ye3', 'sa0'), edge('sa1', 'tags/war_map.md')];
  const out = collapseClusters({ nodes, edges }, clusters, new Set(['ye']), title);

  it('is one node with its count, in its place', () => {
    const one = out.data.nodes.find((n) => n.id === clusterNodeId('ye'))!;
    expect(one).toMatchObject({ type: 'cluster', title: 'ye · 13', metadata: { cluster: 'ye', notes: 13 } });
    expect(out.clusters.of.get(clusterNodeId('ye'))).toBe('ye');
    expect(out.data.nodes.map((n) => n.id).filter((id) => id.startsWith('ye') || id === 'countries/ye.md')).toEqual([]);
  });

  it('keeps the links its notes had to what is outside it, once each, and none within it', () => {
    const pairs = out.data.edges.map((e) => `${e.source as string}->${e.target as string}`).sort();
    expect(pairs).toEqual([`${clusterNodeId('ye')}->sa0`, `${clusterNodeId('ye')}->tags/war_map.md`, 'sa1->tags/war_map.md']);
  });

  it('leaves an open cluster as it was', () => {
    expect(out.data.nodes.filter((n) => n.id.startsWith('sa')).map((n) => n.id)).toEqual(['sa0', 'sa1']);
    expect(out.clusters.of.get('sa0')).toBe('sa');
  });

  it('changes nothing where none is collapsed', () => {
    const same = collapseClusters({ nodes, edges }, clusters, new Set(), title);
    expect(same.data.nodes).toHaveLength(nodes.length);
    expect(same.data.edges).toHaveLength(edges.length);
  });
});
