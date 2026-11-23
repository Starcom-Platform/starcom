/**
 * GraphEngine2D - D3.js 2D Force-Directed Graph Implementation
 * 
 * Phase 3: High-performance 2D graph visualization optimized for 1000+ nodes
 */

import { clusterForces, gravityForces } from './gravity';
import { ROLES } from '../../../../styles/tokens';
import { iconMarkup } from '../../../../symbols/symbolRegistry';
import { categorySymbolOf } from '../../../../services/intel/reportCategory';
import { labelBox, labelCandidates, placeLabels, type LabelBox } from './labelPlacement';
import type { TimelineLayout } from './timelineLayout';
import { MAP_HEIGHT, MAP_WIDTH, type MapLayout } from './mapLayout';
import { RADIAL_RINGS, type RadialLayout } from './radialLayout';

/** A node's label: a cluster's name and count whole, there being few; anything else cut at 15 characters. */
const labelText = (d: IntelNode): string => (d.type === 'cluster' || d.title.length <= 15 ? d.title : `${d.title.substring(0, 15)}...`);
import React, { useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import { IntelNode, IntelEdge, IntelGraphData, PhysicsSettings } from './IntelGraph';
import { VirtualFile } from '../../../../types/DataPack';
import { markerRecordTime, overlapsWindow } from '../../../../services/intel/recordTime';

/** The Timeline (D-IW, step 5): each note's place, the rows' names, and how the axis and the column of notes with no time are said. */
export interface GraphTimeline {
  layout: TimelineLayout;
  rowNames: ReadonlyMap<string, string>;
  /** A time on the axis; `withTime` when the span is a few days, so marks hours apart do not read alike. */
  formatTime: (ms: number, withTime: boolean) => string;
  untimedLabel: string;
  /** How the column of notes far earlier than the rest is named, by the latest of them. */
  earlierLabel?: (until: number) => string;
}

/** The Map (D-IW, IW13, step 6): each note's place and kind, the world's borders once loaded, and how the strip of notes with no place is named. */
export interface GraphMap {
  layout: MapLayout;
  /** GeoJSON lines of the world's borders, in longitude and latitude; null while they load. */
  borders: unknown | null;
  unplacedLabel: string;
}

/** The Radial (D-IW, IW14, step 7): each node's place around the one chosen, and each spoke's name. */
export interface GraphRadial {
  layout: RadialLayout;
  names: ReadonlyMap<string, string>;
}

/** Which cluster each node gathers in, and what each cluster is called (D-IW, IW8). */
export interface GraphClusters {
  of: ReadonlyMap<string, string>;
  names: ReadonlyMap<string, string>;
  /** What a click on a cluster's name does, said on hover: "Close Yemen" (IW9). */
  hints?: ReadonlyMap<string, string>;
}

interface GraphEngine2DProps {
  data: IntelGraphData;
  physics: PhysicsSettings;
  selectedNodes: IntelNode[];
  selectedFile?: VirtualFile | null;
  onNodeClick?: (node: IntelNode) => void;
  onEdgeClick?: (edge: IntelEdge) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  timeRange?: [Date, Date]; // optional temporal filter window
  /** Grouped nodes gather by cluster; without it, or with nothing grouped, the Gravity slider's pull to the middle. */
  clusters?: GraphClusters;
  /** A click on a cluster's name (IW9). */
  onClusterClick?: (key: string) => void;
  /** What a search matched: the rest dimmed, not removed, so a hit keeps its surroundings (D-IW, step 3). */
  highlight?: ReadonlySet<string> | null;
  /** Lay the notes out on a Timeline instead of in clusters (D-IW, step 5). */
  timeline?: GraphTimeline | null;
  /** Or on a Map (D-IW, step 6). */
  map?: GraphMap | null;
  /** Or around a node chosen (D-IW, step 7). */
  radial?: GraphRadial | null;
}

export const GraphEngine2D: React.FC<GraphEngine2DProps> = ({
  data,
  physics,
  selectedNodes,
  selectedFile,
  onNodeClick,
  onEdgeClick,
  containerRef,
  timeRange,
  clusters,
  onClusterClick,
  highlight,
  timeline,
  map,
  radial
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<IntelNode, IntelEdge> | null>(null);

  // Click handlers are held in refs and kept OUT of initializeSimulation's
  // dependency array. They are called, never compared — and every caller so far
  // has passed at least one inline arrow (see IntelGraph's onEdgeClick), which
  // made this component tear the SVG down and rebuild it on every parent
  // render. Reading them through a ref makes that structurally impossible
  // rather than relying on each call site remembering to memoise.
  const onNodeClickRef = useRef(onNodeClick);
  const onEdgeClickRef = useRef(onEdgeClick);
  useEffect(() => { onNodeClickRef.current = onNodeClick; }, [onNodeClick]);
  useEffect(() => { onEdgeClickRef.current = onEdgeClick; }, [onEdgeClick]);
  const onClusterClickRef = useRef(onClusterClick);
  useEffect(() => { onClusterClickRef.current = onClusterClick; }, [onClusterClick]);
  // Read by the layout, never a reason to rebuild it: a search re-dims what is drawn.
  const highlightRef = useRef(highlight);
  useEffect(() => {
    highlightRef.current = highlight;
    (simulationRef.current as (d3.Simulation<IntelNode, IntelEdge> & { applySearch?: () => void }) | null)?.applySearch?.();
  }, [highlight]);
  // The selection, read the same way. It was a dependency of the build below,
  // so every click on a node wiped the SVG and restarted the layout at full
  // heat, losing the reader's pan and zoom (critique audit of 2026-10-01,
  // section 7). A selection is drawn by updateSelection, never by a rebuild.
  const selectedNodesRef = useRef(selectedNodes);
  const selectedFileRef = useRef(selectedFile);
  selectedNodesRef.current = selectedNodes;
  selectedFileRef.current = selectedFile;

  // Node size scaling. Memoised because it is a dependency below; built inline
  // it was a fresh identity every render, which alone forced the rebuild.
  const sizeScale = React.useMemo(
    () => d3.scaleLinear()
      .domain([0, d3.max(data.nodes, d => d.size) || 10])
      .range([6, 20]),
    [data.nodes]
  );

  // Precompute degree ranking for label LOD
  const degreeSortedIds = React.useMemo(() => {
    return [...data.nodes]
      .sort((a, b) => (b.degree || 0) - (a.degree || 0))
      .map(n => n.id);
  }, [data.nodes]);

  // Edge color mapping by type
  const edgeColors: Record<string, string> = {
    reference: '#9E9E9E',
    spatial: '#FF9800',
    temporal: '#9C27B0'
  };

  // Initialize or update D3 simulation
  const initializeSimulation = useCallback(() => {
    if (!svgRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // If nodes are frozen (fx/fy set), start with low alpha
    const hasFixed = data.nodes.some(n => typeof n.fx === 'number' && typeof n.fy === 'number');

    // Precompute adjacency for hover highlighting
    const neighborMap = new Map<string, Set<string>>();
    const incidentEdgeIds = new Map<string, Set<string>>();
    data.edges.forEach(e => {
      const s = typeof e.source === 'string' ? e.source : e.source.id;
      const t = typeof e.target === 'string' ? e.target : e.target.id;
      if (!neighborMap.has(s)) neighborMap.set(s, new Set());
      if (!neighborMap.has(t)) neighborMap.set(t, new Set());
      neighborMap.get(s)!.add(t);
      neighborMap.get(t)!.add(s);
      if (!incidentEdgeIds.has(s)) incidentEdgeIds.set(s, new Set());
      if (!incidentEdgeIds.has(t)) incidentEdgeIds.set(t, new Set());
      incidentEdgeIds.get(s)!.add(e.id);
      incidentEdgeIds.get(t)!.add(e.id);
    });

    // Fresh links with plain ids, resolved against the nodes drawn now. d3 replaces an edge's ends with
    // node objects and keeps any end that is already one, and the graph hands over fresh node copies
    // each render with the same edges: reused, every link pointed at nodes no longer drawn (D-IW).
    const endId = (end: string | IntelNode) => (typeof end === 'string' ? end : end.id);
    const links: IntelEdge[] = data.edges.map((e) => ({ ...e, source: endId(e.source), target: endId(e.target) }));

    // Create or update simulation
    const grouped = !timeline && !map && !radial && clusters && clusters.of.size ? clusterForces(physics.gravity, width, height, clusters, data.nodes, links) : null;
    grouped?.seed(data.nodes);
    // On a Timeline or a Map each node starts at its place and is held there firmly; the push between
    // notes only keeps neighbours apart (D-IW, steps 5 and 6). On the Map, notes stating only a country
    // gather around it more loosely, a little spiral apart to begin with.
    const placed = timeline?.layout.places ?? map?.layout.places ?? radial?.layout.places;
    const gathered = (d: IntelNode) => map?.layout.kinds.get(d.id) === 'gathered';
    if (placed) {
      const around = new Map<string, number>();
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (const n of data.nodes) {
        const at = placed.get(n.id);
        if (!at) continue;
        const key = `${at.x},${at.y}`;
        const k = gathered(n) ? (around.get(key) ?? 0) + 1 : 0;
        if (gathered(n)) around.set(key, k);
        n.x = at.x + 9 * Math.sqrt(k) * Math.cos(k * golden);
        n.y = at.y + 9 * Math.sqrt(k) * Math.sin(k * golden);
      }
    }
    const holdOf = (d: IntelNode) => (!placed?.has(d.id) ? 0 : gathered(d) ? 0.2 : 0.9);
    const gravity = placed
      ? {
        x: d3.forceX<IntelNode>((d) => placed.get(d.id)?.x ?? width / 2).strength(holdOf),
        y: d3.forceY<IntelNode>((d) => placed.get(d.id)?.y ?? height / 2).strength(holdOf),
      }
      : grouped ?? gravityForces(physics.gravity, width, height);
    const simulation = d3.forceSimulation<IntelNode>(data.nodes)
      .force('link', d3.forceLink<IntelNode, IntelEdge>(links)
        .id(d => d.id)
        .distance(physics.linkDistance)
        .strength(physics.linkStrength)
      )
      .force('charge', placed
        ? d3.forceManyBody().strength(-12).distanceMax(60)
        : grouped
          ? d3.forceManyBody().strength(physics.charge * grouped.chargeScale).distanceMax(grouped.chargeReach)
          : d3.forceManyBody().strength(physics.charge))
      // Not on a Timeline: pulling the whole graph to the pane's middle moved every note off its date.
      .force('center', placed ? null : d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => sizeScale(d.size) + 2))
      .force('x', gravity.x)
      .force('y', gravity.y)
      .alpha(hasFixed ? 0.05 : 1)
      .alphaDecay(0.02)
      .velocityDecay(physics.friction);

    simulationRef.current = simulation;

    // Clear previous content
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
;

    // Create zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      // The pane's size, given rather than read from the SVG, which d3 cannot measure everywhere.
      .extent([[0, 0], [width, height]])
      .scaleExtent([0.1, 10])
      .on('zoom', (event) => {
        const t0 = performance.now();
        g.attr('transform', event.transform);
        updateLabelLOD(event.transform.k);
        const t1 = performance.now();
        if ((t1 - t0) > 1) {
          console.log(`[IntelWeb][Perf] Zoom handler ${ (t1 - t0).toFixed(2) }ms (labels)`);
        }
      });

    svg.call(zoom);

    // Create main group
    const g = svg.append('g');


    // Create edge elements
    const edges = g.selectAll('.edge')
      .data(links)
      .enter()
      .append('line')
      .attr('class', 'edge')
      .attr('stroke', d => edgeColors[d.type] || '#9E9E9E')
      .attr('stroke-opacity', d => Math.max(0.2, Math.min(1, 0.3 + d.confidence * 0.7)))
      .attr('stroke-width', d => Math.max(1, (d.weight || 0.5) * 3))
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        onEdgeClickRef.current?.(d);
      });

    // Add simple tooltips for edges with predicate/provenance
    edges.append('title').text(d => {
      const m: any = d.metadata || {};
      const predicate = m.predicate;
      const provenance = m.provenance || m.derivedFrom;
      const sourceReport = m.sourceReport;
      const parts: string[] = [
        `Type: ${d.type}`,
      ];
      if (predicate) parts.push(`Predicate: ${predicate}`);
      if (sourceReport) parts.push(`Source: ${sourceReport}`);
      if (provenance) parts.push(`Provenance: ${provenance}`);
      parts.push(`Weight: ${(d.weight || 0).toFixed(2)}`);
      parts.push(`Confidence: ${Math.round((d.confidence || 0) * 100)}%`);
      return parts.join('\n');
    });

    // Create node groups
    const nodeGroups = g.selectAll('.node-group')
      .data(data.nodes)
      .enter()
      .append('g')
      .attr('class', 'node-group')
      // Where each node already stands (seeded, or d3's start), not at the corner until the first tick.
      .attr('transform', d => `translate(${d.x || 0}, ${d.y || 0})`)
      .style('cursor', 'pointer')
      .call(d3.drag<SVGGElement, IntelNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        onNodeClickRef.current?.(d);
      });

    // Add node circles
    const nodeCircles = nodeGroups.append('circle')
      .attr('class', 'node-circle')
      .attr('r', d => sizeScale(d.size))
      .attr('fill', d => d.color as string)
      .attr('stroke', d => {
        const c = d3.color(d.color as string);
        return c ? c.darker(1).toString() : '#333';
      })
      .attr('stroke-width', 2)
      // Named but not held here (a stub, a mission package not held): a dashed ring, so it reads apart
      // from a raw note, the same grey with the same icon on the build (D-IW).
      .attr('stroke-dasharray', d => (d.type === 'stub' || (d.type === 'mission' && d.metadata?.held === false) ? '3 2' : null))
      .attr('opacity', d => 0.7 + (d.confidence * 0.3));

    // Add node icons based on type
    // A note with a category carries the globe's icon for it (D-IW, IW12), in place of the emoji.
    const glyphOf = (d: IntelNode) => (d.type === 'report' && typeof d.metadata?.intelCategory === 'string'
      ? categorySymbolOf(d.metadata.intelCategory) : null);
    nodeGroups.filter((d) => glyphOf(d) !== null)
      .append('g')
      .attr('class', 'node-glyph')
      .attr('pointer-events', 'none')
      .html((d) => {
        const size = Math.max(10, sizeScale(d.size ?? 0) * 1.1);
        return iconMarkup(glyphOf(d)!.icon, { x: -size / 2, y: -size / 2, size, stroke: 2.5, colour: ROLES.text.heading });
      });
    const _nodeIcons = nodeGroups.filter((d) => glyphOf(d) === null).append('text')
      .attr('class', 'node-icon')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', d => Math.max(8, sizeScale(d.size) * 0.6))
      .attr('fill', '#fff')
      .attr('pointer-events', 'none')
      .text(d => {
        const icons: Record<string, string> = {
          report: '📄',
          entity: '👤',
          location: '📍',
          event: '⚡',
          source: '🔗'
        };
        // A collapsed cluster shows how many notes it holds (IW9).
        if (d.type === 'cluster') return String(d.metadata?.notes ?? '');
        return icons[d.type] || '📄';
      });

    // Add node labels
    const _nodeLabels = nodeGroups.append('text')
      .attr('class', 'node-label')
      .attr('text-anchor', 'middle')
      .attr('dy', d => sizeScale(d.size) + 12)
      .attr('font-size', '10px')
      .attr('fill', '#d4d4d4')
      .attr('pointer-events', 'none')
      .style('user-select', 'none')
      // A cluster's name and count whole: there are few, and cut short they said "Yemen · 13 not…".
      .text(labelText);

    // Which labels are drawn (D-IW, IW10, labelPlacement.ts): hubs and clusters always, a note's on
    // hover, when selected or zoomed in close; one that would overlap another, or a cluster's name,
    // is left out, never stacked. Before, every label showed once zoomed in past half size, and they
    // collided wherever notes gathered.
    let hoveredId: string | null = null;
    const rank = new Map(degreeSortedIds.map((id, i) => [id, degreeSortedIds.length - i]));
    const clusterNameBoxes: LabelBox[] = grouped && clusters
      ? [...grouped.centres].map(([key, at]) => {
        const name = clusters.names.get(key) ?? key;
        // A cluster's name, 14 px and bold, about nine units a character, drawn on its place.
        return { id: `cluster-name:${key}`, x: at.x, y: at.y - 5, width: name.length * 9, height: 18, priority: 0 };
      })
      : [];
    const updateLabelLOD = (k: number) => {
      const selected = new Set(selectedNodesRef.current.map(n => n.id));
      const byId = new Map(data.nodes.map(n => [n.id, n]));
      const boxes = labelCandidates(data.nodes, { k, hovered: hoveredId, selected, degree: rank }).map(({ id, priority }) => {
        const n = byId.get(id)!;
        return labelBox({ id, x: n.x ?? 0, y: n.y ?? 0 }, labelText(n), sizeScale(n.size ?? 0), priority);
      });
      const kept = placeLabels(boxes, clusterNameBoxes);
      _nodeLabels.style('display', d => kept.has(d.id) ? 'block' : 'none');
    };

    // Temporal edge fading helper
    const applyTemporalFading = () => {
      if (!timeRange) return;
      const t0 = performance.now();
      const [start, end] = timeRange;
      edges.attr('stroke-opacity', (d: any) => {
        const m: any = d.metadata || {};
        const ts = m?.provenance?.timestamp || m?.timestamp || m?.time;
        if (!ts) return Math.max(0.15, Math.min(1, 0.3 + d.confidence * 0.7));
        const date = new Date(ts);
        const inRange = date >= start && date <= end;
        return inRange ? Math.max(0.4, Math.min(1, 0.4 + d.confidence * 0.6)) : 0.05;
      });
      // Node dimming (do not remove filtered nodes; dim those out of range)
      nodeCircles.attr('fill-opacity', (d: any) => {
        // By overlap, placed by the node's event time where its record states one (decision D-E).
        const time = markerRecordTime(d) ?? (d.timestamp ? { basis: 'written' as const, start: new Date(d.timestamp).getTime() } : null);
        if (!time || !Number.isFinite(time.start)) return 0.9;
        return overlapsWindow(time, { start, end }) ? 1 : 0.15;
      });
      const t1 = performance.now();
      if ((t1 - t0) > 2) console.log(`[IntelWeb][Perf] Temporal fading pass ${(t1 - t0).toFixed(2)}ms`);
    };

    // Initial label LOD
    updateLabelLOD(1);
    applyTemporalFading();

    // Hover highlighting helpers
    // What a search matched at full strength, the rest dimmed (D-IW, step 3); nothing searched, all full.
    const applySearch = () => {
      const hit = highlightRef.current;
      nodeGroups.style('opacity', d => (!hit || hit.has(d.id) ? 1 : 0.15));
      edges.style('opacity', e => (!hit ? null : hit.has(endId(e.source)) && hit.has(endId(e.target)) ? 1 : 0.1));
    };
    const clearHover = () => {
      applySearch();
      edges.attr('stroke-width', d => Math.max(1, (d.weight || 0.5) * 3));
    };
    applySearch();
    (simulation as d3.Simulation<IntelNode, IntelEdge> & { applySearch?: () => void }).applySearch = applySearch;

    const highlightNode = (nodeId: string) => {
      const neighbors = neighborMap.get(nodeId) || new Set<string>();
      const incident = incidentEdgeIds.get(nodeId) || new Set<string>();

      nodeGroups.style('opacity', (d: any) => {
        if (d.id === nodeId) return 1;
        return neighbors.has(d.id) ? 0.95 : 0.15;
      });

      edges
        .style('opacity', (e: any) => incident.has(e.id) ? 1 : 0.1)
        .attr('stroke-width', (e: any) => incident.has(e.id) ? Math.max(2, (e.weight || 0.5) * 4) : Math.max(1, (e.weight || 0.5) * 2));
    };

    const highlightEdge = (edge: IntelEdge) => {
      const s = typeof edge.source === 'string' ? edge.source : edge.source.id;
      const t = typeof edge.target === 'string' ? edge.target : edge.target.id;
      const neighborSet = new Set([s, t]);

      nodeGroups.style('opacity', (d: any) => neighborSet.has(d.id) ? 1 : 0.15);
      edges
        .style('opacity', (e: any) => e.id === edge.id ? 1 : 0.1)
        .attr('stroke-width', (e: any) => e.id === edge.id ? Math.max(2, (e.weight || 0.5) * 4) : Math.max(1, (e.weight || 0.5) * 2));
    };

    // Wire hover events
    nodeGroups
      .on('mouseover', (_, d) => { hoveredId = (d as any).id; highlightNode((d as any).id); updateLabelLOD(d3.zoomTransform(svg.node() as any).k); })
      .on('mouseout', () => { hoveredId = null; clearHover(); updateLabelLOD(d3.zoomTransform(svg.node() as any).k); });

    edges
      .on('mouseover', (_, d) => { highlightEdge(d as any); updateLabelLOD(d3.zoomTransform(svg.node() as any).k); })
      .on('mouseout', () => { clearHover(); updateLabelLOD(d3.zoomTransform(svg.node() as any).k); });

    // Re-apply temporal fading when timeRange changes via mutation observer pattern (simplified)
    if (timeRange) {
      applyTemporalFading();
    }

    // Update selection highlighting
    const updateSelection = () => {
      const selectedNodes = selectedNodesRef.current;
      const selectedFile = selectedFileRef.current;
      const selectedIds = new Set(selectedNodes.map(n => n.id));
      nodeCircles
        .classed('selected', d => selectedIds.has(d.id))
        .attr('stroke-width', d => selectedIds.has(d.id) ? 4 : 2);
      updateLabelLOD(d3.zoomTransform(svg.node() as any).k);
      // Highlight selected file
      if (selectedFile) {
        nodeCircles
          .classed('highlighted', d => d.file?.path === selectedFile.path);
      }
    };

    // Each cluster's name at its place, over the nodes with a dark halo so it reads on top of them
    // (D-IW, IW8, IW10): under them, most names were hidden on the build.
    if (grouped && clusters) {
      g.append('g').attr('class', 'cluster-labels')
        .selectAll('text')
        .data([...grouped.centres])
        .enter()
        .append('text')
        .attr('class', 'cluster-label')
        .attr('x', ([, at]) => at.x)
        .attr('y', ([, at]) => at.y)
        .attr('text-anchor', 'middle')
        .attr('fill', ROLES.text.heading)
        .attr('stroke', ROLES.surface.globe)
        .attr('stroke-width', 4)
        .attr('paint-order', 'stroke')
        .attr('font-size', 14)
        .attr('font-weight', 700)
        .style('cursor', 'pointer')
        .on('click', (event, [key]) => {
          event.stopPropagation();
          onClusterClickRef.current?.(key);
        })
        .text(([key]) => clusters.names.get(key) ?? key)
        .append('title')
        .text(([key]) => clusters.hints?.get(key) ?? '');
    }

    // The Timeline's rows named at the left, its axis along the top in the reader's dates, and the
    // column of notes stating no time named (D-IW, step 5).
    if (timeline) {
      const marks = g.insert('g', ':first-child').attr('class', 'timeline-marks').style('pointer-events', 'none');
      const { layout } = timeline;
      const top = Math.min(...layout.rows.map((r) => r.y), height) - 40;
      marks.selectAll('text.timeline-row').data(layout.rows).enter().append('text')
        .attr('class', 'timeline-row').attr('x', 12).attr('y', (r) => r.y + 4)
        .attr('fill', ROLES.text.secondary).attr('font-size', 13).attr('font-weight', 600)
        .text((r) => timeline.rowNames.get(r.key) ?? r.key);
      marks.selectAll('line.timeline-rule').data(layout.rows).enter().append('line')
        .attr('class', 'timeline-rule').attr('x1', 0).attr('x2', layout.x1 + 20)
        .attr('y1', (r) => r.y).attr('y2', (r) => r.y)
        .attr('stroke', ROLES.surface.divider).attr('stroke-width', 1);
      if (layout.span) {
        const scale = d3.scaleUtc().domain([layout.span.from, layout.span.until]).range([layout.x0, layout.x1]);
        const ticks = layout.span.until > layout.span.from ? scale.ticks(6) : [new Date(layout.span.from)];
        marks.selectAll('text.timeline-tick').data(ticks).enter().append('text')
          .attr('class', 'timeline-tick').attr('x', (t) => (layout.span!.until > layout.span!.from ? scale(t) : (layout.x0 + layout.x1) / 2)).attr('y', top)
          .attr('text-anchor', 'middle').attr('fill', ROLES.text.muted).attr('font-size', 11)
          // Over a few days the marks are hours apart: dates alone read "11 Oct, 11 Oct" on the build.
          .text((t) => timeline.formatTime(t.getTime(), layout.span!.until - layout.span!.from < 4 * 86_400_000));
      }
      marks.append('text').attr('class', 'timeline-untimed').attr('x', layout.untimedX).attr('y', top)
        .attr('text-anchor', 'middle').attr('fill', ROLES.text.muted).attr('font-size', 11)
        .text(timeline.untimedLabel);
      if (layout.earlier && timeline.earlierLabel) {
        marks.append('text').attr('class', 'timeline-earlier').attr('x', layout.earlier.x).attr('y', top + 14)
          .attr('text-anchor', 'middle').attr('fill', ROLES.text.muted).attr('font-size', 11)
          .text(timeline.earlierLabel(layout.earlier.until));
      }
    }

    // The Map: the world's borders under everything, and the strip of notes stating no place named
    // (D-IW, IW13, step 6).
    if (map) {
      const marks = g.insert('g', ':first-child').attr('class', 'map-marks').style('pointer-events', 'none');
      const borders = map.borders as { features?: unknown[] } | null;
      if (borders && Array.isArray(borders.features)) {
        const projection = d3.geoEquirectangular().scale(MAP_WIDTH / (2 * Math.PI)).translate([MAP_WIDTH / 2, MAP_HEIGHT / 2]);
        const path = d3.geoPath(projection);
        marks.selectAll('path.map-border').data(borders.features as d3.GeoPermissibleObjects[]).enter().append('path')
          .attr('class', 'map-border').attr('d', (f) => path(f) ?? '')
          .attr('fill', 'none').attr('stroke', ROLES.surface.divider).attr('stroke-width', 0.8);
      }
      marks.append('text').attr('class', 'map-unplaced').attr('x', 20).attr('y', map.layout.stripY - 22)
        .attr('fill', ROLES.text.muted).attr('font-size', 12).text(map.unplacedLabel);
    }

    // The Radial's two rings, and each spoke's name beyond the outer one, on its bearing (D-IW, step 7).
    if (radial) {
      const marks = g.insert('g', ':first-child').attr('class', 'radial-marks').style('pointer-events', 'none');
      marks.selectAll('circle.radial-ring').data(RADIAL_RINGS).enter().append('circle')
        .attr('class', 'radial-ring').attr('cx', 0).attr('cy', 0).attr('r', (r) => r)
        .attr('fill', 'none').attr('stroke', ROLES.surface.divider).attr('stroke-width', 1);
      const outer = RADIAL_RINGS[1] + 40;
      marks.selectAll('text.radial-sector').data(radial.layout.sectors).enter().append('text')
        .attr('class', 'radial-sector')
        .attr('x', (sector) => outer * Math.cos((sector.from + sector.to) / 2))
        .attr('y', (sector) => outer * Math.sin((sector.from + sector.to) / 2))
        .attr('text-anchor', 'middle').attr('fill', ROLES.text.secondary).attr('font-size', 13).attr('font-weight', 600)
        .text((sector) => radial.names.get(sector.key) ?? sector.key);
    }

    // A Map or a Timeline opens fitted, every place being known before the layout runs: the Map shows
    // the whole world (at full size it showed the Americas and nothing else), the Timeline every row.
    const fitTo = (x0: number, y0: number, x1: number, y1: number) => {
      const pad = 30;
      const k = Math.min(1, Math.max(0.1, Math.min(width / (x1 - x0 + 2 * pad), height / (y1 - y0 + 2 * pad))));
      svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2 - (k * (x0 + x1)) / 2, height / 2 - (k * (y0 + y1)) / 2).scale(k));
    };
    if (map) fitTo(0, 0, MAP_WIDTH, map.layout.stripY + 20);
    else if (radial) fitTo(-RADIAL_RINGS[1] - 70, -RADIAL_RINGS[1] - 70, RADIAL_RINGS[1] + 70, RADIAL_RINGS[1] + 70);
    else if (timeline && timeline.layout.rows.length) {
      const ys = timeline.layout.rows.map((r) => r.y);
      fitTo(0, Math.min(...ys) - 60, timeline.layout.x1 + 20, Math.max(...ys) + 40);
    }

    // Once the layout settles, the whole graph in view, unless the reader has moved it meanwhile:
    // clusters given room for their size can reach past the pane (D-IW, IW8).
    let readerMoved = false;
    zoom.on('start.reader', (event) => { if (event.sourceEvent) readerMoved = true; });
    simulation.on('end', () => {
      updateLabelLOD(d3.zoomTransform(svg.node() as SVGSVGElement).k);
      // A Map or a Timeline was fitted as it opened; its places do not move.
      if (readerMoved || !data.nodes.length || placed) return;
      const xs = data.nodes.map((n) => n.x ?? 0);
      const ys = data.nodes.map((n) => n.y ?? 0);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const pad = 40;
      const k = Math.min(1, Math.max(0.1, Math.min(width / (x1 - x0 + 2 * pad), height / (y1 - y0 + 2 * pad))));
      svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2 - (k * (x0 + x1)) / 2, height / 2 - (k * (y0 + y1)) / 2).scale(k));
    });

    // Simulation tick function. Labels are placed again every tenth tick, as the nodes move.
    let ticks = 0;
    simulation.on('tick', () => {
      if (++ticks % 10 === 0) updateLabelLOD(d3.zoomTransform(svg.node() as SVGSVGElement).k);
      edges
        .attr('x1', d => (d.source as IntelNode).x || 0)
        .attr('y1', d => (d.source as IntelNode).y || 0)
        .attr('x2', d => (d.target as IntelNode).x || 0)
        .attr('y2', d => (d.target as IntelNode).y || 0);

      nodeGroups
        .attr('transform', d => `translate(${d.x || 0}, ${d.y || 0})`);
    });

    // Initial selection update
    updateSelection();

    // Store update function for external calls
    (simulation as d3.Simulation<IntelNode, IntelEdge> & { updateSelection?: () => void }).updateSelection = updateSelection;

    return simulation;
    // onNodeClick/onEdgeClick are deliberately absent — read via refs above.
  }, [data, physics, containerRef, sizeScale, degreeSortedIds, timeRange, clusters, timeline, map, radial]);

  // Update simulation when data or physics change with proper cleanup
  useEffect(() => {
    // Cleanup previous simulation
    if (simulationRef.current) {
      simulationRef.current.stop();
      simulationRef.current.nodes([]);
      // Clear all forces to prevent memory leaks
      simulationRef.current.force('link', null);
      simulationRef.current.force('charge', null);
      simulationRef.current.force('center', null);
      simulationRef.current.force('collision', null);
    }

    const simulation = initializeSimulation();
    simulationRef.current = simulation;
    
    return () => {
      if (simulation) {
        simulation.stop();
        simulation.nodes([]);
        // Clear all forces
        simulation.force('link', null);
        simulation.force('charge', null);
        simulation.force('center', null);
        simulation.force('collision', null);
      }
    };
  }, [data, physics, initializeSimulation]);

  // Update selection when selectedNodes or selectedFile change
  useEffect(() => {
    if (simulationRef.current && (simulationRef.current as d3.Simulation<IntelNode, IntelEdge> & { updateSelection?: () => void }).updateSelection) {
      (simulationRef.current as d3.Simulation<IntelNode, IntelEdge> & { updateSelection?: () => void }).updateSelection();
    }
  }, [selectedNodes, selectedFile]);

  // Handle container resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && svgRef.current) {
        const container = containerRef.current;
        const svg = d3.select(svgRef.current);
        svg.attr('width', container.clientWidth)
           .attr('height', container.clientHeight);
           
        // Update center force
        if (simulationRef.current) {
          simulationRef.current
            .force('center', d3.forceCenter(container.clientWidth / 2, container.clientHeight / 2))
            .alpha(0.3)
            .restart();
        }
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [containerRef]);

  return (
    <svg
      ref={svgRef}
      className="graph-2d"
      style={{
        width: '100%',
        height: '100%',
        background: 'transparent'
      }}
    />
  );
};

export default GraphEngine2D;
