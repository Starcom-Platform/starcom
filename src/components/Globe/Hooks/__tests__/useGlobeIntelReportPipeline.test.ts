/**
 * The globe's intel-report data pipeline: fetch, filter, dedupe, and a
 * backpressured persistence flush — extracted from Globe.tsx's largest single
 * effect. Never touches the Three.js scene, which is what makes it testable
 * without a WebGL harness.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMemo } from 'react';
import type { IntelReportOverlayMarker } from '../../../../interfaces/IntelReportOverlay';
import { useGlobeIntelReportPipeline, type IntelReportSettings } from '../useGlobeIntelReportPipeline';
import { intelReportVisualizationService } from '../../../../services/IntelReportVisualizationService';
import { nostrStarcomIntelIngest } from '../../../../services/intel/NostrStarcomIntelIngest';
import { intelReportService } from '../../../../services/intel/IntelReportService';
import { intelWorkspaceManager } from '../../../../services/intel/IntelWorkspaceManager';
import RealTimeEventSystem from '../../../../services/realTimeEventSystem';

/*
 * Every vi.fn() lives INSIDE its factory, not as a module-level const
 * referenced from one — vi.mock() factories are hoisted above every other
 * top-level statement in the file, so a factory that closes over a `const`
 * declared below it hits that binding before its own initializer has run.
 * That produced a silent, total hang here rather than the TDZ error one
 * might expect: not even the simplest test in this file — one that never
 * activates the mocked services at all — ever produced output, timed out, or
 * threw, at any per-test timeout tried. Rewritten to the pattern this
 * codebase's other service-mocking tests already use correctly
 * (GlobeEngine.spaceWeather.test.ts): mock the module inline, import the
 * real (now-mocked) binding normally, configure it with vi.mocked(...).
 */
vi.mock('../../../../services/IntelReportVisualizationService', () => ({
  intelReportVisualizationService: {
    getIntelReportMarkers: vi.fn(),
    subscribe: vi.fn(),
    addMarker: vi.fn(),
    getDebugStats: vi.fn(() => ({})),
    getLastMatchingCountBeforeCap: vi.fn(() => 0),
    getLastHiddenByLens: vi.fn(() => 0),
  },
}));

vi.mock('../../../../services/intel/NostrStarcomIntelIngest', () => ({
  nostrStarcomIntelIngest: {
    subscribe: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    setHoldCap: vi.fn(),
    getMetrics: vi.fn(() => ({})),
    getRelayStatus: vi.fn(() => []),
    isActive: vi.fn(() => false),
    onChange: vi.fn(() => () => {}),
    // Boot may have accepted reports before the globe subscribed; the globe asks
    // for them. Unstubbed, the call throws and start() is never reached.
    replayAccepted: vi.fn(),
    // A note carried to its publisher's new key withdraws its original's marker (2 Nov key change).
    onWithdrawn: vi.fn(() => () => {}),
  },
}));

vi.mock('../../../../services/intel/IntelReportService', () => ({
  intelReportService: { importReport: vi.fn(), createReport: vi.fn() },
}));

vi.mock('../../../../services/intel/IntelWorkspaceManager', () => ({
  intelWorkspaceManager: { getPersistenceStats: vi.fn(() => ({})) },
}));

vi.mock('../../../../services/realTimeEventSystem', () => ({
  default: {
    getInstance: vi.fn(() => ({
      getLoopStats: vi.fn(() => ({ processedEvents: 0, tickCount: 0, queueDepth: 0, maxQueueDepth: 0 })),
    })),
  },
}));

const marker = (over: Partial<IntelReportOverlayMarker> = {}): IntelReportOverlayMarker => ({
  pubkey: 'p1', title: 'Report', author: 'a', content: 'c', timestamp: Date.now(),
  latitude: 1, longitude: 2, tags: [], ...over,
});

const allShown: IntelReportSettings = {
  autoRefresh: false,
  refreshInterval: 5,
  maxReports: 50,
  reportFiltering: { showCritical: true, showHigh: true, showMedium: true, showLow: true, showUnset: true },
};

/** The globe's real shipped defaults, not an all-on convenience fixture. */
const globeDefaults: IntelReportSettings = {
  autoRefresh: false,
  refreshInterval: 2,
  maxReports: 50,
  reportFiltering: { showCritical: true, showHigh: true, showMedium: true, showLow: false, showUnset: true },
};

const isLayerActive = (active: boolean) => (id: string) => active && id === 'IntelReports';

const setup = (active: boolean, settings: IntelReportSettings = allShown) =>
  renderHook(
    ({ isActive }) => {
      // The real Globe.tsx sources isLayerActive from useGlobeLayerControl(),
      // whose identity is stable across renders. Without matching that here,
      // this wrapper would hand the hook a brand-new function every render,
      // its effect (which lists isLayerActive as a dep) would tear down and
      // rebuild every render, and the inactive-branch's setIntelReports([])
      // call — a fresh array reference each time — would itself trigger the
      // next render, forever. Not a hook bug; a test-harness one.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const stableIsLayerActive = useMemo(() => isLayerActive(isActive), [isActive]);
      return useGlobeIntelReportPipeline({
        isLayerActive: stableIsLayerActive,
        visualizationMode: { mode: 'CyberCommand', subMode: isActive ? 'IntelReports' : 'Standard' },
        temporalState: null,
        settings,
      });
    },
    { initialProps: { isActive: active } },
  );

/*
 * What the globe can say while it is fetching (decision D-F, step 4).
 *
 * A first visit measured 14.7 s from load to the first report, and the globe drew
 * nothing and said nothing for all of it. It cannot say anything without this:
 * Globe.tsx gets no ingest state at all today.
 *
 * Its own beforeEach rather than the suite's, so what these cases depend on is
 * stated where they are read.
 */
describe('useGlobeIntelReportPipeline, while it is fetching', () => {
  beforeEach(() => {
    vi.mocked(intelReportVisualizationService.getIntelReportMarkers).mockResolvedValue([]);
    vi.mocked(intelReportVisualizationService.subscribe).mockReturnValue(() => {});
    vi.mocked(nostrStarcomIntelIngest.subscribe).mockReturnValue(() => {});
    vi.mocked(nostrStarcomIntelIngest.start).mockResolvedValue(undefined);
    vi.mocked(nostrStarcomIntelIngest.onChange).mockReturnValue(() => {});
  });

  it('reports how many of its relays are connected while nothing has arrived', async () => {
    vi.mocked(nostrStarcomIntelIngest.isActive).mockReturnValue(true);
    vi.mocked(nostrStarcomIntelIngest.getRelayStatus).mockReturnValue([
      { url: 'wss://a', connected: true },
      { url: 'wss://b', connected: true },
      { url: 'wss://c', connected: false },
      { url: 'wss://d', connected: false },
      { url: 'wss://e', connected: false },
    ]);

    const { result } = setup(true);

    await waitFor(() => expect(result.current.intelListening).toEqual({ connected: 2, total: 5 }));
  });

  /* The layer being off is not the same claim as fetching and hearing nothing. */
  it('claims nothing while the layer is off', async () => {
    vi.mocked(nostrStarcomIntelIngest.isActive).mockReturnValue(false);
    vi.mocked(nostrStarcomIntelIngest.getRelayStatus).mockReturnValue([]);

    const { result } = setup(false);

    await waitFor(() => expect(result.current.intelListening).toBeNull());
  });

  /*
   * The 16.8 s measured in the running app. start() is awaited deep inside the
   * pipeline effect, so isActive() is false for all of it — and the globe cannot
   * wait for the ingest before admitting it is fetching.
   */
  it('says it is starting while the layer is on and the ingest is not', async () => {
    vi.mocked(nostrStarcomIntelIngest.isActive).mockReturnValue(false);
    vi.mocked(nostrStarcomIntelIngest.getRelayStatus).mockReturnValue([]);

    const { result } = setup(true);

    await waitFor(() => expect(result.current.intelListening).toBe('starting'));
  });
});

describe('useGlobeIntelReportPipeline', () => {
  beforeEach(() => {
    vi.mocked(intelReportVisualizationService.getIntelReportMarkers).mockResolvedValue([]);
    vi.mocked(intelReportVisualizationService.subscribe).mockReturnValue(() => {});
    vi.mocked(nostrStarcomIntelIngest.subscribe).mockReturnValue(() => {});
    vi.mocked(nostrStarcomIntelIngest.start).mockResolvedValue(undefined);
    vi.mocked(intelReportService.createReport).mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.mocked(intelReportVisualizationService.getIntelReportMarkers).mockClear();
    vi.mocked(intelReportVisualizationService.subscribe).mockClear();
    vi.mocked(intelReportVisualizationService.addMarker).mockClear();
    vi.mocked(nostrStarcomIntelIngest.subscribe).mockClear();
    vi.mocked(nostrStarcomIntelIngest.start).mockClear();
    vi.mocked(nostrStarcomIntelIngest.stop).mockClear();
    vi.mocked(intelReportService.importReport).mockClear();
    vi.mocked(intelReportService.createReport).mockClear();
    vi.mocked(intelWorkspaceManager.getPersistenceStats).mockClear();
  });

  it('starts empty and inactive, with no service calls', () => {
    const { result } = setup(false);
    expect(result.current.intelReports).toEqual([]);
    expect(intelReportVisualizationService.getIntelReportMarkers).not.toHaveBeenCalled();
    expect(nostrStarcomIntelIngest.start).not.toHaveBeenCalled();
  });

  it('fetches and shows markers once IntelReports is active', async () => {
    vi.mocked(intelReportVisualizationService.getIntelReportMarkers).mockResolvedValue([
      marker({ pubkey: 'a' }), marker({ pubkey: 'b' }),
    ]);
    const { result } = setup(true);
    await waitFor(() => expect(result.current.intelReports).toHaveLength(2));
    expect(nostrStarcomIntelIngest.start).toHaveBeenCalled();
  });

  it('filters by priority per settings', async () => {
    vi.mocked(intelReportVisualizationService.getIntelReportMarkers).mockResolvedValue([
      marker({ pubkey: 'crit', tags: ['CRITICAL'] }),
      marker({ pubkey: 'low', tags: [] }),
    ]);
    const settings: IntelReportSettings = {
      ...allShown,
      reportFiltering: { showCritical: true, showHigh: true, showMedium: true, showLow: false },
    };
    const { result } = setup(true, settings);
    await waitFor(() => expect(result.current.intelReports.map((r) => r.pubkey)).toEqual(['crit']));
    // Total-matching reflects what passed the filter, not what came back raw.
    expect(result.current.intelTotalMatching).toBe(1);
  });

  /*
   * The big-three lenses (D-CT, CT5): the service applies them before its cap and counts what
   * they left out; a subscriber is handed every marker, and the pipeline applies them itself.
   * Either way only reports carrying a chosen lens are drawn, and the rest are counted.
   */
  it('asks the service for the chosen lenses before its cap, and says what they hid', async () => {
    vi.mocked(intelReportVisualizationService.getIntelReportMarkers).mockResolvedValue([
      marker({ pubkey: 'tcs', tags: ['lens:tcs'] }),
    ]);
    vi.mocked(intelReportVisualizationService.getLastHiddenByLens).mockReturnValue(4);
    const { result } = setup(true, { ...allShown, lenses: ['tcs'] });
    await waitFor(() => expect(result.current.intelReports.map((r) => r.pubkey)).toEqual(['tcs']));
    expect(vi.mocked(intelReportVisualizationService.getIntelReportMarkers).mock.calls.at(-1)?.[0]).toMatchObject({ lenses: ['tcs'] });
    expect(result.current.intelHiddenByLens).toBe(4);
    vi.mocked(intelReportVisualizationService.getLastHiddenByLens).mockReturnValue(0);
  });

  it('applies the lenses itself to what a subscriber is handed, more than one lens at once', async () => {
    let deliver: ((markers: IntelReportOverlayMarker[]) => void) | null = null;
    // Only the subscriber's delivery: a refresh that never answers cannot race it.
    vi.mocked(intelReportVisualizationService.getIntelReportMarkers).mockReturnValue(new Promise(() => {}));
    vi.mocked(intelReportVisualizationService.subscribe).mockImplementation((listener) => {
      deliver = listener;
      return () => {};
    });
    const { result } = setup(true, { ...allShown, lenses: ['idc', 'cbc'] });
    await waitFor(() => expect(deliver).not.toBeNull());
    act(() => deliver!([
      marker({ pubkey: 'idc', tags: ['nostr', 'lens:idc'] }),
      marker({ pubkey: 'cbc+tcs', tags: ['lens:tcs', 'lens:cbc'] }),
      marker({ pubkey: 'tcs', tags: ['lens:tcs'] }),
      marker({ pubkey: 'none', tags: ['world_note'] }),
    ]));
    await waitFor(() => expect(result.current.intelReports.map((r) => r.pubkey)).toEqual(['idc', 'cbc+tcs']));
    expect(result.current.intelHiddenByLens).toBe(2);
  });

  it('draws a note sent again at its address as sent, so its sources reach the popup (D-CT, CT7)', async () => {
    let deliver: ((markers: IntelReportOverlayMarker[]) => void) | null = null;
    vi.mocked(intelReportVisualizationService.getIntelReportMarkers).mockReturnValue(new Promise(() => {}));
    vi.mocked(intelReportVisualizationService.subscribe).mockImplementation((listener) => {
      deliver = listener;
      return () => {};
    });
    const { result } = setup(true);
    await waitFor(() => expect(deliver).not.toBeNull());
    act(() => deliver!([marker({ pubkey: 'note', nostrEventId: 'v1' })]));
    await waitFor(() => expect(result.current.intelReports).toHaveLength(1));
    act(() => deliver!([marker({ pubkey: 'note', nostrEventId: 'v2', sourceLinks: ['https://www.occ.gov/a'] })]));
    await waitFor(() => expect(result.current.intelReports[0].sourceLinks).toEqual(['https://www.occ.gov/a']));
  });

  it('draws every report under All', async () => {
    vi.mocked(intelReportVisualizationService.getIntelReportMarkers).mockResolvedValue([
      marker({ pubkey: 'tcs', tags: ['lens:tcs'] }), marker({ pubkey: 'none', tags: [] }),
    ]);
    const { result } = setup(true, { ...allShown, lenses: [] });
    await waitFor(() => expect(result.current.intelReports).toHaveLength(2));
    expect(result.current.intelHiddenByLens).toBe(0);
  });

  it('caps the drawn set at maxReports', async () => {
    // This asserted intelTotalMatching === 3 and called that "pre-cap", but the
    // real service caps BEFORE returning, so three markers never reach this
    // code when maxReports is 2. The mock ignores the maxReports option it is
    // handed, which is what made the impossible state look reachable — and it
    // meant every cap assertion here passed whether or not the bug existed.
    //
    // The pre-cap total is now covered against the REAL service in
    // useGlobeIntelReportPipeline.precap.test.ts. What this file can honestly
    // check is the client-side slice.
    vi.mocked(intelReportVisualizationService.getIntelReportMarkers).mockResolvedValue([
      marker({ pubkey: 'a' }), marker({ pubkey: 'b' }), marker({ pubkey: 'c' }),
    ]);
    const { result } = setup(true, { ...allShown, maxReports: 2 });
    await waitFor(() => expect(result.current.intelReports).toHaveLength(2));
    expect(result.current.intelReports.map(m => m.pubkey)).toEqual(['a', 'b']);
  });

  it('does not replace the array when a re-applied marker set is identical', async () => {
    vi.mocked(intelReportVisualizationService.getIntelReportMarkers).mockResolvedValue([marker({ pubkey: 'a' })]);
    const { result } = setup(true);
    await waitFor(() => expect(result.current.intelReports).toHaveLength(1));
    const first = result.current.intelReports;

    // The subscribe listener re-delivering the same markers must not bump the
    // reference — that is the signature-dedup this hook exists to preserve
    // (it stops an unchanged marker set from re-triggering downstream renders).
    const listener = vi.mocked(intelReportVisualizationService.subscribe).mock.calls[0][0];
    act(() => listener([marker({ pubkey: 'a' })]));

    expect(result.current.intelReports).toBe(first);
  });

  it('replaces the array when the marker set actually changes', async () => {
    vi.mocked(intelReportVisualizationService.getIntelReportMarkers).mockResolvedValue([marker({ pubkey: 'a' })]);
    const { result } = setup(true);
    await waitFor(() => expect(result.current.intelReports).toHaveLength(1));

    const listener = vi.mocked(intelReportVisualizationService.subscribe).mock.calls[0][0];
    act(() => listener([marker({ pubkey: 'a' }), marker({ pubkey: 'b' })]));

    expect(result.current.intelReports).toHaveLength(2);
  });

  it('clears reports and shows a real notice naming the new mode, only if something was visible', async () => {
    vi.mocked(intelReportVisualizationService.getIntelReportMarkers).mockResolvedValue([marker()]);
    const { result, rerender } = setup(true);
    await waitFor(() => expect(result.current.intelReports).toHaveLength(1));

    rerender({ isActive: false });

    expect(result.current.intelReports).toEqual([]);
    expect(result.current.intelClearedNotice).toBe('Intel reports hidden — switched to CyberCommand mode');
  });

  it('shows no notice switching modes when there was nothing visible to lose', () => {
    // First render already inactive — nothing was ever shown.
    const { result, rerender } = setup(false);
    rerender({ isActive: false });
    expect(result.current.intelClearedNotice).toBeNull();
  });

  /*
   * This asserted the opposite until 2026-09-17, and the contract was inverted
   * deliberately rather than absorbed (decision D-F, step 4.2).
   *
   * Boot owns the ingest now. The globe unsubscribes its own listener — it stops
   * LISTENING — but must not stop the ingest, because this effect's cleanup runs
   * on sub-mode change, layer change, timeline scrub and any refresh-setting
   * change. Stopping here killed a boot-started ingest on the first layer switch,
   * and line 390 is the only start() in shipped code, so nothing restarted it.
   */
  it('unsubscribes on unmount without stopping the ingest boot owns', async () => {
    const unsub = vi.fn();
    const unsubNostr = vi.fn();
    vi.mocked(intelReportVisualizationService.subscribe).mockReturnValue(unsub);
    vi.mocked(nostrStarcomIntelIngest.subscribe).mockReturnValue(unsubNostr);

    const { unmount } = setup(true);
    await waitFor(() => expect(nostrStarcomIntelIngest.start).toHaveBeenCalled());

    unmount();

    expect(unsub).toHaveBeenCalled();
    expect(unsubNostr).toHaveBeenCalled();
    expect(nostrStarcomIntelIngest.stop).not.toHaveBeenCalled();
  });

  /*
   * Boot starts the ingest, so on a first visit the relays may have answered before
   * this subscription existed — about eleven seconds earlier under a software
   * rasterizer. Five probe runs without this found one partial success and four
   * with no reports in 90 s.
   *
   * Added because stubbing replayAccepted in the mock factory made three suites go
   * green while nothing asserted the globe calls it at all.
   */
  it('asks for the reports accepted before it subscribed', async () => {
    vi.mocked(nostrStarcomIntelIngest.subscribe).mockReturnValue(vi.fn());

    setup(true);

    await waitFor(() => expect(nostrStarcomIntelIngest.replayAccepted).toHaveBeenCalled());
  });

  /* Asking is half of it; what comes back has to reach the globe's markers. */
  it('draws what replay hands it', async () => {
    vi.mocked(nostrStarcomIntelIngest.subscribe).mockReturnValue(vi.fn());
    vi.mocked(nostrStarcomIntelIngest.replayAccepted).mockImplementation(((listener: (report: unknown) => void) => {
      listener({ id: 'replayed-1', title: 'Replayed', content: '', tags: [], latitude: 1, longitude: 2 });
    }) as never);

    setup(true);

    await waitFor(() => expect(intelReportVisualizationService.addMarker)
      .toHaveBeenCalledWith(expect.objectContaining({ id: 'replayed-1' })));
  });

  /*
   * The case the inversion exists for: leaving IntelReports must not take the
   * ingest down with it. A dependency change re-runs the effect's cleanup, which
   * is the path that made moving the start alone a regression.
   */
  it('keeps the ingest running when the layer is switched away', async () => {
    vi.mocked(nostrStarcomIntelIngest.subscribe).mockReturnValue(vi.fn());

    const { rerender } = setup(true);
    await waitFor(() => expect(nostrStarcomIntelIngest.start).toHaveBeenCalled());

    rerender({ isActive: false });

    await waitFor(() => expect(nostrStarcomIntelIngest.stop).not.toHaveBeenCalled());
  });

  it('forwards an incoming Nostr report to addMarker', async () => {
    setup(true);
    await waitFor(() => expect(nostrStarcomIntelIngest.subscribe).toHaveBeenCalled());

    const nostrListener = vi.mocked(nostrStarcomIntelIngest.subscribe).mock.calls[0][0];
    act(() => nostrListener({ ...marker(), id: 'n1' }));

    expect(intelReportVisualizationService.addMarker).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }));
  });

  /*
   * These run against globeDefaults — the settings a user actually has —
   * rather than the all-on fixture above, because the bug was invisible under
   * an all-on fixture. That is the whole reason it survived: showLow: false is
   * the shipped default, and every report the app creates for itself fell
   * through to 'low'.
   */
  describe('priority filtering under the SHIPPED defaults', () => {
    it('draws a report created from the globe context menu', async () => {
      vi.mocked(intelReportVisualizationService.getIntelReportMarkers).mockResolvedValue([
        marker({ pubkey: 'ctx', tags: ['user-created', 'context-menu'] }),
      ]);

      const { result } = setup(true, globeDefaults);

      await waitFor(() => expect(result.current.intelReports).toHaveLength(1));
      expect(result.current.intelReports[0].pubkey).toBe('ctx');
    });

    it('draws an offline-created and a Nostr-ingested report', async () => {
      vi.mocked(intelReportVisualizationService.getIntelReportMarkers).mockResolvedValue([
        marker({ pubkey: 'off', tags: ['location', 'offline'] }),
        marker({ pubkey: 'nos', tags: ['nostr', 'relay:wss://relay.damus.io'] }),
      ]);

      const { result } = setup(true, globeDefaults);

      await waitFor(() => expect(result.current.intelReports).toHaveLength(2));
    });

    it('still hides a report someone explicitly tagged LOW — the filter still works', async () => {
      // Without this the fix could have been "show everything", which is not
      // the decision: an explicit LOW is a statement, and showLow: false honours it.
      vi.mocked(intelReportVisualizationService.getIntelReportMarkers).mockResolvedValue([
        marker({ pubkey: 'lo', tags: ['LOW'] }),
        marker({ pubkey: 'un', tags: ['whatever'] }),
      ]);

      const { result } = setup(true, globeDefaults);

      await waitFor(() => expect(result.current.intelReports).toHaveLength(1));
      expect(result.current.intelReports[0].pubkey).toBe('un');
    });

    it('honours showUnset: false for an operator who deliberately turns it off', async () => {
      const hidden: IntelReportSettings = {
        ...globeDefaults,
        reportFiltering: { ...globeDefaults.reportFiltering, showUnset: false },
      };
      vi.mocked(intelReportVisualizationService.getIntelReportMarkers).mockResolvedValue([
        marker({ pubkey: 'un', tags: ['whatever'] }),
      ]);

      const { result } = setup(true, hidden);

      await waitFor(() => expect(nostrStarcomIntelIngest.start).toHaveBeenCalled());
      expect(result.current.intelReports).toHaveLength(0);
    });
  });
});
