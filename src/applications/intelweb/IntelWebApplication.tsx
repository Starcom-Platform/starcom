/**
 * IntelWeb Implementation Starting Point
 * 
 * Phase 2 First: Vault System Foundation
 * Ready to begin development
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { IntelReportPackage } from '../../types/IntelReportPackage';
import { VirtualFileSystem, VirtualFile } from '../../types/DataPack';
import { VirtualFileSystemManager } from '../../services/VirtualFileSystemManager';
import { IntelGraph } from './components/Graph/IntelGraph';
import GraphErrorBoundary from './components/ErrorBoundary/GraphErrorBoundary';
import { IntelWebLeftSideBar } from './components/IntelWebLeftSideBar';
import { IntelWebRightSideBar } from './components/IntelWebRightSideBar';
import '../../utils/intelligenceMarkdown.css';
import './components/ErrorBoundary/GraphErrorBoundary.css';

// There used to be a `packageId?: string` here, forwarded by the wrapper with
// a type guard and never destructured by this component — no caller passed it
// and nothing read it. It read as a working deep-link intake in review, which
// is why it is called out rather than quietly deleted: a real deep-link into
// IntelWeb needs a report/node target and a selection effect, neither of which
// this prop was. See docs/missions/04-plan/cross-app-affordances.md.
interface IntelWebApplicationProps {
  initialPackage?: IntelReportPackage;
  // New: allow direct injection of a prepared VirtualFileSystem
  initialVault?: VirtualFileSystem;
  /** Vault path to open on arrival, already resolved from a report id. */
  initialPath?: string;
  /** The deep-link named a report this vault does not contain. */
  targetNotFound?: boolean;
  /** Reports that arrived since it opened, and how to add them (D-IW, IW3). */
  arrivals?: { count: number; onAdd: () => void } | null;
}

interface IntelWebState {
  currentPackage: IntelReportPackage | null;
  vault: VirtualFileSystem | null;
  selectedFile: VirtualFile | null;
  rightSidebarTab: 'graph' | 'file' | 'metadata' | 'node' | 'edge';
  loading: boolean;
  error: string | null;
}

export const IntelWebApplication: React.FC<IntelWebApplicationProps> = ({
  initialPackage,
  initialVault,
  initialPath,
  targetNotFound,
  arrivals
}) => {
  /**
   * Arriving via deep-link opens the target once, and only once.
   *
   * Guarded by a ref rather than a dependency list: re-selecting on every vault
   * change would yank the user back to the linked file after they navigated
   * away, which reads as the app fighting them.
   */
  const deepLinkApplied = useRef(false);

  const [state, setState] = useState<IntelWebState>({
    currentPackage: null,
    vault: initialVault || null,
    selectedFile: null,
    rightSidebarTab: 'graph',
    loading: false, // Start with loading false, only set to true when actually loading a package
    error: null
  });

  // Phase 2 Week 1: Basic package loading with AbortController and mount safety
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // If an initialVault arrives later, set it
  useEffect(() => {
    if (initialVault) {
      setState(prev => ({ ...prev, vault: initialVault, loading: false, error: null }));
    }
  }, [initialVault]);

  /**
   * Open the deep-linked file once the vault holding it exists.
   *
   * Also computes whether the target will actually be VISIBLE in the graph.
   * IntelGraph's default confidence filter is [0.3, 1.0] and filterGraphData
   * drops non-matching nodes outright, so a link can resolve to a real file
   * that renders no node — which reads as a broken link rather than as a
   * filter doing its job. The file still opens; the note explains the absence.
   */
  const [targetBelowFilter, setTargetBelowFilter] = useState(false);
  useEffect(() => {
    if (deepLinkApplied.current || !initialPath || !state.vault) return;
    const file = state.vault.fileIndex.get(initialPath);
    if (!file) return;
    deepLinkApplied.current = true;
    const confidence = (file.frontmatter as { confidence?: number } | undefined)?.confidence;
    setTargetBelowFilter(typeof confidence === 'number' && confidence < 0.3);
    setState(prev => ({ ...prev, selectedFile: file, rightSidebarTab: 'file' }));
  }, [initialPath, state.vault]);

  const loadPackage = useCallback(async (pkg: IntelReportPackage) => {
    // Abort any previous operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      if (!isMountedRef.current) return;
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      // Use VirtualFileSystemManager to load the DataPack
      const vfsManager = new VirtualFileSystemManager();
      const result = await vfsManager.loadDataPack(pkg.dataPack);
      
      // Check if operation was aborted
      if (abortController.signal.aborted) {
        return;
      }
      
      if (!result.success || !result.virtualFileSystem) {
        throw new Error('Failed to load virtual filesystem');
      }
      
      // Only update state if component is still mounted
      if (isMountedRef.current) {
        setState(prev => ({
          ...prev,
          currentPackage: pkg,
          vault: result.virtualFileSystem!,
          loading: false
        }));
      }
    } catch (error) {
      // Only update state if component is still mounted and not aborted
      if (isMountedRef.current && !abortController.signal.aborted) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to load package',
          loading: false
        }));
      }
    }
  }, []);

  useEffect(() => {
    if (initialPackage) {
      loadPackage(initialPackage);
    } else {
      // No initial package provided, ensure not loading
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [initialPackage, loadPackage]);

  // Demo vault loader for testing (simplified version)
  const loadDemoVault = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      // Create a simple demo virtual file system
      const demoFiles = new Map<string, VirtualFile>([
        ['operations/operation-nightfall.md', {
          path: 'operations/operation-nightfall.md',
          name: 'operation-nightfall.md',
          extension: 'md',
          size: 1024,
          mimeType: 'text/markdown',
          encoding: 'utf-8',
          hash: 'demo-hash-001',
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
          content: `---
confidence: 0.85
sources: 
  - HUMINT-2024-0157
  - OSINT-Social-Media
coordinates: [40.7128, -74.0060]
entities:
  - Acme Corporation
  - John Doe
tags: [operations, surveillance, new-york]
---

# Operation Nightfall - Status Report

## Summary
Intelligence indicates [[Acme Corporation]] is conducting suspicious activities in [[New York City]].

## Key Findings
- Financial transfers to offshore accounts
- Meetings with known associates
- Increased security at facilities

## Assessment
Confidence: **85%** based on multiple HUMINT sources.
Distribution: **limited** - keep off public relays.

## Geolocation
Coordinates: \`40.7128, -74.0060\` (Manhattan)`,
          frontmatter: {
            confidence: 0.85,
            sources: ['HUMINT-2024-0157', 'OSINT-Social-Media'],
            coordinates: [40.7128, -74.0060],
            entities: ['Acme Corporation', 'John Doe'],
            tags: ['operations', 'surveillance', 'new-york']
          },
          relationships: []
        }],
        ['entities/acme-corp.md', {
          path: 'entities/acme-corp.md',
          name: 'acme-corp.md',
          extension: 'md',
          size: 512,
          mimeType: 'text/markdown',
          encoding: 'utf-8',
          hash: 'demo-hash-002',
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
          content: `---
confidence: 0.75
type: organization
tags: [entities, corporations, surveillance]
---

# Acme Corporation

## Overview
Multi-national corporation with suspicious financial patterns.

## Key Personnel
- [[John Doe]] - CEO
- [[Jane Smith]] - CFO

## Related Operations
- [[Operation Nightfall]] - Primary surveillance target`,
          frontmatter: {
            confidence: 0.75,
            type: 'organization',
            tags: ['entities', 'corporations', 'surveillance']
          },
          relationships: []
        }],
        ['analysis/threat-assessment.md', {
          path: 'analysis/threat-assessment.md',
          name: 'threat-assessment.md',
          extension: 'md',
          size: 768,
          mimeType: 'text/markdown',
          encoding: 'utf-8',
          hash: 'demo-hash-003',
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
          content: `---
confidence: 0.90
tags: [analysis, threat-assessment, intelligence]
---

# Threat Assessment - Q3 2025

## Executive Summary
Current threat level: **ELEVATED**

## Key Threats
1. [[Acme Corporation]] - Corporate espionage
2. Cyber intrusions - Foreign state actors
3. Supply chain vulnerabilities

## Recommendations
- Enhanced surveillance of [[Operation Nightfall]] targets
- Increased cybersecurity monitoring
- Supply chain audits`,
          frontmatter: {
            confidence: 0.90,
            tags: ['analysis', 'threat-assessment', 'intelligence']
          },
          relationships: []
        }]
      ]);
      
      // Create demo virtual file system
      const demoVault: VirtualFileSystem = {
        root: {
          path: '',
          name: 'root',
          children: ['operations/', 'entities/', 'analysis/'],
          files: [],
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString()
        },
        fileIndex: demoFiles,
        directoryIndex: new Map([
          ['operations/', {
            path: 'operations/',
            name: 'operations',
            children: [],
            files: ['operations/operation-nightfall.md'],
            createdAt: new Date().toISOString(),
            modifiedAt: new Date().toISOString()
          }],
          ['entities/', {
            path: 'entities/',
            name: 'entities',
            children: [],
            files: ['entities/acme-corp.md'],
            createdAt: new Date().toISOString(),
            modifiedAt: new Date().toISOString()
          }],
          ['analysis/', {
            path: 'analysis/',
            name: 'analysis',
            children: [],
            files: ['analysis/threat-assessment.md'],
            createdAt: new Date().toISOString(),
            modifiedAt: new Date().toISOString()
          }]
        ]),
        relationshipGraph: []
      };
      
      // It waited 500 ms here "to simulate loading", for a vault built in memory
      // (plan item 8.3). It opens at once.
      // Update state with demo vault
      setState(prev => ({
        ...prev,
        vault: demoVault,
        loading: false,
        currentPackage: null // No package, just demo vault
      }));
      
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to load demo vault',
        loading: false
      }));
    }
  }, []);

  // Persist right sidebar active tab (namespaced once vault loaded)
  useEffect(() => {
    if (!state.vault) return;
    try {
      const ids = Array.from(state.vault.fileIndex.keys()).sort().join('|');
      let hash = 0; for (let i = 0; i < ids.length; i++) { hash = ((hash << 5) - hash) + ids.charCodeAt(i); hash |= 0; }
      const key = `intelweb:v1:${hash}:ui:activeTab`;
      const saved = localStorage.getItem(key) as IntelWebState['rightSidebarTab'] | null;
      // A deep-link is a deliberate "show me THIS", and it must beat a stale
      // tab preference. Without this guard the restore ran after the deep-link
      // and silently put the user back on the Graph tab, so following a link
      // to a report opened the report and then hid it — which is exactly what
      // it looked like in a browser. Unit tests could not see it: localStorage
      // is empty there, so the restore never ran.
      if (deepLinkApplied.current) return;
      if (saved && ['graph','file','metadata','node','edge'].includes(saved)) {
        setState(prev => ({ ...prev, rightSidebarTab: saved }));
      }
    } catch {}
  }, [state.vault]);
  useEffect(() => {
    if (!state.vault) return;
    try {
      const ids = Array.from(state.vault.fileIndex.keys()).sort().join('|');
      let hash = 0; for (let i = 0; i < ids.length; i++) { hash = ((hash << 5) - hash) + ids.charCodeAt(i); hash |= 0; }
      const key = `intelweb:v1:${hash}:ui:activeTab`;
      localStorage.setItem(key, state.rightSidebarTab);
    } catch {}
  }, [state.rightSidebarTab, state.vault]);

  if (state.loading) {
    return (
      <div className="intelweb-loading">
        <div className="loading-spinner">Loading Intelligence Vault...</div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="intelweb-error">
        <div className="error-message">Error: {state.error}</div>
        <button onClick={() => setState(prev => ({ ...prev, error: null }))}>
          Retry
        </button>
      </div>
    );
  }

  if (!state.vault) {
    return (
      <div className="intelweb-empty">
        <div className="empty-state">
          <h2>IntelWeb - Intelligence Vault Explorer</h2>
          <p>Load an Intelligence Package to begin analysis</p>
          <div className="demo-actions">
            <button className="demo-button" onClick={loadDemoVault}>
              📁 Load Demo Intelligence Vault
            </button>
            <p className="demo-description">
              Contains sample intelligence reports, entities, and analysis documents
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Phase 2 Implementation: Basic three-pane layout
  return (
    <div className="intelweb-application">
      <div className="intelweb-layout">
        {/* Left Sidebar - Vault Explorer */}
        <div className="left-sidebar">
          <IntelWebLeftSideBar 
            vault={state.vault}
            selectedFile={state.selectedFile}
            onFileSelect={(file) => setState(prev => ({ ...prev, selectedFile: file }))}
          />
        </div>

        {/* Main Content - Graph Visualization */}
        <div className="main-content">
          {/* Deep-link outcomes, stated. A link that silently lands on nothing
              is indistinguishable from a broken one, and the two have
              different causes: the report may be gone, or it may be present
              and filtered out of the graph. */}
          {targetNotFound && (
            <div className="intelweb-deeplink-note" data-testid="deeplink-not-found">
              That report is not in this vault. It may have been deleted, or it
              belongs to a workspace this vault was not built from.
            </div>
          )}
          {targetBelowFilter && (
            <div className="intelweb-deeplink-note" data-testid="deeplink-below-filter">
              Opened, but hidden in the graph — its confidence is below the
              current filter. Widen the confidence range to see its node.
            </div>
          )}
          <GraphErrorBoundary>
            <IntelGraph
              vault={state.vault}
              selectedFile={state.selectedFile}
              onFileSelect={(file) => setState(prev => ({ ...prev, selectedFile: file }))}
              className="intelligence-graph"
              arrivals={arrivals}
            />
          </GraphErrorBoundary>
        </div>

        {/* Right Sidebar - Tabbed Interface */}
        <div className="right-sidebar">
          <IntelWebRightSideBar 
            vault={state.vault}
            selectedFile={state.selectedFile}
            activeTab={state.rightSidebarTab}
            onTabChange={(tab) => setState(prev => ({ ...prev, rightSidebarTab: tab }))}
          />
        </div>
      </div>
    </div>
  );
};

export default IntelWebApplication;
