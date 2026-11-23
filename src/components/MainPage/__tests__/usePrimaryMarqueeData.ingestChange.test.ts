/**
 * The header follows the Nostr ingest as it changes (decision D-F, step 1). It read
 * the ingest once at load, before the globe had started it, and then every 60 seconds
 * while it looked idle, so a first visit was told "INGEST STANDBY" for a minute in
 * which the ingest had started at 14 seconds and accepted 7 reports by 30.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const doubles = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { active: false, seen: 0, accepted: 0 };
  return {
    listeners,
    state,
    ingest: {
      isActive: () => state.active,
      getMetrics: () => ({
        seen: state.seen, accepted: state.accepted, acceptedEvents: state.accepted, droppedNoGeo: 0,
        droppedInvalid: 0, deduped: 0, droppedOverFeatureCap: 0, reducedGeometry: 0, relaysConnected: 5,
      }),
      getRelayStatus: () => Array.from({ length: 5 }, (_, i) => ({ url: `wss://relay-${i}.example`, connected: state.active })),
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
vi.mock('../../../services/intel/IntelReportService', () => ({
  intelReportService: { listReports: async () => [], onChange: () => () => {} },
}));

import { usePrimaryMarqueeData } from '../usePrimaryMarqueeData';

type Result = { current: ReturnType<typeof usePrimaryMarqueeData> };
const signal = (result: Result, id: string) => result.current.signals.find((s) => s.id === id)?.value;

beforeEach(() => {
  doubles.state.active = false;
  doubles.state.seen = 0;
  doubles.state.accepted = 0;
});

describe('usePrimaryMarqueeData: the Nostr ingest readout', () => {
  it('says the ingest is up soon after it starts, not at the next minute', async () => {
    const { result, unmount } = renderHook(() => usePrimaryMarqueeData());
    expect(signal(result, 'nostr-relays')).toBe('INGEST STANDBY');

    act(() => {
      doubles.state.active = true;
      doubles.state.seen = 10;
      doubles.state.accepted = 7;
      doubles.listeners.forEach((listener) => listener());
    });

    await waitFor(() => expect(signal(result, 'nostr-relays')).toBe('5 OF 5 CONNECTED'), { timeout: 3000 });
    // The relay count follows at once; the counters on the next read, a second at most.
    await waitFor(() => expect(signal(result, 'nostr-ingest-counters')).toBe('SEEN 10 | ACCEPT 7 | DROP 0'), { timeout: 3000 });
    unmount();
  });

  it('gives a screen the ingest is not about none of it, and the panel all of it', async () => {
    // Cases carries no readouts of its own (decision D-F, step 3.4); the status
    // panel the strip opens still holds every one.
    doubles.router.currentApp = 'cases';
    const { result, unmount } = renderHook(() => usePrimaryMarqueeData());

    expect(result.current.signals).toEqual([]);
    expect(result.current.allSignals.find((s) => s.id === 'nostr-relays')?.value).toBe('INGEST STANDBY');
    // The wallet is retired (plan item 4.4): no Solana link, chain telemetry or
    // wallet sign-in readout, and no wallet diagnostics switch.
    for (const id of ['network-posture', 'network-telemetry', 'auth-posture']) {
      expect(result.current.allSignals.find((s) => s.id === id), id).toBeUndefined();
    }
    expect(result.current.allSignals.find((s) => s.id === 'operator-diagnostics')?.value).not.toMatch(/WALLET/);

    unmount();
    doubles.router.currentApp = 'cybercommand';
  });

  it('stops following the ingest when it unmounts', () => {
    const { unmount } = renderHook(() => usePrimaryMarqueeData());
    // The relay count and the timed sampler each follow it.
    expect(doubles.listeners.size).toBeGreaterThan(0);

    unmount();

    expect(doubles.listeners.size).toBe(0);
  });
});
