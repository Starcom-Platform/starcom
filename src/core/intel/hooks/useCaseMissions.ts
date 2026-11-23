import { useEffect, useState } from 'react';
import { missionService } from '../../../services/intel/MissionService';
import type { MissionUI } from '../../../types/intel/MissionUI';

/**
 * The Missions built from a given Case.
 *
 * DERIVED, never stored. `MissionUI.relatedCases` already records the forward
 * link, so a `relatedMissions` array on `IntelCaseUI` would be a second source
 * of truth for the same fact — and two writers of one fact desync. Filtering
 * the forward link cannot: it is wrong only if the forward link is wrong, in
 * which case the Mission side is wrong too and there is one bug rather than a
 * disagreement.
 *
 * The direction matters because of the pipeline shape. Under
 * docs/missions/01-architecture-decisions/mission-downstream-of-case.md a
 * Mission is downstream of a Case, so the Case is upstream and should be able
 * to see its own output — but the types only pointed the other way, and
 * `IntelCaseUI.relatedCases` points at other CASES, not Missions, which is easy
 * to misread as the back-link already existing.
 *
 * `MissionsPanel` does the mirror-image filter (cases attached to a mission),
 * so this is the same query read from the other end.
 */
export function useCaseMissions(caseId: string | null): { missions: MissionUI[]; loading: boolean } {
  const [missions, setMissions] = useState<MissionUI[]>([]);
  const [loading, setLoading] = useState(caseId !== null);

  useEffect(() => {
    if (!caseId) {
      setMissions([]);
      setLoading(false);
      return;
    }

    let alive = true;
    const apply = (all: MissionUI[]) => {
      if (!alive) return;
      setMissions(all.filter((m) => m.relatedCases.includes(caseId)));
      setLoading(false);
    };

    setLoading(true);
    missionService
      .listMissions()
      .then(apply)
      // A failed load must not leave `loading` true forever, which would render
      // as a permanent spinner and be indistinguishable from a slow one.
      .catch(() => { if (alive) { setMissions([]); setLoading(false); } });

    // Re-derive on any mission change: attaching this case to a mission
    // elsewhere is exactly the event this view exists to reflect.
    const off = missionService.onChange(apply);
    return () => { alive = false; off(); };
  }, [caseId]);

  return { missions, loading };
}
