/**
 * The big-three lenses the person chose (decision D-CT, CT5), kept as the report priority filter
 * is: in the CyberCommand settings, in this browser. One choice for the globe's Intel Reports
 * layer and the Intel Dashboard's list. Empty is All.
 */
import { useCyberCommandSettings } from './useCyberCommandSettings';
import { readLensChoice, type LensId } from '../services/intel/bigThreeLenses';

export function useLensChoice(): [LensId[], (next: LensId[]) => void] {
  const { config, updateIntelReports } = useCyberCommandSettings();
  const chosen = readLensChoice(config.intelReports.lenses);
  return [chosen, (next) => updateIntelReports({ lenses: readLensChoice(next) })];
}
