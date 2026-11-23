import { useCallback } from 'react';
import { useTemporalStateOptional } from '../../../context/TemporalContext';
import { useVisualizationModeOptional } from '../../../context/VisualizationModeContext';
import { useApplicationRouter } from '../../../hooks/useApplicationRouter';
import { GLOBE_APP } from '../../../routes/appPath';
import { openPsiLists } from '../../../features/psi/psiListsPanel';
import type { PsiMission } from '../../../services/psiWatch/missions/psiMissions';

/**
 * "Go to the peak" from the Missions app (decision D-PW, PW92): the shared cursor to the window's peak, then the globe
 * in Psi Watch's Windows with the Lists panel's Missions tab open at this mission, where its window is marked on the
 * Timestream. The Missions app covers the globe and its time bar, so the band is seen there.
 */
export function useGoToPsiMissionPeak(): (mission: PsiMission) => void {
  const temporal = useTemporalStateOptional();
  // Optional: the Missions app is shown in tests, and could be anywhere, with no mode provider above it.
  const setVisualizationMode = useVisualizationModeOptional()?.setVisualizationMode;
  const { navigateToApp } = useApplicationRouter();
  return useCallback((mission: PsiMission) => {
    if (mission.window) temporal?.setCurrentTime(mission.window.peakMs);
    setVisualizationMode?.({ mode: 'PsiWatch', subMode: 'PsiWindows' });
    openPsiLists('missions', { mission: mission.address });
    navigateToApp(GLOBE_APP);
  }, [temporal, setVisualizationMode, navigateToApp]);
}
