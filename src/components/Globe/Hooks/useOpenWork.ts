/**
 * Unclaimed mission work, counted against the evidence it rests on.
 *
 * Subscribes to both services rather than polling, and recomputes when either
 * moves: an objective being claimed changes this, and so does a report arriving
 * that a mission already pointed at. Missing the second would leave the globe
 * stating a figure that was true a minute ago, which is the staleness
 * GlobeIntelStatus exists to report rather than to commit.
 *
 * The computation itself is `openWorkOnEvidence` — a pure function, tested
 * directly. This hook only decides WHEN to run it, so there is nothing here
 * that needs a rendered component to assert.
 */
import { useEffect, useState } from 'react';
import { missionService } from '../../../services/intel/MissionService';
import { intelReportService } from '../../../services/intel/IntelReportService';
import { intelCaseService } from '../../../services/intel/IntelCaseService';
import { openWorkOnEvidence, type OpenWorkOnEvidence } from '../../../services/intel/globe/openWork';

const EMPTY: OpenWorkOnEvidence = {
  byReportId: new Map(),
  missionsNotDrawn: 0,
  objectivesNotDrawn: 0,
};

export function useOpenWork(): OpenWorkOnEvidence {
  const [openWork, setOpenWork] = useState<OpenWorkOnEvidence>(EMPTY);

  useEffect(() => {
    let alive = true;

    const recompute = async () => {
      try {
        const [missions, reports, cases] = await Promise.all([
          missionService.listMissions(),
          intelReportService.listReports(),
          intelCaseService.listCases(),
        ]);
        // The globe may have unmounted while these were in flight.
        if (alive) setOpenWork(openWorkOnEvidence(missions, reports, [], cases));
      } catch {
        // A workspace that cannot be read is not the globe's to report: the
        // surfaces that own those records say so. Leaving the last good figure
        // would be worse — it would state open work that may since have been
        // claimed — so this falls back to claiming nothing.
        if (alive) setOpenWork(EMPTY);
      }
    };

    void recompute();
    const offMissions = missionService.onChange(() => void recompute());
    const offReports = intelReportService.onChange(() => void recompute());
    // A case's links are a mission's evidence too.
    const offCases = intelCaseService.onChange(() => void recompute());

    return () => {
      alive = false;
      offMissions();
      offReports();
      offCases();
    };
  }, []);

  return openWork;
}
