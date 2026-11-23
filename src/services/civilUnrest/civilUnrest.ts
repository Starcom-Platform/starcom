/**
 * Civil Unrest: Mecha Jono's protest desk, read from The Record (decision D-CU,
 * docs/missions/01-architecture-decisions/civil-unrest.md; its census of 2026-10-26 beside the record).
 *
 * Two kinds of note, from Mecha Jono's keys only, as AI Watch is read, long-form notes (kind 30023):
 *
 * - **A day of unrest** (`t=unrest_note`): one a country and day, in the section Civil Unrest. Its country
 *   (`jurisdiction`), its city where it names one (`place` and `geo`), its kinds (`unrest_kind`: protest,
 *   shutdown), the movement it names, who reported it (`authority`), and each crowd count beside its claimant
 *   (`claim`: count, claimant, the outlet citing it, the words as stated), never one as fact. Its day is its
 *   address's (`…-es-2026-10-25-…`), the day it is about.
 * - **A protest surge** (`t=reporting_surge` with `t=protest`): in its own section, Protest surges (CU4), a
 *   surge in reporting, not in protest. Timed by when it was written: its address's date is the window's, not
 *   always the day its title names.
 *
 * Nothing is added to what a note says, and one thing is left out: a reporter that is the note's own client, the
 * publisher's own desk, credited to nobody. The newest note at an address stands, and `t=retracted` withdraws it.
 * Both carry `starcom_intel`: Civil Unrest is where they are drawn, never also as Intel Reports (CU3).
 */
import type { Event, Filter, SimplePool } from 'nostr-tools';
import { CIVIL_UNREST_PUBLISHERS } from '../../config/publicInfrastructure';
import { noteIdentity, ROTATING_PUBLISHERS, type RotatingPublisher } from '../nostr/publisherKeys';
import { civilUnrestRelays } from '../nostr/publishTargets';
import { createRelayPool } from '../nostr/relayPool';
import { readComplete } from '../nostr/readComplete';
import { burst } from '../nostr/burst';
import { firstPublishedAt } from '../nostr/firstPublished';
import { parseGeoTag } from '../geoint/parser';
import { sourceLinksFromTags } from '../intel/sourceLinks';
import { tagsNamePeople, rememberNamedNote } from '../intel/namesPeople';

/** The sections Civil Unrest draws (CU4). */
export type CivilUnrestSection = 'CivilUnrest' | 'ProtestSurges';
export const CIVIL_UNREST_SECTIONS: readonly CivilUnrestSection[] = ['CivilUnrest', 'ProtestSurges'];

/** The tags that make a note Civil Unrest's: the Intel Reports ingest leaves these to it (CU3). */
export const UNREST_NOTE_TAG = 'unrest_note';
export const SURGE_TAG = 'reporting_surge';
export const PROTEST_TAG = 'protest';

/** A crowd count, as its claimant states it: never one as fact. */
export interface UnrestClaim {
  count: number;
  /** The claimant's key (`organisers`, `interior_ministry`), and its name as stated. */
  claimant: string;
  claimantName: string;
  /** The outlet that reports the claim, where it says. */
  citedBy?: string;
  /** The words of the count as stated: `at least 25,000`. */
  stated: string;
}

export interface CivilUnrestItem {
  /** `<kind>:<pubkey>:<d>`, as listReports() names it. */
  id: string;
  pubkey: string;
  d: string;
  eventId: string;
  /** When this version was signed, in unix seconds. */
  createdAt: number;
  /** When Mecha Jono published it (`published_at`), else a carried note's first signing; unix seconds. */
  publishedAt: number;
  section: CivilUnrestSection;
  title: string;
  summary?: string;
  content: string;
  /** It names a person as its source names them, by its own `t=names_people` (D-NP): never on a card or clip. */
  namesPeople?: boolean;
  /** The source's own page (the first `r` tag), and every source it names, in order. */
  url?: string;
  sources?: string[];
  /** A day of unrest's day, `YYYY-MM-DD`, from its address. Absent on a surge. */
  day?: string;
  /** Its kinds, as tagged: `protest`, `shutdown`. */
  kinds: string[];
  claims: UnrestClaim[];
  movement?: { wikidata?: string; name: string };
  /** Who reported it, by name (`the CIVICUS Monitor`); and Mecha Jono's id for the source (`civicus`). */
  authority?: string;
  source?: string;
  /** A country, ISO 3166-1 alpha-2 lower case. */
  jurisdiction?: string;
  point?: { lat: number; lon: number };
  /** How precisely the point is known, as stated (`city`), and the city's name. */
  precision?: string;
  placeName?: string;
  /** The licence of what it carries, to credit. */
  licence?: string;
}

type Read = (CivilUnrestItem & { retracted: boolean }) | { refused: string };

const NOTE_KIND = 30023;
const COUNTRY = /^[a-z]{2}$/;
const WIKIDATA = /^Q[1-9][0-9]*$/;
const DAY_IN_ADDRESS = /-(\d{4}-\d{2}-\d{2})-[0-9a-z]+$/;
const WHOLE = /^(0|[1-9]\d{0,9})$/;

const tagsOf = (event: Event): string[][] | null =>
  Array.isArray(event.tags) && event.tags.every((t) => Array.isArray(t) && t.length >= 2 && t.every((v) => typeof v === 'string'))
    ? event.tags
    : null;

/** One Civil Unrest note, read and checked, or why it was refused. */
export function readCivilUnrestNote(event: Event, publishers: readonly string[] = CIVIL_UNREST_PUBLISHERS): Read {
  if (event.kind !== NOTE_KIND) return { refused: 'not a long-form note (30023)' };
  if (!publishers.includes(event.pubkey)) return { refused: 'not from a named Civil Unrest publisher' };
  if (typeof event.content !== 'string') return { refused: 'its content is not words' };
  const tags = tagsOf(event);
  if (!tags) return { refused: 'a tag is not a list of at least two strings' };
  const has = (name: string, value: string) => tags.some((t) => t[0] === name && t[1] === value);
  const first = (name: string) => tags.find((t) => t[0] === name)?.[1];
  const section: CivilUnrestSection | null = has('t', UNREST_NOTE_TAG) ? 'CivilUnrest'
    : has('t', SURGE_TAG) && has('t', PROTEST_TAG) ? 'ProtestSurges' : null;
  if (!section) return { refused: 'neither a day of unrest nor a protest surge' };
  const d = first('d');
  if (!d) return { refused: 'it has no address' };
  const title = first('title');
  if (!title) return { refused: 'it has no title' };

  const item: CivilUnrestItem = {
    id: `${event.kind}:${event.pubkey}:${d}`, pubkey: event.pubkey, d, eventId: event.id, createdAt: event.created_at,
    // First published, not re-signed: a note carried to Mecha Jono's new key keeps its time (firstPublished.ts).
    publishedAt: firstPublishedAt(event),
    section, title, content: event.content,
    kinds: [...new Set(tags.filter((t) => t[0] === 'unrest_kind').map((t) => t[1].trim()).filter(Boolean))],
    claims: tags.filter((t) => t[0] === 'claim' && WHOLE.test(t[1] ?? '') && t[2] && t[3]).map((t) => ({
      count: Number(t[1]), claimant: t[2], claimantName: t[3], ...(t[4] ? { citedBy: t[4] } : {}), stated: t[5] || t[1],
    })),
  };
  const summary = first('summary');
  if (summary !== undefined) item.summary = summary;
  if (tagsNamePeople(tags)) {
    item.namesPeople = true;
    // Its words, for the missions that must not carry them (D-NP, NP5).
    rememberNamedNote(item.id, title, [summary, event.content].filter(Boolean).join('\n'));
  }
  const sources = sourceLinksFromTags(tags);
  if (sources.length) { item.sources = sources; item.url = sources[0]; }
  if (section === 'CivilUnrest') {
    const day = DAY_IN_ADDRESS.exec(d)?.[1];
    if (day && Number.isFinite(Date.parse(`${day}T00:00:00Z`))) item.day = day;
  }
  const movement = tags.find((t) => t[0] === 'movement');
  if (movement) {
    const name = (movement[2] ?? '').trim() || (WIKIDATA.test(movement[1]) ? '' : movement[1].trim());
    if (name) item.movement = { ...(WIKIDATA.test(movement[1]) ? { wikidata: movement[1] } : {}), name };
  }
  const authority = tags.find((t) => t[0] === 'authority');
  // The publisher's own desk is credited to nobody (the operator, 24 Oct; record D-L): an authority naming the
  // note's own client is not said, whoever the client is.
  const client = first('client')?.trim();
  const ownDesk = !!client && !!authority && (authority[2] ?? '').includes(client);
  if (authority?.[2] && !ownDesk) item.authority = authority[2];
  const source = tags.find((t) => t[0] === 't' && t[1].startsWith('source:'))?.[1].slice('source:'.length);
  if (source) item.source = source;
  const jurisdiction = first('jurisdiction');
  if (jurisdiction && COUNTRY.test(jurisdiction)) item.jurisdiction = jurisdiction;
  // A point where the note gives one, of the event itself, at the precision it states.
  const geo = first('geo');
  const point = geo ? parseGeoTag(geo) : null;
  if (point && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180 && first('geo_kind') !== 'outlet_location') {
    item.point = { lat: point.lat, lon: point.lon };
    const precision = first('geo_precision');
    if (precision) item.precision = precision;
  }
  // The city it names, said in its hover whether or not it is placed there.
  const place = first('place');
  if (place) item.placeName = place;
  const licence = first('license');
  if (licence) item.licence = licence;
  return { ...item, retracted: has('t', 'retracted') };
}

/** The newest note at each address, and so what stands. */
export class CivilUnrestStore {
  private readonly newest = new Map<string, CivilUnrestItem & { retracted: boolean }>();
  constructor(
    private readonly publishers: readonly string[] = CIVIL_UNREST_PUBLISHERS,
    /** Publishers whose keys rotate: a note under any of a publisher's keys is one note (D-HW). */
    private readonly rotating: readonly RotatingPublisher[] = ROTATING_PUBLISHERS,
  ) {}

  accept(event: Event): { kept: true } | { kept: false; why: string } {
    const read = readCivilUnrestNote(event, this.publishers);
    if ('refused' in read) return { kept: false, why: read.refused };
    const identity = noteIdentity(read.id, this.rotating);
    const held = this.newest.get(identity);
    // Newer wins; at the same second, the lower id, as relays keep replaceable events (NIP-01).
    if (held && (held.createdAt > read.createdAt || (held.createdAt === read.createdAt && held.eventId <= read.eventId))) {
      return { kept: false, why: 'a newer record at its address is held' };
    }
    this.newest.set(identity, read);
    return { kept: true };
  }

  /** Every note that stands: the newest at each address, unless it withdrew it. Newest first. */
  items(): CivilUnrestItem[] {
    return [...this.newest.values()]
      .filter((r) => !r.retracted)
      .map(({ retracted: _retracted, ...item }) => item)
      .sort((a, b) => b.publishedAt - a.publishedAt || a.id.localeCompare(b.id));
  }
}

// ── The Record, read while anything needs it ─────────────────────────────────

export interface CivilUnrestStatus {
  loaded: boolean;
  error: string | null;
  /** When The Record said it had sent what it holds, in ms; null until it has. */
  at: number | null;
}

const store = new CivilUnrestStore();
const listeners = new Set<() => void>();
let reading: { close: () => void; users: number } | null = null;
// One list and one status, replaced when they change: a React store that hands out a new array on every read re-renders forever.
let snapshot: CivilUnrestItem[] = [];
let status: CivilUnrestStatus = { loaded: false, error: null, at: null };
const notify = () => listeners.forEach((listener) => listener());

/** What a burst of notes changed, told once it is gathered (burst.ts): one rebuild and one render, not one a note. */
let changed = false;
const told = burst(() => {
  if (!changed) return;
  changed = false;
  snapshot = store.items();
  notify();
});

/** What stands now. The same list until it changes. */
export function civilUnrestItems(): CivilUnrestItem[] {
  return snapshot;
}

export function civilUnrestStatus(): CivilUnrestStatus {
  return status;
}

export function subscribeCivilUnrest(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Reads Civil Unrest from The Record until the returned function is called. However many ask, one read is
 * open, and it closes when the last is done.
 */
export function startCivilUnrest(options: { pool?: Pick<SimplePool, 'subscribeMany'>; relays?: string[] } = {}): () => void {
  if (reading) {
    reading.users += 1;
  } else {
    status = { loaded: false, error: null, at: null };
    const pool = options.pool ?? createRelayPool();
    // Every page: The Record returns 500 events per filter (readComplete.ts). Surges by `protest`, which conflict surges lack.
    const filters: Filter[] = [
      { kinds: [NOTE_KIND], authors: [...CIVIL_UNREST_PUBLISHERS], '#t': [UNREST_NOTE_TAG] },
      { kinds: [NOTE_KIND], authors: [...CIVIL_UNREST_PUBLISHERS], '#t': [PROTEST_TAG] },
    ];
    const read = readComplete(pool, options.relays ?? civilUnrestRelays(), filters, {
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
