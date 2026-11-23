import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useGlobalCommand } from '../../../hooks/useUnifiedGlobalCommand';
import { useNodeWebData } from '../../../core/intel/hooks/useNodeWebData';
import type { NodeWebNode, NodeWebEdge } from '../../../core/intel/adapters/nodeWebAdapter';
import styles from './NodeGraphView.module.css';
import { createLogger } from '@utils/logger';
import { FONTS } from '../../../styles/tokens';
const log = createLogger({ prefix: 'NodeGraphView' });

interface NodeGraphViewProps {
  className?: string;
  fullscreen?: boolean;
  /** Inside a floating panel, whose header already names it. See TimelineView's `framed`. */
  framed?: boolean;
}

/** Internal positioned node for canvas rendering */
interface PositionedNode {
  id: string;
  x: number;
  y: number;
  type: string;
  label: string;
  size: number;
  color: string;
}

/** Internal edge for canvas rendering */
interface PositionedEdge {
  from: string;
  to: string;
  type: string;
  strength: number;
  label?: string;
}

// Type → color mapping for node visualization
const NODE_TYPE_COLORS: Record<string, string> = {
  entity: '#ff3333',
  event: '#ff6600',
  location: '#3366ff',
  system: '#00ff88',
  threat: '#ff0066',
  email: '#e040fb',
  domain: '#29b6f6',
  technology: '#66bb6a',
  social: '#ffa726',
  server: '#78909c',
  intel: '#00ffff',
  node: '#00e5ff',
};

// Edge type → color mapping
const EDGE_TYPE_COLORS: Record<string, string> = {
  related: '#66ccff',
  causes: '#ff6666',
  located_at: '#66ff66',
  communicates: '#ffff66',
  correlation: '#66ccff',
  'domain-correlation': '#29b6f6',
  'infrastructure-correlation': '#66bb6a',
  'lineage-correlation': '#ffa726',
};

/** Convert NodeWebNode[] to positioned nodes using force-directed-like layout */
function layoutNodes(webNodes: NodeWebNode[], width: number, height: number): PositionedNode[] {
  if (webNodes.length === 0) return [];

  const margin = 80;
  const usableW = width - margin * 2;
  const usableH = height - margin * 2;

  return webNodes.map((n, i) => {
    // Use stored coordinates if available, otherwise distribute in a circle
    const angle = (2 * Math.PI * i) / webNodes.length;
    const radius = Math.min(usableW, usableH) * 0.35;
    const cx = width / 2;
    const cy = height / 2;

    return {
      id: n.id,
      x: n.x ?? cx + radius * Math.cos(angle),
      y: n.y ?? cy + radius * Math.sin(angle),
      type: n.type || 'intel',
      label: n.label || n.id,
      size: n.size ?? 20,
      color: n.color || NODE_TYPE_COLORS[n.type] || NODE_TYPE_COLORS.intel,
    };
  });
}

/** Convert NodeWebEdge[] to positioned edges with normalized strength */
function layoutEdges(webEdges: NodeWebEdge[]): PositionedEdge[] {
  return webEdges.map(e => ({
    from: e.from,
    to: e.to,
    type: e.type || 'related',
    strength: e.width ? Math.min(1, e.width / 4) : 0.6,
    label: e.label,
  }));
}

const NodeGraphView: React.FC<NodeGraphViewProps> = ({ className, fullscreen, framed = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state } = useGlobalCommand();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // --- Fetch real intel data from Intel Data Core ---
  const { graph, stats, loading, error, readAt, refreshData } = useNodeWebData();

  // Derive positioned nodes/edges for rendering
  const positionedNodes = useMemo(
    () => layoutNodes(graph.nodes, 800, 500),
    [graph.nodes]
  );
  const positionedEdges = useMemo(
    () => layoutEdges(graph.edges),
    [graph.edges]
  );

  // Determine active legend entries from actual data
  const activeLegendTypes = useMemo(() => {
    const seen = new Map<string, string>();
    positionedNodes.forEach(n => {
      if (!seen.has(n.type)) seen.set(n.type, n.color);
    });
    return Array.from(seen.entries()).map(([type, color]) => ({
      type,
      label: type.toUpperCase(),
      color,
    }));
  }, [positionedNodes]);

  // ─── Canvas drawing ────────────────────────────────────────────
  const drawNodeGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = 'rgba(0, 10, 20, 0.9)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    const gridSize = 50;
    for (let gx = 0; gx < canvas.width; gx += gridSize) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, canvas.height); ctx.stroke();
    }
    for (let gy = 0; gy < canvas.height; gy += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(canvas.width, gy); ctx.stroke();
    }

    // Empty-state message
    if (positionedNodes.length === 0) {
      ctx.fillStyle = 'rgba(0, 255, 255, 0.4)';
      ctx.font = `14px ${FONTS.data}`;
      ctx.textAlign = 'center';
      ctx.fillText(
        // What is known, and no guessed remedy (plan item 8.3, block B2).
        loading ? 'LOADING INTEL DATA...' : error ? 'COULD NOT READ INTEL ENTITIES' : 'NO INTEL ENTITIES YET',
        canvas.width / 2,
        canvas.height / 2
      );
      // Title, unless a panel's header already carries it.
      if (!framed) {
        ctx.fillStyle = '#00ffff';
        ctx.font = `bold 16px ${FONTS.data}`;
        ctx.fillText('NODE GRAPH ANALYSIS', canvas.width / 2, 30);
      }
      return;
    }

    // Edges
    positionedEdges.forEach(edge => {
      const fromNode = positionedNodes.find(n => n.id === edge.from);
      const toNode = positionedNodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) return;

      ctx.strokeStyle = EDGE_TYPE_COLORS[edge.type] || '#ffffff';
      ctx.lineWidth = edge.strength * 3;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(fromNode.x, fromNode.y);
      ctx.lineTo(toNode.x, toNode.y);
      ctx.stroke();

      if (edge.label) {
        const midX = (fromNode.x + toNode.x) / 2;
        const midY = (fromNode.y + toNode.y) / 2;
        ctx.fillStyle = '#ffffff';
        ctx.font = `10px ${FONTS.data}`;
        ctx.textAlign = 'center';
        ctx.globalAlpha = 0.8;
        ctx.fillText(edge.label, midX, midY);
      }
      ctx.globalAlpha = 1;
    });

    // Nodes
    positionedNodes.forEach(node => {
      const isSelected = node.id === selectedNodeId;

      // Selection ring
      if (isSelected) {
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.size + 5, 0, 2 * Math.PI);
        ctx.stroke();
      }

      ctx.fillStyle = node.color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.size, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Icon
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 12px ${FONTS.data}`;
      ctx.textAlign = 'center';
      ctx.fillText(getNodeIcon(node.type), node.x, node.y + 4);

      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = `11px ${FONTS.data}`;
      ctx.textAlign = 'center';
      const displayLabel = node.label.length > 20 ? node.label.slice(0, 17) + '...' : node.label;
      ctx.fillText(displayLabel, node.x, node.y + node.size + 15);

      // Type
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = `9px ${FONTS.data}`;
      ctx.fillText(node.type.toUpperCase(), node.x, node.y + node.size + 28);
    });

    // Title, unless a panel's header already carries it.
    if (!framed) {
      ctx.fillStyle = '#00ffff';
      ctx.font = `bold 16px ${FONTS.data}`;
      ctx.textAlign = 'center';
      ctx.fillText('NODE GRAPH ANALYSIS', canvas.width / 2, 30);
    }

    // Dynamic legend
    if (activeLegendTypes.length > 0) {
      drawLegend(ctx, canvas.width - 200, 50, activeLegendTypes);
    }
  }, [positionedNodes, positionedEdges, activeLegendTypes, loading, error, selectedNodeId, framed]);

  const getNodeIcon = (type: string): string => {
    switch (type) {
      case 'entity': return '◉';
      case 'event': return '⚡';
      case 'location': return '📍';
      case 'system': return '⚙';
      case 'threat': return '⚠';
      case 'email': return '✉';
      case 'domain': return '🌐';
      case 'technology': return '💻';
      case 'social': return '👤';
      case 'server': return '🖥';
      default: return '●';
    }
  };

  const drawLegend = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    items: { type: string; label: string; color: string }[]
  ) => {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x - 10, y - 10, 180, items.length * 20 + 20);
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 10, y - 10, 180, items.length * 20 + 20);

    ctx.fillStyle = '#00ffff';
    ctx.font = `bold 12px ${FONTS.data}`;
    ctx.textAlign = 'left';
    ctx.fillText('NODE TYPES', x, y);

    items.forEach((item, index) => {
      const itemY = y + 20 + index * 20;
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(x + 10, itemY, 6, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `10px ${FONTS.data}`;
      ctx.fillText(item.label, x + 25, itemY + 4);
    });
  };

  // Redraw whenever data changes
  useEffect(() => {
    drawNodeGraph();
  }, [drawNodeGraph]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const clickedNode = positionedNodes.find(node => {
      const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
      return distance <= node.size;
    });

    if (clickedNode) {
      log.debug('Node clicked:', clickedNode);
      setSelectedNodeId(prev => prev === clickedNode.id ? null : clickedNode.id);
    } else {
      setSelectedNodeId(null);
    }
  };

  return (
    <div className={`${styles.nodeGraphView} ${fullscreen ? styles.fullscreen : ''} ${framed ? styles.framed : ''} ${className || ''}`}>
      <div className={styles.header}>
        {!framed && (
          <h2 className={styles.title}>
            <span className={styles.icon}>🕸</span>
            Intelligence Node Graph
          </h2>
        )}
        <div className={styles.controls}>
          <button className={styles.controlBtn} onClick={() => refreshData()} title="Refresh data">
            SYNC
          </button>
          <button className={styles.controlBtn}>FORCE</button>
          <button className={styles.controlBtn}>HIER</button>
          <button className={styles.controlBtn}>CIRC</button>
          <button className={styles.controlBtn}>GRID</button>
        </div>
      </div>

      <div className={styles.canvasContainer}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          width={800}
          height={500}
          onClick={handleCanvasClick}
        />

        <div className={styles.overlay}>
          <div className={styles.contextInfo}>
            Context: {state.enhanced?.primaryContextId || 'GLOBAL'}
          </div>
          <div className={styles.stats}>
            <div>Nodes: {stats.totalNodes}</div>
            <div>Edges: {stats.totalEdges}</div>
            {loading && <div style={{ color: '#ffff00' }}>SYNCING...</div>}
            {error && <div style={{ color: '#ff3333' }}>ERR</div>}
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.algorithm}>
          LAYOUT: Force-Directed
          {Object.keys(stats.nodeTypes).length > 0 && (
            <> | TYPES: {Object.entries(stats.nodeTypes).map(([t, c]) => `${t}(${c})`).join(' ')}</>
          )}
        </div>
        <div className={styles.status}>
          {/* When it read, not "GRAPH LIVE": it reads once, when opened. "ZOOM: 100%"
              beside it named a zoom nothing changes. */}
          {loading ? 'LOADING...' : error ? 'COULD NOT READ' : readAt !== null ? `READ ${new Date(readAt).toISOString().slice(11, 16)}Z` : 'NOT READ YET'}
        </div>
      </div>
    </div>
  );
};

export default NodeGraphView;
