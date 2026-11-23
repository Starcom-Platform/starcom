import { useEffect, useState } from 'react';
import { usePsiKit } from './usePsiKit';
import { psiKitOn } from '../../services/psiWatch/psiKitSwitch';
import { psiMissionsFrom, type PsiMission } from '../../services/psiWatch/missions/psiMissions';

/**
 * Psi Watch's missions (decision D-PW, PW91), for any view that shows them: Missions' received list and the Lists
 * panel. Read only while the view is shown and Psi Watch is not hidden in this tab (`?psi=off`); the kit's sample only
 * with `?psi=kit` (PW48).
 */
export function usePsiMissions(enabled: boolean): PsiMission[] {
  const on = enabled && psiKitOn();
  const { fixtures } = usePsiKit(on);
  const [missions, setMissions] = useState<PsiMission[]>([]);
  useEffect(() => {
    if (!on) { setMissions([]); return undefined; }
    let live = true;
    void psiMissionsFrom(fixtures).then((next) => { if (live) setMissions(next); }, () => { if (live) setMissions([]); });
    return () => { live = false; };
  }, [on, fixtures]);
  return missions;
}
