/**
 * Where a replay has reached at each point of the footage (decision D-F,
 * section 18, item 5).
 *
 * Found by watching the first replay of Mecha Jono's reports: their times run
 * from 12 February to 25 September, almost all of them on the 25th, so a replay
 * mapping footage linearly to time showed an empty globe for nine-tenths of the
 * clip and revealed everything in the frames the end card covers.
 */
import { describe, it, expect } from 'vitest';
import { replayMomentAt, planReplay, REVEAL_SHARE } from '../replayPace';

const DAY = 86_400_000;
const T0 = Date.parse('2026-02-12T00:00:00Z');
// One early outlier, then a burst on one day: the shape of the real data.
const times = [T0, T0 + 225 * DAY, T0 + 225 * DAY + 3_600_000, T0 + 225 * DAY + 7_200_000];

describe('replayMomentAt', () => {
  it('has revealed everything before the footage ends, so the close shows it all', () => {
    for (const pace of ['time', 'even'] as const) {
      expect(replayMomentAt(REVEAL_SHARE, times, pace).atMs).toBe(times[times.length - 1]);
      expect(replayMomentAt(1, times, pace).atMs).toBe(times[times.length - 1]);
    }
    expect(REVEAL_SHARE).toBeLessThan(1);
  });

  it('starts at the first report', () => {
    expect(replayMomentAt(0, times, 'even').atMs).toBe(T0);
    expect(replayMomentAt(0, times, 'time').atMs).toBe(T0);
  });

  it('at an even pace, gives each report an equal share of the footage, in order', () => {
    // Halfway through the reveal, half the reports are in.
    const half = replayMomentAt(REVEAL_SHARE / 2, times, 'even').atMs;
    expect(half).toBeGreaterThanOrEqual(times[1]);
    expect(half).toBeLessThan(times[3]);
  });

  it('at the pace of time, spends the footage as the calendar did', () => {
    // Halfway through, the burst has not begun: the literal reading.
    expect(replayMomentAt(REVEAL_SHARE / 2, times, 'time').atMs).toBeLessThan(times[1]);
  });

  it('fades each report in over about one step, whatever the pace', () => {
    const even = replayMomentAt(REVEAL_SHARE * 0.9, times, 'even');
    expect(even.fadeMs).toBeGreaterThan(0);
    expect(even.fadeMs).toBeLessThanOrEqual(3_600_000);
  });

  it('refuses fewer than two distinct times, which have nothing to sweep', () => {
    expect(() => replayMomentAt(0.5, [T0, T0], 'even')).toThrow(/two distinct/);
  });
});

/*
 * A replay bounded by a span (BA2, Mecha Jono's ask B): their daily briefing
 * asked for the past 24 hours, and the replay swept every report drawn, from
 * 12 February to 3 October, so the day was a sliver of it. Named, else the set
 * window, else the reports' own span, as before.
 */
describe('planReplay', () => {
  const DAY_S = 86_400;
  const day = { from: Math.floor((T0 + 225 * DAY) / 1000), until: Math.floor((T0 + 225 * DAY) / 1000) + DAY_S };
  const ms = (s: number) => s * 1000;

  it('takes a named span first, over the set window, and leaves out the reports outside it', () => {
    const plan = planReplay({ times: [...times, null], pace: 'even', named: day, window: { from: 0, until: 1 } });
    expect(plan).toMatchObject({ basis: 'named', span: { fromMs: ms(day.from), untilMs: ms(day.until) }, untimed: 1, outside: 1 });
    expect(plan.times).toEqual(times.slice(1));
  });

  it('else the set window', () => {
    const plan = planReplay({ times, pace: 'even', window: day });
    expect(plan).toMatchObject({ basis: 'window', span: { fromMs: ms(day.from), untilMs: ms(day.until) }, outside: 1 });
  });

  it('else the reports\' own span, as before, with nothing outside it', () => {
    const plan = planReplay({ times, pace: 'time', window: null });
    expect(plan).toMatchObject({ basis: 'reports', span: { fromMs: T0, untilMs: times[3] }, outside: 0 });
    expect(() => planReplay({ times: [T0, T0], pace: 'even', window: null })).toThrow(/two or more distinct times/);
  });

  it('refuses a span that is not two unix-second times, the first before the second', () => {
    expect(() => planReplay({ times, pace: 'even', named: { from: day.from } })).toThrow(/replay.from and replay.until/);
    expect(() => planReplay({ times, pace: 'even', named: { from: day.until, until: day.from } })).toThrow(/replay.from and replay.until/);
    expect(() => planReplay({ times, pace: 'even', named: { from: 'today', until: day.until } })).toThrow(/replay.from and replay.until/);
  });

  it('refuses a span with too few reports in it to sweep, saying what was drawn there', () => {
    const empty = { from: day.until + DAY_S, until: day.until + 2 * DAY_S };
    expect(() => planReplay({ times, pace: 'time', named: empty })).toThrow(/no report drawn in it/);
    const one = { from: Math.floor(T0 / 1000) - 10, until: Math.floor(T0 / 1000) + 10 };
    // At the pace of time one report is enough: the span itself is swept.
    expect(planReplay({ times, pace: 'time', named: one }).times).toEqual([T0]);
    expect(() => planReplay({ times, pace: 'even', named: one })).toThrow(/two or more distinct times/);
  });

  // D-EQ, EQ21: a clip's replay replays the quakes drawn with the reports.
  it('replays the quakes drawn with the reports, enough alone, counted apart from them', () => {
    const empty = { from: day.until + DAY_S, until: day.until + 2 * DAY_S };
    const quakes = [ms(empty.from) + 60_000, ms(empty.from) + 3_600_000, ms(empty.until) + 60_000];
    const plan = planReplay({ times, pace: 'even', named: empty, quakes });
    expect(plan).toMatchObject({ quakes: 2, outside: times.length, untimed: 0 });
    expect(plan.times).toEqual(quakes.slice(0, 2));
    expect(() => planReplay({ times, pace: 'time', named: { from: empty.until + DAY_S, until: empty.until + 2 * DAY_S }, quakes }))
      .toThrow(/no report or quake drawn in it/);
    expect(planReplay({ times, pace: 'time', named: day }).quakes).toBe(0);
  });
});

describe('replayMomentAt over a span', () => {
  const span = { fromMs: T0 + 225 * DAY - 3_600_000, untilMs: T0 + 226 * DAY };
  const inside = times.slice(1);

  it('at the pace of time, sweeps the span itself, not the reports\' first and last', () => {
    expect(replayMomentAt(0, inside, 'time', span).atMs).toBe(span.fromMs);
    expect(replayMomentAt(REVEAL_SHARE, inside, 'time', span).atMs).toBe(span.untilMs);
  });

  it('carries the span, so the marks outside it stay hidden', () => {
    expect(replayMomentAt(0.5, inside, 'even', span)).toMatchObject({ fromMs: span.fromMs, untilMs: span.untilMs });
    expect(replayMomentAt(0.5, times, 'even')).not.toHaveProperty('fromMs');
  });
});
