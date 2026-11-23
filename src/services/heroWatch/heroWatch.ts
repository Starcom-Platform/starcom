/**
 * Hero Watch: Mecha Jono's notes of who is responding, and where, and its field missions, read from
 * The Record (decision D-HW, docs/missions/01-architecture-decisions/hero-watch.md; its census of
 * 2026-10-10 beside the record).
 *
 * Two kinds of record, from Mecha Jono's key only, as Raver Watch is read (RW2):
 *
 * - **Notes** (kind 30023, `t=hero_watch`, `d=hero-watch-*`): an RNLI lifeboat station and its launches
 *   in a year (`lifeboat_station`), a Red Cross or Red Crescent operation in a country
 *   (`response_operation`), how many organisations work in a country (`response_presence`), and the
 *   week's summary (`d=hero-watch-<year>-w<week>`).
 * - **Field missions** (kind 30079, `t=field_mission`): signed packages anyone can take up, each with
 *   its objectives, its window and its safety limits. An open mission without its limits is refused:
 *   none is ever shown without them. A closed one is kept, as closed, to say it ended.
 *
 * Signatures are checked by the pool this reads through (nostr-tools' own check, which Starcom's
 * RelayPool keeps). The newest record at an address stands, and `t=retracted` withdraws it. A station is
 * a public building, kept to 0.001° as Raver Watch keeps a public venue (RW12); other places are a
 * country or a state, as `jurisdiction` or the package's area names it. When a record applies is kept as
 * stated; what draws it decides how.
 */
import type { Event, Filter, SimplePool } from 'nostr-tools';
import { HERO_WATCH_PUBLISHERS } from '../../config/publicInfrastructure';
import { firstPublishedAt } from '../nostr/firstPublished';
import { noteIdentity, ROTATING_PUBLISHERS, type RotatingPublisher } from '../nostr/publisherKeys';
import { heroWatchRelays } from '../nostr/publishTargets';
import { createRelayPool } from '../nostr/relayPool';
import { readComplete } from '../nostr/readComplete';
import { burst } from '../nostr/burst';
import { parseGeoTag } from '../geoint/parser';
import { decodeGeohash } from '../intel/observations/adapters/geohash';
import { packageSourceLinks, sourceLinksFromTags } from '../intel/sourceLinks';
import { tagsNamePeople, rememberNamedNote } from '../intel/namesPeople';
import { fieldMissionWords, missionNamesPeopleProblem } from '../intel/missionNamesPeople';

/** The sections a record is drawn on (HW3); RLSH is the fourth, from its own data. The summary is the panel's. */
export type HeroWatchSection = 'Lifeboats' | 'Relief' | 'FieldMissions';

interface Base {
  /** `<kind>:<pubkey>:<d>`, as listReports() names it. */
  id: string;
  pubkey: string;
  d: string;
  eventId: string;
  /** When this version was signed, in unix seconds. */
  createdAt: number;
  section?: HeroWatchSection;
  title: string;
  summary?: string;
  source?: string;
  /** Its page at its source (the `r` tag). */
  url?: string;
  /**
   * Every source it names, in order, the original first (D-CT, CT2): its `r` tags; for a field
   * mission with none, the source its manifest names (`metadata.mechaJono.source.link`).
   */
  sources?: string[];
  /** When it applies, in unix seconds. */
  validFrom: number;
  validUntil: number;
  /** A country (`et`) or a subdivision (`gb-eng`, `us-nm`), ISO 3166 lower case. */
  jurisdiction?: string;
  point?: { lat: number; lon: number };
  precision?: 'venue';
  license?: string;
  content: string;
  /**
   * It names a person, by its own `t=names_people` (D-NP). Hero Watch's operations name no one, Mecha Jono says; if
   * one ever does, it is labelled and kept off cards and clips like any other.
   */
  namesPeople?: boolean;
}

/** A station, and its launches in a year when the RNLI's records count them: one in 118 is not (its records name it differently). */
export interface LifeboatStation extends Base { kind: 'station'; launches?: number; year?: number; stationType?: string }
export interface ReliefOperation extends Base { kind: 'operation'; appealType?: string; amountChf?: number; peopleToReach?: number; start?: number; end?: number }
export interface ReliefPresence extends Base { kind: 'presence'; organisations: number; nationalNgos?: number; sectors: string[]; periodStart?: string; periodEnd?: string }
export interface WeekSummary extends Base { kind: 'summary'; week: string }

export interface FieldMissionObjective { id: string; ask: string; effortMinutes: number; for?: string }

export interface FieldMission extends Base {
  kind: 'field_mission';
  family: string;
  /** As the package states it: `open`, or `closed` once it ended. */
  state: string;
  /** What the mission asks, in its own words. */
  description: string;
  objectives: FieldMissionObjective[];
  /** The safety rules it carries ("Work in pairs. Never confront anyone…"): never shown without them. */
  limits: string;
  /** Harm reduction, which Raver Watch's Raver missions also show (HW8). */
  harmReduction: boolean;
}

export type HeroWatchItem = LifeboatStation | ReliefOperation | ReliefPresence | WeekSummary | FieldMission;
type Read<T> = (T & { retracted: boolean }) | { refused: string };

const NOTE_KIND = 30023;
const MISSION_KIND = 30079;
const KINDS = [NOTE_KIND, MISSION_KIND] as const;
const JURISDICTION = /^[a-z]{2}(-[a-z0-9]{1,3})?$/;
const SUMMARY_D = /^hero-watch-(\d{4}-w\d{1,2})$/;
const WEEK_S = 7 * 86_400;
/** The field mission families of harm reduction (HW8). */
const HARM_REDUCTION = new Set(['weekend_harm_reduction', 'naloxone']);
/** The note kinds read, by their tag. */
const NOTE_KINDS: Record<string, 'station' | 'operation' | 'presence'> = {
  lifeboat_station: 'station',
  response_operation: 'operation',
  response_presence: 'presence',
};
const toThousandth = (degrees: number) => Math.round(degrees * 1000) / 1000;

const tagsOf = (event: Event): string[][] | null =>
  Array.isArray(event.tags) && event.tags.every((t) => Array.isArray(t) && t.length >= 2 && t.every((v) => typeof v === 'string'))
    ? event.tags
    : null;

/** One Hero Watch note, read and checked, or why it was refused. */
export function readHeroWatchNote(event: Event, publishers: readonly string[] = HERO_WATCH_PUBLISHERS): Read<Exclude<HeroWatchItem, FieldMission>> {
  if (event.kind !== NOTE_KIND) return { refused: 'not a long-form note (30023)' };
  if (!publishers.includes(event.pubkey)) return { refused: 'not from a named Hero Watch publisher' };
  if (typeof event.content !== 'string' || /^\s*[[{]/.test(event.content)) return { refused: 'its content starts as data, not words' };
  const tags = tagsOf(event);
  if (!tags) return { refused: 'a tag is not a list of at least two strings' };
  const has = (name: string, value: string) => tags.some((t) => t[0] === name && t[1] === value);
  const first = (name: string) => tags.find((t) => t[0] === name)?.[1];
  const number = (name: string) => { const v = first(name); return v !== undefined && /^[0-9]+(\.[0-9]+)?$/.test(v) ? Number(v) : undefined; };
  if (!has('t', 'hero_watch')) return { refused: 'not tagged hero_watch' };
  if (has('t', 'starcom_intel')) return { refused: 'also tagged starcom_intel' };
  const d = first('d');
  if (!d || !d.startsWith('hero-watch-')) return { refused: 'its address does not start hero-watch-' };
  const title = first('title');
  if (title === undefined) return { refused: 'it has no title' };
  const week = d.match(SUMMARY_D)?.[1];
  const kindTag = tags.find((t) => t[0] === 't' && t[1] in NOTE_KINDS)?.[1];
  if (!week && !kindTag) return { refused: 'it names no Hero Watch kind' };
  const source = first('source');
  if (!week && source === undefined) return { refused: 'it names no source' };
  // First published, not re-signed: a note carried to Mecha Jono's new key keeps its week (firstPublished.ts).
  const signed = firstPublishedAt(event);
  const validFrom = number('valid_from') ?? (week ? signed : undefined);
  const validUntil = number('valid_until') ?? (week ? signed + WEEK_S : undefined);
  if (validFrom === undefined || validUntil === undefined) return { refused: 'it does not say, in unix seconds, when it applies' };

  const base: Base = { id: `${event.kind}:${event.pubkey}:${d}`, pubkey: event.pubkey, d, eventId: event.id, createdAt: event.created_at, title, validFrom, validUntil, content: event.content };
  const summary = first('summary');
  if (summary !== undefined) base.summary = summary;
  if (source !== undefined) base.source = source;
  const url = first('r');
  if (url && /^https?:\/\//i.test(url)) base.url = url;
  const sources = sourceLinksFromTags(tags);
  if (sources.length) base.sources = sources;
  const jurisdiction = first('jurisdiction');
  if (jurisdiction && JURISDICTION.test(jurisdiction)) base.jurisdiction = jurisdiction;
  const license = first('license');
  if (license) base.license = license;
  if (tagsNamePeople(tags)) {
    base.namesPeople = true;
    rememberNamedNote(base.id, title, [summary, event.content].filter(Boolean).join('\n'));
  }
  const retracted = has('t', 'retracted');

  if (week) return { ...base, kind: 'summary', week, retracted };
  const kind = NOTE_KINDS[kindTag!];
  if (kind === 'station') {
    const launches = number('launches');
    const year = number('year');
    const geo = first('geo');
    const hash = first('g');
    const point = (geo ? parseGeoTag(geo) : null) ?? (hash ? decodeGeohash(hash) : null);
    if (!point || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) return { refused: 'a station with no place' };
    const station: LifeboatStation = { ...base, kind, section: 'Lifeboats', point: { lat: toThousandth(point.lat), lon: toThousandth(point.lon) }, precision: 'venue' };
    // Launches stand only with the year they were counted in.
    if (launches !== undefined && year !== undefined) Object.assign(station, { launches, year });
    const stationType = first('station_type');
    if (stationType) station.stationType = stationType;
    return { ...station, retracted };
  }
  if (!base.jurisdiction) return { refused: `${kind === 'operation' ? 'an operation' : 'a count of who works where'} that names no country` };
  if (kind === 'operation') {
    const op: ReliefOperation = { ...base, kind, section: 'Relief' };
    const appealType = first('appeal_type');
    if (appealType) op.appealType = appealType;
    const amount = number('amount_chf');
    if (amount !== undefined) op.amountChf = amount;
    const people = number('people_to_reach');
    if (people !== undefined) op.peopleToReach = people;
    const start = number('start');
    if (start !== undefined) op.start = start;
    const end = number('end');
    if (end !== undefined) op.end = end;
    return { ...op, retracted };
  }
  const organisations = number('organisations');
  if (organisations === undefined) return { refused: 'a count of who works where that does not say how many organisations' };
  const presence: ReliefPresence = { ...base, kind, section: 'Relief', organisations, sectors: tags.filter((t) => t[0] === 'sector').map((t) => t[1]) };
  const ngos = number('national_ngos');
  if (ngos !== undefined) presence.nationalNgos = ngos;
  const from = first('period_start');
  if (from) presence.periodStart = from;
  const to = first('period_end');
  if (to) presence.periodEnd = to;
  return { ...presence, retracted };
}

/** One field mission package, read and checked, or why it was refused. */
export function readFieldMission(event: Event, publishers: readonly string[] = HERO_WATCH_PUBLISHERS): Read<FieldMission> {
  if (event.kind !== MISSION_KIND) return { refused: 'not a mission package (30079)' };
  if (!publishers.includes(event.pubkey)) return { refused: 'not from a named Hero Watch publisher' };
  const tags = tagsOf(event);
  if (!tags) return { refused: 'a tag is not a list of at least two strings' };
  const has = (name: string, value: string) => tags.some((t) => t[0] === name && t[1] === value);
  const first = (name: string) => tags.find((t) => t[0] === name)?.[1];
  if (!has('t', 'field_mission')) return { refused: 'not tagged field_mission' };
  const d = first('d');
  if (!d) return { refused: 'it has no address' };
  let manifest: { name?: unknown; description?: unknown; objectives?: unknown; metadata?: { mechaJono?: Record<string, unknown> } };
  try {
    manifest = JSON.parse(event.content);
  } catch {
    return { refused: 'a package that is not JSON' };
  }
  const mj = (manifest?.metadata?.mechaJono ?? {}) as { family?: unknown; state?: unknown; area?: { country?: unknown }; format?: { limits?: unknown } };
  const state = first('mission_state') ?? (typeof mj.state === 'string' ? mj.state : 'open');
  const family = first('mission_family') ?? (typeof mj.family === 'string' ? mj.family : undefined);
  if (!family) return { refused: 'a field mission that names no family' };
  const name = typeof manifest.name === 'string' ? manifest.name : undefined;
  if (!name) return { refused: 'a field mission with no name' };
  const limits = typeof mj.format?.limits === 'string' ? mj.format.limits.trim() : '';
  if (state === 'open' && !limits) return { refused: 'an open field mission without its limits: never shown without its safety limits' };
  const validUntil = Number(first('valid_until'));
  if (!Number.isFinite(validUntil)) return { refused: 'it does not say, in unix seconds, until when it applies' };
  const objectives: FieldMissionObjective[] = (Array.isArray(manifest.objectives) ? manifest.objectives : []).flatMap((o: Record<string, unknown>) =>
    typeof o?.id === 'string' && typeof o?.ask === 'string' && typeof o?.effortMinutes === 'number'
      ? [{ id: o.id, ask: o.ask, effortMinutes: o.effortMinutes, ...(typeof o.for === 'string' ? { for: o.for } : {}) }]
      : []);
  const mission: FieldMission = {
    id: `${event.kind}:${event.pubkey}:${d}`, pubkey: event.pubkey, d, eventId: event.id, createdAt: event.created_at,
    kind: 'field_mission', section: 'FieldMissions', title: name, family, state,
    description: typeof manifest.description === 'string' ? manifest.description : '',
    objectives, limits, harmReduction: HARM_REDUCTION.has(family),
    validFrom: firstPublishedAt(event), validUntil, content: event.content,
  };
  // Where it rests: the package's r tags, else its manifest's source (D-CT, CT2; Interchange 3.19).
  const sources = packageSourceLinks(tags, manifest);
  if (sources.length) mission.sources = sources;
  // Its place: the jurisdiction it is tagged with, or the area its package names (whose `country` holds a code).
  const place = [first('jurisdiction'), mj.area?.country].find((v): v is string => typeof v === 'string' && JURISDICTION.test(v));
  if (place) mission.jurisdiction = place;
  // A mission names no one (D-NP, NP5): never one that carries a tagged note's words.
  const naming = missionNamesPeopleProblem(fieldMissionWords(mission));
  if (naming) return { refused: naming };
  return { ...mission, retracted: has('t', 'retracted') };
}


/** Their tags that are not a kind: the mode's own, and flags any kind can carry. */
const NOT_A_KIND = new Set(['hero_watch', 'intel_report', 'retracted', 'duplicate', 'names_people']);

/** The kind of a Hero Watch note no section here reads, or null (as Raver Watch's IX1). */
export function unreadKindOf(event: Event): string | null {
  if (event.kind !== NOTE_KIND) return null;
  const values = event.tags.filter((t) => t[0] === 't' && typeof t[1] === 'string').map((t) => t[1]);
  if (!values.includes('hero_watch') || values.some((v) => v in NOTE_KINDS)) return null;
  if (SUMMARY_D.test(event.tags.find((t) => t[0] === 'd')?.[1] ?? '')) return null;
  return values.find((v) => !NOT_A_KIND.has(v) && !v.includes(':')) ?? null;
}

export interface UnreadKind { kind: string; count: number }

/** The newest record at each address, and so what stands. */
export class HeroWatchStore {
  private readonly newest = new Map<string, HeroWatchItem & { retracted: boolean }>();
  private readonly unreadKinds = new Map<string, Set<string>>();

  constructor(
    private readonly publishers: readonly string[] = HERO_WATCH_PUBLISHERS,
    /** Publishers whose keys rotate: a note under any of a publisher's keys is one note (D-HW). */
    private readonly rotating: readonly RotatingPublisher[] = ROTATING_PUBLISHERS,
  ) {}

  accept(event: Event): { kept: true } | { kept: false; why: string } {
    const read = event.kind === MISSION_KIND ? readFieldMission(event, this.publishers) : readHeroWatchNote(event, this.publishers);
    if ('refused' in read) {
      const kind = this.publishers.includes(event.pubkey) ? unreadKindOf(event) : null;
      if (kind) {
        const d = event.tags.find((t) => t[0] === 'd')?.[1] ?? event.id;
        const addresses = this.unreadKinds.get(kind) ?? new Set<string>();
        addresses.add(`${event.kind}:${event.pubkey}:${d}`);
        this.unreadKinds.set(kind, addresses);
      }
      return { kept: false, why: read.refused };
    }
    // One note under any of its publisher's keys: kept under its identity, shown under its own address.
    const identity = noteIdentity(read.id, this.rotating);
    const held = this.newest.get(identity);
    // Newer wins; at the same second, the lower id, as relays keep replaceable events (NIP-01).
    if (held && (held.createdAt > read.createdAt || (held.createdAt === read.createdAt && held.eventId <= read.eventId))) {
      return { kept: false, why: 'a newer record at its address is held' };
    }
    this.newest.set(identity, read);
    return { kept: true };
  }

  unread(): UnreadKind[] {
    return [...this.unreadKinds]
      .map(([kind, addresses]) => ({ kind, count: addresses.size }))
      .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
  }

  /** Every record that stands: the newest at each address, unless it withdrew it. Newest first. */
  items(): HeroWatchItem[] {
    return [...this.newest.values()]
      .filter((r) => !r.retracted)
      .map(({ retracted: _retracted, ...item }) => item as HeroWatchItem)
      .sort((a, b) => b.validFrom - a.validFrom);
  }
}

// ── The Record, read while anything needs it ─────────────────────────────────

export interface HeroWatchStatus {
  loaded: boolean;
  error: string | null;
  /** When The Record said it had sent what it holds, in ms; null until it has. */
  at: number | null;
}

const store = new HeroWatchStore();
const listeners = new Set<() => void>();
let reading: { close: () => void; users: number } | null = null;
// One list and one status, replaced when they change: a React store that hands out a new array on every read re-renders forever.
let snapshot: HeroWatchItem[] = [];
let unreadSnapshot: UnreadKind[] = [];
let status: HeroWatchStatus = { loaded: false, error: null, at: null };
const notify = () => listeners.forEach((listener) => listener());

/** What a burst of notes changed, told once it is gathered (burst.ts), as Raver Watch's is. */
let changed = false;
function flush(): void {
  const unread = store.unread();
  const unreadChanged = unread.length !== unreadSnapshot.length
    || unread.some((u, i) => u.count !== unreadSnapshot[i].count || u.kind !== unreadSnapshot[i].kind);
  if (!changed && !unreadChanged) return;
  if (changed) snapshot = store.items();
  if (unreadChanged) unreadSnapshot = unread;
  changed = false;
  notify();
}
const told = burst(flush);

/** What stands now. The same list until it changes. */
export function heroWatchItems(): HeroWatchItem[] {
  return snapshot;
}

export function heroWatchStatus(): HeroWatchStatus {
  return status;
}

/** Kinds of Hero Watch note read and not shown. The same list until it changes. */
export function heroWatchUnread(): UnreadKind[] {
  return unreadSnapshot;
}

export function subscribeHeroWatch(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Reads Hero Watch from The Record until the returned function is called: Mecha Jono's `hero_watch`
 * notes and `field_mission` packages. However many ask, one read is open, and it closes when the last
 * is done.
 */
export function startHeroWatch(options: { pool?: Pick<SimplePool, 'subscribeMany'>; relays?: string[] } = {}): () => void {
  if (reading) {
    reading.users += 1;
  } else {
    status = { loaded: false, error: null, at: null };
    const pool = options.pool ?? createRelayPool();
    // A kind at a time, and every page of each: The Record returns 500 events per filter (readComplete.ts).
    const filters: Filter[] = KINDS.map((kind) => ({ kinds: [kind], authors: [...HERO_WATCH_PUBLISHERS], '#t': [kind === NOTE_KIND ? 'hero_watch' : 'field_mission'] }));
    const read = readComplete(pool, options.relays ?? heroWatchRelays(), filters, {
      onevent: (event: Event) => {
        if (store.accept(event).kept) changed = true;
        told.soon();
      },
      oncomplete: () => {
        status = { loaded: true, error: null, at: Date.now() };
        changed = true;
        told.now();
      },
      onfail: (reasons) => {
        status = { loaded: false, error: `The Record could not be read: ${reasons.map((r) => r.reason).filter(Boolean).join('; ') || 'no answer'}`, at: null };
        changed = true;
        told.now();
      },
    });
    reading = { close: () => read.close(), users: 1 };
  }
  let stopped = false;
  return () => {
    if (stopped || !reading) return;
    stopped = true;
    reading.users -= 1;
    if (reading.users === 0) {
      reading.close();
      reading = null;
    }
  };
}
