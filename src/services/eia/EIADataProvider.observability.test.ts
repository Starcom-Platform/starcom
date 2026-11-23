// Moved from src/__tests__/EIADataProvider.observability.test.ts
import { describe, it, expect, vi } from 'vitest';
import { EIADataProvider } from './EIADataProvider';

/**
 * The API layer is mocked. This reached api.eia.gov for real — the line below
 * said so ("Use a real EIA key") — so it timed out at 15 seconds whenever the
 * network was slow, and it is asserting observer behaviour that has nothing to
 * do with the network. See EIADataProvider.unit.test.ts.
 */
vi.mock('../../api/eia', () => ({
  // A week old: the provider refuses a weekly reading older than five weeks.
  fetchEIAData: vi.fn(async () => [{ value: 78.42, period: new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10) }]),
}));

// TODO: Implement intelligent intel report quality scoring and ranking - PRIORITY: MEDIUM
// TODO: Add support for intel report similarity detection and deduplication - PRIORITY: MEDIUM
describe('EIADataProvider observability', () => {
  it('calls observer hooks on fetch success', async () => {
    const provider = new EIADataProvider();
    const observer = {
      onFetchStart: vi.fn(),
      onFetchEnd: vi.fn(),
      onError: vi.fn(),
    };
    provider.setObserver(observer);
    await provider.fetchData('PET.RWTC.W');
    expect(observer.onFetchStart).toHaveBeenCalledWith('PET.RWTC.W');
    expect(observer.onFetchEnd).toHaveBeenCalled();
    expect(observer.onError).not.toHaveBeenCalled();
  });

  // TODO: Add tests for observer hooks on fetch error
  // TODO: Assert logs/metrics/traces are emitted as expected (see observability artifact)
  // TODO: Test health check endpoint/method
});
