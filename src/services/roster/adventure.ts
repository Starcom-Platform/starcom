/**
 * An Adventure (decision D-RS, RS10, RS33–RS36): a call over missions. Its caller says what is happening, its odds
 * as their source states them, where, and when; its trials are the mission packages it links. Its caller calls it
 * off, or its window closing does (RS34), each quoted, never a limit of Starcom's own.
 *
 * Going out on one asks two things first: "How old are you?", neutrally, once, locked (identity/ageAnswer, RS37),
 * and a warning ticked to agree, by its version (RS38; version 2 adds the release, after the legal review of
 * 2026-10-17). The order and the rest live in fieldGate.ts. Starcom never says it checked an age it only asked, and
 * never posts one. Under 18, each
 * field trial waits on "going with an adult"; under 13, desk trials only. Its clock says plain times, never a
 * countdown that hurries anyone out (Lemmon v. Snap). Its return, seen or not, is sealed to its caller (RS35), and
 * the caller posts totals, never who.
 */
import type { RosterItem } from './rosterItem';
import { coarsen, type MissionTotalsStore } from './missionTotals';
import { newSalt, REPORT_KIND, type ReportTemplate } from '../intel/received/missionReport';

/** The rules every adventure keeps, shown with each. From the harms location games and crowd hunts caused. */
export const SAFETY_RULES: readonly string[] = [
  'Nothing to do while moving: never while driving or riding.',
  'Public, lawful places only, while they are open. Leave any place you are asked to leave.',
  'Its caller, a weather warning or its window closing calls it off.',
  'Never a person as the target, and never one as the answer.',
  'No one is followed: returns are sealed, and counted late and coarse.',
];

const DAY = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Its window in milliseconds; a day alone is the whole UTC day. Null without both ends. */
export function windowMs(window: RosterItem['window']): { from: number; until: number } | null {
  if (!window?.from || !window.until) return null;
  const from = Date.parse(DATE_ONLY.test(window.from) ? `${window.from}T00:00:00Z` : window.from);
  const until = DATE_ONLY.test(window.until) ? Date.parse(`${window.until}T00:00:00Z`) + DAY : Date.parse(window.until);
  return Number.isFinite(from) && Number.isFinite(until) ? { from, until } : null;
}

export interface AdventureState {
  state: 'coming' | 'on' | 'over' | 'called_off';
  text: string;
}

/** A moment as a person reads it: "2026-10-17 02:00 Z"; a day alone as it is. */
export const momentText = (moment: string): string => moment.replace('T', ' ').replace(/Z$/, ' Z');

/**
 * Where it stands at `now`: called off by its caller, or by the authority everywhere it names (`calledOffBy`, the
 * warning quoted), to come, on, or over.
 */
export function adventureState(item: Pick<RosterItem, 'window' | 'ended'>, now: number, calledOffBy?: string): AdventureState {
  if (item.ended) return { state: 'called_off', text: `Called off ${item.ended.date} by its caller${item.ended.why ? `: ${item.ended.why}` : '.'}` };
  if (calledOffBy) return { state: 'called_off', text: `Called off by ${calledOffBy}` };
  const w = windowMs(item.window);
  if (!w || now >= w.until) return { state: 'over', text: 'Over: its window closed.' };
  if (now < w.from) return { state: 'coming', text: `Starts ${momentText(item.window!.from)}` };
  return { state: 'on', text: `On now, until ${momentText(item.window!.until)}` };
}

/* ── Kept on this device: the warning agreed, and the returns sent ────────── */

/**
 * The warning before the first field adventure, ticked to agree (RS38): firm, naming the real risks, promising no
 * safety. Its version goes up when its text changes, and it is asked again. The owner approved this text.
 */
export const GOING_OUT_WARNING_VERSION = 2;
export const GOING_OUT_WARNING: readonly string[] = [
  'Adventures and field missions are posted by their callers, people or AI agents, each named on it.',
  'Starcom shows them; it does not plan them or supervise you.',
  'Going out has real risks: weather, cold, darkness, traffic, rough ground, water, wildlife and strangers.',
  'You choose whether to go.',
  'You are responsible for your own safety, your choices, and any harm or liability that follows.',
  'Obey local laws, curfews included. Public places only, while they are open; stay off private land.',
  'If it feels wrong, turn back. In an emergency, call your local emergency number.',
  'As far as the law allows, you release Starcom and its maker from claims arising from taking part, including negligence.',
];
/** What ticking it says: unambiguous assent to the release (Berman v. Freedom Financial, 9th Cir. 2022). */
export const GOING_OUT_AGREEMENT = 'I have read this. I go at my own risk, and I agree to the release above.';

export interface SentReturn {
  seen: boolean;
  day: string;
  relays: number;
}

interface Kept {
  warning?: { version: number; at: string };
  returns: Record<string, SentReturn>;
}

const KEY = 'starcom.adventures.v1';
const listeners = new Set<() => void>();
let version = 0;

function load(): Kept {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Kept> | null;
    const warning = raw?.warning && Number.isInteger(raw.warning.version) && typeof raw.warning.at === 'string' ? raw.warning : undefined;
    const returns = raw?.returns && typeof raw.returns === 'object' && !Array.isArray(raw.returns) ? raw.returns : {};
    return { ...(warning ? { warning } : {}), returns };
  } catch {
    return { returns: {} };
  }
}

let kept: Kept = load();

function persist(next: Kept): void {
  kept = next;
  try { localStorage.setItem(KEY, JSON.stringify(kept)); } catch { /* kept for this visit */ }
  version += 1;
  listeners.forEach((l) => l());
}

/** Whether the warning, as it now reads, was agreed to here. */
export const warningAgreed = (version: number = GOING_OUT_WARNING_VERSION): boolean => kept.warning?.version === version;

export function agreeToWarning(now: number = Date.now()): void {
  persist({ ...kept, warning: { version: GOING_OUT_WARNING_VERSION, at: new Date(now).toISOString() } });
}

export const returnOf = (address: string): SentReturn | undefined => kept.returns[address];

export function recordReturn(address: string, sent: SentReturn): void {
  persist({ ...kept, returns: { ...kept.returns, [address]: sent } });
}

/** Changes whenever what is kept here changes, for a React store. */
export const adventuresVersion = (): number => version;

/** Test seam: forget what this device keeps for adventures. */
export function resetAdventures(): void {
  persist({ returns: {} });
}

export function subscribeAdventures(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/* ── The return, sealed to its caller (RS35) ───────────────────────────── */

/**
 * The return as it will be sealed: the call it answers, seen or not, the counts given, and the day only. Its form is
 * a mission report's (missionReport.ts, D-MX MX28): NavCom's kind 1912, with a salt, so the id inside the seal names
 * its author to nobody; "seen" stands beside the counts, an adventure's own.
 */
export function returnTemplate(r: {
  address: string; seen: boolean; counts: ReadonlyArray<{ label: string; n: number }>; day: string;
  callsign?: string | null; salt?: string;
}): ReportTemplate {
  const content = {
    ...(r.callsign ? { callsign: r.callsign } : {}),
    date: r.day,
    seen: r.seen,
    counts: r.counts.map((c) => ({ line: c.label, n: c.n })),
    salt: r.salt ?? newSalt(),
  };
  return {
    kind: REPORT_KIND,
    tags: [['a', r.address]],
    content: JSON.stringify(content),
    createdAt: Date.parse(`${r.day}T00:00:00Z`) / 1000,
    given: [...r.counts],
  };
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Its caller's posted totals, seen and not: a day late and rounded down, so no one is followed as they go. */
export function adventureTotals(address: string, store: Pick<MissionTotalsStore, 'of'>, today: string): { seen: number; notSeen: number; asOf: string } | null {
  const totals = store.of(address);
  if (!totals?.asOf || totals.asOf >= today) return null;
  const sum = (label: string) => totals.counts.filter((c) => same(c.label, label)).reduce((n, c) => n + c.n, 0);
  return { seen: coarsen(sum('seen')), notSeen: coarsen(sum('not seen')), asOf: totals.asOf };
}
