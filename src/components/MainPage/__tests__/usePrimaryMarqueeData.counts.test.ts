/**
 * The marquee's counts say what was counted, and no more (plan item 1.8). The
 * STATUS panel is a second copy of these readouts and starts afresh each time
 * it opens: it said "TOTAL 0" until its read of the reports finished, beside a
 * strip that said "TOTAL 1". The relays were "2/6 UP | PROBE 0/6 OPEN": two
 * counts of different things in one readout, in a phrase used nowhere else.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const doubles = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { active: false, relaysUp: true, seen: 0, accepted: 0 };
  return {
    listeners,
    state,
    ingest: {
      isActive: () => state.active,
      getMetrics: () => ({
        seen: state.seen, accepted: state.accepted, acceptedEvents: state.accepted, droppedNoGeo: 0,
        droppedInvalid: 0, deduped: 0, droppedOverFeatureCap: 0, reducedGeometry: 0, relaysConnected: 5,
      }),
      getRelayStatus: () => Array.from({ length: 5 }, (_, i) => ({ url: `wss://relay-${i}.example`, connected: state.active && state.relaysUp })),
      getRelayProbeStatus: () => Array.from({ length: 5 }, (_, i) => ({ relay: `wss://relay-${i}.example`, status: 'pending', ts: 0 })),
      onChange: (listener: () => void) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
    },
    // Every hook double returns the same object on every call.
    // The registry's id for the globe. The strip carries readouts per screen
    // (decision D-F, step 3.4), so the id has to be the real one.
    router: { currentApp: 'cybercommand', getApplication: () => null, presentationMode: 'standard', history: [] },
  };
});

vi.mock('../../../services/intel/NostrStarcomIntelIngest', () => ({ nostrStarcomIntelIngest: doubles.ingest }));
vi.mock('../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => doubles.router }));
vi.mock('../../../utils/featureFlags', () => ({ useFeatureFlag: () => false }));
const reports = vi.hoisted(() => ({ read: (): Promise<unknown[]> => Promise.resolve([]) }));
vi.mock('../../../services/intel/IntelReportService', () => ({
  intelReportService: { listReports: () => reports.read(), onChange: () => () => {} },
}));

import { usePrimaryMarqueeData } from '../usePrimaryMarqueeData';

type Result = { current: ReturnType<typeof usePrimaryMarqueeData> };
const readout = (result: Result, id: string) => result.current.allSignals.find((s) => s.id === id)?.value;

beforeEach(() => {
  doubles.state.active = false;
  doubles.state.relaysUp = true;
  reports.read = () => Promise.resolve([]);
});

describe('usePrimaryMarqueeData: counts that say what was counted', () => {
  it('shows no report count until the reports are read', async () => {
    let finish: (r: unknown[]) => void = () => {};
    reports.read = () => new Promise((resolve) => { finish = resolve; });
    const { result } = renderHook(() => usePrimaryMarqueeData());
    expect(readout(result, 'intel-workflow-counters')).not.toMatch(/TOTAL 0/);
    expect(readout(result, 'intel-workflow-counters')).toMatch(/READING/);
    await act(async () => { finish([{ id: 'a', status: 'DRAFT' }, { id: 'b', status: 'REVIEWED' }]); });
    await waitFor(() => expect(readout(result, 'intel-workflow-counters')).toMatch(/^TOTAL 2\b/));
  });

  it('says a failed read failed, rather than that there are none', async () => {
    reports.read = () => Promise.reject(new Error('storage unavailable'));
    const { result } = renderHook(() => usePrimaryMarqueeData());
    await waitFor(() => expect(readout(result, 'intel-workflow-counters')).toMatch(/NOT READ/));
    expect(readout(result, 'intel-workflow-archive')).not.toMatch(/^0 /);
  });

  it('counts the relays connected in the words the globe uses, and the probes apart', async () => {
    const { result } = renderHook(() => usePrimaryMarqueeData());
    act(() => {
      doubles.state.active = true;
      doubles.listeners.forEach((listener) => listener());
    });
    await waitFor(() => expect(readout(result, 'nostr-relays')).toBe('5 OF 5 CONNECTED'));
    // Probes run in development builds only; a probe that never ran is not a relay that could not be reached.
    expect(readout(result, 'relay-probes')).toBe('NOT RUN');
  });

  it('counts only the probes that ran', async () => {
    // In flight is 'pending'; never started is 'not-run' (plan item 8.3b).
    const statuses = ['open', 'open', 'timeout', 'pending', 'not-run'];
    const original = doubles.ingest.getRelayProbeStatus;
    doubles.ingest.getRelayProbeStatus = () => statuses.map((status, i) => ({ relay: `wss://relay-${i}.example`, status, ts: 0 }));
    try {
      const { result } = renderHook(() => usePrimaryMarqueeData());
      await waitFor(() => expect(readout(result, 'relay-probes')).toBe('2 REACHED OF 3 PROBED'));
    } finally {
      doubles.ingest.getRelayProbeStatus = original;
    }
  });

  it('says standby before the relays are tried, and nominal only once one answers (plan item 8.3b)', async () => {
    // It said NOMINAL from the first frame: "nothing has failed" was all it checked,
    // and before ingest starts nothing can have.
    const { result } = renderHook(() => usePrimaryMarqueeData());
    expect(readout(result, 'operator-diagnostics')).toMatch(/^STANDBY\b/);
    act(() => {
      doubles.state.active = true;
      doubles.state.relaysUp = false;
      doubles.listeners.forEach((listener) => listener());
    });
    await waitFor(() => expect(readout(result, 'operator-diagnostics')).toMatch(/^WATCH\b/));
    act(() => {
      doubles.state.relaysUp = true;
      doubles.listeners.forEach((listener) => listener());
    });
    await waitFor(() => expect(readout(result, 'operator-diagnostics')).toMatch(/^NOMINAL\b/));
  });
});
