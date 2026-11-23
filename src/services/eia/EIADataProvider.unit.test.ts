// Moved from src/__tests__/EIADataProvider.unit.test.ts
import { describe, it, expect, vi } from 'vitest';
import { EIADataProvider } from './EIADataProvider';

/**
 * The API layer is mocked, because these were live-network tests.
 *
 * They called `provider.fetchData(...)` with no fetch mock of their own and
 * inherited the setup file's default — which returns `{}`, from which this
 * provider can read no value at all. So they were only ever passing by
 * reaching api.eia.gov for real: 1811ms and 461ms for two "unit" tests, and a
 * 15-second timeout whenever the network was slow. That was three of the
 * remaining flakes in src/services.
 *
 * `noaaSpaceWeather.unit.test.ts` is quarantined for exactly this, named the
 * same way and equally not a unit test. These are kept rather than quarantined
 * because what they assert — that a value is parsed out and the observer hooks
 * fire — is genuinely unit-testable once the API layer is stubbed. Removing
 * them would trade a flake for a coverage hole.
 */
vi.mock('../../api/eia', () => ({
  // A week old: the provider refuses a weekly reading older than five weeks.
  fetchEIAData: vi.fn(async () => [{ value: 78.42, period: new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10) }]),
}));

// TODO: Implement intel report expiration and archival mechanisms - PRIORITY: MEDIUM
// TODO: Add comprehensive intel report access control and permission management - PRIORITY: HIGH
describe('EIADataProvider', () => {
  it('returns data on success', async () => {
    const provider = new EIADataProvider();
    const data = await provider.fetchData('PET.RWTC.W');
    expect(typeof data).toBe('number');
  });

  it('calls observer hooks', async () => {
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
});
