/** The build switch's sub-mode gates (D-CS, CS1, CS13): what the commercial build hides, and nothing else. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { subModeAvailable } from '../buildGates';

afterEach(() => { delete process.env.VITE_BUILD_PROFILE; vi.resetModules(); });

describe('subModeAvailable', () => {
  it('shows every sub-mode in the non-commercial build', () => {
    expect(subModeAvailable('CyberThreats')).toBe(true);
    expect(subModeAvailable('Satellites')).toBe(true);
    expect(subModeAvailable('CommHubs')).toBe(true);
    expect(subModeAvailable('IntelReports')).toBe(true);
  });

  it('hides Cyber Threats, Satellites and Comm Hubs in the commercial build, and only those', () => {
    process.env.VITE_BUILD_PROFILE = 'commercial';
    expect(subModeAvailable('CyberThreats')).toBe(false);
    expect(subModeAvailable('Satellites')).toBe(false);
    expect(subModeAvailable('CommHubs')).toBe(false);
    expect(subModeAvailable('IntelReports')).toBe(true);
    expect(subModeAvailable('EarthWeather')).toBe(true);
  });

  it('leaves them off the rail in a commercial build', async () => {
    process.env.VITE_BUILD_PROFILE = 'commercial';
    vi.resetModules();
    const { SECONDARY_RAIL_MODES } = await import('../../components/HUD/Bars/CyberCommandRails/railModeConfig');
    expect(SECONDARY_RAIL_MODES.CyberCommand.map((i) => i.subMode)).toEqual(['IntelReports']);
  });
});
