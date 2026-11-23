/**
 * The magnetopause and bow shock for the moment shown (space-weather-visualization.md, SW30): while paused, the
 * engine is given the wind at the bow shock then, from NOAA's 7 days; past them, a CME's sheath modelled in; back
 * to live, the latest; waited for, noted for a clip, said on a card.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { boundaryMomentReadiness, boundaryNotes, useGlobeBoundaryMoment } from '../useGlobeBoundaryMoment';
import { allDrawnFor, resetDrawnForTest } from '../../weather/weatherDrawn';
import { formatUtcDateTime } from '../../../../utils/utcTime';
import type { BoundaryWind } from '../../../../services/spaceWeather/boundaryWind';
import type { GlobeEngine } from '../../../../globe-engine/GlobeEngine';

const MIN = 60_000;
const HOUR = 3_600_000;
const START = Date.UTC(2026, 9, 18);
const DAYS = 7;
const LAST = START + (DAYS * 24 * 60 - 1) * MIN;
const NOW = LAST - 30 * MIN;
/** NOAA's 7-day propagated product: a header, then a minute a row. */
const WEEK = [
  ['time_tag', 'speed', 'density', 'temperature', 'bx', 'by', 'bz', 'bt', 'vx', 'vy', 'vz', 'propagated_time_tag'],
  ...Array.from({ length: DAYS * 24 * 60 }, (_, k) => {
    // As NOAA writes them: "2026-10-18T06:53:00Z".
    const at = new Date(START + k * MIN).toISOString().replace('.000Z', 'Z');
    return [at, 420, 6, 100000, 1, 2, -3, 4, -420, 0, 0, at];
  }),
];
const arrival = LAST + 6 * HOUR;
const DONKI = [{
  activityID: 'storm', link: 's',
  cmeAnalyses: [{
    isMostAccurate: true, time21_5: new Date(LAST - 30 * HOUR).toISOString(), latitude: 0, longitude: 0, halfAngle: 45, speed: 1400, type: 'O',
    enlilList: [{ modelCompletionTime: new Date(LAST - 28 * HOUR).toISOString(), estimatedShockArrivalTime: new Date(arrival).toISOString(), isEarthGB: false, link: 'l' }],
  }],
}];
const serve = (fail = false) => vi.fn(async (url: string) => {
  if (fail) return { ok: false, status: 503 } as unknown as Response;
  const body = url.includes('DONKI') ? DONKI : WEEK;
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
});

function mount(props: Partial<Parameters<typeof useGlobeBoundaryMoment>[0]> = {}) {
  const engine = { setBoundaryWind: vi.fn() };
  const fetchImpl = props.fetchImpl ?? serve();
  const hook = renderHook((p: Partial<Parameters<typeof useGlobeBoundaryMoment>[0]>) => useGlobeBoundaryMoment({
    engine: engine as unknown as GlobeEngine, active: true, moment: null, now: () => NOW, ...props, fetchImpl, ...p,
  }), { initialProps: {} });
  const given = (): BoundaryWind | null => engine.setBoundaryWind.mock.calls.at(-1)?.[0] ?? null;
  return { engine, fetchImpl, given, ...hook };
}

afterEach(() => { resetDrawnForTest(); });

describe('the magnetopause and bow shock for the moment shown', () => {
  it('stand off from the latest while live, and nothing is read', () => {
    const { engine, fetchImpl } = mount();
    expect(engine.setBoundaryWind).toHaveBeenLastCalledWith(null);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(boundaryMomentReadiness()).toEqual({ ready: true });
  });

  it('stand off from the wind measured at a paused moment, waited for and noted, and go back to the latest when live', async () => {
    const moment = START + 3 * 24 * HOUR;
    const { engine, given, result, rerender, fetchImpl } = mount({ moment });
    expect(boundaryMomentReadiness().ready).toBe(false);
    await vi.waitFor(() => expect(result.current.wind).not.toBeNull());
    expect(given()).toMatchObject({ kind: 'measured', measuredAt: moment, pushedBy: null });
    expect(given()!.snapshot.speedKmPerSec).toBe(420);
    expect(boundaryMomentReadiness()).toEqual({ ready: true });
    expect(allDrawnFor(moment)).toBe(true);
    expect(allDrawnFor(moment + HOUR)).toBe(false);
    // Another moment within the 7 days: not read again.
    rerender({ moment: moment + HOUR });
    await vi.waitFor(() => expect(given()?.measuredAt).toBe(moment + HOUR));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    rerender({ moment: null });
    expect(engine.setBoundaryWind).toHaveBeenLastCalledWith(null);
    expect(allDrawnFor(moment + 5 * HOUR)).toBe(true);
  });

  it('past the measurements, are pushed in by a CME CCMC has reaching the Earth by then, said to be modelled', async () => {
    const { given, result } = mount({ moment: arrival + HOUR });
    await vi.waitFor(() => expect(result.current.wind).not.toBeNull());
    expect(given()).toMatchObject({ kind: 'last-measured', pushedBy: { cmeId: 'storm', arrivedAt: arrival } });
    expect(boundaryNotes(given()!).noteShort).toBe(`Magnetopause pushed in by a CME arriving ${formatUtcDateTime(arrival)}: modelled.`);
    expect(boundaryNotes(given()!).note).toMatch(/its sheath modelled, the wind at the CME's drag-based speed at the Earth \(\d+ km\/s\) and 4 times as dense/);
  });

  it('stand off from the latest when the 7 days cannot be read, and say why', async () => {
    const { given, result } = mount({ moment: START + HOUR, fetchImpl: serve(true) });
    await vi.waitFor(() => expect(result.current.error).toBe('NOAA answered 503'));
    expect(given()).toBeNull();
    expect(boundaryMomentReadiness()).toEqual({ ready: true });
  });

  it('say on a card which wind they stand off from', () => {
    const wind: BoundaryWind = { snapshot: { speedKmPerSec: 400, densityPerCm3: 5, bz: -1, timestamp: '' }, kind: 'measured', measuredAt: START, pushedBy: null };
    expect(boundaryNotes(wind).noteShort).toBe(`Magnetopause: the wind measured at ${formatUtcDateTime(START)}.`);
    expect(boundaryNotes({ ...wind, kind: 'last-measured' }).noteShort).toBe(`Magnetopause: the last wind measured, ${formatUtcDateTime(START)}.`);
    expect(boundaryNotes({ ...wind, kind: 'earliest-measured' }).noteShort).toBe(`Magnetopause: the earliest wind kept, ${formatUtcDateTime(START)}; none for the moment.`);
  });
});
