/**
 * AI Watch: Mecha Jono's Terminator Watch notes, read from The Record (decision D-AW,
 * docs/missions/01-architecture-decisions/ai-watch.md; its census of 2026-10-12 beside the record).
 *
 * One kind of record, from Mecha Jono's keys only, as Hero Watch is read: a long-form note (kind 30023,
 * `t=terminator_watch`) carrying a source's headline and link, sorted by Mecha Jono into facets and a
 * stance. Nothing is added to what the note says.
 *
 * - **Sections** (AW2) come from its facets: Incidents, Frontier AI, AI in war, Safety & security. A note
 *   with two facets is in both; one whose facets none names is kept, in no section, for the panel.
 * - **Its stance** (AW4) is kept as stated (`good`, `bad`, `ugly`), and absent where none is.
 * - **Its place** (AW3) only as the note states it: a point (`geo`) at the precision it gives, else a
 *   country or a subdivision (`jurisdiction`), else none. The outlet's country is kept apart, and never
 *   used as a place: where a story is reported is not where it happened.
 * - **What may be done with it**: `translate=reader-only` keeps its reason. Such a note may be read here
 *   in a machine translation, and never published translated (ML14).
 *
 * Signatures are checked by the pool this reads through. The newest note at an address stands, and
 * `t=retracted` withdraws it. A note tagged `starcom_intel` is accepted: AI Watch is where it is drawn
 * (AW1).
 */
import type { Event, Filter, SimplePool } from 'nostr-tools';
import { AI_WATCH_PUBLISHERS } from '../../config/publicInfrastructure';
import { noteIdentity, ROTATING_PUBLISHERS, type RotatingPublisher } from '../nostr/publisherKeys';
import { aiWatchRelays } from '../nostr/publishTargets';
import { createRelayPool } from '../nostr/relayPool';
import { readComplete } from '../nostr/readComplete';
import { burst } from '../nostr/burst';
import { firstPublishedAt } from '../nostr/firstPublished';
import { parseGeoTag } from '../geoint/parser';
import { sourceLinksFromTags } from '../intel/sourceLinks';
import { tagsNamePeople, rememberNamedNote } from '../intel/namesPeople';

/** The sections a note is drawn on (AW2). */
export type AiWatchSection = 'AiIncidents' | 'AiFrontier' | 'AiWar' | 'AiSafety';
export const AI_WATCH_SECTIONS: readonly AiWatchSection[] = ['AiIncidents', 'AiFrontier', 'AiWar', 'AiSafety'];
export type AiWatchStance = 'good' | 'bad' | 'ugly';

/** Each facet Mecha Jono sorts by, and the section it is drawn in. */
const SECTION_OF_FACET: Record<string, AiWatchSection> = {
  incident: 'AiIncidents',
  frontier: 'AiFrontier',
  autonomous_weapons: 'AiWar',
  military_industrial: 'AiWar',
  ai_security: 'AiSafety',
  loss_of_control: 'AiSafety',
};
const STANCES = new Set<string>(['good', 'bad', 'ugly']);

export interface AiWatchItem {
  /** `<kind>:<pubkey>:<d>`, as listReports() names it. */
  id: string;
  pubkey: string;
  d: string;
  eventId: string;
  /** When this version was signed, in unix seconds. */
  createdAt: number;
  /** When Mecha Jono published it (`published_at`), else a carried note's first signing, else when it was signed; unix seconds. */
  publishedAt: number;
  title: string;
  summary?: string;
  content: string;
  /** It names a person as its source names them, by its own `t=names_people` (D-NP): never on a card or clip. */
  namesPeople?: boolean;
  /** The source's own page (the `r` tag). */
  url: string;
  /** Every source it names, its `r` tags in order, the original first (D-CT, CT2). */
  sources?: string[];
  sections: AiWatchSection[];
  /** Every facet as tagged, those no section names among them. */
  facets: string[];
  stance?: AiWatchStance;
  /** Mecha Jono's id for the source (`aiid`, `qbitai`). */
  source?: string;
  /** The country of the outlet that reported it: never a place. */
  outletCountry?: string;
  /** The language the source wrote in, ISO 639-1. */
  language?: string;
  /** Why its terms allow it to be read and never published translated, when they do (ML14). */
  readerOnly?: string;
  /** A country (`ua`) or a subdivision, ISO 3166 lower case. */
  jurisdiction?: string;
  point?: { lat: number; lon: number };
  /** How precisely the point is known, as stated (`city`). */
  precision?: string;
}

type Read = (AiWatchItem & { retracted: boolean }) | { refused: string };

const NOTE_KIND = 30023;
const JURISDICTION = /^[a-z]{2}(-[a-z0-9]{1,3})?$/;
const COUNTRY = /^[a-z]{2}$/;
const LANGUAGE = /^[a-z]{2,3}$/;

const tagsOf = (event: Event): string[][] | null =>
  Array.isArray(event.tags) && event.tags.every((t) => Array.isArray(t) && t.length >= 2 && t.every((v) => typeof v === 'string'))
    ? event.tags
    : null;

/** One AI Watch note, read and checked, or why it was refused. */
export function readAiWatchNote(event: Event, publishers: readonly string[] = AI_WATCH_PUBLISHERS): Read {
  if (event.kind !== NOTE_KIND) return { refused: 'not a long-form note (30023)' };
  if (!publishers.includes(event.pubkey)) return { refused: 'not from a named AI Watch publisher' };
  if (typeof event.content !== 'string') return { refused: 'its content is not words' };
  const tags = tagsOf(event);
  if (!tags) return { refused: 'a tag is not a list of at least two strings' };
  const has = (name: string, value: string) => tags.some((t) => t[0] === name && t[1] === value);
  const first = (name: string) => tags.find((t) => t[0] === name)?.[1];
  const prefixed = (prefix: string) => tags.filter((t) => t[0] === 't' && t[1].startsWith(`${prefix}:`)).map((t) => t[1].slice(prefix.length + 1));
  if (!has('t', 'terminator_watch')) return { refused: 'not tagged terminator_watch' };
  const d = first('d');
  if (!d) return { refused: 'it has no address' };
  const title = first('title');
  if (title === undefined) return { refused: 'it has no title' };
  const url = first('r');
  if (!url || !/^https?:\/\//i.test(url)) return { refused: 'it has no link to its source' };

  const facets = prefixed('facet');
  const sections = AI_WATCH_SECTIONS.filter((section) => facets.some((f) => SECTION_OF_FACET[f] === section));
  const item: AiWatchItem = {
    id: `${event.kind}:${event.pubkey}:${d}`, pubkey: event.pubkey, d, eventId: event.id, createdAt: event.created_at,
    // First published, not re-signed: a note carried to Mecha Jono's new key keeps its time (firstPublished.ts).
    publishedAt: firstPublishedAt(event),
    title, content: event.content, url, sections, facets,
  };
  const summary = first('summary');
  if (summary !== undefined) item.summary = summary;
  if (tagsNamePeople(tags)) {
    item.namesPeople = true;
    // Its words, for the missions that must not carry them (D-NP, NP5).
    rememberNamedNote(item.id, title, [summary, event.content].filter(Boolean).join('\n'));
  }
  const sources = sourceLinksFromTags(tags);
  if (sources.length) item.sources = sources;
  const stance = prefixed('stance')[0];
  if (stance && STANCES.has(stance)) item.stance = stance as AiWatchStance;
  const source = prefixed('source')[0];
  if (source) item.source = source;
  const outlet = prefixed('outlet_country')[0];
  if (outlet && COUNTRY.test(outlet)) item.outletCountry = outlet;
  const language = tags.find((t) => t[0] === 'l' && t[2] === 'ISO-639-1')?.[1];
  if (language && LANGUAGE.test(language)) item.language = language;
  const readerOnly = tags.find((t) => t[0] === 'translate' && t[1] === 'reader-only');
  if (readerOnly) item.readerOnly = readerOnly[2] ?? 'its terms allow no adaptation';
  const jurisdiction = first('jurisdiction');
  if (jurisdiction && JURISDICTION.test(jurisdiction)) item.jurisdiction = jurisdiction;
  // A point where the note gives one, of the event itself, at the precision it states.
  const geo = first('geo');
  const point = geo ? parseGeoTag(geo) : null;
  if (point && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180 && first('geo_kind') !== 'outlet_location') {
    item.point = { lat: point.lat, lon: point.lon };
    const precision = first('geo_precision');
    if (precision) item.precision = precision;
  }
  return { ...item, retracted: has('t', 'retracted') };
}

/** The newest note at each address, and so what stands. */
export class AiWatchStore {
  private readonly newest = new Map<string, AiWatchItem & { retracted: boolean }>();
  constructor(
    private readonly publishers: readonly string[] = AI_WATCH_PUBLISHERS,
    /** Publishers whose keys rotate: a note under any of a publisher's keys is one note (D-HW). */
    private readonly rotating: readonly RotatingPublisher[] = ROTATING_PUBLISHERS,
  ) {}

  accept(event: Event): { kept: true } | { kept: false; why: string } {
    const read = readAiWatchNote(event, this.publishers);
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
  items(): AiWatchItem[] {
    return [...this.newest.values()]
      .filter((r) => !r.retracted)
      .map(({ retracted: _retracted, ...item }) => item)
      .sort((a, b) => b.publishedAt - a.publishedAt || a.id.localeCompare(b.id));
  }
}

// ── The Record, read while anything needs it ─────────────────────────────────

export interface AiWatchStatus {
  loaded: boolean;
  error: string | null;
  /** When The Record said it had sent what it holds, in ms; null until it has. */
  at: number | null;
}

const store = new AiWatchStore();
const listeners = new Set<() => void>();
let reading: { close: () => void; users: number } | null = null;
// One list and one status, replaced when they change: a React store that hands out a new array on every read re-renders forever.
let snapshot: AiWatchItem[] = [];
let status: AiWatchStatus = { loaded: false, error: null, at: null };
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
export function aiWatchItems(): AiWatchItem[] {
  return snapshot;
}

export function aiWatchStatus(): AiWatchStatus {
  return status;
}

export function subscribeAiWatch(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Reads AI Watch from The Record until the returned function is called. However many ask, one read is
 * open, and it closes when the last is done.
 */
export function startAiWatch(options: { pool?: Pick<SimplePool, 'subscribeMany'>; relays?: string[] } = {}): () => void {
  if (reading) {
    reading.users += 1;
  } else {
    status = { loaded: false, error: null, at: null };
    const pool = options.pool ?? createRelayPool();
    // Every page: The Record returns 500 events per filter (readComplete.ts).
    const filters: Filter[] = [{ kinds: [NOTE_KIND], authors: [...AI_WATCH_PUBLISHERS], '#t': ['terminator_watch'] }];
    const read = readComplete(pool, options.relays ?? aiWatchRelays(), filters, {
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
