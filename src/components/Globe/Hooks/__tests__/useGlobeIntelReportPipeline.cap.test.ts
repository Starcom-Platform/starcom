/**
 * The report cap on the globe (BA4–BA7; plan block J, item 2), against the real
 * visualization service, as the "showing N of M" suite beside it runs.
 *
 * The cap was read once, when the layer started: a changed setting drew nothing
 * new until something else reloaded, and there was no Unlimited. Now the cap in
 * force, the person's or the handle's for this page, draws, reloads when it
 * changes, and tells the intake how many reports to hold (BA6).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMemo } from 'react';
import { useGlobeIntelReportPipeline, type IntelReportSettings } from '../useGlobeIntelReportPipeline';
import { nostrStarcomIntelIngest } from '../../../../services/intel/NostrStarcomIntelIngest';
import { setReportCapOverride } from '../../../../services/intel/reportCap';
import { act } from '@testing-library/react';
import { intelReportService } from '../../../../services/intel/IntelReportService';
import { intelReportVisualizationService } from '../../../../services/IntelReportVisualizationService';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';

vi.mock('../../../../services/intel/NostrStarcomIntelIngest', () => ({
  nostrStarcomIntelIngest: {
    subscribe: vi.fn(() => () => {}),
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    getMetrics: vi.fn(() => ({})),
    getRelayStatus: vi.fn(() => []),
    isActive: vi.fn(() => false),
    onChange: vi.fn(() => () => {}),
    replayAccepted: vi.fn(),
    onWithdrawn: vi.fn(() => () => {}),
    setHoldCap: vi.fn(),
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

const settings = (maxReports: number | null): IntelReportSettings => ({
  autoRefresh: false,
  refreshInterval: 5,
  maxReports,
  reportFiltering: { showCritical: true, showHigh: true, showMedium: true, showLow: true, showUnset: true },
});

const setup = (s: IntelReportSettings) =>
  renderHook((props: { s: IntelReportSettings }) => {
    const isLayerActive = useMemo(() => (id: string) => id === 'IntelReports', []);
    return useGlobeIntelReportPipeline({
      isLayerActive,
      visualizationMode: { mode: 'CyberCommand', subMode: 'IntelReports' },
      temporalState: null,
      settings: props.s,
    });
  }, { initialProps: { s } });


const five = () => ['a', 'b', 'c', 'd', 'e'].map((id) => report(id));
const holdCap = () => (nostrStarcomIntelIngest as unknown as { setHoldCap: ReturnType<typeof vi.fn> }).setHoldCap;

describe('the report cap on the globe', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    setReportCapOverride(undefined);
    holdCap().mockClear();
    spy = vi.spyOn(intelReportService, 'listReports');
    vi.spyOn(intelReportService, 'createReport').mockResolvedValue({} as never);
    intelReportVisualizationService.clearCache();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    setReportCapOverride(undefined);
    intelReportVisualizationService.clearCache();
  });

  it('draws everything when the cap is Unlimited (BA5), past where people start', async () => {
    const sixty = Array.from({ length: 60 }, (_, i) => report(`r${i}`));
    spy.mockResolvedValue(sixty);
    const { result } = setup(settings(null));
    await waitFor(() => expect(result.current.intelReports).toHaveLength(60));
    expect(result.current.intelTotalMatching).toBe(60);
  });

  it('draws again when the setting changes, without anything else reloading', async () => {
    spy.mockResolvedValue(five());
    const { result, rerender } = setup(settings(2));
    await waitFor(() => expect(result.current.intelReports).toHaveLength(2));
    rerender({ s: settings(4) });
    await waitFor(() => expect(result.current.intelReports).toHaveLength(4));
  });

  it('draws to the handle\'s cap for the page while set, and to the setting once cleared (BA7)', async () => {
    spy.mockResolvedValue(five());
    const { result } = setup(settings(2));
    await waitFor(() => expect(result.current.intelReports).toHaveLength(2));
    act(() => setReportCapOverride(3));
    await waitFor(() => expect(result.current.intelReports).toHaveLength(3));
    act(() => setReportCapOverride('unlimited'));
    await waitFor(() => expect(result.current.intelReports).toHaveLength(5));
    act(() => setReportCapOverride(undefined));
    await waitFor(() => expect(result.current.intelReports).toHaveLength(2));
  });

  it('tells the intake how many to hold: 200 at least, more for a larger cap, everything for Unlimited (BA6)', async () => {
    spy.mockResolvedValue(five());
    const { rerender } = setup(settings(50));
    await waitFor(() => expect(holdCap()).toHaveBeenLastCalledWith(200));
    rerender({ s: settings(500) });
    await waitFor(() => expect(holdCap()).toHaveBeenLastCalledWith(500));
    rerender({ s: settings(null) });
    await waitFor(() => expect(holdCap()).toHaveBeenLastCalledWith(Infinity));
  });
});
