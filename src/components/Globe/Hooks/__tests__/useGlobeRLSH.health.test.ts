/**
 * What the RLSH layer says about its own data (decision D-F, step 12).
 *
 * The hook returned `{ reports, loading }` and nothing else, so Globe.tsx built
 * its feed as `unreported` and the key and the share card both said "does not
 * report whether its data arrived". A failure was swallowed — `setReports([])`
 * and a log line — so it looked exactly like an empty registry.
 *
 * And the data has an age worth stating: the layer is as current as its least-recently verified profile. (The
 * scraped snapshot this was measured on, some two hundred days old, is gone: RS49.)
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useGlobeRLSH, rlshSourceAsOf } from '../useGlobeRLSH';
import type { IntelReportOverlayMarker } from '../../../../interfaces/IntelReportOverlay';

const svc = vi.hoisted(() => ({ get: vi.fn() }));
// Keep the module's real exports (the hook reads RLSH_MARKER_CAPS from it);
// replace only the service, which would hand a test placeholders by design.
vi.mock('../../../../services/RLSHVisualizationService', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  rlshVisualizationService: {
    getIntelCompatibleMarkers: (...a: unknown[]) => svc.get(...a),
    subscribe: () => () => {},
    getDebugStats: () => ({}),
  },
}));

const marker = (over: Partial<IntelReportOverlayMarker>): IntelReportOverlayMarker => ({
  pubkey: 'p', title: 't', content: '', tags: [], latitude: 0, longitude: 0,
  timestamp: 0, author: 'wiki.rlsh.net', ...over,
});

describe('rlshSourceAsOf', () => {
  /*
   * The oldest record, since the layer is only as current as its least-recently
   * verified entry — the rule Cyber Threats already follows for its blocklists.
   */
  it('takes the oldest record time', () => {
    expect(rlshSourceAsOf([
      marker({ pubkey: 'a', timestamp: Date.parse('2026-09-01T00:00:00Z') }),
      marker({ pubkey: 'b', timestamp: Date.parse('2026-03-02T15:15:26Z') }),
    ])).toBe(Date.parse('2026-03-02T15:15:26Z'));
  });

  it('skips a record whose time cannot be read, and is null when none can', () => {
    expect(rlshSourceAsOf([marker({ timestamp: Number.NaN })])).toBeNull();
    expect(rlshSourceAsOf([])).toBeNull();
  });

});

describe('useGlobeRLSH — health', () => {
  beforeEach(() => { svc.get.mockReset(); });
  const mount = () => renderHook(() => useGlobeRLSH({ isLayerActive: (id) => id === 'RLSH', isMobileDevice: false }));

  it('reports when the drawn registry was verified', async () => {
    svc.get.mockResolvedValue([
      marker({ pubkey: 'a', latitude: 1, timestamp: Date.parse('2026-03-02T15:15:26Z') }),
      marker({ pubkey: 'b', latitude: 2, timestamp: Date.parse('2026-04-01T00:00:00Z') }),
    ]);
    const { result } = mount();

    await waitFor(() => expect(result.current.lastLoadedAt).toBe(Date.parse('2026-03-02T15:15:26Z')));
    expect(result.current.error).toBeNull();
  });

  /*
   * The failure that used to look like an empty registry. Now it has a reason,
   * and the key says "did not load" instead of drawing nothing in silence.
   */
  it('carries the reason when the registry fails to load', async () => {
    svc.get.mockRejectedValue(new Error('every RLSH source failed'));
    const { result } = mount();

    await waitFor(() => expect(result.current.error).toMatch(/every RLSH source failed/));
    expect(result.current.lastLoadedAt).toBeNull();
    expect(result.current.reports).toEqual([]);
  });

  it('says a list with no profiles yet loaded, as of when it was read (RS49)', async () => {
    svc.get.mockResolvedValue([]);
    const before = Date.now();
    const { result } = mount();

    await waitFor(() => expect(result.current.lastLoadedAt).not.toBeNull());
    expect(result.current.lastLoadedAt!).toBeGreaterThanOrEqual(before);
    expect(result.current.error).toBeNull();
    expect(result.current.untimed).toBe(false);
    expect(result.current.reports).toEqual([]);
  });

  it('says a registry that loaded without readable times is untimed, not unloaded', async () => {
    svc.get.mockResolvedValue([marker({ timestamp: Number.NaN })]);
    const { result } = mount();

    await waitFor(() => expect(result.current.untimed).toBe(true));
    expect(result.current.error).toBeNull();
  });
});
