/**
 * RLSH profiles are the heroes' own (owner, 2026-10-17; rlsh-minors.md, RS49). Starcom ships no scraped data
 * and fetches none: no RLSH wiki, no Wikipedia, no static file of people. Until heroes submit their own public
 * profiles through NavCom, the layer draws no one, and says so rather than failing or inventing anyone.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { rlshVisualizationService } from '../RLSHVisualizationService';

type Internals = { isTestRuntime: () => boolean; fetchJson: (u: string) => Promise<unknown>; fetchSourceRecords: () => Promise<unknown[]> };
const internals = rlshVisualizationService as unknown as Internals;

describe('RLSH sources', () => {
  afterEach(() => vi.restoreAllMocks());

  it('draws no one, fetching nothing, until heroes submit their own profiles', async () => {
    vi.spyOn(internals, 'isTestRuntime').mockReturnValue(false);
    const fetchJson = vi.spyOn(internals, 'fetchJson');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await internals.fetchSourceRecords()).toEqual([]);
    expect(fetchJson).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('loads none submitted yet as nothing drawn, not as a failure', async () => {
    vi.spyOn(internals, 'isTestRuntime').mockReturnValue(false);
    await expect(rlshVisualizationService.getIntelCompatibleMarkers({ limit: 10 })).resolves.toEqual([]);
  });
});
