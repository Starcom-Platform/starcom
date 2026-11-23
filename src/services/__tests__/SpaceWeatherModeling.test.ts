import {
  buildAuroralPayload,
  buildBowShockPayload,
  buildGeomagneticIndexPayload,
  buildMagnetopausePayload,
  classifyGeomagneticActivity,
  computeBowShockRadius,
  computeDynamicPressureNPa,
  computeMagnetopauseStandoff
} from '../SpaceWeatherModeling';

describe('SpaceWeatherModeling', () => {
  it('computes magnetopause and bow shock radii for quiet solar wind', () => {
    const pressure = computeDynamicPressureNPa(5, 400);
    expect(pressure).toBeCloseTo(1.338, 3);

    const { value: rmp, clamped: mpClamped } = computeMagnetopauseStandoff(pressure);
    expect(mpClamped).toBe(false);
    expect(rmp).toBeCloseTo(9.74, 2);

    const { value: rbs, clamped: bowClamped } = computeBowShockRadius(pressure, rmp);
    expect(bowClamped).toBe(false);
    expect(rbs).toBeCloseTo(13.3, 1);
    expect(rbs).toBeGreaterThan(rmp + 2.4);
  });

  it('clamps magnetopause under extreme storm pressure and enforces bow shock gap', () => {
    const pressure = computeDynamicPressureNPa(60, 1200);

    const { value: rmp, clamped: mpClamped } = computeMagnetopauseStandoff(pressure);
    expect(mpClamped).toBe(true);
    expect(rmp).toBeCloseTo(5, 1);

    const { value: rbs, clamped: bowClamped } = computeBowShockRadius(pressure, rmp);
    expect(bowClamped).toBe(false);
    expect(rbs).toBeCloseTo(7.5, 1);
    expect(rbs).toBeGreaterThan(rmp + 2.4);
  });

  it('caps bow shock radius for ultra-quiet conditions', () => {
    const pressure = 0.00001;
    const { value: rbs, clamped } = computeBowShockRadius(pressure, 24);
    expect(clamped).toBe(false);
    expect(rbs).toBeCloseTo(26.5, 1);
  });

  it('builds auroral payloads with closed loops and blackout metadata', () => {
    const payload = buildAuroralPayload({ kp: 4, timestamp: '2024-01-01T00:00:00Z' }, 'live');

    expect(payload.kp).toBe(4);
    expect(payload.quality).toBe('live');
    expect(payload.oval.north.length).toBeGreaterThan(90);

    const first = payload.oval.north[0];
    const last = payload.oval.north[payload.oval.north.length - 1];
    expect(first).toEqual(last);

    const lats = payload.oval.north.map((p) => p.lat);
    expect(Math.min(...lats)).toBeGreaterThan(69);
    expect(Math.max(...lats)).toBeLessThan(71);

    expect(payload.blackout.thresholdKp).toBe(7);
    expect(payload.blackout.gradient.inner).toBeGreaterThan(0);
    expect(payload.blackout.gradient.outer).toBeGreaterThan(payload.blackout.gradient.inner);
  });

  it('includes deformation profiles in modeled boundary payloads', () => {
    const solarWind = {
      speedKmPerSec: 450,
      densityPerCm3: 6,
      bz: -4,
      timestamp: '2024-01-01T00:00:00Z'
    };

    const magnetopause = buildMagnetopausePayload(solarWind, 'live');
    const bowShock = buildBowShockPayload(solarWind, magnetopause.standoffRe, 'live');

    expect(magnetopause.deformation).toBeDefined();
    expect(magnetopause.deformation?.modelVersion).toBe('shue-approx-v1');
    expect(magnetopause.deformation?.tailRe ?? 0).toBeGreaterThan(magnetopause.deformation?.flankRe ?? 0);

    expect(bowShock.deformation).toBeDefined();
    expect(bowShock.deformation?.modelVersion).toBe('shue-approx-v1');
    expect((bowShock.deformation?.noseRe ?? 0)).toBeGreaterThan(magnetopause.standoffRe);
    expect((bowShock.meta as { deformationModel?: string })?.deformationModel).toBe('shue-approx-v1');
  });

  it('builds a geomagnetic index payload directly from a Kp snapshot', () => {
    const payload = buildGeomagneticIndexPayload({ kp: 6, timestamp: '2024-01-01T00:00:00Z' }, 'live');

    expect(payload.kp).toBe(6);
    expect(payload.activity).toBe('major_storm');
    expect(payload.lastUpdated).toBe('2024-01-01T00:00:00Z');
    expect(payload.quality).toBe('live');
    expect(payload.meta?.source).toBe('noaa-kp');
  });

  it('classifies Kp into NOAA\'s 6-tier activity scale at each boundary', () => {
    expect(classifyGeomagneticActivity(0)).toBe('quiet');
    expect(classifyGeomagneticActivity(2.99)).toBe('quiet');
    expect(classifyGeomagneticActivity(3)).toBe('unsettled');
    expect(classifyGeomagneticActivity(3.99)).toBe('unsettled');
    expect(classifyGeomagneticActivity(4)).toBe('active');
    expect(classifyGeomagneticActivity(4.99)).toBe('active');
    expect(classifyGeomagneticActivity(5)).toBe('minor_storm');
    expect(classifyGeomagneticActivity(5.99)).toBe('minor_storm');
    expect(classifyGeomagneticActivity(6)).toBe('major_storm');
    expect(classifyGeomagneticActivity(6.99)).toBe('major_storm');
    expect(classifyGeomagneticActivity(7)).toBe('severe_storm');
    expect(classifyGeomagneticActivity(9)).toBe('severe_storm');
  });
});
