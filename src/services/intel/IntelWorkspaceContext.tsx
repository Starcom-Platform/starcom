import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import { intelWorkspaceManager } from './IntelWorkspaceManager';
import { IntelReportUI } from '../../types/intel/IntelReportUI';
import { workspaceFileToUI } from './adapters/reportMappers';
import { IntelReportData, IntelReportFile } from '../../types/IntelWorkspace';
import { IntelItemUI } from '../../types/intel/IntelItemUI';

interface WorkspaceContextValue {
  reports: IntelReportUI[];
  intelItems: IntelItemUI[];
  refresh(): Promise<void>;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export const IntelWorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [reports, setReports] = useState<IntelReportUI[]>([]);
  const [intelItems, setIntelItems] = useState<IntelItemUI[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    // Unmounted while the workspace opened: neither load nor subscribe. It set
    // state on the unmounted provider, and it subscribed after this cleanup had
    // run, so that listener was never removed (2026-09-30).
    let cancelled = false;
    (async () => {
      setLoading(true);
      await intelWorkspaceManager.ensureInitialized();
      if (cancelled) return;
      const load = () => {
        const reportData: IntelReportData[] = intelWorkspaceManager.getReports();
        const reportUI = reportData.map(d => workspaceFileToUI({
          path: '', filename: d.id + '.intelReport', extension: '.intelReport', reportData: d,
          size: 0, createdAt: d.createdAt, modifiedAt: d.modifiedAt, checksum: ''
        } as IntelReportFile));
        setReports(reportUI);
        setIntelItems(intelWorkspaceManager.getIntelItems());
      };
      load();
      unsub = intelWorkspaceManager.subscribe(load);
      setLoading(false);
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, []);

  const refresh = useCallback(async () => {
    await intelWorkspaceManager.ensureInitialized();
  }, []);

  // Memoized so consumers that depend on the whole context value (or on `refresh`)
  // don't see a new reference on every render of an ancestor — this provider wraps
  // most of the IntelAnalyzer tree, so an unmemoized value here previously caused
  // a "Maximum update depth exceeded" cascade through the provider stack.
  const value: WorkspaceContextValue = useMemo(() => ({
    reports,
    intelItems,
    refresh,
    loading
  }), [reports, intelItems, refresh, loading]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export function useIntelWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useIntelWorkspace must be used within IntelWorkspaceProvider');
  return ctx;
}
