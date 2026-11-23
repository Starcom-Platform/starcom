/**
 * Whether the left sub rail has anything to show: one gate, for the rail and
 * for the layout that makes room for it. Two copies were kept in step by hand,
 * and the Intel Reports settings (BA4) were added to one and not the other: the
 * rail had a button for them that the layout never mounted. Found on the built
 * app.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { leftSubRailShown } from '../railModeConfig';

describe('leftSubRailShown', () => {
  it('for the sub-modes with settings or toggles there', () => {
    expect(leftSubRailShown({ mode: 'CyberCommand', subMode: 'IntelReports' }, false)).toBe(true);
    // RLSH's filters and its roster, in Hero Watch since RLSH moved there (D-HW).
    expect(leftSubRailShown({ mode: 'HeroWatch', subMode: 'RLSH' }, false)).toBe(true);
    expect(leftSubRailShown({ mode: 'EcoNatural', subMode: 'EarthWeather' }, false)).toBe(true);
    expect(leftSubRailShown({ mode: 'EcoNatural', subMode: 'EcologicalDisasters' }, false)).toBe(true);
    expect(leftSubRailShown({ mode: 'EcoNatural', subMode: 'SpaceWeather' }, true)).toBe(true);
  });

  // Every sub-mode with kits on the rail (critique-2026-11-01, OR1; plan A2): Geo Political's first.
  it('for every sub-mode with kits', () => {
    for (const subMode of ['WarConflict', 'ConflictZones', 'ResourceZones', 'DiplomaticEvents']) {
      expect(leftSubRailShown({ mode: 'GeoPolitical', subMode }, false), subMode).toBe(true);
    }
  });

  it('not for the layers without controls of their own', () => {
    // Space Weather has its looks on the rail now (plan B2): shown whether or not its sidebar is up.
    expect(leftSubRailShown({ mode: 'EcoNatural', subMode: 'SpaceWeather' }, false)).toBe(true);
    expect(leftSubRailShown({ mode: 'CyberCommand', subMode: 'CyberThreats' }, true)).toBe(false);
    expect(leftSubRailShown({ mode: 'CyberCommand', subMode: 'RLSH' }, false)).toBe(false);
    expect(leftSubRailShown({ mode: 'HeroWatch', subMode: 'Lifeboats' }, false)).toBe(false);
  });
});
