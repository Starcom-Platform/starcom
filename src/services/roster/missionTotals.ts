/**
 * An Epic's progress (decision D-RS, RS23; spec rev 14, "An Epic's progress: mission totals").
 *
 * A report on a mission is sealed to the package's signer, so only the signer sees the counts. The signer posts
 * the totals, never who reported, one note per mission; an Epic sums the totals of the missions it counts, by its
 * criteria's labels. Only the package's own signer's note counts: nobody can post totals for another's mission.
 * An Adventure's caller posts its returns' totals the same way, naming the adventure (RS35).
 */
import type { Event, Filter, SimplePool } from 'nostr-tools';
import { createRelayPool } from '../nostr/relayPool';
import { readComplete } from '../nostr/readComplete';
import { burst } from '../nostr/burst';
import { rosterReadRelays } from '../nostr/publishTargets';
import type { RosterItem } from './rosterItem';

export const MISSION_TOTALS_TOPIC = 'mission_totals';
const NOTE_KIND = 30023;
const PACKAGE = /^30079:([0-9a-f]{64}):[^\s]{1,200}$/;
/** What a totals note may name: a mission package, or an adventure (a roster item), its signer the note's. */
const TOTALED = /^(?:30079|30084):([0-9a-f]{64}):[^\s]{1,200}$/;
const WHOLE = /^(0|[1-9]\d{0,9})$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface MissionTotals {
  coordinate: string;
  counts: Array<{ label: string; n: number }>;
  reports: number | null;
  asOf: string | null;
  createdAt: number;
}

export type TotalsRead = { ok: true; totals: MissionTotals } | { ok: false; reason: string; retracted?: boolean };

export function readMissionTotals(event: Event): TotalsRead {
  const topics = event.tags.filter((t) => t[0] === 't').map((t) => t[1]);
  if (!topics.includes(MISSION_TOTALS_TOPIC)) return { ok: false, reason: `not tagged ${MISSION_TOTALS_TOPIC}` };
  const coordinate = event.tags.find((t) => t[0] === 'a' && TOTALED.test(t[1] ?? ''))?.[1];
  if (!coordinate) return { ok: false, reason: 'no mission named' };
  if (TOTALED.exec(coordinate)![1] !== event.pubkey) return { ok: false, reason: 'not signed by the mission\'s own signer' };
  if (topics.includes('retracted')) return { ok: false, reason: 'retracted', retracted: true };
  const counts = event.tags.filter((t) => t[0] === 'total' && (t[1] ?? '').trim() && WHOLE.test(t[2] ?? ''))
    .map((t) => ({ label: t[1].trim(), n: Number(t[2]) }));
  const reports = event.tags.find((t) => t[0] === 'reports' && WHOLE.test(t[1] ?? ''))?.[1];
  const asOf = event.tags.find((t) => t[0] === 'as_of' && DAY.test(t[1] ?? ''))?.[1];
  return { ok: true, totals: { coordinate, counts, reports: reports === undefined ? null : Number(reports), asOf: asOf ?? null, createdAt: event.created_at } };
}

const coordinateOfNote = (event: Event) => event.tags.find((t) => t[0] === 'a' && TOTALED.test(t[1] ?? ''))?.[1] ?? null;

export class MissionTotalsStore {
  private latest = new Map<string, { created_at: number; id: string; totals: MissionTotals | null }>();

  accept(event: Event): { kept: boolean } {
    const read = readMissionTotals(event);
    const coordinate = read.ok ? read.totals.coordinate : ('retracted' in read && read.retracted ? coordinateOfNote(event) : null);
    if (!coordinate) return { kept: false };
    const prior = this.latest.get(coordinate);
    if (prior && (event.created_at < prior.created_at || (event.created_at === prior.created_at && event.id >= prior.id))) return { kept: false };
    this.latest.set(coordinate, { created_at: event.created_at, id: event.id, totals: read.ok ? read.totals : null });
    return { kept: true };
  }

  of(coordinate: string): MissionTotals | null {
    return this.latest.get(coordinate)?.totals ?? null;
  }
}

export interface EpicProgress {
  /** The missions the epic counts. */
  missions: number;
  /** Of them, how many have totals posted. */
  posted: number;
  /** The newest of their dates. */
  asOf: string | null;
  criteria: Array<{ label: string; target: number; done: number }>;
  /** True when the counts are a day late and rounded (an Operation's, RS26). */
  coarse?: boolean;
}

/** Rounded down: to tens below 100, to hundreds above (RS26). */
export const coarsen = (n: number) => (n < 100 ? Math.floor(n / 10) * 10 : Math.floor(n / 100) * 100);

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** An item's progress against its criteria, from the posted totals of the missions it counts; null without criteria. */
export function epicProgress(
  item: RosterItem,
  store: Pick<MissionTotalsStore, 'of'>,
  options: { lateAndCoarse?: { today: string } } = {},
): EpicProgress | null {
  if (!item.criteria?.length) return null;
  const missions = item.counts.map((l) => l.coordinate).filter((c) => PACKAGE.test(c));
  const late = options.lateAndCoarse;
  // A day late: only totals as of a day before today; a total with no date is not shown late.
  const posted = missions.map((c) => store.of(c)).filter((t): t is MissionTotals => t !== null)
    .filter((t) => !late || (t.asOf !== null && t.asOf < late.today));
  const asOf = posted.map((t) => t.asOf).filter((d): d is string => d !== null).sort().pop() ?? null;
  return {
    missions: missions.length,
    posted: posted.length,
    asOf,
    criteria: item.criteria.map((c) => {
      const done = posted.reduce((sum, t) => sum + t.counts.filter((x) => same(x.label, c.label)).reduce((s, x) => s + x.n, 0), 0);
      return { label: c.label, target: c.target, done: late ? coarsen(done) : done };
    }),
    ...(late ? { coarse: true } : {}),
  };
}

/* The read: every mission_totals note, newest at each mission standing. */
const store = new MissionTotalsStore();
const listeners = new Set<() => void>();
let reading: { close: () => void; users: number } | null = null;
let version = 0;
const notify = () => { version += 1; listeners.forEach((l) => l()); };
/** Notes kept in a burst, told once it is gathered (burst.ts). */
let changed = false;
const told = burst(() => { if (changed) { changed = false; notify(); } });

export const missionTotals = (): Pick<MissionTotalsStore, 'of'> => store;
/** Changes whenever a totals note is kept, for a React store. */
export const missionTotalsVersion = (): number => version;

export function subscribeMissionTotals(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function startMissionTotalsRead(options: { pool?: Pick<SimplePool, 'subscribeMany'>; relays?: string[] } = {}): () => void {
  if (reading) {
    reading.users += 1;
  } else {
    const pool = options.pool ?? createRelayPool();
    const filters: Filter[] = [{ kinds: [NOTE_KIND], '#t': [MISSION_TOTALS_TOPIC] }];
    const read = readComplete(pool, options.relays ?? rosterReadRelays(), filters, {
      onevent: (event: Event) => { if (store.accept(event).kept) { changed = true; told.soon(); } },
      oncomplete: () => told.now(),
      onfail: () => {},
    });
    reading = { close: () => read.close(), users: 1 };
  }
  let stopped = false;
  return () => {
    if (stopped || !reading) return;
    stopped = true;
    reading.users -= 1;
    if (reading.users === 0) { reading.close(); reading = null; }
  };
}
