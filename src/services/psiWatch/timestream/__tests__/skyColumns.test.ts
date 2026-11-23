/**
 * The sky the Timestream draws (decision D-PW, PW41–PW42): each column's longitudes the same as Psi Watch's own
 * positions and frames give, Lilith opposite the mean perigee, and retrograde read from neighbouring columns.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { eclipticOfDate, meanNorthNode } from '../../astro/sky';
import { inFrame } from '../../astro/frames';
import { anglesAt } from '../../astro/angles';
import { columnMs, LANE_BODIES, longitudesAt, meanLunarPerigee, skyColumns } from '../skyColumns';
import { viewAround } from '../timeView';

const DAY = 86_400_000;
const AT = new Date(Date.UTC(2026, 9, 27, 3, 0));

describe('the Timestream\'s sky', () => {
  it('gives each body the longitude Psi Watch\'s own positions give, in either frame', () => {
    for (const frame of ['tropical', 'galactic'] as const) {
      const lons = longitudesAt(LANE_BODIES, AT, frame);
      for (const [i, body] of ['Sun', 'Moon', 'Mars', 'Pluto'].entries()) {
        const k = LANE_BODIES.indexOf(body as (typeof LANE_BODIES)[number]);
        expect(lons[k], `${frame} ${body} (${i})`).toBeCloseTo(inFrame(eclipticOfDate(body as 'Sun', AT).lon, frame, AT), 6);
      }
      expect(lons[LANE_BODIES.indexOf('NorthNode')]).toBeCloseTo(inFrame(meanNorthNode(AT), frame, AT), 6);
    }
  });

  it('casts the angles for an observer, in the frame, and leaves them empty without one', () => {
    const observer = { lat: 51.5, lon: -0.1 };
    const angles = anglesAt(AT, observer.lat, observer.lon);
    const [asc, mc, dsc, ic] = longitudesAt(['ASC', 'MC', 'DSC', 'IC'], AT, 'galactic', observer);
    expect(asc).toBeCloseTo(inFrame(angles.asc, 'galactic', AT), 6);
    expect(mc).toBeCloseTo(inFrame(angles.mc, 'galactic', AT), 6);
    expect((dsc - asc + 360) % 360).toBeCloseTo(180, 6);
    expect((ic - mc + 360) % 360).toBeCloseTo(180, 6);
    expect(longitudesAt(['ASC'], AT, 'galactic').every(Number.isNaN)).toBe(true);
  });

  it('puts the south node opposite the north, and Lilith opposite the mean perigee', () => {
    const lons = longitudesAt(LANE_BODIES, AT, 'tropical');
    const at = (b: (typeof LANE_BODIES)[number]) => lons[LANE_BODIES.indexOf(b)];
    expect((at('SouthNode') - at('NorthNode') + 360) % 360).toBeCloseTo(180, 6);
    expect((at('Lilith') - at('Perigee') + 360) % 360).toBeCloseTo(180, 6);
    expect(at('Perigee')).toBeCloseTo(meanLunarPerigee(AT), 6);
  });

  it('lays the columns out across the view, and marks Mercury retrograde through its station, never the Sun', () => {
    // Mercury stations retrograde on 24 Oct 2026 08:00Z and direct on 13 Nov 17:00Z (an hourly scan of eclipticOfDate):
    // a 30-day view from 20 Oct, in half-day columns, holds both.
    const view = { startMs: Date.UTC(2026, 9, 20), spanMs: 30 * DAY };
    const sky = skyColumns(view, 60, ['Sun', 'Mercury'], 'galactic');
    expect(sky.longitudes).toHaveLength(120);
    const retro = (col: number) => sky.retrograde[col * 2 + 1];
    const dayOf = (col: number) => new Date(columnMs(view, 60, col)).toISOString().slice(5, 10);
    const backward = Array.from({ length: 60 }, (_, col) => col).filter((col) => retro(col) === 1);
    expect(['10-24', '10-25']).toContain(dayOf(backward[0]));
    expect(['11-13', '11-14']).toContain(dayOf(backward[backward.length - 1]));
    expect(backward.length).toBe(backward[backward.length - 1] - backward[0] + 1);
    expect(Array.from({ length: 60 }, (_, col) => sky.retrograde[col * 2]).every((r) => r === 0)).toBe(true);
    expect(columnMs(viewAround(AT.getTime(), DAY), 10, 0)).toBeGreaterThan(viewAround(AT.getTime(), DAY).startMs);
  });
});
