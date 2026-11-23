/**
 * Verifies getSubmarineCableData()'s stale-cache fallback: if the live fetch fails but a
 * real stale cached copy exists, that stale copy is served instead of surfacing an error
 * — showing last week's real cable map beats showing nothing. Only a genuine cold-start
 * failure (no cache at all) should propagate. Separate file from
 * SubmarineCableService.test.ts because this needs a mocked axios/cache store, while that
 * file deliberately uses the real axios for its live-reachability tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import type { SubmarineCableData } from '../../types/CommHubs';

vi.mock('axios');

const cacheGetMock = vi.fn();
const cacheSetMock = vi.fn();
vi.mock('./SubmarineCableCacheStore', () => ({
  submarineCableCacheStore: {
    get: () => cacheGetMock(),
    set: (data: SubmarineCableData) => cacheSetMock(data)
  }
}));

const staleData: SubmarineCableData = {
  cables: [{ id: 'old', name: 'Old Cable', color: '#e63946', paths: [[[0, 0], [1, 1]]], isPlanned: false, rfsYear: 2010, landingPoints: [] }],
  landingPoints: [],
  fetchedAt: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago — well past the 7-day TTL
  datasetCableCount: 1
};

describe('getSubmarineCableData — stale-cache fallback on live fetch failure', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    cacheGetMock.mockReset();
    cacheSetMock.mockReset();
  });

  it('serves the real stale cached copy when the live fetch fails and a cache exists', async () => {
    cacheGetMock.mockResolvedValue(staleData);
    vi.mocked(axios.get).mockRejectedValue(new Error('network down'));

    const { getSubmarineCableData, getLastSubmarineCableFetchInfo } = await import('./SubmarineCableService');
    const result = await getSubmarineCableData();

    expect(result).toBe(staleData);
    expect(getLastSubmarineCableFetchInfo()).toEqual({
      fetchedAt: staleData.fetchedAt,
      datasetCableCount: staleData.datasetCableCount,
      fromCache: true
    });
  });

  it('propagates the error when the live fetch fails and there is no cache at all', async () => {
    cacheGetMock.mockResolvedValue(null);
    vi.mocked(axios.get).mockRejectedValue(new Error('network down'));

    const { getSubmarineCableData } = await import('./SubmarineCableService');
    await expect(getSubmarineCableData()).rejects.toThrow('network down');
  });
});
