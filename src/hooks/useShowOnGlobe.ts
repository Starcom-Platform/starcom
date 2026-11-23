/**
 * "Show on the globe" for a Case or a Mission: point the camera at its pins,
 * then open the globe with it shown. For a package another node published, or
 * what one key published (plan item 9.14), the relays are first asked for
 * everything that key published, which arrives as the relays answer.
 *
 * The camera target is read here, once, because a camera move is an event.
 * What the globe draws does not come from here: the globe reads the record
 * again itself (useShownRecord), so its pins and counts stay current after
 * this click. Both use readShownRecord, so they agree on what the evidence is.
 */
import { useCallback } from 'react';
import { useGlobeContext, type ShownOnGlobe } from '../context/GlobeContext';
import { useVisualizationMode } from '../context/VisualizationModeContext';
import { nostrStarcomIntelIngest } from '../services/intel/NostrStarcomIntelIngest';
import { useApplicationRouter } from './useApplicationRouter';
import { GLOBE_APP } from '../routes/appPath';
import { readShownRecord } from '../services/intel/globe/readShownRecord';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'show-on-globe' });

export const useShowOnGlobe = () => {
  const { setFocusLocation, showRecordOnGlobe } = useGlobeContext();
  const { setVisualizationMode } = useVisualizationMode();
  const { navigateToApp } = useApplicationRouter();

  return useCallback(async (target: ShownOnGlobe) => {
    if (target.kind === 'package') nostrStarcomIntelIngest.followAuthor(target.signer);
    if (target.kind === 'publisher') nostrStarcomIntelIngest.followAuthor(target.id);
    try {
      const read = await readShownRecord(target);
      // No target (nothing placed, or pins all round the planet): the camera
      // stays where it is, and the globe's panel says what is drawn.
      if (read.status === 'ready' && read.placement.cameraTarget) setFocusLocation(read.placement.cameraTarget);
    } catch (error) {
      log.warn(`Could not work out where to point the camera for ${target.kind} ${target.id}`, error);
    }
    showRecordOnGlobe(target);
    // Its pins are report pins. In any other mode the globe would open with
    // nothing to see and no explanation, the same reason View on Globe in
    // IntelWorkspaceConsole sets this.
    setVisualizationMode({ mode: 'CyberCommand', subMode: 'IntelReports' });
    navigateToApp(GLOBE_APP);
  }, [setFocusLocation, showRecordOnGlobe, setVisualizationMode, navigateToApp]);
};
