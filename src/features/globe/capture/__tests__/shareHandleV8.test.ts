/**
 * Share handle contract v8 (globe record, section 19; decisions RW7, RW8):
 * Raver Watch. What an agent reads from the published contract before it has
 * loaded the app. The live handle's behaviour is tested mounted, in
 * useGlobeShareCard.v8.test.tsx.
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';
import { GLOBE_CAPTURE_SCHEMA_VERSION } from '../shareCardProvenance';

describe('contract v8', () => {
  it('is at version 8 or later, with cards at capture schema 10', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(8);
    expect(GLOBE_CAPTURE_SCHEMA_VERSION).toBeGreaterThanOrEqual(10);
  });

  it('lists Raver Watch’s six layers after the eleven', () => {
    expect(SHARE_HANDLE_CONTRACT.layers.slice(11, 17)).toEqual([
      'DrugCheckAlerts', 'SceneIncidents', 'SceneEvents', 'HeatRisk', 'RaverMissions', 'HarmReductionSites',
    ]);
  });

  it('says a listed report names its layer', () => {
    expect(SHARE_HANDLE_CONTRACT.returns.listReports).toContain('layer');
  });

  it('declares the shared time window, set and read in unix seconds', () => {
    expect(SHARE_HANDLE_CONTRACT.methods.setTimeWindow).toEqual({ args: 1, options: ['from', 'until'] });
    expect(SHARE_HANDLE_CONTRACT.methods.getTimeWindow).toEqual({ args: 0, options: [] });
    expect(SHARE_HANDLE_CONTRACT.returns.setTimeWindow).toEqual(['from', 'until', 'live']);
    expect(SHARE_HANDLE_CONTRACT.returns.getTimeWindow).toEqual(['from', 'until', 'live']);
  });
});
