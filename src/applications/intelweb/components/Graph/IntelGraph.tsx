/**
 * IntelGraph - Main Graph Visualization Component
 * 
 * Phase 3: D3.js force-directed graph with intelligence-specific features
 * Supports 2D/3D modes and optimized for 1000+ nodes
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { NODE_TYPES, type IntelNodeType } from './nodeTypes';
import * as d3 from 'd3';
import { VirtualFileSystem, VirtualFile } from '../../../../types/DataPack';
import { GraphEngine2D } from './GraphEngine2D';
import { GraphControls } from './GraphControls';
import { GraphContext } from './GraphContext';
import { useGraphClusters } from './useGraphClusters';
import { ROLES } from '../../../../styles/tokens';
import { clusterNodeId, collapseClusters, collapsedAtFirst } from './collapseClusters';
import { COLOURINGS, noteColours, type Colouring } from './noteColours';
import { ColourKey } from './ColourKey';
import { timelineLayout } from './timelineLayout';
import { mapLayout } from './mapLayout';
import { radialLayout } from './radialLayout';
import type { GraphMap, GraphRadial, GraphTimeline } from './GraphEngine2D';
import { nationalTerritoriesService } from '../../../../geopolitical/services/NationalTerritoriesService';
import { iso2ToIso3 } from '../../../../services/geolocation/iso2to3CountryCodes';
import { utcDateIn, utcDateTimeIn } from '../../../../i18n/app/dates';
import { GROUPINGS, type Grouping } from '../../../../services/intelweb/intelGroups';
import { counted, fill, useMessages } from '../../../../i18n/app/i18n';

/** How the reader last grouped the notes, kept on this device only. */
const GROUP_BY_KEY = 'intelweb:groupBy';
/** How the reader last coloured them (IW12), likewise. */
const COLOUR_BY_KEY = 'intelweb:colourBy';
/** The layouts (IW2): Clusters, the Timeline (step 5), the Map (step 6), the Radial (step 7). */
const LAYOUTS = ['clusters', 'timeline', 'map', 'radial'] as const;
/** On the Radial, nodes of another kind in no group: one spoke, named as the colour key names the rest. */
const RADIAL_OTHERS = 'radial:others';
/** The world's borders under the Map: the lightest of the globe's own. */
const MAP_BORDERS_URL = '/geopolitical/world-borders-lod0.geojson';
type GraphLayout = typeof LAYOUTS[number];
const LAYOUT_KEY = 'intelweb:layout';
import { frontmatterTime, nodeTimeFields } from '../../../../services/intel/recordTime';

// Graph data interfaces
export interface IntelNode extends d3.SimulationNodeDatum {
  id: string;
  type: IntelNodeType;
  confidence: number; // 0-1, affects node opacity
  title: string;
  description?: string;
  timestamp?: Date;
  /** Which time placed the node (decision D-E): its event, or when its record was written. */
  timeBasis?: 'event' | 'written';
  /** Where the event's stated end starts, in ms, when it was a span. */
  timeEndMs?: number;
  /** How closely the event time is known, in ms, when stated. */
  timePrecisionMs?: number;
  location?: [number, number]; // lat, lng
  tags: string[];
  metadata: Record<string, unknown>;
  degree?: number; // computed structural degree (for sizing / label LOD)
  
  // Graph properties
  x?: number;
  y?: number;
  z?: number; // For 3D mode
  vx?: number;
  vy?: number;
  vz?: number;
  fx?: number | null;
  fy?: number | null;
  fz?: number | null;
  
  // Visualization
  color?: string;
  size?: number;
  group?: string;
  file?: VirtualFile; // Associated file
}

/**
 * Pin (frozen) or release (unfrozen) every node's d3 fixed position.
 *
 * Returns the IDENTICAL array when no node's fx/fy actually changes. That
 * referential stability is the contract, not an optimisation: the caller feeds
 * the result back through setGraphData, and a always-fresh array made the
 * effect re-trigger itself without bound. Keep the identity check when editing.
 */
export function applyFreezeState(nodes: IntelNode[], frozen: boolean): IntelNode[] {
  let changed = false;
  const next = nodes.map(n => {
    const fx = frozen ? n.x : null;
    const fy = frozen ? n.y : null;
    if (n.fx === fx && n.fy === fy) return n;
    changed = true;
    return { ...n, fx, fy };
  });
  return changed ? next : nodes;
}

export interface IntelEdge {
  id: string;
  source: string | IntelNode;
  target: string | IntelNode;
  type: 'reference' | 'temporal' | 'spatial' | 'causal' | 'similar';
  weight: number; // 0-1, affects edge thickness
  confidence: number; // 0-1, affects edge opacity
  description?: string;
  metadata: Record<string, unknown>;
}

export interface GraphData {
  nodes: IntelNode[];
  edges: IntelEdge[];
}

// Alias for compatibility
export type IntelGraphData = GraphData;

export interface GraphFilters {
  confidenceRange: [number, number];
  nodeTypes: string[];
  edgeTypes: string[];
  timeRange?: [Date, Date];
  searchQuery?: string;
}

export interface PhysicsSettings {
  charge: number;
  linkDistance: number;
  linkStrength: number;
  friction: number;
  alpha: number;
  alphaDecay: number;
  gravity: number;
  theta: number;
}

export interface IntelGraphProps {
  vault: VirtualFileSystem;
  initialGraph?: GraphData; // new optional injected graph data
  selectedFile?: VirtualFile | null;
  onFileSelect?: (file: VirtualFile) => void;
  onNodeSelect?: (node: IntelNode) => void;
  width?: number;
  height?: number;
  className?: string;
  /** Reports that arrived since IntelWeb opened, and how to add them (D-IW, IW3). */
  arrivals?: { count: number; onAdd: () => void } | null;
}

export const IntelGraph: React.FC<IntelGraphProps> = ({
  vault,
  initialGraph,
  selectedFile: _selectedFile,
  onFileSelect,
  onNodeSelect,
  width: _width = 800,
  height: _height = 600,
  className = '',
  arrivals
}) => {
  /**
   * The box the graph is actually DRAWN into — not the whole panel.
   *
   * GraphEngine2D sizes its SVG from this, and it used to point at the outer
   * container, which also holds the header and controls. Combined with that
   * container having no CSS rule at all, the sizing was circular: the container
   * was sized by its content, and its content included an SVG sized from the
   * container. Measured in a browser it settled at 840x150 inside a 673px-tall
   * pane — the graph using 22% of the space available to it.
   */
  const graphAreaRef = useRef<HTMLDivElement>(null);
  const [graphMode, setGraphMode] = useState<'2d' | '3d'>('2d'); // 3D disabled until engine implemented (Phase 4+)
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [fullGraph, setFullGraph] = useState<GraphData | null>(null); // base filtered graph prior to isolate
  const [activeGraph, setActiveGraph] = useState<GraphData | null>(null); // graph after isolate (or full)
  const [isolateState, setIsolateState] = useState<{ rootId: string | null; depth: number; active: boolean }>({ rootId: null, depth: 1, active: false });
  const [sizingMode, setSizingMode] = useState<'degree' | 'confidence'>('degree');
  const degreeCalcRef = useRef<string>('');
  const storageVersion = 'v1';
  const [filters, setFilters] = useState<GraphFilters>({
    // Removed classification filters for OSINT use
    confidenceRange: [0.3, 1.0],
    nodeTypes: [...NODE_TYPES],
    edgeTypes: ['reference', 'temporal', 'spatial']
  } as any);
  const [physics, setPhysics] = useState<PhysicsSettings>({
    charge: -300,
    linkDistance: 80,
    linkStrength: 0.1,
    friction: 0.9,
    alpha: 1,
    alphaDecay: 0.0228,
    gravity: 0.1,
    theta: 0.8
  });
  const [selectedNode, setSelectedNode] = useState<IntelNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<IntelEdge | null>(null);
  const [_highlightedNode, setHighlightedNode] = useState<string | null>(null);
  const [frozen, setFrozen] = useState(false);
  // How the notes are grouped (D-IW, IW8): country first, then as the reader last chose.
  const [groupBy, setGroupBy] = useState<Grouping>(() => {
    try {
      const saved = localStorage.getItem(GROUP_BY_KEY);
      return saved && (GROUPINGS as readonly string[]).includes(saved) ? saved as Grouping : 'country';
    } catch { return 'country'; }
  });
  useEffect(() => { try { localStorage.setItem(GROUP_BY_KEY, groupBy); } catch { /* not kept */ } }, [groupBy]);
  const clusters = useGraphClusters((activeGraph || graphData).nodes, groupBy);
  const { lang, m } = useMessages();
  // Collapsed clusters (IW9): more than 12 notes at first, then as the reader opens and closes them;
  // grouped another way, the rule again.
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  useEffect(() => { setToggled(new Map()); }, [groupBy]);
  const shown = useMemo(() => {
    const graph = activeGraph || graphData;
    const first = collapsedAtFirst(graph.nodes, clusters);
    const collapsed = new Set([...new Set(clusters.of.values())].filter((key) => toggled.get(key) ?? first.has(key)));
    const nameOf = (key: string) => clusters.names.get(key) ?? key;
    const out = collapseClusters(graph, clusters, collapsed,
      (key, n) => counted(m.intelWeb.clusterNotes, n, { name: nameOf(key) }));
    const hints = new Map([...clusters.names.keys()].map((key) => [key,
      fill(collapsed.has(key) ? m.intelWeb.openCluster : m.intelWeb.closeCluster, { name: nameOf(key) })]));
    return { data: out.data, clusters: { ...out.clusters, hints }, collapsed };
  }, [activeGraph, graphData, clusters, toggled, m]);
  const toggleCluster = useCallback((key: string) => {
    setToggled((was) => new Map(was).set(key, !shown.collapsed.has(key)));
  }, [shown]);
  // Colour by (IW12): assessment as the globe colours it, then as the reader last chose.
  const [colourBy, setColourBy] = useState<Colouring>(() => {
    try {
      const saved = localStorage.getItem(COLOUR_BY_KEY);
      return saved && (COLOURINGS as readonly string[]).includes(saved) ? saved as Colouring : 'assessment';
    } catch { return 'assessment'; }
  });
  useEffect(() => { try { localStorage.setItem(COLOUR_BY_KEY, colourBy); } catch { /* not kept */ } }, [colourBy]);
  // The layout (IW2): Clusters first, then as the reader last chose.
  const [layout, setLayout] = useState<GraphLayout>(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_KEY);
      return saved && (LAYOUTS as readonly string[]).includes(saved) ? saved as GraphLayout : 'clusters';
    } catch { return 'clusters'; }
  });
  useEffect(() => { try { localStorage.setItem(LAYOUT_KEY, layout); } catch { /* not kept */ } }, [layout]);
  // The Timeline (step 5): the notes only and the links between them, each across by when it happened,
  // a row for each group of the way they are grouped. Nothing collapses on it.
  const timelineView = useMemo((): { data: GraphData; timeline: GraphTimeline } | null => {
    if (layout !== 'timeline') return null;
    const graph = activeGraph || graphData;
    // Small, so the notes of one day stack in their row rather than spilling into the next.
    const notes = graph.nodes.filter((n) => n.type === 'report').map((n) => ({ ...n, size: 0 }));
    const ids = new Set(notes.map((n) => n.id));
    const endOf = (e: string | IntelNode) => (typeof e === 'string' ? e : e.id);
    const edges = graph.edges.filter((e) => ids.has(endOf(e.source)) && ids.has(endOf(e.target)));
    const rowOf = new Map(notes.map((n) => [n.id, clusters.of.get(n.id) ?? '']));
    const area = graphAreaRef.current;
    return {
      data: { nodes: notes, edges },
      timeline: {
        layout: timelineLayout(notes, rowOf, area?.clientWidth || 1000, area?.clientHeight || 600),
        rowNames: new Map([...clusters.names, ['', m.intelWeb.none[groupBy]]]),
        formatTime: (ms, withTime) => (withTime ? utcDateTimeIn(lang, ms, false) : utcDateIn(lang, ms, false)),
        untimedLabel: m.intelWeb.noTime,
        earlierLabel: (until) => fill(m.intelWeb.earlierTo, { when: utcDateIn(lang, until, true) }),
      },
    };
  }, [layout, activeGraph, graphData, clusters, groupBy, lang, m]);
  // The Map (step 6, IW13): the notes and their countries; each country's middle from the territories
  // the globe draws, and the world's borders under them, both read once the Map is chosen.
  const [centres, setCentres] = useState<ReadonlyMap<string, { lat: number; lng: number }> | null>(null);
  const [borders, setBorders] = useState<unknown | null>(null);
  useEffect(() => {
    if (layout !== 'map') return;
    let alive = true;
    if (!centres) {
      void nationalTerritoriesService.getCountryCentroids()
        .then((byIso3) => { if (alive) setCentres(byIso3); })
        .catch(() => { if (alive) setCentres(new Map()); });
    }
    if (!borders) {
      void fetch(MAP_BORDERS_URL).then((res) => (res.ok ? res.json() : null))
        .then((geo) => { if (alive && geo) setBorders(geo); })
        .catch(() => { /* drawn without them */ });
    }
    return () => { alive = false; };
  }, [layout, centres, borders]);
  const mapView = useMemo((): { data: GraphData; map: GraphMap } | null => {
    if (layout !== 'map' || !centres) return null;
    const graph = activeGraph || graphData;
    // Small, so a country's notes gather close around it.
    const candidates = graph.nodes.filter((n) => n.type === 'report' || n.type === 'country').map((n) => ({ ...n, size: 0 }));
    const centreOf = (iso2: string) => { const iso3 = iso2ToIso3(iso2.toUpperCase()); return iso3 ? centres.get(iso3) ?? null : null; };
    const placed = mapLayout(candidates, centreOf);
    // What has no place stays off the Map: a state's hub, whose middle is not known here, floated loose.
    const nodes = candidates.filter((n) => placed.places.has(n.id));
    const ids = new Set(nodes.map((n) => n.id));
    const endOf = (e: string | IntelNode) => (typeof e === 'string' ? e : e.id);
    const edges = graph.edges.filter((e) => ids.has(endOf(e.source)) && ids.has(endOf(e.target)));
    return { data: { nodes, edges }, map: { layout: placed, borders, unplacedLabel: m.intelWeb.noPlace } };
  }, [layout, centres, borders, activeGraph, graphData, m]);
  // The Radial (step 7, IW14): the node selected at the middle, else the most-linked hub; what it links
  // to one step out and two, in spokes by group. Selecting a node re-centres it.
  const radialView = useMemo((): { data: GraphData; radial: GraphRadial } | null => {
    if (layout !== 'radial') return null;
    const graph = activeGraph || graphData;
    if (!graph.nodes.length) return null;
    const endOf = (e: string | IntelNode) => (typeof e === 'string' ? e : e.id);
    const degree = new Map<string, number>();
    for (const e of graph.edges) for (const end of [endOf(e.source), endOf(e.target)]) degree.set(end, (degree.get(end) ?? 0) + 1);
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const hubs = graph.nodes.filter((n) => n.type !== 'report');
    const busiest = [...(hubs.length ? hubs : graph.nodes)].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.id.localeCompare(b.id))[0];
    const centre = selectedNode && byId.has(selectedNode.id) ? selectedNode.id : busiest.id;
    const groupOf = (id: string) => clusters.of.get(id) ?? (byId.get(id)?.type === 'report' ? '' : RADIAL_OTHERS);
    const placed = radialLayout(centre, graph.edges, groupOf, ['', RADIAL_OTHERS]);
    const nodes = graph.nodes.filter((n) => placed.places.has(n.id));
    const edges = graph.edges.filter((e) => placed.places.has(endOf(e.source)) && placed.places.has(endOf(e.target)));
    return {
      data: { nodes, edges },
      radial: { layout: placed, names: new Map([...clusters.names, ['', m.intelWeb.none[groupBy]], [RADIAL_OTHERS, m.intelWeb.colourOthers]]) },
    };
  }, [layout, activeGraph, graphData, selectedNode, clusters, groupBy, m]);
  const laidOut = timelineView ? timelineView.data : mapView ? mapView.data : radialView ? radialView.data : shown.data;
  const colours = useMemo(() => noteColours(laidOut.nodes, colourBy), [laidOut.nodes, colourBy]);
  // What a search matches (D-IW, step 3): by title, description or tag, as before; a collapsed cluster
  // holding a match matches too. The rest is dimmed, not removed.
  const query = (filters.searchQuery ?? '').trim().toLowerCase();
  const searched = useMemo(() => {
    if (!query) return null;
    const base = (activeGraph || graphData).nodes;
    const hit = new Set(base.filter((n) => n.title.toLowerCase().includes(query)
      || n.description?.toLowerCase().includes(query)
      || n.tags.some((tag) => tag.toLowerCase().includes(query))).map((n) => n.id));
    const matched = hit.size;
    for (const id of [...hit]) {
      const key = clusters.of.get(id);
      if (key !== undefined && shown.collapsed.has(key)) hit.add(clusterNodeId(key));
    }
    return { hit, matched, of: base.length };
  }, [query, activeGraph, graphData, clusters, shown]);
  // Isolate from the node selected, not a path typed (D-IW, step 3).
  const [isolateDepth, setIsolateDepth] = useState(1);
  const drawn = useMemo(() => ({
    ...laidOut,
    nodes: laidOut.nodes.map((n) => (colours.of.has(n.id) ? { ...n, color: colours.of.get(n.id) } : n)),
  }), [laidOut, colours]);

  // Persist/restore node positions (simple localStorage by file id)
  const POSITION_KEY = React.useMemo(() => {
    try {
      const ids = Array.from(vault.fileIndex.keys()).sort().join('|');
      let hash = 0;
      for (let i = 0; i < ids.length; i++) { hash = ((hash << 5) - hash) + ids.charCodeAt(i); hash |= 0; }
      return `intelweb:${storageVersion}:${hash}:positions`;
    } catch { return `intelweb:${storageVersion}:default:positions`; }
  }, [vault]);

  // migrate legacy key once
  useEffect(() => {
    try {
      const migrated = localStorage.getItem(`${POSITION_KEY}:migrated`);
      if (!migrated) {
        const legacyKey = POSITION_KEY.replace(`intelweb:${storageVersion}:`, 'intelweb.');
        const legacy = localStorage.getItem(legacyKey);
        if (legacy) {
          const existing = localStorage.getItem(POSITION_KEY);
          if (!existing) localStorage.setItem(POSITION_KEY, legacy);
          console.log('[IntelWeb] Migrated node positions to namespaced key');
        }
        localStorage.setItem(`${POSITION_KEY}:migrated`, '1');
      }
    } catch {}
  }, [POSITION_KEY]);

  const savePositions = useCallback((data: GraphData) => {
    const positions: Record<string, { x: number; y: number }> = {};
    data.nodes.forEach(n => {
      if (typeof n.x === 'number' && typeof n.y === 'number') positions[n.id] = { x: n.x, y: n.y };
    });
    try { localStorage.setItem(POSITION_KEY, JSON.stringify(positions)); } catch {}
  }, [POSITION_KEY]);

  const resetPositions = useCallback(() => {
    try { localStorage.removeItem(POSITION_KEY); } catch {}
    setFrozen(false);
    setGraphData(prev => ({ ...prev, nodes: prev.nodes.map(n => ({ ...n, fx: null, fy: null })) }));
  }, [POSITION_KEY]);

  const loadPositions = useCallback((): Record<string, { x: number; y: number }> => {
    try {
      const raw = localStorage.getItem(POSITION_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, [POSITION_KEY]);

  // Graph size limits for performance
  const MAX_NODES = 5000;
  const _MAX_EDGES = 10000;
  const _WARNING_THRESHOLD = 1000;

  // Convert VirtualFileSystem to graph data with size limits
  const convertVaultToGraph = useCallback((vault: VirtualFileSystem): GraphData => {
    const nodes: IntelNode[] = [];
    const edges: IntelEdge[] = [];
    const nodeMap = new Map<string, IntelNode>();
    const edgeSet = new Set<string>();

    const filesArray = Array.from(vault.fileIndex.values());
    if (filesArray.length > MAX_NODES) {
      console.warn(`Graph too large: ${filesArray.length} nodes exceeds limit of ${MAX_NODES}. Truncating...`);
    }
    const limitedFiles = filesArray.slice(0, MAX_NODES);

    // Create nodes from files
    limitedFiles.forEach((file) => {
      const nodeId = file.path;
      const stated = file.frontmatter?.type;
      const nodeType: IntelNodeType = (NODE_TYPES as readonly string[]).includes(stated) ? stated as IntelNodeType : 'report';

      // Removed classification handling

      const rawConfidence = file.frontmatter?.confidence;
      const confidence = typeof rawConfidence === 'number' && rawConfidence >= 0 && rawConfidence <= 1
        ? rawConfidence
        : (file.modifiedAt ? 0.8 : 0.5);

      const node: IntelNode = {
        id: nodeId,
        type: nodeType,
        // classification removed
        confidence,
        title: file.name,
        description: file.frontmatter?.description || '',
        // Placed by the event its frontmatter states, or when its record was written.
        // It was the file's modification time, which a vault built from the
        // workspace sets to the moment the vault was built, for every file alike.
        ...nodeTimeFields(frontmatterTime(file.frontmatter, file.modifiedAt)),
        location: file.frontmatter?.coordinates,
        tags: file.hashtags || [],
        metadata: file.frontmatter || {},
        file,
        color: getNodeColor(nodeType),
        size: Math.max(8, Math.min(20, (confidence * 15) + 5)),
        group: nodeType
      };

      nodes.push(node);
      nodeMap.set(nodeId, node);
    });

    // Prefer explicit relationshipGraph edges
    if (vault.relationshipGraph && vault.relationshipGraph.length > 0) {
      vault.relationshipGraph.forEach(relationship => {
        const sourceId = relationship.source;
        const targetId = relationship.target;
        const sourceNode = nodeMap.get(sourceId);
        const targetNode = nodeMap.get(targetId);
        if (!sourceNode || !targetNode) return;

        const predicate = (relationship.metadata && (relationship.metadata as any).predicate) as string | undefined;
        let edgeType: IntelEdge['type'] = 'reference';
        if (predicate === 'located_at' || predicate === 'observed_at') edgeType = 'spatial';
        else if (predicate === 'temporal' || predicate === 'occurred_at') edgeType = 'temporal';

        const edgeId = `${sourceId}-${targetId}-${predicate || relationship.type}`;
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          edges.push({
            id: edgeId,
            source: sourceId,
            target: targetId,
            type: edgeType,
            weight: relationship.strength || 0.5,
            confidence: Math.min(sourceNode.confidence, targetNode.confidence),
            metadata: relationship.metadata || {}
          });
        }
      });
    }

    // Add wikilink-derived edges only if not already present
    nodes.forEach(node => {
      const file = node.file!;
      if (typeof file.content !== 'string') return;
      const references = extractFileReferences(file.content, vault);
      references.forEach(refPath => {
        const targetNode = nodeMap.get(refPath);
        if (!targetNode || targetNode.id === node.id) return;
        const edgeId = `${node.id}->${targetNode.id}`;
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          edges.push({
            id: edgeId,
            source: node.id,
            target: targetNode.id,
            type: 'reference',
            weight: 0.5,
            confidence: Math.min(node.confidence, targetNode.confidence),
            metadata: { derivedFrom: 'wikilink' }
          });
        }
      });
    });

    console.log(`🔗 Graph created: ${nodes.length} nodes, ${edges.length} edges`);
    return { nodes, edges };
  }, []);

  // Filter graph data based on current filters
  const filterGraphData = useCallback((data: GraphData, filters: GraphFilters): GraphData => {
    const filteredNodes = data.nodes.filter(node => {
      if (node.confidence < filters.confidenceRange[0] || node.confidence > filters.confidenceRange[1]) return false;
      if (!filters.nodeTypes.includes(node.type)) return false;
      // A search no longer removes what does not match: it is dimmed in the engine (D-IW, step 3).
      // NOTE: Do NOT exclude nodes outside timeRange; they will be visually dimmed in engine (temporal context) instead of removed.
      // if (filters.timeRange && node.timestamp) {
      //   if (node.timestamp < filters.timeRange[0] || node.timestamp > filters.timeRange[1]) return false;
      // }
      return true;
    });

    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = data.edges.filter(edge => {
      const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
      const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;
      if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) return false;
      if (!filters.edgeTypes.includes(edge.type)) return false;
      if (edge.confidence < filters.confidenceRange[0] || edge.confidence > filters.confidenceRange[1]) return false;
      return true;
    });

    return { nodes: filteredNodes, edges: filteredEdges };
  }, []);

  // Compute graph when vault/filters change
  useEffect(() => {
    if (initialGraph) {
      console.log('[IntelWeb] Using injected initialGraph (bypassing vault conversion)');
      const filtered = filterGraphData(initialGraph, filters);
      setGraphData(filtered);
      setFullGraph(filtered);
      setActiveGraph(filtered); // initially same
      return;
    }
    const rawData = convertVaultToGraph(vault);
    const filteredData = filterGraphData(rawData, filters);
    setGraphData(filteredData);
    setFullGraph(filteredData);
    setActiveGraph(prev => (isolateState.active ? prev : filteredData)); // if isolate active, keep until recompute
  }, [vault, filters, convertVaultToGraph, filterGraphData, initialGraph, isolateState.active]);

  // Degree computation + sizing + metrics dispatch (after filtering)
  useEffect(() => {
    if (!graphData.nodes.length) return;
    const key = `${graphData.nodes.length}|${graphData.edges.length}|${filters.searchQuery || ''}|${filters.nodeTypes.join(',')}|${filters.edgeTypes.join(',')}`;
    if (degreeCalcRef.current === key) return; // avoid repeat on same dataset
    degreeCalcRef.current = key;

    const degreeMap = new Map<string, number>();
    graphData.edges.forEach(e => {
      const s = typeof e.source === 'string' ? e.source : e.source.id;
      const t = typeof e.target === 'string' ? e.target : e.target.id;
      degreeMap.set(s, (degreeMap.get(s) || 0) + 1);
      degreeMap.set(t, (degreeMap.get(t) || 0) + 1);
    });

    const updatedNodes = graphData.nodes.map(n => {
      const d = degreeMap.get(n.id) || 0;
      const base = 8;
      const k = 6;
      let size = base + Math.log2(d + 1) * k;
      size = Math.max(8, Math.min(34, size));
      const derivedSize = sizingMode === 'degree' ? size : Math.max(8, Math.min(34, 8 + (n.confidence * 26)));
      return { ...n, size: derivedSize, degree: d };
    });

    const degrees = Array.from(degreeMap.values());
    const minDegree = degrees.length ? Math.min(...degrees) : 0;
    const maxDegree = degrees.length ? Math.max(...degrees) : 0;
    const avgDegree = degrees.length ? degrees.reduce((a,b)=>a+b,0) / degrees.length : 0;
    const topNodes = [...graphData.nodes]
      .map(n => ({ id: n.id, title: n.title, degree: degreeMap.get(n.id) || 0 }))
      .sort((a,b) => b.degree - a.degree)
      .slice(0,5);

    setGraphData(prev => ({ ...prev, nodes: updatedNodes }));

    try {
      window.dispatchEvent(new CustomEvent('intelweb:graphMetrics', { detail: {
        minDegree, maxDegree, avgDegree, topNodes,
        nodeCount: graphData.nodes.length,
        edgeCount: graphData.edges.length
      }}));
    } catch {}
  }, [graphData, filters, sizingMode]);

  // Apply saved positions once nodes exist
  useEffect(() => {
    if (!graphData.nodes.length) return;
    const saved = loadPositions();
    if (!saved) return;
    setGraphData(prev => {
      const nodes = prev.nodes.map(n => {
        const p = saved[n.id];
        if (p) {
          return { ...n, x: p.x, y: p.y, fx: frozen ? p.x : n.fx, fy: frozen ? p.y : n.fy };
        }
        return n;
      });
      return { ...prev, nodes };
    });
  }, [graphData.nodes.length, frozen, loadPositions]);

  // Read graphData without depending on it — see the effect below for why.
  const graphDataRef = useRef(graphData);
  useEffect(() => { graphDataRef.current = graphData; }, [graphData]);

  // When toggling frozen, pin or release positions.
  //
  // This used to depend on `graphData` while unconditionally calling
  // setGraphData with a freshly-built object in BOTH branches, so every run
  // scheduled the next one — an unbounded render loop on the app's main
  // content pane, reached in one click. It looped even for an empty vault,
  // since [].map() still returns a new array. It also meant savePositions()
  // hammered localStorage once per iteration.
  //
  // Two independent guards, deliberately: the dep array no longer contains
  // the state this effect writes, AND applyFreezeState returns the identical
  // array when nothing actually changes so React bails out structurally. Either
  // alone would fix today's loop; keeping both means re-adding `graphData` to
  // the deps — the obvious careless edit — cannot reopen it.
  useEffect(() => {
    if (frozen) savePositions(graphDataRef.current);
    setGraphData(prev => {
      const nodes = applyFreezeState(prev.nodes, frozen);
      return nodes === prev.nodes ? prev : { ...prev, nodes };
    });
  }, [frozen, savePositions]);

  const applyIsolate = useCallback((rootId: string, depth: number) => {
    if (!fullGraph) return;
    const t0 = performance.now();
    const adj = new Map<string, Set<string>>();
    fullGraph.edges.forEach(e => {
      const s = typeof e.source === 'string' ? e.source : e.source.id;
      const t = typeof e.target === 'string' ? e.target : e.target.id;
      if (!adj.has(s)) adj.set(s, new Set());
      if (!adj.has(t)) adj.set(t, new Set());
      adj.get(s)!.add(t); adj.get(t)!.add(s);
    });
    const visited = new Set<string>();
    const queue: { id: string; d: number }[] = [{ id: rootId, d: 0 }];
    visited.add(rootId);
    while (queue.length) {
      const { id, d } = queue.shift()!;
      if (d >= depth) continue;
      const nbrs = adj.get(id);
      if (!nbrs) continue;
      for (const n of nbrs) {
        if (!visited.has(n)) { visited.add(n); queue.push({ id: n, d: d + 1 }); }
      }
    }
    const newNodes = fullGraph.nodes.filter(n => visited.has(n.id));
    const nodeSet = new Set(newNodes.map(n => n.id));
    const newEdges = fullGraph.edges.filter(e => {
      const s = typeof e.source === 'string' ? e.source : e.source.id;
      const t = typeof e.target === 'string' ? e.target : e.target.id;
      return nodeSet.has(s) && nodeSet.has(t);
    });
    const subGraph = { nodes: newNodes, edges: newEdges };
    setActiveGraph(subGraph);
    // Bail out when the isolate is already exactly this, or this self-triggers:
    // the effect below depends on `isolateState` and calls back into here, so a
    // fresh object literal every time is an unbounded loop. It is dormant only
    // because `active` defaults to false — reaching isolate mode once, via the
    // controls or the intelweb:requestIsolate event, is enough to enter it.
    setIsolateState(prev =>
      prev.active && prev.rootId === rootId && prev.depth === depth
        ? prev
        : { rootId, depth, active: true }
    );
    try { window.dispatchEvent(new CustomEvent('intelweb:isolateStateChanged', { detail: { rootId, depth, active: true } })); } catch {}
    const t1 = performance.now();
    const dt = t1 - t0;
    if (dt > 1) console.log(`[IntelWeb][Perf] BFS isolate root=${rootId} depth=${depth} took ${dt.toFixed(2)}ms (nodes=${newNodes.length} edges=${newEdges.length})`);
  }, [fullGraph]);

  const clearIsolate = useCallback(() => {
    if (fullGraph) setActiveGraph(fullGraph);
    setIsolateState({ rootId: null, depth: 1, active: false });
    try { window.dispatchEvent(new CustomEvent('intelweb:isolateStateChanged', { detail: { rootId: null, depth: 1, active: false } })); } catch {}
  }, [fullGraph]);

  // Isolate mode effects (after applyIsolate defined)
  useEffect(() => {
    if (!fullGraph || !isolateState.active) {
      setActiveGraph(fullGraph);
      return;
    }
    if (isolateState.rootId) applyIsolate(isolateState.rootId, isolateState.depth);
  }, [fullGraph, isolateState, applyIsolate]);

  // Event bridge for sidebar / other components to request isolate
  useEffect(() => {
    const handler = (e: any) => {
      const { rootId, depth } = e.detail || {};
      if (!rootId) return;
      applyIsolate(rootId, typeof depth === 'number' ? depth : 2);
    };
    const clearHandler = () => clearIsolate();
    window.addEventListener('intelweb:requestIsolate', handler);
    window.addEventListener('intelweb:clearIsolate', clearHandler);
    return () => {
      window.removeEventListener('intelweb:requestIsolate', handler);
      window.removeEventListener('intelweb:clearIsolate', clearHandler);
    };
  }, [applyIsolate, clearIsolate]);

  // Handlers
  const handleNodeClick = useCallback((node: IntelNode) => {
    setSelectedEdge(null);
    setSelectedNode(node);
    onNodeSelect?.(node);
    if (node.file && onFileSelect) onFileSelect(node.file);
    try {
      window.dispatchEvent(new CustomEvent('intelweb:nodeSelected', { detail: node }));
    } catch {}
  }, [onNodeSelect, onFileSelect]);

  const _handleNodeHover = useCallback((nodeId: string | null) => {
    setHighlightedNode(nodeId);
  }, []);

  const handleFiltersChange = useCallback((newFilters: GraphFilters) => setFilters(newFilters), []);
  const handlePhysicsChange = useCallback((newPhysics: PhysicsSettings) => setPhysics(newPhysics), []);
  const handleModeChange = useCallback((mode: '2D' | '3D') => setGraphMode(mode.toLowerCase() as '2d' | '3d'), []);

  // Memoised because GraphEngine2D depends on this identity to decide whether
  // to rebuild the whole SVG; a fresh array every render forced a teardown.
  const selectedNodes: IntelNode[] = useMemo(
    () => (selectedNode ? [selectedNode] : []),
    [selectedNode]
  );

  function extractFileReferences(content: string, vault: VirtualFileSystem): string[] {
    const references: string[] = [];
    
    // Look for Obsidian-style wikilinks: [[Entity Name]]
    const wikilinkMatches = content.match(/\[\[([^\]]+)\]\]/g);
    if (wikilinkMatches) {
      wikilinkMatches.forEach(link => {
        const match = link.match(/\[\[([^\]]+)\]\]/);
        if (match) {
          const entityName = match[1].trim();
          
          // Find file that matches this entity name (without .md extension)
          const matchingPath = Array.from(vault.fileIndex.keys()).find(filePath => {
            const fileName = filePath.split('/').pop()?.replace('.md', '');
            return fileName === entityName;
          });
          
          if (matchingPath) {
            references.push(matchingPath);
          }
        }
      });
    }
    
    // Look for markdown-style links: [text](path) - keep for other references
    const markdownLinks = content.match(/\[([^\]]+)\]\(([^)]+)\)/g);
    if (markdownLinks) {
      markdownLinks.forEach(link => {
        const match = link.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (match) {
          const path = match[2];
          if (vault.fileIndex.has(path)) {
            references.push(path);
          }
        }
      });
    }
    
    return [...new Set(references)]; // Remove duplicates
  }

  return (
    <div className={`intel-graph-container ${className}`}>
      <GraphContext.Provider value={{
        filters,
        setFilters,
        physics,
        setPhysics,
        graphMode,
        setGraphMode,
        frozen,
        setFrozen,
        nodeCount: (activeGraph || graphData).nodes.length,
        edgeCount: (activeGraph || graphData).edges.length,
        saveLayout: () => savePositions(graphData),
        resetLayout: resetPositions,
        timestamps: (activeGraph || graphData).nodes.map(n => n.timestamp).filter(Boolean) as Date[],
        // Of the nodes with a time, how many were placed by when their record was written (decision D-E).
        timedNodes: (activeGraph || graphData).nodes.filter(n => n.timestamp).length,
        placedByWritten: (activeGraph || graphData).nodes.filter(n => n.timeBasis === 'written').length,
        vaultHash: POSITION_KEY,
        fullGraph,
        activeGraph: activeGraph || graphData,
        isolateState,
        applyIsolate,
        clearIsolate,
        sizingMode,
        setSizingMode,
        searchMatches: searched ? { matched: searched.matched, of: searched.of } : null
      }}>
        {/* Header. In the flow, above the graph: absolutely placed, it had no
            positioned ancestor inside IntelWeb, so it spanned the whole app,
            over both sidebars' headers, and covered the graph's top 48 px
            (critique audit of 2026-10-01, section 7). */}
        <div style={{ position: 'relative', flexShrink: 0, minHeight: 48, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', rowGap: 6, padding: '6px 12px', background: 'var(--intel-bg-primary)', borderBottom: '1px solid var(--intel-border)', zIndex: 2, whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, color: 'var(--intel-text)' }}>Intel Graph</span>
            <span style={{ color: 'var(--intel-text-dim)', fontSize: '0.9rem' }}>{graphData.nodes.length} nodes · {graphData.edges.length} edges</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--intel-text-dim)', fontSize: '0.85rem' }}>
              {m.intelWeb.layout}
              <select value={layout} onChange={(e) => setLayout(e.target.value as GraphLayout)}>
                {LAYOUTS.map((l) => <option key={l} value={l}>{m.intelWeb.layouts[l]}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--intel-text-dim)', fontSize: '0.85rem' }}>
              {m.intelWeb.groupBy}
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as Grouping)}>
                {GROUPINGS.map((g) => <option key={g} value={g}>{m.intelWeb.groupings[g]}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--intel-text-dim)', fontSize: '0.85rem' }}>
              {m.intelWeb.colourBy}
              <select value={colourBy} onChange={(e) => setColourBy(e.target.value as Colouring)}>
                {COLOURINGS.map((c) => <option key={c} value={c}>{m.intelWeb.colourings[c]}</option>)}
              </select>
            </label>
            {arrivals && arrivals.count > 0 && (
              // Added only when the reader asks, so the layout never moves under them (IW3).
              <button onClick={arrivals.onAdd} data-testid="intelweb-arrivals">
                {`${counted(m.intelWeb.arrivals, arrivals.count)} · ${m.intelWeb.addThem}`}
              </button>
            )}
            {isolateState.active ? (
              <button onClick={clearIsolate}>{m.intelWeb.showAll}</button>
            ) : selectedNode && selectedNode.type !== 'cluster' && (
              <>
                <button onClick={() => applyIsolate(selectedNode.id, isolateDepth)}>{fill(m.intelWeb.isolateAround, { name: selectedNode.title })}</button>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--intel-text-dim)', fontSize: '0.85rem' }}>
                  {m.intelWeb.isolateSteps}
                  <select value={isolateDepth} onChange={(e) => setIsolateDepth(Number(e.target.value))}>
                    {[1, 2, 3].map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
              </>
            )}
            <button onClick={() => setFrozen(f => !f)} title={frozen ? 'Unfreeze layout' : 'Freeze layout'}>
              {frozen ? 'Unfreeze' : 'Freeze'}
            </button>
            <button onClick={() => savePositions(graphData)} title="Save layout">Save</button>
            <button onClick={resetPositions} title="Reset layout">Reset</button>
          </div>
        </div>

        {/* Controls */}
        <GraphControls />
        {/* Graph Engine */}
        <div ref={graphAreaRef} className="graph-engine-wrapper">
          {graphMode === '2d' && (
            <GraphEngine2D
              containerRef={graphAreaRef}
              data={drawn}
              /* The Time Window's range. It was never passed, so the engine's dimming never ran. */
              timeRange={filters.timeRange}
              physics={physics}
              selectedNodes={selectedNodes}
              selectedFile={_selectedFile}
              onNodeClick={(node) => (node.type === 'cluster' ? toggleCluster(String(node.metadata.cluster)) : handleNodeClick(node))}
              clusters={timelineView || mapView || radialView ? undefined : shown.clusters}
              radial={radialView?.radial ?? null}
              timeline={timelineView?.timeline ?? null}
              map={mapView?.map ?? null}
              highlight={searched?.hit ?? null}
              onClusterClick={toggleCluster}
              onEdgeClick={(edge) => { setSelectedNode(null); setSelectedEdge(edge); try { window.dispatchEvent(new CustomEvent('intelweb:edgeSelected', { detail: edge })); } catch {} }}
            />
          )}
          {colours.key.length > 0 && <ColourKey by={colourBy} entries={colours.key} />}
          {graphMode === '3d' && (
            <div className="graph-3d-placeholder">3D mode coming soon…</div>
          )}
        </div>
      </GraphContext.Provider>
    </div>
  );
};

/** A colour for each kind. A stub is grey: named, and not held here. */
const NODE_COLORS: Record<IntelNodeType, string> = {
  report: '#4CAF50',
  entity: '#2196F3',
  location: '#FF9800',
  event: '#9C27B0',
  source: '#607D8B',
  country: '#FFC107',
  tag: '#00BCD4',
  publisher: '#8D6E63',
  mission: '#E91E63',
  stub: '#9E9E9E',
  // A collapsed cluster in the heading text's colour, apart from every kind of node it holds.
  cluster: ROLES.text.heading,
};

// Helper functions
function getNodeColor(type: IntelNodeType): string {
  return NODE_COLORS[type] ?? NODE_COLORS.stub;
}

function extractFileReferences(content: string, vault: VirtualFileSystem): string[] {
  const references: string[] = [];
  
  // Look for Obsidian-style wikilinks: [[Entity Name]]
  const wikilinkMatches = content.match(/\[\[([^\]]+)\]\]/g);
  if (wikilinkMatches) {
    wikilinkMatches.forEach(link => {
      const match = link.match(/\[\[([^\]]+)\]\]/);
      if (match) {
        const entityName = match[1].trim();
        
        // Find file that matches this entity name (without .md extension)
        const matchingPath = Array.from(vault.fileIndex.keys()).find(filePath => {
          const fileName = filePath.split('/').pop()?.replace('.md', '');
          return fileName === entityName;
        });
        
        if (matchingPath) {
          references.push(matchingPath);
        }
      }
    });
  }
  
  // Look for markdown-style links: [text](path) - keep for other references
  const markdownLinks = content.match(/\[([^\]]+)\]\(([^)]+)\)/g);
  if (markdownLinks) {
    markdownLinks.forEach(link => {
      const match = link.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (match) {
        const path = match[2];
        if (vault.fileIndex.has(path)) {
          references.push(path);
        }
      }
    });
  }
  
  return [...new Set(references)]; // Remove duplicates
}

export default IntelGraph;
