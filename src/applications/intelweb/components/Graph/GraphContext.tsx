import React, { createContext, useContext } from 'react';
import type { GraphFilters, PhysicsSettings, GraphData } from './IntelGraph';

export interface IsolateState {
  rootId: string | null;
  depth: number;
  active: boolean;
}

export interface GraphContextValue {
  filters: GraphFilters;
  setFilters: (f: GraphFilters) => void;
  physics: PhysicsSettings;
  setPhysics: (p: PhysicsSettings) => void;
  graphMode: '2d' | '3d';
  setGraphMode: (m: '2d' | '3d') => void;
  frozen: boolean;
  setFrozen: (f: boolean) => void;
  nodeCount: number;
  edgeCount: number;
  saveLayout?: () => void;
  resetLayout?: () => void;
  timestamps?: Date[];
  /** Nodes with a time, and how many of them were placed by when their record was written (decision D-E). */
  timedNodes?: number;
  placedByWritten?: number;
  vaultHash: string;
  fullGraph: GraphData | null; // filtered base graph (no isolate)
  activeGraph: GraphData | null; // graph currently rendered (isolate or full)
  isolateState: IsolateState;
  applyIsolate: (rootId: string, depth: number) => void;
  clearIsolate: () => void;
  sizingMode: 'degree' | 'confidence';
  setSizingMode: (m: 'degree' | 'confidence') => void;
  /** How many nodes a search matches, of how many drawn; null with nothing searched (D-IW, step 3). */
  searchMatches?: { matched: number; of: number } | null;
}

export const GraphContext = createContext<GraphContextValue | undefined>(undefined);

export const useGraphContext = (): GraphContextValue => {
  const ctx = useContext(GraphContext);
  if (!ctx) throw new Error('useGraphContext must be used within GraphContext provider');
  return ctx;
};
