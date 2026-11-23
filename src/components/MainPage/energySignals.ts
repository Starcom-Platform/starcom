/**
 * The Globe's energy readings as the one ticker carries them (K4): only those
 * the visitor has. An EIA-backed category is carried when EIA answered it; one
 * that needs a key, has no data, is loading or failed is left out, as are the
 * retired market feeds EIA never answered. With no EIA key that is none at all,
 * where the Globe's own ticker repeated "needs an EIA key" eight times.
 */
import type { PrimaryMarqueeSignal } from './usePrimaryMarqueeData';
import { EIA_BACKED_CATEGORY_IDS, NEEDS_EIA_KEY } from '../HUD/Bars/CyberCommandTopBar/topbarCategories';

export interface EnergyDataPoint {
  id: string;
  label: string;
  value: string;
  isLoading?: boolean;
  hasError?: boolean;
}

const EIA_BACKED = new Set<string>(EIA_BACKED_CATEGORY_IDS);
const NOT_A_READING = new Set([NEEDS_EIA_KEY, 'no data', 'N/A', 'Error', 'Loading...', '']);

export function energySignalsFrom(points: readonly EnergyDataPoint[]): PrimaryMarqueeSignal[] {
  return points
    .filter((p) => EIA_BACKED.has(p.id) && !p.isLoading && !p.hasError && !NOT_A_READING.has(p.value.trim()))
    .map((p) => ({ id: `energy-${p.id}`, label: p.label.toUpperCase(), value: p.value }));
}
