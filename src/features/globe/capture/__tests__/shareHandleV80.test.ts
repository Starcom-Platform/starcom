/**
 * Share handle v80, as published: Earth Weather beside a forecast hour (D-CM, CM5), so many hours ahead of the moment
 * shown, the forecast strip's steps.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';

describe('contract v80', () => {
  it('is at version 80', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(80);
  });

  it('takes Earth Weather so many hours ahead', () => {
    expect(SHARE_HANDLE_CONTRACT.methods.setCompare.options).toEqual(expect.arrayContaining(['layer', 'ahead']));
    expect(SHARE_HANDLE_CONTRACT.compareMomentLayers).toEqual(expect.arrayContaining(['EcologicalDisasters', 'EarthWeather']));
    expect(SHARE_HANDLE_CONTRACT.compareAhead).toEqual([6, 12, 24, 72, 168]);
  });
});
