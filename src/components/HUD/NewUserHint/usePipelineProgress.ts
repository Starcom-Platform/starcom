/**
 * Where the operator actually is in the intel -> mission pipeline, derived
 * from the canonical stores rather than asserted by a script.
 *
 * The onboarding this replaces was a static card that said "join a cyber
 * investigation team to access group chat" — which described neither the
 * pipeline nor what the app is for, and could not notice that it had stopped
 * being true. A hardcoded tour has the same problem in slower motion: it
 * narrates a sequence of screens, and drifts silently the moment one moves.
 *
 * So this reads real counts from the same services the screens themselves
 * use. If Missions stopped existing, this reports zero missions rather than
 * continuing to describe a step that isn't there. The guide can be wrong
 * about what is USEFUL; it cannot be wrong about what EXISTS.
 *
 * Steps are chosen so each has a DISTINCT, checkable completion condition —
 * "you have a report" and "you have reviewed a report" would collapse into
 * one observable state, so the second isn't a step.
 */
import { useEffect, useState } from 'react';
import { intelReportService } from '../../../services/intel/IntelReportService';
import { missionService } from '../../../services/intel/MissionService';
import { intelCaseService } from '../../../services/intel/IntelCaseService';
import { MissionStatus } from '../../../types/intel/MissionUI';
import { caseGroup } from '../../../types/intel/IntelCaseUI';

export interface PipelineProgress {
  reportCount: number;
  /**
   * Cases are a pipeline STAGE, not a side branch: a Mission is downstream of a
   * Case (see mission-downstream-of-case.md). The guide used to jump report ->
   * mission, which described a shape the app no longer claims.
   */
  caseCount: number;
  /** Open by status, as the Cases tabs count them (plan item 1.8). */
  openCaseCount: number;
  missionCount: number;
  /** A mission that reached PACKAGED or DISPATCHED, closed since or not — the package was really built. */
  packagedMissionCount: number;
  loading: boolean;
}

const EMPTY: PipelineProgress = {
  reportCount: 0,
  caseCount: 0,
  openCaseCount: 0,
  missionCount: 0,
  packagedMissionCount: 0,
  loading: true,
};

export function usePipelineProgress(): PipelineProgress {
  const [progress, setProgress] = useState<PipelineProgress>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    const read = async () => {
      try {
        const [reports, cases, missions] = await Promise.all([
          intelReportService.listReports(),
          intelCaseService.listCases(),
          missionService.listMissions(),
        ]);
        if (cancelled) return;
        setProgress({
          reportCount: reports.length,
          caseCount: cases.length,
          openCaseCount: cases.filter((c) => caseGroup(c.status) === 'open').length,
          missionCount: missions.length,
          packagedMissionCount: missions.filter(
            (m) => m.status === MissionStatus.PACKAGED || m.status === MissionStatus.DISPATCHED || m.status === MissionStatus.CLOSED
          ).length,
          loading: false,
        });
      } catch {
        // A guide that can't read state should show nothing rather than
        // claim zero progress the operator may not actually have.
        if (!cancelled) setProgress((p) => ({ ...p, loading: false }));
      }
    };

    void read();

    // Both stores publish changes; re-derive rather than letting the guide
    // go stale the moment the operator does the thing it is asking for.
    const unsubReports = intelReportService.onChange(() => { void read(); });
    const unsubCases = intelCaseService.onChange(() => { void read(); });
    const unsubMissions = missionService.onChange(() => { void read(); });

    return () => {
      cancelled = true;
      unsubReports();
      unsubCases();
      unsubMissions();
    };
  }, []);

  return progress;
}

export default usePipelineProgress;
