/**
 * With no EIA key, the energy marquee asks nothing — and says that is why.
 *
 * It used to send every series with an empty api_key: about twenty 403s every
 * five minutes per open tab, each logged as an API failure, rendered as "no
 * data" — as though EIA had nothing, when it had never been asked.
 *
 * And a key typed into the provider panel has to take effect then, not at the
 * next five-minute tick, or it looks like the key did nothing.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const service = vi.hoisted(() => ({
  getCriticalData: vi.fn(async () => ({ oilPrice: 71.2 })),
  getAllEnhancedData: vi.fn(async () => ({ oilPrice: 71.2 })),
}));
vi.mock('../../services/eia/EIAService', () => ({
  EnhancedEIAService: { getInstance: () => service },
}));

import { useEnhancedEIAData } from '../useEnhancedEIAData';
import { setUserCredential, clearUserCredential } from '../../shared/config/userCredentialStore';

describe('useEnhancedEIAData and the EIA key', () => {
  beforeEach(() => {
    localStorage.clear();
    service.getCriticalData.mockClear();
    service.getAllEnhancedData.mockClear();
  });

  it('with no key, reports it is not configured and asks the service for nothing', async () => {
    const { result } = renderHook(() => useEnhancedEIAData({ enableAutoRefresh: false }));

    await waitFor(() => expect(result.current.configured).toBe(false));
    // Give a would-be fetch every chance to have started.
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(service.getCriticalData).not.toHaveBeenCalled();
    expect(service.getAllEnhancedData).not.toHaveBeenCalled();
  });

  it('fetches as soon as a key is saved — not at the next tick', async () => {
    const { result } = renderHook(() => useEnhancedEIAData({ enableAutoRefresh: false }));
    await waitFor(() => expect(result.current.configured).toBe(false));

    act(() => { setUserCredential('eia', 'mine'); });

    await waitFor(() => expect(service.getAllEnhancedData).toHaveBeenCalled());
    expect(result.current.configured).toBe(true);
  });

  it('goes back to not configured when the key is cleared', async () => {
    setUserCredential('eia', 'mine');
    const { result } = renderHook(() => useEnhancedEIAData({ enableAutoRefresh: false }));
    await waitFor(() => expect(result.current.configured).toBe(true));
    await waitFor(() => expect(service.getAllEnhancedData).toHaveBeenCalled());

    act(() => { clearUserCredential('eia'); });

    await waitFor(() => expect(result.current.configured).toBe(false));
  });
});
