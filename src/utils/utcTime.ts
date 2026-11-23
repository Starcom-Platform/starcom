/**
 * How Starcom shows a time: in UTC, marked Z, with its date whenever the date matters.
 *
 * Decision D-E (docs/missions/01-architecture-decisions/time-model.md). One screen
 * showed five time readouts in three conventions (UTC marked Z, local marked L, and
 * local unmarked), a paused window that read `09:24Z – 09:24Z` for twenty-four hours,
 * and a timeline axis that printed times of day at ticks 6.9 days apart. Every time
 * readout goes through this module instead.
 *
 * The visible text uses `getUTC*` only, so it reads the same in every browser and
 * time zone. The viewer's own local time is offered on hover, through `localTimeTitle`.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** 1970-01-05 was a Monday: weekly ticks count from it. */
const FIRST_MONDAY = Date.UTC(1970, 0, 5);

const pad = (n: number) => String(n).padStart(2, '0');

/** `21:24Z`, or `21:24:05Z` with seconds. */
export function formatUtcTime(ms: number, options: { seconds?: boolean } = {}): string {
  const d = new Date(ms);
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return `${options.seconds ? `${time}:${pad(d.getUTCSeconds())}` : time}Z`;
}

/** `27 Jul`, or `27 Jul 2026` with the year. Day before month, so 7/8 is never read as 8/7. */
export function formatUtcDate(ms: number, options: { year?: boolean } = {}): string {
  const d = new Date(ms);
  const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return options.year ? `${date} ${d.getUTCFullYear()}` : date;
}

/** `27 Jul 21:24Z`, with the year or seconds when asked. */
export function formatUtcDateTime(ms: number, options: { year?: boolean; seconds?: boolean } = {}): string {
  return `${formatUtcDate(ms, options)} ${formatUtcTime(ms, options)}`;
}

/** `Jul 2026`. */
export function formatUtcMonth(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const utcDay = (ms: number) => Math.floor(ms / DAY);

/** Whether a moment is outside this UTC year, so its date needs the year: the quakes' history reaches 2150 BC. */
export function notThisYear(ms: number, nowMs = Date.now()): boolean {
  return new Date(ms).getUTCFullYear() !== new Date(nowMs).getUTCFullYear();
}

/**
 * A window from start to end. Both ends carry their date unless the window falls
 * within one UTC day, in which case the date is given once; both carry the year
 * when either end is outside this one.
 */
export function formatUtcWindow(start: number, end: number): string {
  const year = notThisYear(start) || notThisYear(end);
  return utcDay(start) === utcDay(end)
    ? `${formatUtcDateTime(start, { year })} – ${formatUtcTime(end)}`
    : `${formatUtcDateTime(start, { year })} – ${formatUtcDateTime(end, { year })}`;
}

/** The same moment in the viewer's own time zone, for a hover title. */
export function localTimeTitle(ms: number): string {
  return `Local: ${new Date(ms).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  })}`;
}

/** A window in the viewer's own time zone, both ends, for a hover title. */
export function localWindowTitle(start: number, end: number): string {
  return `${localTimeTitle(start)} – ${localTimeTitle(end).replace(/^Local: /, '')}`;
}

export interface TimeTick {
  at: number;
  label: string;
}

type Step =
  | { kind: 'fixed'; ms: number }
  | { kind: 'week' }
  | { kind: 'month'; months: number }
  | { kind: 'year'; years: number };

const STEPS: Step[] = [
  ...[1, 5, 15, 30].map((s): Step => ({ kind: 'fixed', ms: s * SECOND })),
  ...[1, 5, 15, 30].map((m): Step => ({ kind: 'fixed', ms: m * MINUTE })),
  ...[1, 3, 6, 12].map((h): Step => ({ kind: 'fixed', ms: h * HOUR })),
  { kind: 'fixed', ms: DAY },
  { kind: 'fixed', ms: 2 * DAY },
  { kind: 'week' },
  ...[1, 3, 6].map((months): Step => ({ kind: 'month', months })),
  ...[1, 2, 5, 10, 25, 50, 100].map((years): Step => ({ kind: 'year', years })),
];

const approxMs = (step: Step): number => {
  switch (step.kind) {
    case 'fixed': return step.ms;
    case 'week': return 7 * DAY;
    case 'month': return step.months * 30.44 * DAY;
    case 'year': return step.years * 365.25 * DAY;
  }
};

function tickTimes(start: number, end: number, step: Step): number[] {
  const times: number[] = [];
  switch (step.kind) {
    case 'fixed': {
      for (let t = Math.ceil(start / step.ms) * step.ms; t <= end; t += step.ms) times.push(t);
      break;
    }
    case 'week': {
      const week = 7 * DAY;
      for (let t = FIRST_MONDAY + Math.ceil((start - FIRST_MONDAY) / week) * week; t <= end; t += week) times.push(t);
      break;
    }
    case 'month': {
      const first = new Date(start);
      let year = first.getUTCFullYear();
      let month = first.getUTCMonth();
      if (Date.UTC(year, month, 1) < start) month += 1;
      month = Math.ceil(month / step.months) * step.months;
      for (let t = Date.UTC(year, month, 1); t <= end; t = Date.UTC(year, month, 1)) {
        times.push(t);
        month += step.months;
        if (month >= 12) { year += Math.floor(month / 12); month %= 12; }
      }
      break;
    }
    case 'year': {
      let year = new Date(start).getUTCFullYear();
      if (Date.UTC(year, 0, 1) < start) year += 1;
      year = Math.ceil(year / step.years) * step.years;
      for (; Date.UTC(year, 0, 1) <= end; year += step.years) times.push(Date.UTC(year, 0, 1));
      break;
    }
  }
  return times;
}

function tickLabel(at: number, step: Step): string {
  const d = new Date(at);
  switch (step.kind) {
    case 'fixed':
      // Within a day, a tick shows its time (with seconds when the step is under a
      // minute), except the one at midnight, which names the day.
      if (step.ms >= DAY || at % DAY === 0) return formatUtcDate(at);
      return formatUtcTime(at, { seconds: step.ms < MINUTE });
    case 'week':
      return formatUtcDate(at);
    case 'month':
      return d.getUTCMonth() === 0 ? `Jan ${d.getUTCFullYear()}` : MONTHS[d.getUTCMonth()];
    case 'year':
      return String(d.getUTCFullYear());
  }
}

/** The step whose tick count over a span comes closest to `target`. */
function chooseStep(span: number, target: number): Step {
  let best = STEPS[STEPS.length - 1];
  let bestDistance = Infinity;
  for (const step of STEPS) {
    const distance = Math.abs(Math.log(span / approxMs(step) / target));
    if (distance < bestDistance) {
      best = step;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Ticks for a time axis from start to end,on UTC calendar boundaries (whole
 * seconds, minutes, hours, midnights, Mondays, month starts or year starts), with the step
 * whose tick count comes closest to `target`. Labels are times within a day and
 * dates across days, so an axis never prints a bare time of day at a point days
 * away from the last one.
 */
export function utcTimeTicks(start: number, end: number, target = 8): TimeTick[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || target < 1) return [];
  const best = chooseStep(end - start, target);
  return tickTimes(start, end, best).map((at) => ({ at, label: tickLabel(at, best) }));
}

/**
 * The whole axis step that contains a moment, for an axis from spanStart to
 * spanEnd: the step utcTimeTicks would choose, on the calendar boundaries its
 * ticks fall on (decision D-E). A click or a pause selects it, so the selected
 * window is always one of the steps the timeline shows. With no span to go by,
 * the UTC day containing the moment.
 */
export function utcStepContaining(at: number, spanStart: number, spanEnd: number, target = 8): { start: number; end: number } {
  if (!(spanEnd > spanStart) || !Number.isFinite(spanStart) || !Number.isFinite(spanEnd)) {
    const start = Math.floor(at / DAY) * DAY;
    return { start, end: start + DAY };
  }
  const step = chooseStep(spanEnd - spanStart, target);
  switch (step.kind) {
    case 'fixed': {
      const start = Math.floor(at / step.ms) * step.ms;
      return { start, end: start + step.ms };
    }
    case 'week': {
      const week = 7 * DAY;
      const start = FIRST_MONDAY + Math.floor((at - FIRST_MONDAY) / week) * week;
      return { start, end: start + week };
    }
    case 'month': {
      const d = new Date(at);
      const month = Math.floor(d.getUTCMonth() / step.months) * step.months;
      return { start: Date.UTC(d.getUTCFullYear(), month, 1), end: Date.UTC(d.getUTCFullYear(), month + step.months, 1) };
    }
    case 'year': {
      const year = Math.floor(new Date(at).getUTCFullYear() / step.years) * step.years;
      return { start: Date.UTC(year, 0, 1), end: Date.UTC(year + step.years, 0, 1) };
    }
  }
}
