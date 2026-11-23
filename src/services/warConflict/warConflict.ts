/**
 * War & Conflict: Mecha Jono's parsed war news and its map of the world's
 * wars, read from The Record (Interchange 3.4 and 3.5, kept beside the record
 * in `war-conflict/`; the owner's decisions WC1-WC3 of 2026-10-02).
 *
 * Two families, both kind 30023 from named publishers only:
 *
 *   an item     `t=conflict_desk`, one line of the day's war news, parsed:
 *               its theatre (a stable slug for the war), up to three things
 *               that happened, each casualty claim, the forces and states
 *               named, and its place, with a point when the line's place has
 *               one;
 *   a war       `t=war_map`, one of Wikipedia's ongoing armed conflicts: its
 *               intensity tier, every country it is fought in, its deaths by
 *               year as the list writes them, and the theatres it covers.
 *
 * Their rules, kept here: two sides' casualty numbers are two claims, kept
 * apart and never summed; an actor is a force, group or state, never a
 * person; `jurisdiction` is where it happened. A place is kept no finer than
 * 0.1°, as everything Starcom draws and shares is (RW3). The newest note at an
 * address stands, and a withdrawal (`t: retracted`) ends its item, as it does
 * a second copy withdrawn as a duplicate.
 */
import type { Event, Filter, SimplePool } from 'nostr-tools';
import { WAR_CONFLICT_PUBLISHERS } from '../../config/publicInfrastructure';
import { noteIdentity, ROTATING_PUBLISHERS, type RotatingPublisher } from '../nostr/publisherKeys';
import { warConflictRelays } from '../nostr/publishTargets';
import { createRelayPool } from '../nostr/relayPool';
import { readComplete } from '../nostr/readComplete';
import { burst } from '../nostr/burst';
import { firstPublishedAt } from '../nostr/firstPublished';
import { parseGeoTag } from '../geoint/parser';
import { decodeGeohash } from '../intel/observations/adapters/geohash';
import { sourceLinksFromTags } from '../intel/sourceLinks';
import { lensesOf, type LensId } from '../intel/bigThreeLenses';
import { tagsNamePeople, rememberNamedNote } from '../intel/namesPeople';

/** A war's tier on Wikipedia's list, by combat deaths in the current or previous year. */
export type WarTier = 'major_war' | 'minor_war' | 'conflict' | 'skirmish';
/** The tiers, worst first. */
export const WAR_TIERS: readonly WarTier[] = ['major_war', 'minor_war', 'conflict', 'skirmish'];
export type ConflictRole = 'critical' | 'actionable' | 'context';
const ROLES: readonly string[] = ['critical', 'actionable', 'context'];
/** How precise an item's point is: a town, or a province's centre standing for the province. */
export type ConflictPrecision = 'city' | 'state';
const PRECISIONS: readonly string[] = ['city', 'state'];
/** A country (`sd`), or a subdivision as ISO 3166-2 writes it, lower case. */
const JURISDICTION = /^[a-z]{2}(-[a-z0-9]{1,3})?$/;
/** The address each family is published at. The war map's index is `starcom-intel-war-map`, and is not a war. */
const ITEM_ADDRESS = /^starcom-intel-conflict-/;
const WAR_ADDRESS = /^starcom-intel-war-(?!map$)/;
/** The most things that happened an item keeps, most specific first. */
const EVENTS_KEPT = 3;

export interface Theatre {
  slug: string;
  name: string;
  region: string;
}

/** What both families share. */
interface Note {
  /** `30023:<pubkey>:<d>`, as listReports() names it. */
  id: string;
  pubkey: string;
  d: string;
  /** The signed event this version is. */
  eventId: string;
  /** When this version was signed, in unix seconds. */
  createdAt: number;
  title: string;
  summary?: string;
  /** The item's page at its source (the `r` tag), when it is a web page. */
  url?: string;
  /** Every source it names, its `r` tags in order, the original first (D-CT, CT2; Interchange 3.19). */
  sources?: string[];
  /** The big-three lenses it is sorted under, from its `t=lens:*` tags (D-CT, CT6). */
  lenses?: LensId[];
  license?: string;
  /** When Mecha Jono reported it, in unix seconds: `published_at`, else a carried note's first signing, else when it was signed. */
  reportedAt: number;
  content: string;
  /** It names a person as a cited source names them, by its own `t=names_people` (D-NP): never on a card or clip. */
  namesPeople?: boolean;
}

export interface ConflictItem extends Note {
  family: 'item';
  /** The source within the desk (`t=source:<id>`): wikipedia, un_news, easa, … */
  source?: string;
  /** The category's kind, as `conflict.events`. */
  category?: string;
  role?: ConflictRole;
  /** When a warning stops applying, in unix seconds, where it says. */
  validUntil?: number;
  theatre?: Theatre;
  events: Array<{ id: string; label: string }>;
  /** Each claim as the line reports it: two sides' numbers are two claims. */
  casualties: Array<{ kind: string; count: number | null; qualifier: string; words: string }>;
  /** The line reports deaths. */
  fatal: boolean;
  actors: Array<{ name: string; kind: string; country: string }>;
  /** Where, in the line's own words, and how precise. */
  place?: { words: string; precision: string };
  /** The place's point, rounded to 0.1°. */
  point?: { lat: number; lon: number };
  precision?: ConflictPrecision;
  /** Where it happened, never where people came from. */
  jurisdiction?: string;
}

export interface WarItem extends Note {
  family: 'war';
  name: string;
  tier: WarTier;
  tierLabel: string;
  tierMeans: string;
  /** Every country it is fought in. */
  countries: string[];
  /** Its deaths as the list writes them, cumulative and by year, with a low number to sort by. */
  fatalities: Array<{ period: string; text: string; low: number | null }>;
  includes: string[];
  theatres: Theatre[];
  started?: string;
}

export type WarConflictNote = (ConflictItem | WarItem) & {
  /** A withdrawal: the item at its address has ended. */
  retracted: boolean;
};

const toTenth = (degrees: number) => Math.round(degrees * 10) / 10;
const whole = (text: string | undefined) => (text !== undefined && /^[0-9]+$/.test(text) ? Number(text) : null);

/** One note, read and checked, or why it was refused. */
export function readWarConflictNote(
  event: Event,
  publishers: readonly string[] = WAR_CONFLICT_PUBLISHERS,
): WarConflictNote | { refused: string } {
  if (event.kind !== 30023) return { refused: 'not a long-form note (30023)' };
  if (!publishers.includes(event.pubkey)) return { refused: 'not from a named War & Conflict publisher' };
  if (typeof event.content !== 'string' || /^\s*[[{]/.test(event.content)) return { refused: 'its content starts as data, not words' };
  const tags = event.tags;
  if (!Array.isArray(tags) || !tags.every((t) => Array.isArray(t) && t.length >= 2 && t.every((v) => typeof v === 'string'))) {
    return { refused: 'a tag is not a list of at least two strings' };
  }
  const has = (name: string, value: string) => tags.some((t) => t[0] === name && t[1] === value);
  const first = (name: string) => tags.find((t) => t[0] === name)?.[1];
  const all = (name: string) => tags.filter((t) => t[0] === name);
  const prefixed = (prefix: string) => tags.find((t) => t[0] === 't' && t[1].startsWith(prefix))?.[1].slice(prefix.length);
  if (has('t', 'scratch-verification')) return { refused: 'their own test event' };
  const isItem = has('t', 'conflict_desk');
  const isWar = has('t', 'war_map');
  if (isItem === isWar) return { refused: 'neither a conflict item nor a war' };
  const d = first('d');
  if (!d || !(isItem ? ITEM_ADDRESS : WAR_ADDRESS).test(d)) return { refused: 'its address is not one their desk publishes at' };
  const title = first('title');
  if (title === undefined) return { refused: 'it has no title' };

  const note: Note & { retracted: boolean } = {
    id: `30023:${event.pubkey}:${d}`,
    pubkey: event.pubkey,
    d,
    eventId: event.id,
    createdAt: event.created_at,
    title,
    // First published, not re-signed: a note carried to Mecha Jono's new key keeps its time (firstPublished.ts).
    reportedAt: firstPublishedAt(event),
    content: event.content,
    retracted: has('t', 'retracted'),
  };
  const summary = first('summary');
  if (summary !== undefined) note.summary = summary;
  if (tagsNamePeople(tags)) {
    note.namesPeople = true;
    // Its words, for the missions that must not carry them (D-NP, NP5).
    rememberNamedNote(note.id, title, [summary, event.content].filter(Boolean).join('\n'));
  }
  const url = first('r');
  if (url && /^https?:\/\//i.test(url)) note.url = url;
  const sources = sourceLinksFromTags(tags);
  if (sources.length) note.sources = sources;
  const lenses = lensesOf(all('t').map((t) => t[1]));
  if (lenses.length) note.lenses = lenses;
  const license = first('license');
  if (license) note.license = license;
  const theatres = all('theatre').filter((t) => t[1] && t[2]).map((t) => ({ slug: t[1], name: t[2], region: t[3] ?? '' }));

  if (isWar) {
    const intensity = tags.find((t) => t[0] === 'intensity' && (WAR_TIERS as readonly string[]).includes(t[1]));
    if (!intensity) return { refused: 'a war with no tier it can read' };
    const war: WarItem & { retracted: boolean } = {
      ...note,
      family: 'war',
      name: title.replace(/^[^:]*:\s*/, ''),
      tier: intensity[1] as WarTier,
      tierLabel: intensity[2] ?? intensity[1],
      tierMeans: intensity[3] ?? '',
      countries: [...new Set(all('jurisdiction').map((t) => t[1]).filter((code) => JURISDICTION.test(code)))],
      fatalities: all('fatalities').filter((t) => t[2] !== undefined).map((t) => ({ period: t[1], text: t[2], low: whole(t[3]) })),
      includes: all('includes').map((t) => t[1]),
      theatres,
    };
    const started = first('started');
    if (started) war.started = started;
    return war;
  }

  const item: ConflictItem & { retracted: boolean } = {
    ...note,
    family: 'item',
    events: all('event').slice(0, EVENTS_KEPT).map((t) => ({ id: t[1], label: t[2] ?? t[1] })),
    casualties: all('casualty').map((t) => ({ kind: t[1], count: whole(t[2]), qualifier: t[3] ?? '', words: t[4] ?? '' })),
    fatal: has('t', 'fatalities'),
    actors: all('actor').map((t) => ({ name: t[1], kind: t[2] ?? '', country: t[3] ?? '' })),
  };
  if (theatres[0]) item.theatre = theatres[0];
  const source = prefixed('source:');
  if (source) item.source = source;
  const category = tags.find((t) => t[0] === 't' && /^category:[a-z_]+\.[a-z_]+$/.test(t[1]))?.[1].slice('category:'.length);
  if (category) item.category = category;
  const role = prefixed('role:');
  if (role && ROLES.includes(role)) item.role = role as ConflictRole;
  const validUntil = whole(first('valid_until'));
  if (validUntil !== null) item.validUntil = validUntil;
  const place = tags.find((t) => t[0] === 'place');
  if (place) item.place = { words: place[1], precision: place[2] ?? '' };
  // The point as `geo` gives it, or else the centre of the geohash cell beside it.
  const geo = first('geo');
  const hash = first('g');
  const point = (geo ? parseGeoTag(geo) : null) ?? (hash ? decodeGeohash(hash) : null);
  if (point && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180) {
    item.point = { lat: toTenth(point.lat), lon: toTenth(point.lon) };
    const precision = first('geo_precision');
    if (precision && PRECISIONS.includes(precision)) item.precision = precision as ConflictPrecision;
  }
  const jurisdiction = first('jurisdiction');
  if (jurisdiction && JURISDICTION.test(jurisdiction)) item.jurisdiction = jurisdiction;
  return item;
}

const TIER_RANK = (tier: WarTier) => WAR_TIERS.indexOf(tier);
/** This year's deaths, or the latest year's, to sort wars of one tier by. */
const latestDeaths = (war: WarItem) => {
  const years = war.fatalities.filter((f) => /^[0-9]{4}$/.test(f.period)).sort((a, b) => b.period.localeCompare(a.period));
  return years[0]?.low ?? 0;
};

/** The newest note at each address, and so what stands. */
export class WarConflictStore {
  private readonly newest = new Map<string, WarConflictNote>();

  constructor(
    private readonly publishers: readonly string[] = WAR_CONFLICT_PUBLISHERS,
    /** Publishers whose keys rotate: a note under any of a publisher's keys is one note (D-HW). */
    private readonly rotating: readonly RotatingPublisher[] = ROTATING_PUBLISHERS,
  ) {}

  /** Takes a note in: kept when it is the newest at its address. */
  accept(event: Event): { kept: true } | { kept: false; why: string } {
    const note = readWarConflictNote(event, this.publishers);
    if ('refused' in note) return { kept: false, why: note.refused };
    // One note under any of its publisher's keys: kept under its identity, shown under its own address.
    const identity = noteIdentity(note.id, this.rotating);
    const held = this.newest.get(identity);
    // Newer wins; at the same second, the lower id, as relays keep replaceable events (NIP-01).
    if (held && (held.createdAt > note.createdAt || (held.createdAt === note.createdAt && held.eventId <= note.eventId))) {
      return { kept: false, why: 'a newer note at its address is held' };
    }
    this.newest.set(identity, note);
    return { kept: true };
  }

  private standing(): WarConflictNote[] {
    return [...this.newest.values()].filter((note) => !note.retracted);
  }

  /** The items that stand, newest reported first. */
  items(): ConflictItem[] {
    return this.standing()
      .filter((note): note is WarConflictNote & ConflictItem => note.family === 'item')
      .map(({ retracted: _retracted, ...item }) => item as ConflictItem)
      .sort((a, b) => b.reportedAt - a.reportedAt);
  }

  /** The wars that stand, by tier, worst first, then by their latest year's deaths. */
  wars(): WarItem[] {
    return this.standing()
      .filter((note): note is WarConflictNote & WarItem => note.family === 'war')
      .map(({ retracted: _retracted, ...war }) => war as WarItem)
      .sort((a, b) => TIER_RANK(a.tier) - TIER_RANK(b.tier) || latestDeaths(b) - latestDeaths(a));
  }
}

// ── The Record, read while anything needs it ─────────────────────────────────

/** Whether The Record has sent what it holds, or why it could not be read. */
export interface WarConflictStatus {
  loaded: boolean;
  error: string | null;
  /** When The Record said it had sent what it holds, in ms; null until it has. */
  at: number | null;
}

export interface WarConflictSnapshot {
  items: ConflictItem[];
  wars: WarItem[];
}

const store = new WarConflictStore();
const listeners = new Set<() => void>();
let reading: { close: () => void; users: number } | null = null;
// One snapshot and one status, replaced when they change: a React store that
// hands out new arrays on every read re-renders forever.
let snapshot: WarConflictSnapshot = { items: [], wars: [] };
let status: WarConflictStatus = { loaded: false, error: null, at: null };

const notify = () => listeners.forEach((listener) => listener());

/** What a burst of notes changed, told once it is gathered (burst.ts): one rebuild and one render, not one a note. */
let changed = false;
const told = burst(() => {
  if (!changed) return;
  changed = false;
  snapshot = { items: store.items(), wars: store.wars() };
  notify();
});

/** What stands now. The same object until it changes. */
export function warConflictSnapshot(): WarConflictSnapshot {
  return snapshot;
}

/** Whether The Record has answered the read open now. */
export function warConflictStatus(): WarConflictStatus {
  return status;
}

/** Told whenever what stands, or the status, changes. Returns the function that stops it. */
export function subscribeWarConflict(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Reads War & Conflict from The Record until the returned function is called:
 * named publishers' conflict items and wars. However many ask, one read is
 * open, and it closes when the last is done.
 */
export function startWarConflict(
  options: { pool?: Pick<SimplePool, 'subscribeMany'>; relays?: string[] } = {},
): () => void {
  if (reading) {
    reading.users += 1;
  } else {
    status = { loaded: false, error: null, at: null };
    const pool = options.pool ?? createRelayPool();
    // Every page of it: The Record returns 500 events per filter (readComplete.ts).
    const filters: Filter[] = [{ kinds: [30023], authors: [...WAR_CONFLICT_PUBLISHERS], '#t': ['conflict_desk', 'war_map'] }];
    const read = readComplete(pool, options.relays ?? warConflictRelays(), filters, {
      onevent: (event: Event) => {
        if (store.accept(event).kept) { changed = true; told.soon(); }
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
