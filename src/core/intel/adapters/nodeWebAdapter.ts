/**
 * NodeWebAdapter - Adapter for NodeWeb visualization
 *
 * Backed by the unified Intel substrate (services/intel/IntelWorkspaceManager
 * + IntelRelationshipService) instead of core/intel's storageOrchestrator/
 * intelDataStore. NodeWeb previously had zero real persistence — its graph
 * was rebuilt from whatever happened to be in memory each session and
 * evaporated on reload. Nodes are IntelItemUI records (a node IS an intel
 * item — this adapter just presents it for graph display); edges are the
 * IntelRelationshipUI records added in this same phase, the one concept the
 * canonical substrate had no equivalent for before now.
 *
 * Public API (types and method signatures) is unchanged from the previous
 * storageOrchestrator-backed version, so useNodeWebData.ts and
 * NodeGraphView.tsx need no changes.
 */

import {
  intelWorkspaceManager
} from '../../../services/intel/IntelWorkspaceManager';
import type { IntelItemUI, CreateIntelItemInput } from '../../../types/intel/IntelItemUI';
import type { IntelRelationshipUI } from '../../../types/intel/IntelRelationship';
import {
  NodeEntity,
  EdgeRelationship
} from '../types/intelDataModels';

// Types for NodeWeb visualization component (unchanged)
export interface NodeWebNode {
  id: string;
  label: string;
  type: string;
  group?: string;
  size?: number;
  color?: string;
  icon?: string;
  shape?: string;
  title?: string;
  x?: number;
  y?: number;
  properties: Record<string, any>;
  metadata: Record<string, any>;
  tags: string[];
}

export interface NodeWebEdge {
  id: string;
  from: string;
  to: string;
  type: string;
  label?: string;
  width?: number;
  color?: string;
  dashes?: boolean;
  arrows?: {
    to?: boolean;
    from?: boolean;
  };
  metadata: Record<string, any>;
  tags: string[];
}

export interface NodeWebGraph {
  nodes: NodeWebNode[];
  edges: NodeWebEdge[];
}

export interface NodeWebStats {
  totalNodes: number;
  totalEdges: number;
  nodeTypes: Record<string, number>;
  edgeTypes: Record<string, number>;
}

export interface NodeWebFilter {
  property: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan';
  value: any;
}

// Color map keyed by the free-form IntelItemUI.type string. Node "types" in
// this substrate aren't a closed enum (IntelItemUI.type is deliberately
// free-form — "e.g. INDICATOR, OBSERVATION, EVENT" per its own doc comment),
// so this covers the common System-A-era categories and falls back to a
// neutral color for anything else, rather than requiring a fixed enum.
const NODE_TYPE_COLORS: Record<string, string> = {
  PERSON: '#3498db',
  ORGANIZATION: '#9b59b6',
  LOCATION: '#2ecc71',
  EVENT: '#e67e22',
  IP_ADDRESS: '#1abc9c',
  DOMAIN: '#16a085',
  FILE: '#95a5a6',
  MALWARE: '#c0392b',
  THREAT_ACTOR: '#e74c3c',
  SYSTEM: '#34495e',
  VULNERABILITY: '#f39c12',
  CUSTOM: '#7f8c8d'
};

/**
 * NodeWeb adapter class, backed by the unified Intel substrate.
 */
export class NodeWebAdapter {
  /**
   * Fetch graph data based on filters
   */
  async getGraphData(filters?: NodeWebFilter[]): Promise<NodeWebGraph> {
    try {
      await intelWorkspaceManager.ensureInitialized();

      const items = intelWorkspaceManager.getIntelItems();
      const filteredItems = filters && filters.length > 0
        ? items.filter(item => this.matchesFilters(item, filters))
        : items;
      const nodeIds = new Set(filteredItems.map(item => item.id));

      // Only include relationships where both endpoints are in our filtered node set.
      const allRelationships = intelWorkspaceManager.getRelationships();
      const relevantRelationships = allRelationships.filter(
        rel => nodeIds.has(rel.sourceId) && nodeIds.has(rel.targetId)
      );

      return {
        nodes: filteredItems.map(item => this.transformItemToNodeWebNode(item)),
        edges: relevantRelationships.map(rel => this.transformRelationshipToNodeWebEdge(rel))
      };
    } catch (error) {
      console.error('Error in getGraphData:', error);
      return { nodes: [], edges: [] };
    }
  }

  /**
   * Get statistics about the current graph
   */
  async getGraphStats(filters?: NodeWebFilter[]): Promise<NodeWebStats> {
    try {
      const graph = await this.getGraphData(filters);

      const nodeTypes: Record<string, number> = {};
      const edgeTypes: Record<string, number> = {};

      graph.nodes.forEach(node => {
        nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
      });

      graph.edges.forEach(edge => {
        edgeTypes[edge.type] = (edgeTypes[edge.type] || 0) + 1;
      });

      return {
        totalNodes: graph.nodes.length,
        totalEdges: graph.edges.length,
        nodeTypes,
        edgeTypes
      };
    } catch (error) {
      console.error('Error in getGraphStats:', error);
      return {
        totalNodes: 0,
        totalEdges: 0,
        nodeTypes: {},
        edgeTypes: {}
      };
    }
  }

  /**
   * Add a node to the graph. Accepts the same Partial<NodeEntity> shape the
   * previous storageOrchestrator-backed adapter did (so callers don't need
   * to change), mapped onto a real IntelItemUI underneath.
   */
  async addNode(nodeData: Partial<NodeEntity>): Promise<string | null> {
    try {
      await intelWorkspaceManager.ensureInitialized();
      const input: CreateIntelItemInput = {
        title: nodeData.title || 'Untitled Node',
        type: nodeData.nodeType || 'CUSTOM',
        // Was a cast from NodeEntity's 7-value ClassificationLevel down to
        // the canonical 4-value type, with `?? 'UNCLASSIFIED'` behind it —
        // itself a fix for an earlier version that hardcoded 'UNCLASSIFIED'
        // and dropped whatever the caller passed. Both ladders are gone; the
        // axes are the same type on both sides, so no cast and no default.
        visibility: nodeData.visibility,
        sensitivity: nodeData.sensitivity,
        source: nodeData.source || 'nodeweb',
        // IntelItemUI's reliability scale is A-F; the source NodeEntity type
        // also allows 'X' (deliberate deception suspected) — map that down
        // to 'F' (cannot be judged) rather than widening the canonical scale
        // for one caller's edge case.
        reliability: nodeData.reliability && nodeData.reliability !== 'X' ? nodeData.reliability : 'F',
        confidence: typeof nodeData.confidence === 'number' ? nodeData.confidence / 100 : 0.5,
        tags: nodeData.tags || [],
        categories: [],
        latitude: nodeData.coordinates?.latitude,
        longitude: nodeData.coordinates?.longitude,
        content: nodeData.description || '',
        verified: nodeData.verified ?? false
      };
      const created = intelWorkspaceManager.addIntelItem(input);
      return created.id;
    } catch (error) {
      console.error('Error adding node:', error);
      return null;
    }
  }

  /**
   * Add an edge to the graph.
   */
  async addEdge(edgeData: Partial<EdgeRelationship>): Promise<string | null> {
    try {
      await intelWorkspaceManager.ensureInitialized();
      if (!edgeData.sourceId || !edgeData.targetId) {
        console.error('Error adding edge: sourceId and targetId are required');
        return null;
      }
      const created = intelWorkspaceManager.addRelationship({
        type: edgeData.type || 'related',
        sourceId: edgeData.sourceId,
        targetId: edgeData.targetId,
        confidence: edgeData.confidence,
        strength: edgeData.strength,
        direction: edgeData.direction,
        timeframe: edgeData.timeframe,
        tags: edgeData.tags,
        metadata: edgeData.metadata,
        // A stated author is carried, so writing it touches no signing identity.
        createdBy: edgeData.createdBy
      });
      return created.id;
    } catch (error) {
      console.error('Error adding edge:', error);
      return null;
    }
  }

  /**
   * Update a node in the graph
   */
  async updateNode(id: string, updates: Partial<NodeEntity>): Promise<boolean> {
    try {
      await intelWorkspaceManager.ensureInitialized();
      const existing = intelWorkspaceManager.getIntelItem(id);
      if (!existing) return false;
      const updated: IntelItemUI = {
        ...existing,
        title: updates.title ?? existing.title,
        type: updates.nodeType ?? existing.type,
        tags: updates.tags ?? existing.tags,
        content: updates.description ?? existing.content,
        verified: updates.verified ?? existing.verified
      };
      intelWorkspaceManager.updateIntelItem(updated);
      return true;
    } catch (error) {
      console.error('Error updating node:', error);
      return false;
    }
  }

  /**
   * Delete a node from the graph. Also removes any relationships that
   * reference it, so the graph never carries a dangling edge.
   */
  async deleteNode(id: string): Promise<boolean> {
    try {
      await intelWorkspaceManager.ensureInitialized();
      const orphanedRelationships = intelWorkspaceManager.getRelationshipsForEntity(id);
      orphanedRelationships.forEach(rel => intelWorkspaceManager.removeRelationship(rel.id));

      // IntelWorkspaceManager has no generic "remove item" — items are
      // append/update-oriented (see updateIntelItem). Node deletion for a
      // real item-backed graph is a reasonable follow-up; for now this
      // adapter honestly reports what it can't yet do rather than silently
      // no-op-ing on the item itself while still cleaning up edges above.
      console.warn(`deleteNode(${id}): edges removed; IntelWorkspaceManager does not yet support removing an intel item itself.`);
      return orphanedRelationships.length > 0;
    } catch (error) {
      console.error('Error deleting node:', error);
      return false;
    }
  }

  /**
   * Transform an IntelItemUI to NodeWebNode format
   */
  private transformItemToNodeWebNode(item: IntelItemUI): NodeWebNode {
    return {
      id: item.id,
      label: item.title || item.id,
      type: item.type,
      group: item.type,
      size: 25,
      color: NODE_TYPE_COLORS[item.type] || NODE_TYPE_COLORS.CUSTOM,
      shape: 'circle',
      title: item.content || item.source,
      properties: {
        visibility: item.visibility,
        sensitivity: item.sensitivity,
        reliability: item.reliability,
        confidence: item.confidence,
        source: item.source
      },
      metadata: {
        verified: item.verified,
        version: item.version
      },
      tags: item.tags || []
    };
  }

  /**
   * Transform an IntelRelationshipUI to NodeWebEdge format
   */
  private transformRelationshipToNodeWebEdge(rel: IntelRelationshipUI): NodeWebEdge {
    return {
      id: rel.id,
      from: rel.sourceId,
      to: rel.targetId,
      type: rel.type,
      label: rel.type,
      width: rel.strength ? rel.strength / 10 : 1,
      dashes: false,
      arrows: {
        to: rel.direction === 'unidirectional',
        from: rel.direction === 'bidirectional'
      },
      metadata: rel.metadata || {},
      tags: rel.tags || []
    };
  }

  /**
   * Evaluate NodeWeb filters in-memory against an IntelItemUI. Mirrors
   * timelineAdapter's matchesTimelineFilters pattern — filtering happens
   * client-side rather than being pushed down into a query layer.
   */
  private matchesFilters(item: IntelItemUI, filters: NodeWebFilter[]): boolean {
    return filters.every(filter => {
      const value = (item as unknown as Record<string, unknown>)[filter.property];
      switch (filter.operator) {
        case 'equals': return value === filter.value;
        case 'contains': return typeof value === 'string' && value.includes(String(filter.value));
        case 'startsWith': return typeof value === 'string' && value.startsWith(String(filter.value));
        case 'endsWith': return typeof value === 'string' && value.endsWith(String(filter.value));
        case 'greaterThan': return typeof value === 'number' && value > filter.value;
        case 'lessThan': return typeof value === 'number' && value < filter.value;
        default: return true;
      }
    });
  }
}

// Export a singleton instance
export const nodeWebAdapter = new NodeWebAdapter();
