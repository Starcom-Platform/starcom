/**
 * DataIntegrityBanner — Phase 1 roadmap item ("the data-integrity
 * dashboard tile"), designed for outside visibility from the start (per
 * the collective-value/future-proofing revision of the roadmap), not as
 * private operator-only telemetry. Answers, honestly: of the intelligence
 * this instance has collected recently, how much came from a real source
 * vs. a mock fallback?
 *
 * NetRunner mission history is the only real source feeding this today —
 * see computeDataIntegritySummary's doc comment for why the aggregation
 * itself is written generically rather than tied to NetRunner specifically.
 */
import React, { useEffect, useState } from 'react';
import { loadMissionHistory } from '../../applications/netrunner/services/persistence/NetRunnerPersistence';
import { computeDataIntegritySummary, DataIntegritySummary } from '../../services/intel/dataIntegrity/computeDataIntegritySummary';
import styles from './DataIntegrityBanner.module.css';
import { realDataShare } from '../../services/epistemic/epistemicLanguage';

const DataIntegrityBanner: React.FC = () => {
  const [summary, setSummary] = useState<DataIntegritySummary | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMissionHistory()
      .then(missions => {
        if (cancelled) return;
        setSummary(computeDataIntegritySummary(missions.map(m => ({ isMock: m.usedMockData }))));
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
      });
    return () => { cancelled = true; };
  }, []);

  if (loadError) return null; // fail quiet — this is a transparency aid, not a blocking requirement
  if (!summary || summary.totalObservations === 0) return null; // nothing collected yet, nothing honest to report

  const pct = Math.round(summary.realRatio * 100);
  const level = summary.realRatio >= 0.8 ? styles.good : summary.realRatio >= 0.4 ? styles.warn : styles.low;

  return (
    <div className={`${styles.banner} ${level}`} title="Share of recent NetRunner collection that came from a real source rather than a mock fallback">
      <span className={styles.pct}>{pct}%</span>
      <span className={styles.label}>{realDataShare(summary.realCount, summary.totalObservations)}</span>
    </div>
  );
};

export default DataIntegrityBanner;
