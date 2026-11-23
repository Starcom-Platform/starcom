/**
 * Where a replay has reached at each point of the footage (decision D-F,
 * section 18, item 5).
 *
 * Two paces. `time` spends the footage as the calendar did: a quiet month is a
 * long empty stretch. `even` reveals the reports in the order they happened,
 * each given an equal share of the footage: the order is true, the spacing is
 * not the time between them, and the clip's caveat says which it used.
 *
 * `even` is the default because of the first real replay: Mecha Jono's reports
 * run from 12 February to 25 September, almost all on the 25th, and at the pace
 * of time nine-tenths of the clip showed an empty globe.
 *
 * Either way the reveal completes at REVEAL_SHARE of the footage, so the close
 * holds on every report before the end card, rather than revealing the last of
 * them in frames the end card replaces.
 */
export type ReplayPace = 'time' | 'even';
export const REPLAY_PACES: readonly ReplayPace[] = ['even', 'time'];

/** The share of the footage the reveal takes; the rest holds on all of them. */
export const REVEAL_SHARE = 0.85;

/** How long a report takes to fade in, as a share of one step. */
const FADE_OF_STEP = 0.8;

export interface ReplayMoment {
  atMs: number;
  fadeMs: number;
  /** A bounded replay's span (BA2): marks outside it stay hidden. Absent when unbounded. */
  fromMs?: number;
  untilMs?: number;
}

/** A span of time, in ms since the epoch. */
export interface ReplaySpan { fromMs: number; untilMs: number }
/** Where a replay's span came from (BA2): named by the caller, the timeline's window, or the reports' own. */
export type ReplayBasis = 'named' | 'window' | 'reports';

export interface ReplayPlan {
  span: ReplaySpan;
  basis: ReplayBasis;
  pace: ReplayPace;
  /** The times of the reports and quakes in the span, the ones the replay reveals. */
  times: number[];
  /** How many quakes drawn are in the span (D-EQ, EQ21): they rise and fade as the replay reaches them. */
  quakes: number;
  /** Reports stating no time, shown throughout. */
  untimed: number;
  /** Reports drawn with a time outside the span, hidden while it plays. */
  outside: number;
}

/**
 * A replay's span and the reports it reveals (BA2, Mecha Jono's ask B): the
 * span named (`replay: { from, until }`, unix seconds), else the timeline's
 * window when one is set, else the reports' own first and last times, as it
 * always was. Their daily briefing asked for the past day, and the replay swept
 * every report drawn, from February on, so the day was a sliver of the clip.
 *
 * At the pace of time the span itself is swept, so one report in it is enough;
 * evenly, the reports in it are the steps, so two distinct times are needed.
 * Refused, saying why, rather than sweeping nothing.
 */
export function planReplay(input: {
  times: ReadonlyArray<number | null>;
  pace: ReplayPace;
  named?: { from?: unknown; until?: unknown };
  window?: { from: number; until: number } | null;
  /** The quakes drawn, by their times (D-EQ, EQ21): replayed with the reports, enough alone to replay. */
  quakes?: readonly number[];
}): ReplayPlan {
  const reported = input.times.filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
  const untimed = input.times.length - reported.length;
  const quakeTimes = (input.quakes ?? []).filter((t) => Number.isFinite(t));
  const timed = [...reported, ...quakeTimes];
  const what = quakeTimes.length ? 'report or quake' : 'report';
  const { named } = input;
  let span: ReplaySpan;
  let basis: ReplayBasis;
  if (named && (named.from !== undefined || named.until !== undefined)) {
    const { from, until } = named;
    if (typeof from !== 'number' || typeof until !== 'number' || !Number.isFinite(from) || !Number.isFinite(until) || from >= until) {
      throw new Error(`replay.from and replay.until are unix seconds, the first before the second; got ${String(from)} and ${String(until)}.`);
    }
    span = { fromMs: from * 1000, untilMs: until * 1000 };
    basis = 'named';
  } else if (input.window) {
    span = { fromMs: input.window.from * 1000, untilMs: input.window.until * 1000 };
    basis = 'window';
  } else {
    span = { fromMs: timed.length ? Math.min(...timed) : 0, untilMs: timed.length ? Math.max(...timed) : 0 };
    basis = 'reports';
  }
  const inSpan = (t: number) => t >= span.fromMs && t <= span.untilMs;
  const times = timed.filter(inSpan);
  const distinct = new Set(times).size;
  const minute = (msValue: number) => `${new Date(msValue).toISOString().slice(0, 16).replace('T', ' ')}Z`;
  const between = basis === 'reports' ? '' : ` from ${minute(span.fromMs)} to ${minute(span.untilMs)}`;
  if (basis !== 'reports' && times.length === 0) {
    throw new Error(`A replay${between} has no ${what} drawn in it: ${timed.length} drawn ${what}${timed.length === 1 ? ' is' : 's are'} outside it.`);
  }
  if ((input.pace === 'even' || basis === 'reports') && distinct < 2) {
    throw new Error(`A replay${between} needs ${what}s at two or more distinct times; the ${what}s drawn${between ? ' in it' : ''} do not have them.`);
  }
  // The reports outside it are hidden while it plays; a quake outside it is not drawn for it at all.
  return {
    span, basis, pace: input.pace, times, untimed,
    outside: reported.filter((t) => !inSpan(t)).length,
    quakes: quakeTimes.filter(inSpan).length,
  };
}

/**
 * The moment reached `progress` (0–1) of the way through the footage, for
 * reports at these times.
 */
export function replayMomentAt(progress: number, times: readonly number[], pace: ReplayPace, span?: ReplaySpan): ReplayMoment {
  const sorted = [...new Set(times.filter((t) => Number.isFinite(t)))].sort((a, b) => a - b);
  const bounds = span ? { fromMs: span.fromMs, untilMs: span.untilMs } : {};
  const p = Math.min(1, Math.max(0, progress / REVEAL_SHARE));

  // At the pace of time a bounded replay sweeps its span, whatever the reports in it.
  if (pace === 'time' && span && span.untilMs > span.fromMs) {
    const length = span.untilMs - span.fromMs;
    return { atMs: span.fromMs + length * p, fadeMs: length * 0.04, ...bounds };
  }
  if (sorted.length < 2) {
    throw new Error('A replay needs at least two distinct report times to sweep between.');
  }
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (pace === 'time') {
    return { atMs: first + (last - first) * p, fadeMs: (last - first) * 0.04 };
  }

  // Even: step k of n-1 is the k-th distinct time.
  const x = p * (sorted.length - 1);
  const k = Math.min(Math.floor(x), sorted.length - 2);
  const gap = sorted[k + 1] - sorted[k];
  return {
    atMs: p >= 1 ? last : sorted[k] + gap * (x - k),
    fadeMs: gap * FADE_OF_STEP,
    ...bounds,
  };
}
