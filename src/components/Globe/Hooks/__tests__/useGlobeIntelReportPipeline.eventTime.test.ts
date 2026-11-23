/**
 * The globe says how many reports it placed by when they were written, while the
 * cursor is paused, and nothing while live (decision D-E). Against the real
 * visualization service, with only listReports stubbed, like the pre-cap suite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMemo } from 'react';
import { useGlobeIntelReportPipeline, type IntelReportSettings } from '../useGlobeIntelReportPipeline';
import { intelReportService } from '../../../../services/intel/IntelReportService';
import { intelReportVisualizationService } from '../../../../services/IntelReportVisualizationService';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';

vi.mock('../../../../services/intel/NostrStarcomIntelIngest', () => ({
  nostrStarcomIntelIngest: {
    subscribe: vi.fn(() => () => {}),
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    setHoldCap: vi.fn(),
    getMetrics: vi.fn(() => ({})),
    getRelayStatus: vi.fn(() => []),
    isActive: vi.fn(() => false),
    onChange: vi.fn(() => () => {}),
    replayAccepted: vi.fn(),
    onWithdrawn: vi.fn(() => () => {}),
  },
}));

// ensureInitialized/subscribe are needed because listReports awaits the
// service's own ensure() — without them the service logs "Failed to prime
// cache" and falls into its catch, so the test would exercise the error path
// while still passing, which is exactly the kind of green-but-wrong this suite
// exists to prevent.
vi.mock('../../../../services/intel/IntelWorkspaceManager', () => ({
  intelWorkspaceManager: {
    getPersistenceStats: vi.fn(() => ({})),
    ensureInitialized: vi.fn(async () => {}),
    subscribe: vi.fn(() => () => {}),
    getReports: vi.fn(() => []),
  },
}));

vi.mock('../../../../services/realTimeEventSystem', () => ({
  default: {
    getInstance: vi.fn(() => ({
      getLoopStats: vi.fn(() => ({ processedEvents: 0, tickCount: 0, queueDepth: 0, maxQueueDepth: 0 })),
    })),
  },
}));

const written = new Date('2026-09-12T08:00:00.000Z');

const report = (id: string, over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id, title: `Report ${id}`, content: 'Body', summary: 'S', author: 'Tester', category: 'General', tags: [],
  latitude: 10, longitude: 20, createdAt: written, updatedAt: written, status: 'DRAFT', version: 1, history: [],
  ...over,
});

const settings: IntelReportSettings = {
  autoRefresh: false,
  refreshInterval: 5,
  maxReports: 50,
  reportFiltering: { showCritical: true, showHigh: true, showMedium: true, showLow: true, showUnset: true },
};

// Stable across renders: the pipeline refreshes when the window's identity changes.
const PAUSED = { timeWindow: { start: new Date('2026-09-12T00:00:00.000Z'), end: new Date('2026-09-13T00:00:00.000Z') } };

const setup = (temporalState: typeof PAUSED | null) =>
  renderHook(() => {
    const isLayerActive = useMemo(() => (id: string) => id === 'IntelReports', []);
    return useGlobeIntelReportPipeline({
      isLayerActive,
      visualizationMode: { mode: 'CyberCommand', subMode: 'IntelReports' },
      temporalState,
      settings,
    });
  });

describe('useGlobeIntelReportPipeline: reports placed by when they were written', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(intelReportService, 'listReports');
    vi.spyOn(intelReportService, 'createReport').mockResolvedValue({} as never);
    // Before as well as after: the visualization singleton primes its cache at
    // import, so the first test in the file would otherwise run against it.
    intelReportVisualizationService.clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    intelReportVisualizationService.clearCache();
  });

  it('counts, while paused, the reports the window placed by when they were written', async () => {
    spy.mockResolvedValue([
      report('undated-a'),
      report('undated-b'),
      report('dated', { startDate: new Date('2026-09-12T06:00:00.000Z'), timePrecisionMs: 3_600_000 }),
    ]);

    const { result } = setup(PAUSED);

    await waitFor(() => expect(result.current.intelJudgedByWindow).toBe(3));
    expect(result.current.intelPlacedByWritten).toBe(2);
  });

  it('counts nothing while live, when nothing is placed in time', async () => {
    spy.mockResolvedValue([report('undated-a'), report('undated-b')]);

    const { result } = setup(null);

    await waitFor(() => expect(result.current.intelReports).toHaveLength(2));
    expect(result.current.intelPlacedByWritten).toBe(0);
    expect(result.current.intelJudgedByWindow).toBe(0);
  });
});
