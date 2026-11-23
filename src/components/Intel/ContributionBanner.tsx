/**
 * ContributionBanner — Phase 2 roadmap item ("attribution/contribution
 * tile"). collaborators[] and activityLog already exist on Report/Case/
 * Mission and are already being written; the gap was never infrastructure,
 * only that none of it was ever surfaced anywhere (see
 * computeContributionSummary's doc comment for what this deliberately
 * does NOT claim — no per-analyst "findings corroborated" or
 * "contradictions resolved" counts, since neither is attributed to a
 * specific analyst in the data model today).
 *
 * Same self-contained fetch-and-render pattern as DataIntegrityBanner:
 * one-shot load on mount, fail quiet, render nothing when there's
 * nothing honest to report.
 */
import React, { useEffect, useState } from 'react';
import { intelCaseService } from '../../services/intel/IntelCaseService';
import { missionService } from '../../services/intel/MissionService';
import { intelReportService } from '../../services/intel/IntelReportService';
import { computeContributionSummary, ContributorSummary } from '../../services/intel/contribution/computeContributionSummary';
import KeyName from '../Identity/KeyName';
import styles from './ContributionBanner.module.css';

const TOP_N = 3;

const ContributionBanner: React.FC = () => {
  const [summaries, setSummaries] = useState<ContributorSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([intelCaseService.listCases(), missionService.listMissions(), intelReportService.listReports()])
      .then(([cases, missions, reports]) => {
        if (cancelled) return;
        setSummaries(computeContributionSummary(cases, missions, reports));
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
      });
    return () => { cancelled = true; };
  }, []);

  if (loadError) return null; // fail quiet — this is a transparency aid, not a blocking requirement
  if (!summaries || summaries.length === 0) return null; // nothing collaborated on yet, nothing honest to report

  const top = summaries.slice(0, TOP_N);

  return (
    <div className={styles.banner} title="Collaboration and logged activity per analyst, from existing Report/Case/Mission records">
      <span className={styles.label}>Top contributors:</span>
      {top.map(s => (
        <span key={s.userId} className={styles.chip}>
          <KeyName pubkey={s.userId} /> <span className={styles.count}>{s.activityCount + s.collaborations}</span>
        </span>
      ))}
    </div>
  );
};

export default ContributionBanner;
