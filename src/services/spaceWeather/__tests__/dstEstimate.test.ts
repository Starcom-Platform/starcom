/**
 * Dst estimated from the measured solar wind (space-weather-visualization.md, SW4): O'Brien and
 * McPherron's model (2000), from NOAA's real-time wind, a minute a step, standing in for the
 * quick-look index Kyoto asks be cleared with them before it is published.
 */
import { describe, expect, it } from 'vitest';
import { estimateDst, joinRealtimeWind, type WindMinute } from '../dstEstimate';

const hours = (n: number, at: (k: number) => Omit<WindMinute, 't'>): WindMinute[] =>
  Array.from({ length: n * 60 + 1 }, (_, k) => ({ t: Date.UTC(2026, 9, 10) + k * 60_000, ...at(k) }));

describe('the estimate', () => {
  it('follows the model\'s own solution under a steady southward field', () => {
    // V 500 km/s, Bz -10 nT: VBs 5 mV/m, Q -4.4 (5 - 0.49) nT/h, tau 2.4 exp(9.74 / 9.69) h.
    const est = estimateDst(hours(24, () => ({ speed: 500, density: 5, bz: -10 })))!;
    const q = -4.4 * (5 - 0.49), tau = 2.4 * Math.exp(9.74 / 9.69);
    const star = q * tau * (1 - Math.exp(-24 / tau));
    const pressure = 1.6726e-6 * 5 * 500 ** 2;
    expect(est.dst).toBeCloseTo(star + 7.26 * Math.sqrt(pressure) - 11, 0);
    expect(est.hours).toBeCloseTo(24, 6);
  });

  it('is only the wind\'s pressure under a northward field', () => {
    const est = estimateDst(hours(12, () => ({ speed: 400, density: 5, bz: 5 })))!;
    expect(est.dst).toBeCloseTo(7.26 * Math.sqrt(1.6726e-6 * 5 * 400 ** 2) - 11, 9);
  });

  it('recovers after the field turns north again, at the model\'s pace', () => {
    const est = estimateDst(hours(24, (k) => (k < 12 * 60 ? { speed: 500, density: 5, bz: -10 } : { speed: 500, density: 5, bz: 3 })))!;
    const southOnly = estimateDst(hours(12, () => ({ speed: 500, density: 5, bz: -10 })))!;
    expect(est.dst).toBeGreaterThan(southOnly.dst);
    expect(est.dst).toBeLessThan(-20);
  });

  it('is for when the last minute\'s wind reaches the Earth, 1.5 million km on at its speed', () => {
    const est = estimateDst(hours(12, () => ({ speed: 500, density: 5, bz: 5 })))!;
    expect(Date.parse(est.at)).toBe(Date.UTC(2026, 9, 10, 12) + 3_000_000);
  });

  it('is none with too little wind to begin from', () => {
    expect(estimateDst(hours(2, () => ({ speed: 400, density: 5, bz: -5 })))).toBeNull();
  });
});

describe('the wind it is made from', () => {
  it('is the active spacecraft\'s minutes, speed and density joined to the field\'s Bz by the minute, oldest first', () => {
    const wind = [
      { time_tag: '2026-10-10T18:31:00', active: false, proton_speed: 745, proton_density: 1.1 },
      { time_tag: '2026-10-10T18:31:00', active: true, proton_speed: 820, proton_density: 16 },
      { time_tag: '2026-10-10T18:30:00', active: true, proton_speed: 810, proton_density: null },
      { time_tag: '2026-10-10T18:29:00', active: true, proton_speed: 800, proton_density: 15 },
    ];
    const mag = [
      { time_tag: '2026-10-10T18:31:00', active: true, bz_gsm: -1.7 },
      { time_tag: '2026-10-10T18:30:00', active: true, bz_gsm: -2 },
      { time_tag: '2026-10-10T18:29:00', active: true, bz_gsm: -3 },
    ];
    expect(joinRealtimeWind(wind, mag)).toEqual([
      { t: Date.UTC(2026, 9, 10, 18, 29), speed: 800, density: 15, bz: -3 },
      { t: Date.UTC(2026, 9, 10, 18, 31), speed: 820, density: 16, bz: -1.7 },
    ]);
  });
});
