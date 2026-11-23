/**
 * Raver Watch: Mecha Jono's safety notes for people at dance events, read from
 * The Record (globe record, section 19; decisions RW1 to RW8; their v1.1 of
 * 2026-10-01, RAVER_WATCH_V1_1.md beside the record).
 *
 * Each note is kind 30023, tagged `raver_watch` and one sub-layer, with the
 * source it came from and when it applies. From v1.1 a scene event is a NIP-52
 * calendar event (kind 31923) with its own start, end and time zone, and a
 * cancellation is a status on it, kept and shown, not a withdrawal. Only named publishers are read
 * (RW2). A note that fails their schema is refused, as is one that also claims
 * to be Starcom intel, or whose content starts as data. The newest note at an
 * address stands, and a withdrawal (`t: retracted`) ends its item. Places are
 * kept no finer than 0.1°, as everything Starcom draws and shares is (RW3),
 * with one exception from v1.2: a scene event at a public venue, which names
 * the venue and its address, is kept to 0.001°, about the 150 m they state
 * (RW12, the owner's decision of 2026-10-02). From v1.2 a HeatRisk note
 * carries the National Weather Service's level, 0 to 4.
 * When an item applies is kept as stated; fading and hiding it by
 * `valid_until` is for what draws it (RW6). A scene event and scene news say
 * who is playing, and scene news which festival, as their `artist` and
 * `festival` tags name them, and nothing more (raver-nights.md, RN13).
 */
import type { Event, Filter, SimplePool } from 'nostr-tools';
import { RAVER_WATCH_PUBLISHERS } from '../../config/publicInfrastructure';
import { noteIdentity, ROTATING_PUBLISHERS, type RotatingPublisher } from '../nostr/publisherKeys';
import { raverWatchRelays } from '../nostr/publishTargets';
import { createRelayPool } from '../nostr/relayPool';
import { readComplete } from '../nostr/readComplete';
import { burst } from '../nostr/burst';
import { parseGeoTag } from '../geoint/parser';
import { decodeGeohash } from '../intel/observations/adapters/geohash';
import { sourceLinksFromTags } from '../intel/sourceLinks';
import { tagsNamePeople, rememberNamedNote } from '../intel/namesPeople';

export type RaverWatchLayer =
  | 'DrugCheckAlerts' | 'SceneIncidents' | 'SceneEvents' | 'HeatRisk' | 'RaverMissions' | 'HarmReductionSites';
export type RaverWatchLevel = 'red' | 'amber' | 'info';

/** The layer each sub-layer tag is read onto. */
const LAYER_OF: Record<string, RaverWatchLayer> = {
  drug_check_alert: 'DrugCheckAlerts',
  scene_incident: 'SceneIncidents',
  scene_event: 'SceneEvents',
  // Their v1.5's scene news (RW17): read onto Scene events as news, listed and never drawn.
  scene_news: 'SceneEvents',
  heat_risk: 'HeatRisk',
  // No publisher sends raver_mission or harm_reduction_site: Raver missions are Hero Watch's field missions, and
  // no site is posted (raver-nights.md, RN12).
};
/** Their levels; a note with none is information, as levelOf reads it (RN12). */
const LEVELS: readonly string[] = ['red', 'amber'];
/** The kinds they publish: long-form notes, and from v1.1 calendar events for scene events. */
const KINDS = [30023, 31923] as const;
/**
 * How precise a point is: a town, or a state's main city standing for the
 * state (v1.1), or a public venue, for a scene event only (v1.2).
 */
export type RaverWatchPrecision = 'city' | 'state' | 'venue';
const PRECISIONS: readonly string[] = ['city', 'state'];
/** The NWS HeatRisk, 0 (Green) to 4 (Magenta), as `heat_risk` gives it (v1.2). */
const HEAT_RISK = /^[0-4]$/;
/** Areas wider than a country that a note can apply to, with no jurisdiction and no point (v1.1). */
export type RaverWatchRegion = 'europe';
const REGIONS: readonly string[] = ['europe'];
/** A country (`de`), or a subdivision as ISO 3166-2 writes it, lower case (`us-tx`, `au-nsw`, `fr-75`). */
const JURISDICTION = /^[a-z]{2}(-[a-z0-9]{1,3})?$/;
const MUSICBRAINZ_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WIKIDATA_QID = /^Q[1-9][0-9]*$/;
const COUNTRY = /^[a-z]{2}$/i;
/** The longest name kept from an `artist` or `festival` tag. */
const NAME_MAX = 120;

/** A performer a scene event or scene news names (RN13). */
export interface RaverWatchArtist {
  name: string;
  /** Their MusicBrainz id, when the name is not ambiguous. */
  musicbrainz?: string;
}

/** A festival scene news names (RN13). */
export interface RaverWatchFestival {
  name: string;
  wikidata?: string;
  /** Its country, lower case (`be`). */
  country?: string;
}

/** Each name a tag gives, once, in order, with what else it gives that is what it says it is. */
function namedIn<T extends { name: string }>(tags: string[][], tagName: string, read: (name: string, rest: string[]) => T): T[] {
  const seen = new Set<string>();
  return tags.flatMap((t) => {
    const name = t[0] === tagName ? t[1].trim() : '';
    if (!name || name.length > NAME_MAX || seen.has(name)) return [];
    seen.add(name);
    return [read(name, t.slice(2))];
  });
}

export interface RaverWatchItem {
  /** `<kind>:<pubkey>:<d>`, as listReports() names it: 30023, or 31923 for a scene event. */
  id: string;
  pubkey: string;
  d: string;
  /** The signed event this version is. */
  eventId: string;
  /** When this version was signed, in unix seconds. */
  createdAt: number;
  layer: RaverWatchLayer;
  title: string;
  summary?: string;
  source: string;
  /** The item's page at its source (the `r` tag), when it is a web page. */
  url?: string;
  /** Every source it names, its `r` tags in order, the original first (D-CT, CT2). */
  sources?: string[];
  level?: RaverWatchLevel;
  category?: string;
  /** When it applies, in unix seconds, as the note states it. */
  validFrom: number;
  validUntil: number;
  /** The region it applies to: a country's code (`de`), or a subdivision's (`us-tx`, `au-nsw`). */
  jurisdiction?: string;
  /** An area wider than a country, given instead of a jurisdiction or a point. */
  region?: RaverWatchRegion;
  /** The place it applies to, rounded to 0.1°; to 0.001° for a scene event at a public venue. */
  point?: { lat: number; lon: number };
  /** How precise the point is: a town, a state's main city standing for the whole state, or a public venue. */
  precision?: RaverWatchPrecision;
  /** A scene event's venue, named only when it is a public one (v1.2). */
  venue?: string;
  /** The licence of what the note draws on, to credit: OpenStreetMap's, for a venue. */
  license?: string;
  /** A HeatRisk note's level: the National Weather Service's 0 to 4. */
  heatRisk?: number;
  /**
   * A scene event listed with no start time (3.25's `time_precision: "day"`): its times are its day's, in its zone,
   * and it is said as all day, never as a clock time.
   */
  allDay?: true;
  /** A scene event's own times, in unix seconds, and the zone they were listed in. */
  start?: number;
  end?: number;
  startTzid?: string;
  /** A scene event's town and state; from v1.2 its venue and address first, when the venue is public. */
  location?: string;
  /** A scene event's genres, up to three. */
  genres?: string[];
  /** A scene event that will not happen: shown struck through until its end, unlike a withdrawal. */
  cancelled?: boolean;
  /** Scene news (v1.5: festivals, tours, line-ups, releases): listed with Scene events, never drawn (RW17). */
  sceneNews?: boolean;
  /**
   * Who is playing, or who scene news names: their `artist` tags, for performers MusicBrainz knows as electronic
   * artists. "Line-ups are promotion, and the `artist` tag is the whole of what may be shown" (RN13).
   */
  lineup?: RaverWatchArtist[];
  /** The festivals scene news names: their `festival` tags (RN13). */
  festivals?: RaverWatchFestival[];
  content: string;
  /**
   * It names a person (an artist, a promoter) as its outlet names them, by its own `t=names_people` (D-NP): shown on
   * the layer like any other (NP3), never on a card or clip (NP2).
   */
  namesPeople?: boolean;
}

export interface RaverWatchNote extends RaverWatchItem {
  /** A withdrawal: the item it names has ended. */
  retracted: boolean;
  reason?: string;
}

const toTenth = (degrees: number) => Math.round(degrees * 10) / 10;
const toThousandth = (degrees: number) => Math.round(degrees * 1000) / 1000;

/** One note, read and checked, or why it was refused. */
export function readRaverWatchNote(
  event: Event,
  publishers: readonly string[] = RAVER_WATCH_PUBLISHERS,
): RaverWatchNote | { refused: string } {
  if (!(KINDS as readonly number[]).includes(event.kind)) return { refused: 'not a long-form note (30023) or a calendar event (31923)' };
  if (!publishers.includes(event.pubkey)) return { refused: 'not from a named Raver Watch publisher' };
  if (typeof event.content !== 'string' || /^\s*[[{]/.test(event.content)) return { refused: 'its content starts as data, not words' };
  const tags = event.tags;
  if (!Array.isArray(tags) || !tags.every((t) => Array.isArray(t) && t.length >= 2 && t.every((v) => typeof v === 'string'))) {
    return { refused: 'a tag is not a list of at least two strings' };
  }
  const has = (name: string, value: string) => tags.some((t) => t[0] === name && t[1] === value);
  const first = (name: string) => tags.find((t) => t[0] === name)?.[1];
  if (!has('t', 'raver_watch')) return { refused: 'not tagged raver_watch' };
  if (has('t', 'starcom_intel')) return { refused: 'also tagged starcom_intel' };
  const d = tags.find((t) => t[0] === 'd' && t[1].startsWith('raver-'))?.[1];
  if (!d) return { refused: 'its address does not start raver-' };
  const layerTag = tags.find((t) => t[0] === 't' && t[1] in LAYER_OF)?.[1];
  if (!layerTag) return { refused: 'it names no Raver Watch layer' };
  const title = first('title');
  const source = first('source');
  if (title === undefined) return { refused: 'it has no title' };
  if (source === undefined) return { refused: 'it names no source' };
  const time = (name: string) => tags.find((t) => t[0] === name && /^[0-9]+$/.test(t[1]))?.[1];
  const validFrom = time('valid_from');
  const validUntil = time('valid_until');
  if (validFrom === undefined || validUntil === undefined) return { refused: 'it does not say, in unix seconds, when it applies' };
  // A calendar event is a scene event, with its own times and town (v1.1).
  const calendar = event.kind === 31923;
  const start = time('start');
  const end = time('end');
  const startTzid = first('start_tzid');
  const location = first('location');
  if (calendar) {
    if (layerTag !== 'scene_event') return { refused: 'a calendar event that is not a scene event' };
    if (start === undefined || end === undefined) return { refused: 'a scene event that does not say, in unix seconds, when it starts and ends' };
    if (!startTzid || !location) return { refused: 'a scene event that names no time zone or town' };
  }

  const note: RaverWatchNote = {
    id: `${event.kind}:${event.pubkey}:${d}`,
    pubkey: event.pubkey,
    d,
    eventId: event.id,
    createdAt: event.created_at,
    layer: LAYER_OF[layerTag],
    title,
    source,
    validFrom: Number(validFrom),
    validUntil: Number(validUntil),
    content: event.content,
    retracted: has('t', 'retracted'),
  };
  const summary = first('summary');
  if (summary !== undefined) note.summary = summary;
  if (tagsNamePeople(tags)) {
    note.namesPeople = true;
    // Its words, for the missions that must not carry them (D-NP, NP5).
    rememberNamedNote(note.id, note.title, [summary, event.content].filter(Boolean).join('\n'));
  }
  const url = first('r');
  if (url && /^https?:\/\//i.test(url)) note.url = url;
  const sources = sourceLinksFromTags(tags);
  if (sources.length) note.sources = sources;
  const level = first('level');
  if (level && LEVELS.includes(level)) note.level = level as RaverWatchLevel;
  const category = first('category');
  if (category) note.category = category;
  const jurisdiction = first('jurisdiction');
  if (jurisdiction && JURISDICTION.test(jurisdiction)) note.jurisdiction = jurisdiction;
  const region = first('region');
  if (region && REGIONS.includes(region)) note.region = region as RaverWatchRegion;
  // The point as `geo` gives it, or else the centre of the geohash cell they send beside it.
  const geo = first('geo');
  const hash = first('g');
  const point = (geo ? parseGeoTag(geo) : null) ?? (hash ? decodeGeohash(hash) : null);
  const precision = first('geo_precision');
  // A public venue is placed at the venue; it is public only on a scene event that names it (RW12).
  const venue = first('venue');
  const atVenue = calendar && precision === 'venue' && !!venue;
  if (point && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180) {
    note.point = atVenue ? { lat: toThousandth(point.lat), lon: toThousandth(point.lon) } : { lat: toTenth(point.lat), lon: toTenth(point.lon) };
    if (atVenue) {
      note.precision = 'venue';
      note.venue = venue;
    } else if (precision && PRECISIONS.includes(precision)) {
      note.precision = precision as RaverWatchPrecision;
    }
  }
  const license = first('license');
  if (license) note.license = license;
  const heatRisk = first('heat_risk');
  if (note.layer === 'HeatRisk' && heatRisk && HEAT_RISK.test(heatRisk)) note.heatRisk = Number(heatRisk);
  if (calendar) {
    note.start = Number(start);
    note.end = Number(end);
    note.startTzid = startTzid;
    note.location = location;
    note.genres = tags.filter((t) => t[0] === 't' && t[1].startsWith('genre:')).map((t) => t[1].slice('genre:'.length)).slice(0, 3);
    note.cancelled = has('status', 'cancelled');
    if (first('time_precision') === 'day') note.allDay = true;
  }
  if (layerTag === 'scene_news') note.sceneNews = true;
  // Only a scene event or scene news names who is playing, or a festival (RN13).
  if (note.layer === 'SceneEvents') {
    const lineup = namedIn(tags, 'artist', (name, [id]) => (id && MUSICBRAINZ_ID.test(id) ? { name, musicbrainz: id.toLowerCase() } : { name }));
    if (lineup.length) note.lineup = lineup;
    const festivals = namedIn(tags, 'festival', (name, [qid, country]) => ({
      name,
      ...(qid && WIKIDATA_QID.test(qid) ? { wikidata: qid } : {}),
      ...(country && COUNTRY.test(country) ? { country: country.toLowerCase() } : {}),
    }));
    if (festivals.length) note.festivals = festivals;
  }
  const reason = first('reason');
  if (note.retracted && reason) note.reason = reason;
  return note;
}

/** Their tags that are not a kind: the mode's own, and flags any kind can carry. */
const NOT_A_KIND = new Set(['raver_watch', 'critical', 'retracted', 'duplicate', 'names_people']);

/**
 * The kind of a Raver Watch note no layer here reads, or null (decision IX1).
 * Their v1.5 added scene news, and Starcom refused all 16 notes without a word
 * until 3 October. The kind is the first plain `t` tag that is not the mode's
 * own or a flag; a namespaced one (`category:`, `artist:`) is not a kind.
 */
export function unreadKindOf(event: Event): string | null {
  const values = event.tags.filter((t) => t[0] === 't' && typeof t[1] === 'string').map((t) => t[1]);
  if (!values.includes('raver_watch') || values.some((v) => v in LAYER_OF)) return null;
  return values.find((v) => !NOT_A_KIND.has(v) && !v.includes(':')) ?? null;
}

/** A kind of note no layer here reads, and how many addresses carry it. */
export interface UnreadKind { kind: string; count: number }

/** The newest note at each address, and so what stands. */
export class RaverWatchStore {
  private readonly newest = new Map<string, RaverWatchNote>();
  /** The addresses of notes of a kind no layer reads, by kind (IX1). */
  private readonly unreadKinds = new Map<string, Set<string>>();

  constructor(
    private readonly publishers: readonly string[] = RAVER_WATCH_PUBLISHERS,
    /** Publishers whose keys rotate: a note under any of a publisher's keys is one note (D-HW). */
    private readonly rotating: readonly RotatingPublisher[] = ROTATING_PUBLISHERS,
  ) {}

  /** Takes a note in: kept when it is the newest at its address. */
  accept(event: Event): { kept: true } | { kept: false; why: string } {
    const note = readRaverWatchNote(event, this.publishers);
    if ('refused' in note) {
      const kind = this.publishers.includes(event.pubkey) ? unreadKindOf(event) : null;
      if (kind) {
        const d = event.tags.find((t) => t[0] === 'd')?.[1] ?? event.id;
        const addresses = this.unreadKinds.get(kind) ?? new Set<string>();
        addresses.add(`${event.kind}:${event.pubkey}:${d}`);
        this.unreadKinds.set(kind, addresses);
      }
      return { kept: false, why: note.refused };
    }
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

  /** Kinds of note no layer here reads, with how many addresses carry each, most first (IX1). */
  unread(): UnreadKind[] {
    return [...this.unreadKinds]
      .map(([kind, addresses]) => ({ kind, count: addresses.size }))
      .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
  }

  /** Every item that stands: the newest note at each address, unless that note withdrew it. */
  items(): RaverWatchItem[] {
    return [...this.newest.values()]
      .filter((note) => !note.retracted)
      .map(({ retracted: _retracted, reason: _reason, ...item }) => item)
      // Newest first by when it happened or was issued, as they ask (v1.1, question 12).
      .sort((a, b) => b.validFrom - a.validFrom);
  }
}

// ── The Record, read while anything needs it ─────────────────────────────────

/** Whether The Record has sent what it holds, or why it could not be read. */
export interface RaverWatchStatus {
  loaded: boolean;
  error: string | null;
  /** When The Record said it had sent what it holds, in ms; null until it has. */
  at: number | null;
}

const store = new RaverWatchStore();
const listeners = new Set<() => void>();
let reading: { close: () => void; users: number } | null = null;
// Kept as one list and one status, replaced when they change: a React store
// that hands out a new array on every read re-renders forever.
let snapshot: RaverWatchItem[] = [];
let unreadSnapshot: UnreadKind[] = [];
let status: RaverWatchStatus = { loaded: false, error: null, at: null };

const notify = () => listeners.forEach((listener) => listener());

/**
 * A burst of notes is gathered before what stands is rebuilt and told (burst.ts): The Record sends a thousand in a
 * few seconds, and rebuilding and re-rendering for each one sorted the whole list a thousand times and set React
 * past its limit of nested updates.
 */
let changed = false;

/** Rebuilds what stands and tells listeners, when anything changed since last time. */
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
export function raverWatchItems(): RaverWatchItem[] {
  return snapshot;
}

/** Whether The Record has answered the read open now. */
export function raverWatchStatus(): RaverWatchStatus {
  return status;
}

/** Kinds of note read and not shown, since no layer here reads them (IX1). The same list until it changes. */
export function raverWatchUnread(): UnreadKind[] {
  return unreadSnapshot;
}

/** Told whenever what stands, or the status, changes. Returns the function that stops it. */
export function subscribeRaverWatch(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Reads Raver Watch from The Record until the returned function is called:
 * named publishers' `raver_watch` notes only. However many ask, one read is
 * open, and it closes when the last is done.
 */
export function startRaverWatch(
  options: { pool?: Pick<SimplePool, 'subscribeMany'>; relays?: string[] } = {},
): () => void {
  if (reading) {
    reading.users += 1;
  } else {
    status = { loaded: false, error: null, at: null };
    const pool = options.pool ?? createRelayPool();
    // A kind at a time, and every page of each: The Record returns 500 events per filter (readComplete.ts).
    const filters: Filter[] = KINDS.map((kind) => ({ kinds: [kind], authors: [...RAVER_WATCH_PUBLISHERS], '#t': ['raver_watch'] }));
    const read = readComplete(pool, options.relays ?? raverWatchRelays(), filters, {
      onevent: (event: Event) => {
        // A note kept changes what stands; one of a kind no layer reads changes what the key says, though
        // nothing is drawn. Either is told once the burst it came in has been gathered.
        if (store.accept(event).kept) changed = true;
        told.soon();
      },
      oncomplete: () => {
        status = { loaded: true, error: null, at: Date.now() };
        // What has come is told with the status, so "loaded" never stands beside a list still gathering.
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
