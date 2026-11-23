/**
 * The coverage measurement, kept current.
 *
 * Recomputes when reports, cases, missions or the relay set move, because all
 * four change what "how much can this node see" answers. Subscribes rather
 * than polls, for the reason useOpenWork gives: a figure that updates on a
 * timer is stale for as long as the timer is long.
 *
 * The measurement itself is a pure function tested directly; this only decides
 * when to run it.
 */
import { useEffect, useState } from 'react';
import { intelReportService } from '../../../services/intel/IntelReportService';
import { intelCaseService } from '../../../services/intel/IntelCaseService';
import { missionService } from '../../../services/intel/MissionService';
import { nostrStarcomIntelIngest } from '../../../services/intel/NostrStarcomIntelIngest';
import { measureCoverage, type CoverageAxis } from '../../../services/intel/coverage/coverage';
import { loadTerritories } from './useTerritories';

export function useCoverage(): CoverageAxis[] {
  const [axes, setAxes] = useState<CoverageAxis[]>([]);

  useEffect(() => {
    let alive = true;

    const recompute = async () => {
      try {
        const [reports, cases, missions] = await Promise.all([
          intelReportService.listReports(),
          intelCaseService.listCases(),
          missionService.listMissions(),
        ]);
        const relays = nostrStarcomIntelIngest.getRelayStatus()
          .map((r) => ({ url: r.url, connected: r.connected }));
        const territories = await loadTerritories();
        if (alive) setAxes(measureCoverage({ reports, cases, missions, relays, territories }));
      } catch {
        // A workspace that cannot be read is not this panel's to report; the
        // surfaces that own those records say so. Claiming nothing is better
        // than claiming a coverage figure derived from a failed read.
        if (alive) setAxes([]);
      }
    };

    void recompute();
    const offReports = intelReportService.onChange(() => void recompute());
    const offCases = intelCaseService.onChange(() => void recompute());
    const offMissions = missionService.onChange(() => void recompute());
    const offIngest = nostrStarcomIntelIngest.onChange(() => void recompute());

    return () => {
      alive = false;
      offReports();
      offCases();
      offMissions();
      offIngest();
    };
  }, []);

  return axes;
}
