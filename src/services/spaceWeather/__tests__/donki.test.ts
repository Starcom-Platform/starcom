/**
 * NASA DONKI's CMEs (space-weather-visualization.md, SW8, SW20–SW22): each read from its most accurate
 * analysis, its arrival at the Earth from the latest ENLIL run CCMC made of it, and its front moved out
 * by the drag-based model while it is in flight.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  CME_RANGE_AU, DBM, R0_KM, cmeAxis, cmeFrontAu, cmesInFlight, dbmDistance, dbmSpeed, donkiCmeUrl, donkiCmesBetweenUrl, earthDirected, fetchCmes, paceToArrival, parseCmes, parseCmesSeen, type Cme,
} from '../donki';
import { AU_KM } from '../heliosphere';

const DAY = 86_400_000;

/** A DONKI CME record, as the API gives it, trimmed to what is read. */
const record = (over: Record<string, unknown> = {}, analyses?: unknown[]) => ({
  activityID: '2026-10-10T16:15:00-CME-001',
  startTime: '2026-10-10T16:15Z',
  link: 'https://ccmc.gsfc.nasa.gov/DONKI/view/CME/49064/-1',
  cmeAnalyses: analyses ?? [
    { isMostAccurate: false, time21_5: '2026-10-10T20:06Z', latitude: 33, longitude: 54, halfAngle: 43, speed: 844, type: 'C', enlilList: null },
    {
      isMostAccurate: true, time21_5: '2026-10-10T18:40Z', latitude: 12, longitude: 9, halfAngle: 45, speed: 1553, type: 'O',
      enlilList: [
        { modelCompletionTime: '2026-10-10T19:00Z', estimatedShockArrivalTime: null, isEarthGB: false, link: 'old' },
        { modelCompletionTime: '2026-10-10T22:30Z', estimatedShockArrivalTime: '2026-10-12T00:43Z', isEarthGB: false, link: 'new' },
      ],
    },
  ],
  ...over,
});

describe('every CME DONKI lists, for what is new (plan H10)', () => {
  it('keeps each by its start time, with its analysis where DONKI has one, and one not yet measured too', () => {
    const seen = parseCmesSeen([record(), record({ activityID: '2026-10-11T02:00:00-CME-001', startTime: '2026-10-11T02:00Z' }, []), { startTime: '2026-10-11T03:00Z' }]);
    expect(seen.map((s) => [s.id, s.startTime, s.cme?.speed ?? null])).toEqual([
      ['2026-10-10T16:15:00-CME-001', Date.UTC(2026, 9, 10, 16, 15), 1553],
      ['2026-10-11T02:00:00-CME-001', Date.UTC(2026, 9, 11, 2), null],
    ]);
    expect(seen[1].link).toBe('https://ccmc.gsfc.nasa.gov/DONKI/view/CME/49064/-1');
  });

  it('asks for the days from one moment to another', () => {
    expect(donkiCmesBetweenUrl(Date.UTC(2026, 9, 20, 22), Date.UTC(2026, 9, 26, 1))).toBe('https://ccmc.gsfc.nasa.gov/DONKI-API/get/CME?startDate=2026-10-20&endDate=2026-10-26');
  });
});

describe('reading DONKI\'s CMEs', () => {
  it('reads each from its most accurate analysis, its arrival from CCMC\'s latest ENLIL run of it', () => {
    const [cme] = parseCmes([record()]);
    expect(cme).toMatchObject({
      id: '2026-10-10T16:15:00-CME-001', leftAt: Date.UTC(2026, 9, 10, 18, 40), speed: 1553, halfAngle: 45, lat: 12, lon: 9, type: 'O',
      link: 'https://ccmc.gsfc.nasa.gov/DONKI/view/CME/49064/-1',
      earth: { kind: 'arrives', at: Date.UTC(2026, 9, 12, 0, 43), glancing: false, modelledAt: Date.UTC(2026, 9, 10, 22, 30), link: 'new' },
    });
  });

  it('says when CCMC\'s run shows no Earth arrival, a glancing blow, or no run at all', () => {
    const run = (arrival: string | null, gb: boolean) => record({}, [{ isMostAccurate: true, time21_5: '2026-10-07T13:53Z', latitude: 0, longitude: 17, halfAngle: 36, speed: 310, type: 'S', enlilList: [{ modelCompletionTime: '2026-10-07T20:00Z', estimatedShockArrivalTime: arrival, isEarthGB: gb, link: 'l' }] }]);
    expect(parseCmes([run(null, false)])[0].earth).toEqual({ kind: 'misses', modelledAt: Date.UTC(2026, 9, 7, 20), link: 'l' });
    expect(parseCmes([run('2026-10-11T06:00Z', true)])[0].earth).toMatchObject({ kind: 'arrives', glancing: true });
    const unmodelled = record({}, [{ isMostAccurate: true, time21_5: '2026-10-07T13:53Z', latitude: 0, longitude: 17, halfAngle: 36, speed: 310, type: 'S', enlilList: [] }]);
    expect(parseCmes([unmodelled])[0].earth).toEqual({ kind: 'unmodelled' });
  });

  it('leaves out a CME whose analysis lacks a time, speed, width or direction', () => {
    for (const missing of ['time21_5', 'speed', 'halfAngle', 'latitude', 'longitude']) {
      const a = { isMostAccurate: true, time21_5: '2026-10-07T13:53Z', latitude: 0, longitude: 17, halfAngle: 36, speed: 310, type: 'S', [missing]: null };
      expect(parseCmes([record({}, [a])])).toEqual([]);
    }
    expect(parseCmes([record({}, [])])).toEqual([]);
    expect(parseCmes('nothing')).toEqual([]);
  });

  it('asks for the days a CME could still be in flight from, up to the moment or today, whichever is sooner', () => {
    expect(donkiCmeUrl(Date.UTC(2026, 9, 10, 22), Date.UTC(2026, 9, 10, 23))).toBe('https://ccmc.gsfc.nasa.gov/DONKI-API/get/CME?startDate=2026-09-28&endDate=2026-10-10');
    // A moment ahead: none has been seen leaving yet, so up to today.
    expect(donkiCmeUrl(Date.UTC(2026, 9, 13), Date.UTC(2026, 9, 10, 23))).toBe('https://ccmc.gsfc.nasa.gov/DONKI-API/get/CME?startDate=2026-09-28&endDate=2026-10-10');
  });

  it('fetches and reads them, and says why when it cannot', async () => {
    const ok = vi.fn(async () => ({ ok: true, status: 200, json: async () => [record()] }) as unknown as Response);
    expect((await fetchCmes(Date.UTC(2026, 9, 10, 22), ok, Date.UTC(2026, 9, 10, 23)))[0].speed).toBe(1553);
    const down = vi.fn(async () => ({ ok: false, status: 503 }) as unknown as Response);
    await expect(fetchCmes(Date.UTC(2026, 9, 10, 22), down, Date.UTC(2026, 9, 10, 23))).rejects.toThrow('DONKI answered 503');
  });
});

describe('the drag-based model', () => {
  /** The model's own equation, dv/dt = -γ (v - w) |v - w|, stepped a minute at a time from each step's middle. */
  const stepped = (v0: number, seconds: number) => {
    const accel = (v: number) => -DBM.gamma * (v - DBM.wind) * Math.abs(v - DBM.wind);
    let v = v0, r = 0;
    for (let t = 0; t < seconds; t += 60) {
      const mid = v + accel(v) * 30;
      r += mid * 60;
      v += accel(mid) * 60;
    }
    return { v, r };
  };

  it('slows a fast CME toward the wind, as its equation does', () => {
    const { v, r } = stepped(1553, 2 * 86_400);
    expect(dbmSpeed(1553, 2 * 86_400)).toBeCloseTo(v, 0);
    expect(dbmDistance(1553, 2 * 86_400) / r).toBeCloseTo(1, 4);
    expect(dbmSpeed(1553, 2 * 86_400)).toBeLessThan(1553);
  });

  it('speeds a slow CME up toward the wind, and leaves one at the wind\'s speed alone', () => {
    const { v, r } = stepped(250, 3 * 86_400);
    expect(dbmSpeed(250, 3 * 86_400)).toBeCloseTo(v, 0);
    expect(dbmDistance(250, 3 * 86_400) / r).toBeCloseTo(1, 4);
    expect(dbmSpeed(250, 3 * 86_400)).toBeGreaterThan(250);
    expect(dbmDistance(DBM.wind, 1000)).toBeCloseTo(DBM.wind * 1000, 6);
  });
});

describe('a CME in flight', () => {
  const cme: Cme = { id: 'a', leftAt: Date.UTC(2026, 9, 10, 18, 40), speed: 1553, halfAngle: 45, lat: 12, lon: 9, type: 'O', link: '', earth: { kind: 'unmodelled' } };

  it('has its front at 21.5 solar radii when it was measured there, moving out by the model', () => {
    expect(cmeFrontAu(cme, cme.leftAt)).toBeCloseTo(R0_KM / AU_KM, 9);
    expect(cmeFrontAu(cme, cme.leftAt + DAY)).toBeCloseTo((R0_KM + dbmDistance(1553, 86_400)) / AU_KM, 9);
  });

  it('is drawn from then until its front passes 2 AU, not before or after', () => {
    expect(cmesInFlight([cme], cme.leftAt - 60_000)).toEqual([]);
    expect(cmesInFlight([cme], cme.leftAt + DAY)).toEqual([{ cme, frontAu: cmeFrontAu(cme, cme.leftAt + DAY)! }]);
    let t = cme.leftAt;
    while (cmeFrontAu(cme, t)! <= CME_RANGE_AU) t += 3_600_000;
    expect(cmesInFlight([cme], t)).toEqual([]);
  });

  it('heads along its direction from the Sun: west toward the side ahead of the Earth, north up', () => {
    const near = (a: number[], b: number[]) => a.forEach((v, k) => expect(v).toBeCloseTo(b[k], 9));
    near(cmeAxis(0, 0), [1, 0, 0]);
    near(cmeAxis(0, 90), [0, 1, 0]);
    near(cmeAxis(90, 0), [0, 0, 1]);
  });

  it('is Earth-directed when the Earth lies inside its cone', () => {
    expect(earthDirected(cme)).toBe(true);
    expect(earthDirected({ ...cme, lon: 54, lat: 33, halfAngle: 43 })).toBe(false);
  });
});

describe('a CME paced to CCMC\'s arrival (SW24)', () => {
  const HOUR = 3_600_000;
  const leftAt = Date.UTC(2026, 9, 10, 18, 40);
  const arriving = (at: number): Cme => ({ id: 'p', leftAt, speed: 1553, halfAngle: 45, lat: 12, lon: 9, type: 'O', link: '', earth: { kind: 'arrives', at, glancing: false, modelledAt: leftAt, link: '' } });

  it('reaches the Earth when CCMC\'s ENLIL says, its surrounding wind fitted and its measured speed kept', () => {
    const at = Date.UTC(2026, 9, 12, 0, 43);
    const paced = paceToArrival(arriving(at));
    expect(cmeFrontAu(paced, at)).toBeCloseTo(1, 5);
    // A faster surrounding wind than the usual 400 km/s, as on 10 Oct, and the launch speed as measured.
    expect(paced.wind!).toBeGreaterThan(DBM.wind);
    expect(paced.timeScale ?? 1).toBe(1);
    expect(cmeFrontAu(paced, leftAt)).toBeCloseTo(R0_KM / AU_KM, 9);
    expect(dbmSpeed(paced.speed, 0, paced.wind)).toBeCloseTo(1553, 9);
  });

  it('still reaches the Earth then when no plausible wind would, its timing stretched instead', () => {
    for (const at of [leftAt + 2 * HOUR, leftAt + 30 * 24 * HOUR]) {
      const paced = paceToArrival(arriving(at));
      expect(cmeFrontAu(paced, at)).toBeCloseTo(1, 5);
      expect(paced.timeScale).not.toBe(1);
    }
  });

  it('leaves a CME with no Earth arrival, or an arrival before it left, to the usual values', () => {
    const none: Cme = { ...arriving(0), earth: { kind: 'misses', modelledAt: leftAt, link: '' } };
    expect(paceToArrival(none)).toBe(none);
    const before = arriving(leftAt - HOUR);
    expect(paceToArrival(before)).toBe(before);
  });

  it('is paced as it is read', () => {
    const [cme] = parseCmes([record()]);
    expect(cmeFrontAu(cme, Date.UTC(2026, 9, 12, 0, 43))).toBeCloseTo(1, 5);
  });
});
