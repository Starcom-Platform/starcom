/**
 * This file used to assert the inventions: that the "latest" gasoline price
 * was 3.25, oil inventory 350 and gas storage 3200 — constants returned in
 * place of readings "to avoid 'Unknown EIA series' warnings". A test that pins
 * a fabricated value keeps it alive; this one pins its absence.
 */
import { describe, it, expect, vi } from 'vitest';

global.fetch = vi.fn();

describe('EIAService legacy readings', () => {
  it('refuses rather than returning a value it does not have', async () => {
    const EIAService = (await import('./EIAService.js')).default;

    await expect(EIAService.getLatestGasolinePrice()).rejects.toThrow(/No live source/);
    await expect(EIAService.getLatestOilInventory()).rejects.toThrow(/No live source/);
    await expect(EIAService.getLatestNaturalGasStorage()).rejects.toThrow(/No live source/);
  });

  // The app-wide dashboard path that also refused is gone: nothing read it (plan block F, item 2).
});
