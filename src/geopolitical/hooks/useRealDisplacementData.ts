// useRealDisplacementData.ts — shared real-data fetch for ConflictZones' humanitarian-
// crisis layer. Built on useRealDataLayer, mirroring useRealDiplomaticEvents.ts/
// useRealConflictEvents.ts.
//
// Shares its resourceMode ('GeoPolitical.ConflictZones') with useRealConflictEvents.ts's
// war-events layer — the two are independent real data sources (UNHCR vs GDELT) feeding
// the same sub-mode. Deliberately records into `pipelineVectors`/`maxPipelineVectors`
// rather than `vectors`/`maxVectors` (which the war-events layer already owns) so the two
// budgets track separately under the shared mode key instead of one silently overwriting
// the other's warning condition — VisualizationResourceMonitor.setBudgets merges per-mode
// budgets across callers specifically to make this safe.
import { getRealDisplacementData, type CountryDisplacement, CACHE_TTL_MS } from '../../services/geopolitical/UNHCRDisplacementService';
import { useRealDataLayer } from './useRealDataLayer';

export interface UseRealDisplacementDataResult {
  records: CountryDisplacement[];
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  pausedByBudget: boolean;
}

// Real ceiling is ~181 countries/territories (confirmed live this session at
// limit=300, maxPages=1) — generous headroom above that real number, not a tight guess.
const MAX_REAL_COUNTRIES_BUDGET = 500;

export function useRealDisplacementData(enabled: boolean): UseRealDisplacementDataResult {
  const { data, loading, error, lastUpdated, pausedByBudget } = useRealDataLayer<CountryDisplacement[]>({
    key: 'geopolitical-displacement-fetch',
    enabled,
    fetchFn: getRealDisplacementData,
    intervalMs: CACHE_TTL_MS,
    initialValue: [],
    resourceMode: 'GeoPolitical.ConflictZones',
    countRecords: (records) => records.length,
    metricKind: 'pipelineVectors',
    budget: { maxPipelineVectors: MAX_REAL_COUNTRIES_BUDGET }
  });

  return { records: data, loading, error, lastUpdated, pausedByBudget };
}
