/**
 * Data-integrity summary — Phase 1 roadmap item ("the data-integrity
 * dashboard tile"). The whole positioning bet of this app is "real,
 * falsifiable analysis, not fabricated data" (see the mock-data audit
 * findings this same phase fixed: TheHarvesterAdapter's mislabeled mock
 * flag, IntelligenceSummaryPanel's fabricated threat indicators, OSINT
 * search results with no mock provenance). This is the metric that lets
 * an operator actually check that claim against their own instance,
 * instead of trusting it on faith.
 *
 * Deliberately generic — takes `{ isMock: boolean }[]`, not NetRunner's
 * specific `EnhancedMissionResult` shape. NetRunner is the only real
 * source feeding this today, but Phase 3/4 add Navcom Patterns and
 * eventually a third source type; each new source maps its own
 * mock-flag field name (usedMockData, _isMockData, ...) into this one
 * generic shape before calling in, so the aggregation logic itself never
 * needs a rewrite when a source is added.
 */
export interface DataIntegritySummary {
  totalObservations: number;
  realCount: number;
  mockCount: number;
  /** 0..1. 0 when there are no observations at all — not NaN, not 1. */
  realRatio: number;
}

export function computeDataIntegritySummary(
  observations: Array<{ isMock: boolean }>
): DataIntegritySummary {
  const totalObservations = observations.length;
  const mockCount = observations.filter(o => o.isMock).length;
  const realCount = totalObservations - mockCount;
  return {
    totalObservations,
    realCount,
    mockCount,
    realRatio: totalObservations === 0 ? 0 : realCount / totalObservations
  };
}

/**
 * Per-source integrity, so a single fabricated feed cannot be averaged into
 * invisibility across five real ones.
 *
 * The aggregate ratio answers "how much of what I am looking at is real".
 * It does not answer "which source is lying to me", and with six sources that
 * second question is the actionable one — a 95% real corpus where the entire
 * 5% comes from one feed is a very different situation from 5% spread evenly.
 */
export interface SourceIntegrity extends DataIntegritySummary {
  sourceId: string;
}

export function computeIntegrityBySource(
  observations: Array<{ isMock: boolean; sourceId: string }>
): SourceIntegrity[] {
  const bySource = new Map<string, Array<{ isMock: boolean }>>();
  for (const obs of observations) {
    const bucket = bySource.get(obs.sourceId) ?? [];
    bucket.push(obs);
    bySource.set(obs.sourceId, bucket);
  }

  return [...bySource.entries()]
    .map(([sourceId, group]) => ({ sourceId, ...computeDataIntegritySummary(group) }))
    // Least-real first: the source most worth an operator's attention leads.
    .sort((a, b) => a.realRatio - b.realRatio || a.sourceId.localeCompare(b.sourceId));
}
