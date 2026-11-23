/**
 * A key entered while the app is running must take effect on the next request.
 *
 * This resolved its credential into a module-level constant, evaluated the
 * first time anything imported the file — necessarily before the user could
 * have typed one. So saving a key in the provider panel changed nothing until
 * a full page reload: the capability existed, was reachable, reported success,
 * and did not work.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const axiosGet = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: { get: axiosGet } }));

import { fetchEIAData, isEIAConfigured } from '../eia';
import { setUserCredential, clearUserCredential } from '../../shared/config/userCredentialStore';

const keySent = () => axiosGet.mock.calls.at(-1)?.[1]?.params?.api_key;

describe('EIA credential timing', () => {
  beforeEach(() => {
    localStorage.clear();
    clearUserCredential('eia');
    axiosGet.mockReset();
    axiosGet.mockResolvedValue({ data: { response: { data: [] } } });
  });

  it('uses a key saved after the module was imported', async () => {
    // The import above already happened, which is precisely the situation.
    await fetchEIAData('some/endpoint');
    const before = keySent();

    setUserCredential('eia', 'typed-just-now');
    await fetchEIAData('some/endpoint');

    expect(keySent()).toBe('typed-just-now');
    expect(keySent()).not.toBe(before);
  });

  it('picks up a key that is cleared again — by no longer asking', async () => {
    setUserCredential('eia', 'temporary');
    await fetchEIAData('some/endpoint');
    expect(keySent()).toBe('temporary');

    clearUserCredential('eia');
    await expect(fetchEIAData('some/endpoint')).resolves.toBeNull();
    // The cleared key is not reused, and no keyless request replaces it.
    expect(axiosGet).toHaveBeenCalledTimes(1);
  });
});

/**
 * An empty api_key earns EIA's 403, every time. The app sent about twenty of
 * them every five minutes per open tab, each logged as an API failure — for a
 * question whose answer was known before it left.
 */
describe('EIA with no key', () => {
  beforeEach(() => {
    localStorage.clear();
    axiosGet.mockReset();
  });

  it('sends nothing, and reports nothing', async () => {
    await expect(fetchEIAData('seriesid/PET.RWTC.W')).resolves.toBeNull();
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('says whether it is configured, read at the moment of asking', () => {
    expect(isEIAConfigured()).toBe(false);
    setUserCredential('eia', 'mine');
    expect(isEIAConfigured()).toBe(true);
  });
});
