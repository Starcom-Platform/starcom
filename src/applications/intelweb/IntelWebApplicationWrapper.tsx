/**
 * IntelWebApplicationWrapper
 * 
 * Adapts IntelWebApplication to work with the Enhanced Application Router
 * by providing the ApplicationContext interface compatibility.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { IntelReportUI } from '../../types/intel/IntelReportUI';
import { counted, useMessages } from '../../i18n/app/i18n';
import { ApplicationContext } from '../../components/Router/ApplicationRouter';
import { IntelWebApplication } from './IntelWebApplication';
import './IntelWeb.css';
import { IntelWebIntegrationService, intelReportUIToReportData } from '../../services/intelweb/IntelWebIntegrationService';
import { intelStructure } from '../../services/intelweb/intelStructure';
import { VirtualFileSystem } from '../../types/DataPack';
import { intelReportService } from '../../services/intel/IntelReportService';
import { useApplicationRouter } from '../../hooks/useApplicationRouter';

// Wrapper component that adapts IntelWebApplication to ApplicationContext
export const IntelWebApplicationWrapper: React.FC<ApplicationContext> = (context) => {
  // Build the vault from whatever's actually been published to the canonical
  // Intel substrate (services/intel) — previously this always rendered two
  // hardcoded demo reports regardless of real app data.
  const [vault, setVault] = useState<VirtualFileSystem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reportCount, setReportCount] = useState(0);
  /**
   * The vault path a deep-link asked for, resolved from a report id.
   *
   * Resolved HERE because the id -> path mapping only exists on the build
   * result, and resolving it downstream would mean re-deriving the slug — a
   * second implementation of a rule that lives in one place.
   *
   * `notFound` is a real outcome, not an error: a report can be deep-linked and
   * then deleted, or belong to a workspace this vault was not built from. That
   * is a different sentence from "the vault failed to build".
   */
  const [initialPath, setInitialPath] = useState<string | null>(null);
  const [targetNotFound, setTargetNotFound] = useState(false);
  /*
   * Reports that arrive while IntelWeb is open (D-IW, IW3): counted, and added when the reader asks,
   * so the layout never moves under them. It read the stored reports once, when it opened.
   */
  const held = useRef<ReadonlySet<string>>(new Set());
  const [arrived, setArrived] = useState<{ reports: IntelReportUI[]; count: number } | null>(null);
  const { m } = useMessages();
  const build = useCallback(async (reports: IntelReportUI[]) => {
    const integration = new IntelWebIntegrationService();
    const result = await integration.buildFromReports(reports.map(intelReportUIToReportData), { structure: intelStructure(reports) });
    held.current = new Set(reports.map((r) => r.id));
    return result;
  }, []);
  useEffect(() => intelReportService.onChange?.((reports) => {
    const count = reports.filter((r) => !held.current.has(r.id)).length;
    setArrived(count ? { reports, count } : null);
  }), []);
  const addArrived = useCallback(async () => {
    if (!arrived) return;
    const result = await build(arrived.reports);
    setReportCount(arrived.reports.length);
    setVault(result.vfs);
    setArrived(null);
  }, [arrived, build]);
  const arrivals = arrived ? { count: arrived.count, onAdd: () => { void addArrived(); } } : null;
  const { navigateToApp } = useApplicationRouter();

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        const reports = await intelReportService.listReports();
        // What links them, from what each states (D-IW, step 1): countries, shared tags, what each names.
        const result = await build(reports);
        if (!mounted) return;
        setReportCount(reports.length);
        setVault(result.vfs);
        const wanted = typeof context.reportId === 'string' ? context.reportId : null;
        if (wanted) {
          const path = result.reportPathById.get(wanted) ?? null;
          setInitialPath(path);
          setTargetNotFound(path === null);
        }
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Failed to build Intel vault');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    run();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return <div style={{ padding: 16, color: 'var(--intel-text)' }}>Loading Intel vault…</div>;
  }

  if (error) {
    return <div style={{ padding: 16, color: 'var(--intel-text)' }}>Error: {error}</div>;
  }

  /*
   * The vault is built from every local report, drafts included, so writing one
   * is enough; it said "Publish one", with nothing to press (plan item 1.5).
   */
  if (reportCount === 0) {
    return (
      <div className="empty-state" style={{ padding: 16, color: 'var(--intel-text)' }} data-testid="intelweb-empty">
        <p style={{ margin: '0 0 12px' }}>
          No intel reports yet. Each report you write appears here as a note, linked to the others it names.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {arrivals && (
            <button type="button" onClick={arrivals.onAdd}>
              {`${counted(m.intelWeb.arrivals, arrivals.count)} · ${m.intelWeb.addThem}`}
            </button>
          )}
          <button type="button" onClick={() => navigateToApp('inteldashboard')}>
            Write a report
          </button>
          <button type="button" onClick={() => navigateToApp('netrunner')}>
            Collect with NetRunner
          </button>
        </div>
      </div>
    );
  }

  return (
    <IntelWebApplication
      // Provide the prepared vault to bootstrap the app
      initialVault={vault || undefined}
      initialPath={initialPath ?? undefined}
      targetNotFound={targetNotFound}
      arrivals={arrivals}
    />
  );
};

export default IntelWebApplicationWrapper;
