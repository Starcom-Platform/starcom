/**
 * RLSH recurrence missions (decision D-RR; Mecha Jono's kit v0, `kit/schemas_rlsh.md`): the safety-presence windows
 * round recurring nights in a city, their Case, and the coalition count after a window closes. Read as the kit's
 * rules have it: the new key only; no point finer than a city; a window whose anchor and profile do not give its
 * `peak` and `until` refused; its state held to the clock (the shared cursor: the present while the timeline is live).
 * Unknown tags and fields are ignored.
 */
import { readWindow, shownState, WINDOW_STATES, type EventWindow, type WindowState } from '../../psiWatch/windowProfile';
import { layerKeys } from '../../../config/publicInfrastructure';

/** The only key RLSH items are ever signed by (kit section 0): the newest of their publisher's, as publishers.json says. */
export const RLSH_SIGNER: string = layerKeys('rlsh_recurrence')[0] ?? '';

export type RlshRefusal = 'not-our-key' | 'rlsh-point-finer-than-city' | 'unknown-window-state' | 'profile-malformed' | 'window-profile-disagree';
export type RlshFamily = 'recurrence_window' | 'recurrence_case' | 'mission_totals' | 'celebration_safety';

export interface RlshNote {
  kind: number;
  pubkey: string;
  created_at: number;
  tags: string[][];
  content: string;
  id?: string;
  sig?: string;
}

const tag = (note: { tags: string[][] }, name: string) => note.tags.find((t) => t[0] === name);
const tagsOf = (note: { tags: string[][] }, name: string) => note.tags.filter((t) => t[0] === name);
const topics = (note: { tags: string[][] }) => new Set(tagsOf(note, 't').map((t) => t[1]));
const num = (v: string | undefined) => (v === undefined || v.trim() === '' ? NaN : Number(v));
export const addressOf = (note: RlshNote): string => `${note.kind}:${note.pubkey}:${tag(note, 'd')?.[1] ?? ''}`;

/** A point's precision at a city or coarser: the only ones an RLSH item may carry. */
const COARSE_ENOUGH = new Set(['city', 'region', 'state', 'country']);

export function rlshFamilyOf(note: RlshNote): RlshFamily | null {
  const t = topics(note);
  if (note.kind === 30079) return tag(note, 'mission_family')?.[1] === 'celebration_safety' ? 'celebration_safety' : null;
  if (t.has('recurrence_window')) return 'recurrence_window';
  if (t.has('recurrence_case')) return 'recurrence_case';
  if (t.has('mission_totals')) return 'mission_totals';
  return null;
}

/** A rise_halflife profile's four fields, minutes, or why it cannot be one. */
function riseHalflife(note: RlshNote): { lead: number; peak: number; halfLife: number; end: number } | 'malformed' | null {
  const p = tag(note, 'profile');
  if (!p || p[1] !== 'rise_halflife') return null;
  const [lead, peak, halfLife, end] = p.slice(2, 6).map(num);
  if (![lead, peak, halfLife, end].every(Number.isFinite) || halfLife <= 0 || lead < 0 || end < peak) return 'malformed';
  return { lead, peak, halfLife, end };
}

/** Why an RLSH item is refused (kit section 6), or null. */
export function rlshRefusalOf(note: RlshNote): RlshRefusal | null {
  if (note.pubkey !== RLSH_SIGNER) return 'not-our-key';
  const precision = tag(note, 'geo_precision')?.[1];
  if ((tag(note, 'geo') || tag(note, 'g')) && !(precision && COARSE_ENOUGH.has(precision))) return 'rlsh-point-finer-than-city';
  if (rlshFamilyOf(note) !== 'recurrence_window') return null;
  if (!(WINDOW_STATES as readonly string[]).includes(tag(note, 'window_state')?.[1] ?? '')) return 'unknown-window-state';
  const profile = riseHalflife(note);
  if (profile === 'malformed') return 'profile-malformed';
  const [from, peak, until] = (tag(note, 'window') ?? []).slice(1, 4).map(num);
  if (profile && [from, peak, until].every(Number.isFinite)) {
    // The anchor from `from`; then the peak and the end are what the profile gives (kit 1.1).
    const anchor = from + profile.lead * 60;
    const end = anchor + Math.floor(Math.min(profile.end * 60, profile.peak * 60 + profile.halfLife * 60 * Math.log2(20)));
    if (peak !== anchor + profile.peak * 60 || until !== end) return 'window-profile-disagree';
  }
  return null;
}

export interface IntelLine { kind: string; asOf: number | null; source: string; words: string; link: string | null }

export interface RecurrenceWindow {
  address: string;
  title: string;
  summary: string;
  /** The state as published; the state shown comes from `stateAt`. */
  published: WindowState;
  window: EventWindow;
  tzid: string;
  anchor: { at: number; basis: string; words: string } | null;
  trigger: { cls: string; words: string } | null;
  schedule: { code: string; words: string; asOf: number | null; source: string } | null;
  scoreLine: string | null;
  intel: IntelLine[];
  closedBecause: 'passed' | 'not_needed' | null;
  outcome: string | null;
  place: string | null;
  areas: string[];
  point: { lat: number; lng: number } | null;
  validUntil: number | null;
  license: string | null;
  packageAddress: string | null;
  caseAddress: string | null;
  publishedAt: number;
}

const unixOrNull = (v: string | undefined) => {
  const n = num(v);
  if (Number.isFinite(n)) return n;
  const ms = v ? Date.parse(v) : NaN;
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
};

/** A window note read, or null where it is refused or does not hold together. */
export function readRecurrenceWindow(note: RlshNote): RecurrenceWindow | null {
  if (rlshFamilyOf(note) !== 'recurrence_window' || rlshRefusalOf(note)) return null;
  const window = readWindow(note.tags);
  if (!window) return null;
  const geo = tag(note, 'geo')?.[1]?.match(/lat:(-?[\d.]+),\s*lon:(-?[\d.]+)/);
  const anchor = tag(note, 'anchor');
  const trigger = tag(note, 'trigger');
  const schedule = tag(note, 'schedule');
  const closed = tag(note, 'closed_because')?.[1];
  const outcome = tag(note, 'outcome');
  const addresses = tagsOf(note, 'a').map((t) => t[1]);
  return {
    address: addressOf(note),
    title: tag(note, 'title')?.[1] ?? '',
    summary: tag(note, 'summary')?.[1] ?? '',
    published: tag(note, 'window_state')![1] as WindowState,
    window,
    tzid: tag(note, 'tzid')?.[1] ?? 'UTC',
    anchor: anchor && Number.isFinite(num(anchor[1])) ? { at: num(anchor[1]), basis: anchor[2] ?? '', words: anchor[3] ?? '' } : null,
    trigger: trigger ? { cls: trigger[1], words: trigger[2] ?? '' } : null,
    schedule: schedule ? { code: schedule[1], words: schedule[2] ?? '', asOf: unixOrNull(schedule[3]), source: schedule[4] ?? '' } : null,
    scoreLine: tag(note, 'score_line')?.[1] ?? null,
    intel: tagsOf(note, 'intel').map((t) => ({ kind: t[1], asOf: unixOrNull(t[2]), source: t[3] ?? '', words: t[4] ?? '', link: t[5] || null })),
    closedBecause: closed === 'passed' || closed === 'not_needed' ? closed : null,
    // The outcome's own words, as published: Starcom never scores.
    outcome: outcome ? outcome[outcome.length - 1] ?? null : null,
    place: tag(note, 'place')?.[1] ?? null,
    areas: tagsOf(note, 'area').map((t) => t[1]).filter(Boolean),
    point: geo ? { lat: Number(geo[1]), lng: Number(geo[2]) } : null,
    validUntil: unixOrNull(tag(note, 'valid_until')?.[1]),
    license: tag(note, 'license')?.[1] ?? null,
    packageAddress: addresses.find((a) => a.startsWith('30079:')) ?? null,
    caseAddress: addresses.find((a) => a.startsWith('30023:') && a.includes(':recurrence-case-')) ?? null,
    publishedAt: unixOrNull(tag(note, 'published_at')?.[1]) ?? note.created_at,
  };
}

/** The state shown at a moment, unix seconds (kit 1.2). */
export const stateAt = (w: Pick<RecurrenceWindow, 'published' | 'window'>, nowS: number): WindowState =>
  shownState(w.published, w.window.from, w.window.until, nowS) ?? 'closed';

export interface RecurrenceCase {
  address: string;
  title: string;
  asOf: { day: string; words: string } | null;
  owners: Record<string, string>;
  nights: Array<{ day: string; trigger: string; where: string }>;
  counts: Array<{ night: string; measure: string; n: number; owner: string; outlet: string; link: string; typical: number | null; words: string }>;
  decisions: Array<{ day: string; owner: string; words: string; link: string }>;
  answers: Array<{ id: string; kind: 'settled' | 'narrowed' | 'no_record'; answer: string; question: string }>;
  scoreLine: string | null;
}

export function readRecurrenceCase(note: RlshNote): RecurrenceCase | null {
  if (rlshFamilyOf(note) !== 'recurrence_case' || rlshRefusalOf(note)) return null;
  const owners: Record<string, string> = {};
  for (const t of tagsOf(note, 'owner')) owners[t[1]] = t[2] ?? t[1];
  const asOf = tag(note, 'as_of');
  return {
    address: addressOf(note),
    title: tag(note, 'title')?.[1] ?? '',
    asOf: asOf ? { day: asOf[1], words: asOf[2] ?? '' } : null,
    owners,
    nights: tagsOf(note, 'night').map((t) => ({ day: t[1], trigger: t[2] ?? '', where: t[3] ?? '' })),
    counts: tagsOf(note, 'count').filter((t) => Number.isFinite(num(t[3]))).map((t) => ({
      night: t[1], measure: t[2] ?? '', n: num(t[3]), owner: t[4] ?? '', outlet: t[5] ?? '', link: t[6] ?? '',
      typical: Number.isFinite(num(t[7])) ? num(t[7]) : null, words: t[8] ?? '',
    })),
    decisions: tagsOf(note, 'decision').map((t) => ({ day: t[1], owner: t[2] ?? '', words: t[3] ?? '', link: t[4] ?? '' })),
    answers: tagsOf(note, 'answer').filter((t) => ['settled', 'narrowed', 'no_record'].includes(t[2])).map((t) => ({
      id: t[1], kind: t[2] as 'settled' | 'narrowed' | 'no_record', answer: t[3] ?? '', question: t[4] ?? '',
    })),
    scoreLine: tag(note, 'score_line')?.[1] ?? null,
  };
}

/** The coalition count's rule (kit 5.6, exact): hidden until the window has closed, then the count, zeros as zeros. */
export function coalitionCount(untilS: number, nowS: number, takingPart: { operators: number; agents: number } | null):
  { shown: true; operators: number; agents: number } | { shown: false; why: 'before_until' | 'not_counted_yet' } {
  if (nowS <= untilS) return { shown: false, why: 'before_until' };
  if (!takingPart) return { shown: false, why: 'not_counted_yet' };
  return { shown: true, operators: takingPart.operators, agents: takingPart.agents };
}

/**
 * The version of an item standing at a moment: the newest published at or before it, else the first. A relay keeps
 * only the newest; the kit's files keep each version of one night, so its samples can be seen as the night went.
 */
export function versionAt<T extends { created_at: number }>(versions: readonly T[], atS: number): T | null {
  const sorted = [...versions].sort((a, b) => a.created_at - b.created_at);
  return [...sorted].reverse().find((v) => v.created_at <= atS) ?? sorted[0] ?? null;
}
