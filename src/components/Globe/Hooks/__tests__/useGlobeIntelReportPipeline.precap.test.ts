/**
 * "Showing N of M intel reports" against the REAL IntelReportVisualizationService.
 *
 * The sibling suite mocks that service, and its mock ignores the maxReports
 * option it is handed — so its `caps at maxReports after filtering` test asserts
 * intelTotalMatching === 3, a state the real service cannot produce, and every
 * cap assertion written against that mock passes whether the bug is present or
 * not. That is how this survived:
 *
 *   applyFilters records lastMatchingCountBeforeCap and THEN slices to
 *   maxReports before returning, so the pipeline was computing
 *   intelTotalMatching from an already-capped array. `intelTotalMatching >
 *   intelReports.length` — the condition gating the notice in Globe.tsx — was
 *   therefore false in steady state, and the notice could never render.
 *
 * Meanwhile getLastMatchingCountBeforeCap() had existed, been computed on every
 * call, and been tested since the cap was added, with zero non-test callers. Its
 * own doc comment states it is there "so callers can show an honest showing X
 * of Y indicator". This wires it.
 *
 * Only intelReportService.listReports is stubbed — the service under test is
 * real, which is the entire point.
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

const report = (id: string, tags: string[] = []): IntelReportUI => ({
  id,
  title: `Report ${id}`,
  content: 'Body',
  summary: 'S',
  author: 'Tester',
  category: 'General',
  tags,
  latitude: 10,
  longitude: 20,
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  status: 'DRAFT',
  version: 1,
  history: [],
});

const settings = (maxReports: number): IntelReportSettings => ({
  autoRefresh: false,
  refreshInterval: 5,
  maxReports,
  reportFiltering: { showCritical: true, showHigh: true, showMedium: true, showLow: true, showUnset: true },
});

const setup = (s: IntelReportSettings) =>
  renderHook(() => {
    const isLayerActive = useMemo(() => (id: string) => id === 'IntelReports', []);
    return useGlobeIntelReportPipeline({
      isLayerActive,
      visualizationMode: { mode: 'CyberCommand', subMode: 'IntelReports' },
      temporalState: null,
      settings: s,
    });
  });

describe('intelTotalMatching against the real visualization service', () => {
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

  it('reports the PRE-cap total, so "showing N of M" can actually fire', async () => {
    spy.mockResolvedValue([report('a'), report('b'), report('c')]);

    const { result } = setup(settings(2));

    await waitFor(() => expect(result.current.intelReports).toHaveLength(2));
    // Against the old code this was 2 — derived from the already-capped array —
    // so the notice's `total > shown` guard was false and it never rendered.
    expect(result.current.intelTotalMatching).toBe(3);
    expect(result.current.intelTotalMatching).toBeGreaterThan(result.current.intelReports.length);
  });

  it('reports equal totals when nothing is capped, so the notice stays silent', async () => {
    spy.mockResolvedValue([report('a'), report('b')]);

    const { result } = setup(settings(50));

    await waitFor(() => expect(result.current.intelReports).toHaveLength(2));
    expect(result.current.intelTotalMatching).toBe(2);
  });

  it('counts reports dropped by the priority filter separately from the cap', async () => {
    // Two different sentences: "there are more past the cap" and "we received
    // these and chose not to draw them". Collapsing them would misdescribe both.
    spy.mockResolvedValue([report('a', ['LOW']), report('b'), report('c')]);

    const { result } = setup({
      ...settings(50),
      reportFiltering: { showCritical: true, showHigh: true, showMedium: true, showLow: false, showUnset: true },
    });

    await waitFor(() => expect(result.current.intelReports).toHaveLength(2));
    expect(result.current.intelHiddenByPriority).toBe(1);
  });

  it('reports nothing hidden when the filter drops nothing', async () => {
    spy.mockResolvedValue([report('a'), report('b')]);

    const { result } = setup(settings(50));

    await waitFor(() => expect(result.current.intelReports).toHaveLength(2));
    expect(result.current.intelHiddenByPriority).toBe(0);
  });
});
