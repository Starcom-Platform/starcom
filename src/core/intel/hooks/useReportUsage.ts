import { useEffect, useState } from 'react';
import { enhancedEventEmitter } from '../events/enhancedEventEmitter';
import { missionService } from '../../../services/intel/MissionService';
import { intelCaseService } from '../../../services/intel/IntelCaseService';
import type { MissionUI } from '../../../types/intel/MissionUI';
import type { IntelCaseUI } from '../../../types/intel/IntelCaseUI';

/**
 * What became of a report.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * Evidence in this pipeline points backwards and never forwards. A mission
 * cites its reports; a case cites its evidence. From a report there was no way
 * to learn whether it reached anything at all.
 *
 * So the most ordinary question a contributor has — "did what I wrote matter?"
 * — had no answer anywhere in the interface. For a network whose bottleneck is
 * people willing to collect, that is not a missing convenience: it is the
 * feedback loop that decides whether anyone collects a second time.
 *
 * ─── DERIVED, NEVER STORED ─────────────────────────────────────────────────
 *
 * Same reasoning as useCaseMissions, which is the precedent this copies. The
 * forward links already exist — `MissionUI.relatedReports` and
 * `IntelCaseUI.relatedEntities` — so a `usedIn` array on the report would be a
 * second writer of one fact, and two writers desync. A filter over the forward
 * link cannot: it is wrong only when the forward link is wrong, which is one
 * bug rather than a disagreement between two records.
 */
export interface ReportUsage {
  cases: IntelCaseUI[];
  missions: MissionUI[];
  loading: boolean;
  /**
   * Reached nothing, and we actually looked.
   *
   * Distinct from `cases.length === 0 && missions.length === 0` while loading,
   * which is the same shape and means "not known yet". Collapsing the two would
   * tell a contributor their work reached nothing every time the screen opened.
   */
  reachedNothing: boolean;
}

export function useReportUsage(reportId: string | null): ReportUsage {
  const [cases, setCases] = useState<IntelCaseUI[]>([]);
  const [missions, setMissions] = useState<MissionUI[]>([]);
  const [loading, setLoading] = useState(reportId !== null);

  useEffect(() => {
    if (!reportId) {
      setCases([]);
      setMissions([]);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);

    const applyMissions = (all: MissionUI[]) => {
      if (alive) setMissions(all.filter((m) => m.relatedReports.includes(reportId)));
    };

    /**
     * `relatedEntities` holds RECORD IDS, not display names — a distinction
     * that was a shipped bug once on this exact field. Matching on the id is
     * the whole point; matching on a title would find nothing and look like an
     * unused report.
     */
    const applyCases = (all: IntelCaseUI[]) => {
      if (alive) setCases(all.filter((c) => c.relatedEntities.includes(reportId)));
    };

    Promise.all([missionService.listMissions(), intelCaseService.listCases()])
      .then(([m, c]) => { applyMissions(m); applyCases(c); if (alive) setLoading(false); })
      // A failed load must not leave `loading` true forever — a permanent
      // spinner is indistinguishable from a slow one, and here it would also be
      // indistinguishable from "reached nothing".
      .catch(() => { if (alive) { setCases([]); setMissions([]); setLoading(false); } });

    // Attaching this report to a mission or a case elsewhere is exactly the
    // event this view exists to reflect. Cases were never listened to, so a
    // report added to a case still read "Not yet used" (plan item 1.3).
    const off = missionService.onChange(applyMissions);
    const relistCases = () => { void intelCaseService.listCases().then(applyCases).catch(() => {}); };
    const caseEvents = ['case:created', 'case:updated', 'case:deleted'].map((name) => enhancedEventEmitter.on(name, relistCases));
    return () => { alive = false; off(); for (const e of caseEvents) e.unsubscribe(); };
  }, [reportId]);

  return {
    cases,
    missions,
    loading,
    reachedNothing: !loading && cases.length === 0 && missions.length === 0,
  };
}
