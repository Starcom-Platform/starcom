/**
 * One relay count, followed at every change (plan item 1.8): the top strip
 * sampled it on its own timer, so it lagged the globe's note beside it.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const ingest = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { active: false, connected: [false, false, false] };
  return {
    listeners, state,
    service: {
      isActive: () => state.active,
      getRelayStatus: () => state.connected.map((connected, i) => ({ url: `wss://r${i}.example`, connected })),
      onChange: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
    },
  };
});
vi.mock('../../services/intel/NostrStarcomIntelIngest', () => ({ nostrStarcomIntelIngest: ingest.service }));

import { useRelayCount } from '../useRelayCount';

describe('useRelayCount', () => {
  it('counts the relays connected, at the moment each change is reported, and stops following on unmount', () => {
    const { result, unmount } = renderHook(() => useRelayCount());
    expect(result.current).toEqual({ active: false, connected: 0, total: 3 });
    act(() => {
      ingest.state.active = true;
      ingest.state.connected = [true, false, true];
      ingest.listeners.forEach((l) => l());
    });
    expect(result.current).toEqual({ active: true, connected: 2, total: 3 });
    unmount();
    expect(ingest.listeners.size).toBe(0);
  });
});
