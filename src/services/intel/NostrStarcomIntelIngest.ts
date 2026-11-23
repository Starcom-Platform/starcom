import type { Event as NostrEvent, Filter, SimplePool } from 'nostr-tools';
import { PROTEST_TAG, SURGE_TAG, UNREST_NOTE_TAG } from '../civilUnrest/civilUnrest';
import { precisionForEvent } from '../geoint/statedPrecision';
import type { IntelReportUI } from '../../types/intel/IntelReportUI';
import { GEOINT_DEFAULT_CONFIG } from '../geoint/config';
import { readRelays, intelSearchRelays } from '../nostr/publishTargets';
import { parseEvent } from '../geoint/parser';
import { representativePoint } from '../geoint/representativePoint';
import { boundedOutline } from '../geoint/boundedOutline';
import type { ParsedLine, ParsedPoint, ParsedPolygon } from '../geoint/types';
import { createLogger } from '@utils/logger';
import { normalizeTag } from '../../utils/normalizeTag';
import { GEOJSON_DELIMITER } from '../geoint/parser';
import { SCRATCH_MARKER_TAG } from './scratchMarker';
import { INGEST_HOLD_FLOOR } from './reportCap';
import { citationsFromTags, namedAddresses } from './citations';
import { sourceLinksFromTags } from './sourceLinks';
import { tagsNamePeople, rememberNamedNote } from './namesPeople';
import { noteIdentity } from '../nostr/publisherKeys';
import { firstPublishedAt } from '../nostr/firstPublished';
import { isOwnPublishedReport } from './publishedReports';
const log = createLogger({ prefix: 'NostrStarcomIntelIngest' });

/** How many a page back asks for: The Record sends 500 a filter, whatever more is asked. */
const READ_BACK_LIMIT = 500;
/** As long as a page may take: nostr-tools otherwise ends a read at 4.4 s (readComplete.ts). */
const READ_BACK_WAIT_MS = 30_000;
/** A bound on pages back from one relay, so an unlimited read cannot run without end. */
const READ_BACK_MAX_PAGES = 200;

export interface NostrStarcomIntelIngestMetrics {
  seen: number;
  /** Reports emitted. No longer 1:1 with events — see acceptedEvents. */
  accepted: number;
  /** Events that produced at least one report. */
  acceptedEvents: number;
  /**
   * Features whose geometry was reduced to a single representative vertex —
   * a line kept its first point, a polygon its first ring's first point.
   *
   * Counted because the reduction is real and lossy. It used to happen with no
   * metric at all, which made a reduced record indistinguishable from one that
   * genuinely described a point.
   */
  reducedGeometry: number;
  /**
   * Features the PARSER discarded before we saw them, because the event
   * exceeded maxFeaturesPerCollection. Distinct from geometry reduction: these
   * claims never reached this service at all.
   */
  droppedOverFeatureCap: number;
  /**
   * Accepted reports that name no place at all — neither a coordinate nor a
   * jurisdiction. A subset of `accepted`, not a separate total.
   *
   * These used to be refused and counted in `droppedNoGeo`, so that figure read
   * as "intel this node turned away". It no longer is: `droppedNoGeo` now means
   * an event that CLAIMED a position this node could not parse, which is a
   * defect somewhere, while this means a publisher who named nowhere, which is
   * ordinary. Keeping them in one number would have hidden the second inside
   * the first — and the second is most of what a desk-work publisher sends.
   */
  acceptedPlaceless: number;
  /**
   * Addressable events that arrived after a newer version of the same address
   * had already been accepted — relays answer independently, so an opening
   * can land after its own ending. Counted rather than dropped silently: a
   * rising number here means a peer is republishing, which is the ordinary
   * case, not a fault.
   */
  droppedSuperseded: number;
  /**
   * Notes withdrawn by their publisher: a newer version at the same address tagged `retracted` (decision D-RP,
   * RP7). Each takes its report off every reader here; nothing is drawn or listed for the withdrawal itself.
   */
  withdrawn: number;
  /**
   * Events carrying this project's own scratch-verification mark.
   *
   * Three such events are on nostr.mom and nos.lol permanently — published by
   * cross-node verification runs on 2026-08-06, carrying a placeholder IPFS CID
   * that points at nothing, placed at Washington DC because that is what the
   * scratch script hardcoded. They were three of the seven pins a first-time
   * visitor saw.
   *
   * They cannot be unpublished. Deletion and addressable replacement both need
   * a signature from the publishing key, and the three events carry three
   * DIFFERENT pubkeys — one minted per run by uncommitted scratch scripts that
   * no longer exist. So this counter is not a transitional measure waiting on a
   * cleanup; it is the permanent fix, on the only side of this we still
   * control.
   */
  droppedScratch: number;
  /** Notes that belong to a mode or layer of their own: AI Watch's (D-AW, AW1), Civil Unrest's (D-CU, CU3). Not Intel Reports. */
  droppedOwnMode: number;
  droppedNoGeo: number;
  droppedInvalid: number;
  deduped: number;
  relaysConnected: number;
}

/** Mecha Jono's Terminator Watch: AI Watch draws these (D-AW, AW1). */
const AI_WATCH_TAG = 'terminator_watch';
/** Their protest desk's days of unrest and protest surges: Civil Unrest draws these (D-CU, CU3). */
const isCivilUnrest = (tags: readonly string[]): boolean =>
  tags.includes(UNREST_NOTE_TAG) || (tags.includes(SURGE_TAG) && tags.includes(PROTEST_TAG));

/** How long a live read waits for its relay to connect: as long as a complete read waits (readComplete's READ_WAIT_MS). */
const LIVE_WAIT_MS = 30_000;
/** When a live read whose connection was lost is asked again; the last wait repeats. */
const RESUBSCRIBE_AFTER_MS = [5_000, 15_000, 45_000, 120_000, 300_000] as const;
/** nostr-tools' reason when a subscription is closed by the app's own call. */
const CLOSED_BY_CALLER = 'closed by caller';
/** nostr-tools' reasons for a connection lost, not a filter refused: "connection timed out", "relay connection closed"... */
const connectionLost = (reason: string): boolean => /^(relay )?connection\b|^connection failure/i.test(reason) && reason !== 'relay connection closed by us';

export interface NostrRelayState {
  url: string;
  connected: boolean;
  lastNotice?: string;
  /** When its state last changed: a connect, a drop, a close. */
  lastSeen?: number;
  /** When it last answered: an event, or the end of what it holds (BD11). Connecting is not an answer. */
  lastAnsweredAt?: number;
  /** When it last let a light check go unanswered (BD11). */
  lastCheckFailedAt?: number;
  /**
   * Whether it is still sending what it holds (plan H3): from its first reads' opening until each has ended, with
   * the end of what it holds or the read's wait running out, and while it pages back. A read asked again after a
   * dropped connection is not counted: a page waits on its first. Absent before any read has begun.
   */
  storedRead?: 'reading' | 'ended';
}

/** How often the light check asks each connected relay, and how long it waits (BD11). */
const RELAY_CHECK_EVERY_MS = 60_000;
const RELAY_CHECK_TIMEOUT_MS = 10_000;

type RelayProbeResult = {
  relay: string;
  /** 'pending' is a probe under way; 'not-run', a relay nobody probed. */
  status: 'not-run' | 'pending' | 'open' | 'error' | 'timeout' | 'closed' | 'unsupported';
  /** When the probe reached this status. None for a probe that never ran. */
  ts?: number;
  detail?: string;
};

export interface NostrStarcomIntelIngestConfig {
  relays: string[];
  searchRelays: string[];
  hashtags: string[];
  sinceWindowMs: number;
  maxReports: number;
  enableRelaySearch: boolean;
}

const defaultConfig = (): NostrStarcomIntelIngestConfig => ({
  // The Record first, then the public surface set (D-F 4.5). The public relays
  // are KEPT, not replaced: the step exists because four of five of them
  // connected and delivered zero reports in 104 seconds, so the globe cannot
  // rely on that set alone — not because it should stop asking.
  // VITE_NOSTR_INTEL_RELAYS adds to it, as .env.example has always said; this
  // intake used to replace the set with it instead (plan item 0.3).
  relays: readRelays('INTEL'),
  // Navcom's search surface, matched so hashtag visibility stays consistent
  // with it. The Record is not here: it answers tag subscriptions, and NIP-50
  // search is off by default anyway (see enableRelaySearch below).
  searchRelays: intelSearchRelays(),
  // Include a few common variants; many clients differ in underscore vs dash.
  hashtags: ['starcom_intel', 'starcom-intel', 'starcomintel'],
  // Generous default so existing posts show up without env tuning.
  sinceWindowMs: 365 * 24 * 60 * 60 * 1000,
  maxReports: 200,
  /**
   * NIP-50 content search, as a SECONDARY path for publishers that put
   * #starcom_intel in the body without the ["t", ...] tag.
   *
   * Off by default, because it was breaking the primary path. Most relays do
   * not implement NIP-50 and answer the search REQ with
   * `ERROR: bad req: unrecognised filter item: search` — and nostr-tools closes
   * the socket on that, taking the TAG subscription down with it. Measured
   * against live relays: nostr.mom and nos.lol both errored, nos.lol dropped to
   * connected: false, and the ingest saw zero events while a direct query with
   * the same tag filter returned five from each. The two relays carrying the
   * intel were exactly the two that reject search.
   *
   * Enable per-deployment with VITE_NOSTR_INTEL_ENABLE_SEARCH=true once the
   * configured search relays are known to implement NIP-50.
   */
  enableRelaySearch: false
});

function expandHashtagVariants(normalizedHashtags: string[]): string[] {
  // Some clients/relays store the 't' tag with a leading '#'.
  const expanded = normalizedHashtags.flatMap((t) => [t, `#${t}`]);
  return Array.from(new Set(expanded));
}

function parseCsvList(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeRelayUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^wss?:\/\//, '')
    .replace(/\/+$/, '');
}

function envConfig(): Partial<NostrStarcomIntelIngestConfig> {
  // `import.meta` exists under plain node too; `import.meta.env` is Vite's, and
  // only Vite defines it. Guarding the first alone threw a TypeError on the
  // second the moment anything outside a Vite build imported this module — and
  // the singleton is constructed at import time, so the whole file was
  // unimportable from a script. That is how the ingest became the one service
  // this project could not point a command-line probe at.
  if (typeof import.meta === 'undefined' || !import.meta.env) return {};
  // Named individually so Vite substitutes each one and never emits the whole
  // env object. The wholesale form shipped every VITE_ variable in the build
  // environment, credentials included.
  const env: Record<string, unknown> = {
    VITE_NOSTR_INTEL_HASHTAGS: import.meta.env.VITE_NOSTR_INTEL_HASHTAGS,
    VITE_NOSTR_INTEL_ENABLE_SEARCH: import.meta.env.VITE_NOSTR_INTEL_ENABLE_SEARCH,
    VITE_NOSTR_INTEL_SINCE_DAYS: import.meta.env.VITE_NOSTR_INTEL_SINCE_DAYS,
  };
  const hashtags = parseCsvList(env.VITE_NOSTR_INTEL_HASHTAGS);
  const enableRelaySearchRaw = env.VITE_NOSTR_INTEL_ENABLE_SEARCH;
  const enableRelaySearch = typeof enableRelaySearchRaw === 'string'
    ? enableRelaySearchRaw.toLowerCase() === 'true'
    : undefined;
  const sinceDaysRaw = env.VITE_NOSTR_INTEL_SINCE_DAYS;
  const sinceDays = typeof sinceDaysRaw === 'string' ? Number.parseFloat(sinceDaysRaw) : NaN;

  // Important: do not explicitly set keys to `undefined` here.
  // Spreading `{ hashtags: undefined }` over defaults will clobber defaults and can crash at runtime.
  const cfg: Partial<NostrStarcomIntelIngestConfig> = {};
  if (hashtags.length) cfg.hashtags = hashtags;
  if (typeof enableRelaySearch === 'boolean') cfg.enableRelaySearch = enableRelaySearch;
  if (Number.isFinite(sinceDays) && sinceDays > 0) {
    cfg.sinceWindowMs = Math.round(sinceDays * 24 * 60 * 60 * 1000);
  }
  return cfg;
}

/*
 * Nostr hashtag tags are usually lowercased and carry no '#'.
 *
 * Delegated to the shared normaliser rather than kept as its own copy: this
 * function and getIntelReportPriority's uppercase comparison were two
 * normalisers that disagreed, and every report from a relay classified as
 * `unset` because of it. See utils/normalizeTag.ts.
 */
function normalizeHashtag(tag: string): string {
  return normalizeTag(tag);
}

/**
 * How long a title may be before it is cut.
 *
 * Was 96, and that cut mid-word through every headline a peer wrote: measured
 * against their relay on 2026-09-23, 17 of 17 of their titles were longer,
 * running 101 to 244 characters. They are not truncated at source — they are
 * complete lead sentences, and the cap was destroying the part that carried the
 * finding. "35% of every revocation ever recorded there" lost "against 11%
 * nationally", which is the only thing that makes 35% mean anything.
 *
 * 280 covers every title observed with room to spare, and anything past it is
 * prose rather than a headline. Display decides what FITS; this decides only
 * what a title IS, and the two must not be the same decision — a CSS change
 * should never be able to alter what the classifier can match on.
 */
const MAX_TITLE_LENGTH = 280;

/**
 * Cut at a word boundary and say that it was cut.
 *
 * A reader who sees "…while carrying a Reciprocal excl" cannot tell a truncated
 * title from a garbled one. The ellipsis is the difference between a limit and
 * a defect.
 */
function clampTitle(text: string): string {
  if (text.length <= MAX_TITLE_LENGTH) return text;
  const window = text.slice(0, MAX_TITLE_LENGTH);
  const lastSpace = window.lastIndexOf(' ');
  // A single unbroken run longer than the cap has no boundary to find; cutting
  // it hard is still better than emitting it whole.
  const cut = lastSpace > MAX_TITLE_LENGTH * 0.6 ? window.slice(0, lastSpace) : window;
  return `${cut.replace(/[\s,;:.\u2013\u2014-]+$/, '')}\u2026`;
}

function deriveTitle(content: string): string {
  // A post that is a JSON object names itself. Its first line is the whole object,
  // so reading that line as a title put raw JSON on the globe (decision D-F, step 1).
  const trimmed = content.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const title = parsed && typeof parsed === 'object' ? (parsed as { title?: unknown }).title : undefined;
      if (typeof title === 'string' && title.trim()) return clampTitle(title.trim());
    } catch {
      // Not a JSON object after all; it is titled like any other post.
    }
  }
  /*
   * Drop the GeoJSON tail BEFORE taking the first line.
   *
   * The launch notices carry no newline, so "the first line" is the whole
   * content including `---GEOJSON---{...}`. The old 96-character cap hid that
   * by accident; raising the cap without this would have put raw JSON into the
   * title, which is the defect D-F step 1 removed from the globe.
   */
  const withoutGeo = content.split(GEOJSON_DELIMITER)[0] ?? content;
  const firstLine = withoutGeo.split(/\r?\n/)[0]?.trim() || '';
  const cleaned = firstLine.replace(/#[a-zA-Z0-9_]+/g, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length >= 8) return clampTitle(cleaned);
  const fallback = withoutGeo.replace(/\s+/g, ' ').trim();
  return fallback ? clampTitle(fallback) : 'Nostr Intel Report';
}

function collectHashtags(event: NostrEvent): string[] {
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const hashTags = tags
    .filter((t) => Array.isArray(t) && t[0] === 't' && typeof t[1] === 'string')
    .map((t) => normalizeHashtag(String(t[1])));

  const contentTags = (event.content || '').match(/#[a-zA-Z0-9_]+/g)?.map((m) => normalizeHashtag(m)) || [];

  return Array.from(new Set([...hashTags, ...contentTags]));
}

/**
 * The address of an addressable event, `<kind>:<pubkey>:<d>`, or null.
 *
 * NIP-01: kinds 30000–39999 are identified by (kind, pubkey, d), not by event
 * id, and a missing `d` tag is the empty string. Everything outside that range
 * is identified by its event id alone — a `d` tag on a kind 1 means nothing.
 *
 * The pubkey is part of the address, so nobody can replace another author's
 * note by choosing the same `d`.
 */
function addressOf(event: NostrEvent): string | null {
  if (event.kind < 30000 || event.kind >= 40000) return null;
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const d = tags.find((t) => Array.isArray(t) && t[0] === 'd')?.[1];
  return `${event.kind}:${event.pubkey}:${typeof d === 'string' ? d : ''}`;
}

/**
 * Whether `a` replaces `b` at the same address. NIP-01: the newer wins; on
 * equal timestamps the lower id is kept, so two relays that disagree about
 * arrival order still agree about the outcome.
 */
function supersedes(
  a: { createdAt: number; id: string },
  b: { createdAt: number; id: string },
): boolean {
  if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt;
  return a.id < b.id;
}

/**
 * Jurisdictions the publisher named, as they named them.
 *
 * Lowercased and trimmed, and otherwise untouched: a peer publishes `us` and
 * `us-tx`, another may use ISO codes or full names, and mapping those onto a
 * vocabulary of ours would reinterpret their claim rather than record it.
 * Deduplicated, because an event repeating a tag is not two claims.
 */
function statedJurisdictions(event: NostrEvent): string[] {
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const stated = tags
    .filter((t) => Array.isArray(t) && t[0] === 'jurisdiction' && typeof t[1] === 'string')
    .map((t) => String(t[1]).trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(stated));
}

/** What the event cites (D-MX: MX3, MX23), read from its tags; nothing when it cites nothing. */
function citedBy(event: NostrEvent): Pick<IntelReportUI, 'cites'> {
  const cites = citationsFromTags(event.tags);
  return cites.length ? { cites } : {};
}

/**
 * The notes and mission packages the event names, from its `a` tags (decision D-IW, IW1 and IW7):
 * a convergence note names the notes it draws on, a grant notice the package it announces. Read as
 * stated, each once; nothing when it names nothing.
 */
function referredBy(event: NostrEvent): Pick<IntelReportUI, 'refers'> {
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const refers = namedAddresses(tags.filter((t) => Array.isArray(t) && t[0] === 'a').map((t) => t[1]));
  return refers.length ? { refers } : {};
}

/** Where the event's information was published, from its `r` tags, the original first (D-CT, CT2); nothing when it names none. */
function sourcedBy(event: NostrEvent): Pick<IntelReportUI, 'sourceLinks'> {
  const sourceLinks = sourceLinksFromTags(event.tags);
  return sourceLinks.length ? { sourceLinks } : {};
}

/** Whether the publisher's own t tags withdraw the note (D-RP, RP7): never a #word in its text. */
function retractedByTags(tags: unknown): boolean {
  return Array.isArray(tags) && tags.some((t) => Array.isArray(t) && t[0] === 't'
    && typeof t[1] === 'string' && t[1].trim().toLowerCase() === 'retracted');
}

function hasGeoIntEncoding(event: NostrEvent): boolean {
  const content = event.content || '';
  if (content.includes(GEOJSON_DELIMITER)) return true;
  const trimmed = content.trim();
  // Raw JSON payloads (the parser will validate shape and bounds).
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return true;
  const tags = Array.isArray(event.tags) ? event.tags : [];
  // Common geo tags used by some clients.
  return tags.some((t) => Array.isArray(t) && (t[0] === 'geo' || t[0] === 'g'));
}

export class NostrStarcomIntelIngest {
  private config: NostrStarcomIntelIngestConfig;
  private pool: SimplePool | null = null;
  private subs: Array<{ unsub: () => void }> = [];
  /**
   * Keys asked for by name (plan item 9.14, decision G6): everything each
   * published, whenever the intake runs. The ordinary subscription reads the
   * newest year from everyone, so what a received package cites, or anything
   * else its signer published, may never have been asked for.
   */
  private followed = new Set<string>();
  private active = false;

  private debugInterval: ReturnType<typeof setInterval> | null = null;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private startupWatchdog: ReturnType<typeof setTimeout> | null = null;

  private listeners = new Set<(report: IntelReportUI) => void>();
  /** Told the reports a note's newer version, under another of its publisher's keys, has replaced. */
  private withdrawnListeners = new Set<(reportIds: string[]) => void>();
  /** The address each note is held at, by its identity across its publisher's keys (publisherKeys.ts). */
  private addressOfNote = new Map<string, string>();
  /** Told when whether it runs, what it has counted, or which relays are up, changes. */
  private changeListeners = new Set<() => void>();
  private relayStatus = new Map<string, NostrRelayState>();
  private relayProbe = new Map<string, RelayProbeResult>();

  private seenIds = new Set<string>();
  private reportIds: string[] = [];
  /** The oldest report time each relay has sent, where a page back starts (BA6). */
  private oldestAt = new Map<string, number>();
  /** Relays being read back now. */
  private readingBack = new Set<string>();
  /** Each relay's first reads still sending what it holds (H3), anew at each start. */
  private storedReads = new Map<string, number>();
  /** True while a report read back is taken in: older than all held, so held behind them. */
  private olderArrival = false;
  /**
   * The version currently held at each address, for NIP-01 replacement.
   * Recorded when a version is ACCEPTED, and consulted before anything else so
   * a stale arrival is dropped before it can displace the newer one.
   */
  private versions = new Map<string, { createdAt: number; id: string }>();
  /**
   * Which event a retained report came from. Report ids are no longer always
   * event ids — an addressable note's id is its address — so eviction can no
   * longer recover the event by splitting the report id.
   */
  private eventIdOf = new Map<string, string>();
  /**
   * The reports behind reportIds, newest first, for a listener that arrives after
   * they did (decision D-F, step 4.2).
   *
   * Boot starts the ingest and the globe subscribes when its effect runs — about
   * 0.6 s later on hardware, about eleven seconds under a software rasterizer.
   * Everything accepted in that gap used to be handed to an empty listener set and
   * then skipped forever, because seenIds suppresses a second delivery.
   */
  private retained = new Map<string, IntelReportUI>();

  private metrics: NostrStarcomIntelIngestMetrics = {
    seen: 0,
    accepted: 0,
    acceptedEvents: 0,
    reducedGeometry: 0,
    droppedOverFeatureCap: 0,
    acceptedPlaceless: 0,
    droppedSuperseded: 0,
    withdrawn: 0,
    droppedScratch: 0,
    droppedOwnMode: 0,
    droppedNoGeo: 0,
    droppedInvalid: 0,
    deduped: 0,
    relaysConnected: 0
  };
  private readonly verboseLogs = process.env.NODE_ENV === 'development';

  /**
   * A live read of one relay, kept alive. CHANGED 2026-10-12 (measured on the
   * live site): every close marked its relay down and nothing asked again, so a
   * relay slow to connect was lost for the session. Five of six relays' live
   * reads closed "connection timed out" 12 s after load, while their sockets
   * opened at 8-13 s, and the coverage strip read 0-1 of 6 relays a minute in.
   *
   * Now: the read waits LIVE_WAIT_MS for its connection, as a complete read does.
   * A lost connection marks the relay down and the read is asked again after
   * RESUBSCRIBE_AFTER_MS. A close the app made itself (stop, a new start)
   * changes nothing. A relay that answers but refuses this filter (a search it
   * does not support) is up: it is neither marked down nor asked again.
   */
  private subscribeWithPool(relay: string, filter: Filter, label: 'tag' | 'search' | 'discovery' | 'author' | 'withdrawals'): { unsub: () => void } {
    if (!this.pool) {
      throw new Error('Nostr pool is not initialized');
    }
    let current: { close: (reason?: string) => void } | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let attempt = 0;
    // The first read counts toward its relay's stored read (H3), in the tally of the start that opened it.
    const reads = this.storedReads;
    let firstRead: 'open' | 'ended' | null = null;
    const endFirstRead = () => {
      if (firstRead !== 'open') return;
      firstRead = 'ended';
      reads.set(relay, Math.max(0, (reads.get(relay) ?? 1) - 1));
      this.notifyChange();
    };

    const open = () => {
      if (!this.pool) return;
      if (firstRead === null) {
        firstRead = 'open';
        reads.set(relay, (reads.get(relay) ?? 0) + 1);
      }
      // Typed on purpose. This call went through an untyped cast, which kept the
      // nostr-tools 2.25 change from a list of filters to one filter out of sight.
      current = this.pool.subscribeMany([relay], filter, {
        maxWait: LIVE_WAIT_MS,
        onevent: (event: NostrEvent) => {
          if (label === 'tag') this.noteOldest(relay, event);
          this.handleEvent(event, relay);
        },
        oneose: () => {
          attempt = 0;
          endFirstRead();
          this.markAnswered(relay);
          // A cap raised before the live read answered reads back once it has (BA6).
          if (label === 'tag' && this.wantsMore()) void this.readBack(relay);
        },
        onclose: (reasons) => {
          // A read closed before its end has ended too: nothing more comes until it is asked again.
          endFirstRead();
          const text = JSON.stringify(reasons);
          if (this.verboseLogs) {
            log.info('[NostrStarcomIntelIngest] relay closed', { relay, sub: label, reason: text, ours: stopped });
          }
          if (stopped) return;
          const why = reasons.map((r) => String(r.reason ?? ''));
          const lost = why.some(connectionLost);
          if (!lost && !why.every((w) => w === CLOSED_BY_CALLER)) return;   // the relay answered: it refused this filter
          if (lost) this.markRelay(relay, false, text);
          if (!this.active) return;
          const wait = RESUBSCRIBE_AFTER_MS[Math.min(attempt, RESUBSCRIBE_AFTER_MS.length - 1)];
          attempt += 1;
          retry = setTimeout(() => {
            retry = null;
            if (!stopped && this.active) open();
          }, wait);
        }
      });
    };
    open();
    return {
      unsub: () => {
        stopped = true;
        if (retry) clearTimeout(retry);
        retry = null;
        current?.close();
      },
    };
  }

  constructor(config?: Partial<NostrStarcomIntelIngestConfig>) {
    const base = defaultConfig();
    this.config = { ...base, ...envConfig(), ...(config || {}) };
    this.config.hashtags = (this.config.hashtags || base.hashtags).map(normalizeHashtag);
    this.config.relays.forEach((url) => this.relayStatus.set(url, { url, connected: false }));
  }
  /**
   * Hold a report, and drop the oldest once the cap is passed.
   *
   * Extracted because it was inline in the coordinate path and nowhere else, so
   * the jurisdiction-only branch — added later, beside it — retained everything
   * it ever accepted. A session left open grew until the tab did. Every path
   * that accepts a report goes through here, which is the only way a second
   * one cannot repeat it.
   */
  private retain(report: IntelReportUI, eventId: string, kind: number): void {
    // The version read, on the record: a review is pinned to it (plan item 5.1).
    report.nostrEventId = eventId;
    report.nostrKind = kind;
    // A note naming a person: its words, for the missions that must not carry them (D-NP, NP5).
    if (report.namesPeople) rememberNamedNote(report.id, report.title, report.content);
    // Idempotent on the id. A replacement arrives under the same id as the
    // version it supersedes, and unshifting it again would hold one address
    // twice and let the list grow on every republish.
    if (this.retained.has(report.id)) {
      this.reportIds = this.reportIds.filter((rid) => rid !== report.id);
    }
    // A report read back is older than every one held (BA6): held behind them,
    // so a page that overshoots the cap drops its own oldest, never the newest.
    if (this.olderArrival) this.reportIds.push(report.id);
    else this.reportIds.unshift(report.id);
    this.retained.set(report.id, report);
    this.eventIdOf.set(report.id, eventId);
    if (this.reportIds.length <= this.config.maxReports) return;

    const evicted = this.reportIds.pop();
    if (!evicted) return;
    this.retained.delete(evicted);
    const evictedEventId = this.eventIdOf.get(evicted) ?? evicted.split('#')[0];
    this.eventIdOf.delete(evicted);
    // seenIds is keyed by EVENT id. Only forget the event once none of its
    // reports remain, or a multi-feature event would become re-importable while
    // some of its reports are still held — producing duplicates next sighting.
    const stillHeld = this.reportIds.some((rid) => this.eventIdOf.get(rid) === evictedEventId);
    if (!stillHeld) this.seenIds.delete(evictedEventId);
  }

  /**
   * Drop everything an older version of this address left behind.
   *
   * Its event id stays in seenIds on purpose: a relay re-sending the old
   * version should be recognised as already seen, not reconsidered — and it
   * would lose to the newer version anyway.
   */
  private forgetAddress(address: string): void {
    const belongs = (rid: string) => rid === address || rid.startsWith(`${address}#`);
    for (const rid of this.reportIds.filter(belongs)) {
      this.retained.delete(rid);
      this.eventIdOf.delete(rid);
    }
    this.reportIds = this.reportIds.filter((rid) => !belongs(rid));
  }

  /**
   * Withdrawn by its publisher: every reader drops the address's reports, including one saved in an earlier session
   * and not read in this one, which is kept under the address itself.
   */
  private retractAddress(address: string): void {
    const ids = new Set([address, ...this.reportIds.filter((rid) => rid === address || rid.startsWith(`${address}#`))]);
    this.forgetAddress(address);
    this.withdrawnListeners.forEach((listener) => {
      try {
        listener([...ids]);
      } catch {
        // ignore listener error, as live delivery does
      }
    });
  }

  /** Forgets an address's reports and tells every reader they are gone. */
  private withdrawAddress(address: string): void {
    const ids = this.reportIds.filter((rid) => rid === address || rid.startsWith(`${address}#`));
    this.forgetAddress(address);
    if (ids.length === 0) return;
    this.withdrawnListeners.forEach((listener) => {
      try {
        listener(ids);
      } catch {
        // ignore listener error, as live delivery does
      }
    });
  }

  getRelayStatus(): NostrRelayState[] {
    return Array.from(this.relayStatus.values(), (state) => {
      const open = this.storedReads.get(state.url);
      const back = this.readingBack.has(state.url);
      if (open === undefined && !back) return state;
      return { ...state, storedRead: (open ?? 0) > 0 || back ? 'reading' as const : 'ended' as const };
    });
  }

  getRelayProbeStatus(): RelayProbeResult[] {
    return this.config.relays.map((relay) => {
      // Not 'pending' stamped with the time of asking, which read as a probe
      // under way (plan item 8.3b): probes run in development builds only.
      return this.relayProbe.get(relay) || { relay, status: 'not-run' };
    });
  }


  /**
   * How far back the live query asks, in ms.
   *
   * Exposed so the globe's hydration of persisted reports can bound itself by
   * the SAME window rather than a second number that could drift from it
   * (decision D-F, step 4.4). Read-only on purpose: this is the query's own
   * span, not a setting for a consumer to change.
   */
  getSinceWindowMs(): number {
    return this.config.sinceWindowMs;
  }

  isActive(): boolean {
    return this.active;
  }

  getMetrics(): NostrStarcomIntelIngestMetrics {
    return { ...this.metrics };
  }

  /** Tell me about new reports. Live only — see replayAccepted for history. */
  subscribe(listener: (report: IntelReportUI) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Tell me which reports are gone: withdrawn by their publisher (D-RP, RP7), or replaced by a newer version of their
   * note signed under another of its publisher's keys (Mecha Jono's key change, 2 Nov 2026: its standing notes are
   * re-signed under the new key while both keys are read). A store or a picture that keeps reports by id drops these:
   * under its own key's address the carried copy has an id of its own, so it would otherwise stand beside its original.
   */
  onWithdrawn(listener: (reportIds: string[]) => void): () => void {
    this.withdrawnListeners.add(listener);
    return () => {
      this.withdrawnListeners.delete(listener);
    };
  }

  /**
   * Hand over the reports already accepted, oldest first.
   *
   * Boot starts the ingest and the globe subscribes when its effect runs — about
   * 0.6 s later on hardware, about eleven seconds under a software rasterizer.
   * Everything accepted in that gap went to an empty listener set and was then
   * skipped forever, because seenIds suppresses a second delivery and only forgets
   * an event when the cap evicts it. Measured: five runs of the first-visit probe
   * gave one partial success and four with no reports in 90 s.
   *
   * A SEPARATE call rather than part of subscribe(), because subscribe() means
   * "tell me about new reports" to three existing suites that receive one event
   * live and unsubscribe. Giving it a second meaning inflated their counts with
   * reports from earlier tests. Only the caller that wants history asks for it.
   */
  replayAccepted(listener: (report: IntelReportUI) => void): void {
    for (let i = this.reportIds.length - 1; i >= 0; i -= 1) {
      const report = this.retained.get(this.reportIds[i]);
      if (!report) continue;
      try {
        listener(report);
      } catch {
        // ignore listener error, exactly as live delivery does
      }
    }
  }

  /**
   * Told when what isActive, getMetrics or getRelayStatus report has changed, so a
   * readout follows the ingest rather than guessing on a timer. The header read it
   * once at load and then every minute while it looked idle, and said standby for
   * the first minute of every visit (decision D-F, step 1).
   */
  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private notifyChange(): void {
    this.changeListeners.forEach((listener) => {
      try {
        listener();
      } catch {
        // A readout that fails is its own problem, not the ingest's.
      }
    });
  }

  async start(): Promise<void> {
    if (this.active) return;
    if (typeof window === 'undefined') return;

    this.active = true;
    this.resetState();
    this.notifyChange();

    // Loaded when the layer starts, not with the globe: nostr-tools stays out of the first load.
    const { createRelayPool } = await import('../nostr/relayPool');
    this.pool = createRelayPool();
    this.checkInterval = setInterval(() => this.checkRelays(), RELAY_CHECK_EVERY_MS);

    const since = Math.floor((Date.now() - this.config.sinceWindowMs) / 1000);
    const limit = Math.max(10, Math.min(200, this.config.maxReports));

    // Periodic debug so production runs can confirm whether we're seeing/dropping/accepting events.
    // This is lightweight (no content) and only active while IntelReports mode is active.
    if (this.verboseLogs) {
      this.debugInterval = setInterval(() => {
        if (!this.active) return;
        log.info('[NostrStarcomIntelIngest] heartbeat', {
          metrics: this.getMetrics(),
          relays: this.getRelayStatus(),
          probes: this.getRelayProbeStatus()
        });
      }, 15000);
    }

    // Primary path: Nostr tag filter by hashtag tag: ["t", "starcom_intel"] => filter key "#t": ["starcom_intel"]
    type HashtagFilter = Filter & { ['#t']?: string[] };
    const filter: HashtagFilter = { kinds: [1, 30023], since, limit, ['#t']: expandHashtagVariants(this.config.hashtags) };

    /*
     * Withdrawals, asked for by their own tag (D-RP, RP7). A publisher may drop starcom_intel from the version that
     * withdraws a note: Mecha Jono's 53 withdrawn notes on The Record (read 20 Nov 2026) all do, so the tag filter
     * above never returned them, and a copy saved before the withdrawal stayed. Any author's are read: a withdrawal
     * takes away only what its own address held, and the address carries its author's key.
     */
    const withdrawalFilter: HashtagFilter = { kinds: [30023], since, limit, ['#t']: ['retracted'] };

    // Secondary path: some clients include #starcom_intel in content but omit the ["t", ...] tag.
    // On relays that support NIP-50-ish search, we can query by content. We still filter locally.
    type SearchFilter = Filter & { search?: string };
    const searchFilter: SearchFilter = {
      kinds: [1, 30023],
      since,
      limit,
      // Keep search string narrowly scoped.
      search: '#starcom_intel'
    };

    // Some relays tokenize search differently; include a variant without the '#'.
    const searchFilterNoHash: SearchFilter = {
      kinds: [1, 30023],
      since,
      limit,
      search: 'starcom_intel'
    };

    const searchRelaySet = new Set(this.config.searchRelays.map(normalizeRelayUrl));

    // Transport probes help distinguish "no events available" from "cannot reach relay".
    // Run in parallel and log outcomes explicitly.
    if (this.verboseLogs) {
      this.config.relays.forEach((relay) => {
        this.probeRelayTransport(relay).catch(() => {
          // ignore probe failures; results are recorded in map/logs.
        });
      });
    }

    // This start's reads, counted afresh: a read from before a stop ends in the tally it began in.
    this.storedReads = new Map();
    for (const relay of this.config.relays) {
      try {
        // Primary subscription (hashtag tag filter).
        if (this.verboseLogs) {
          log.info('[NostrStarcomIntelIngest] subscribing', {
            relay,
            mode: 'tag',
            filter
          });
        }
        this.subs.push(this.subscribeWithPool(relay, filter, 'tag'));
        this.subs.push(this.subscribeWithPool(relay, withdrawalFilter, 'withdrawals'));

        // Optional secondary subscription (relay search) to catch content-only hashtags.
        if (this.config.enableRelaySearch && searchRelaySet.has(normalizeRelayUrl(relay))) {
          if (this.verboseLogs) {
            log.info('[NostrStarcomIntelIngest] subscribing', {
              relay,
              mode: 'search',
              filter: searchFilter
            });
          }
          this.subs.push(this.subscribeWithPool(relay, searchFilter, 'search'));
          if (this.verboseLogs) {
            log.info('[NostrStarcomIntelIngest] subscribing', {
              relay,
              mode: 'search-no-hash',
              filter: searchFilterNoHash
            });
          }
          this.subs.push(this.subscribeWithPool(relay, searchFilterNoHash, 'search'));
        } else if (this.config.enableRelaySearch) {
          log.info('[NostrStarcomIntelIngest] search skipped for relay (not in searchRelays after normalization)', {
            relay,
            searchRelays: this.config.searchRelays
          });
        }
      } catch (error) {
        log.warn('[NostrStarcomIntelIngest] subscribe failed', {
          relay,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        });
        this.markRelay(relay, false);
      }
    }

    if (this.verboseLogs) {
      log.info('[NostrStarcomIntelIngest] started', {
        relays: this.config.relays.length,
        searchRelays: this.config.enableRelaySearch ? this.config.searchRelays.length : 0,
        hashtags: this.config.hashtags,
        since
      });
    }

    for (const pubkey of this.followed) this.subscribeAuthor(pubkey);

    // If nothing arrives shortly after startup, emit a focused diagnostic with likely root causes.
    this.startupWatchdog = setTimeout(() => {
      if (!this.active) return;
      if (this.metrics.seen > 0) return;
      if (this.verboseLogs) {
        log.warn('[NostrStarcomIntelIngest] no events observed after startup window', {
          metrics: this.getMetrics(),
          relays: this.getRelayStatus(),
          probes: this.getRelayProbeStatus(),
          likelyCauses: [
            'Browser/network blocks outbound wss:// connections (CSP, extension, corporate firewall)',
            'Relays reachable but not returning matching historical events for current filters',
            'Relay search unsupported and hashtag-tagged events unavailable in current window'
          ]
        });
      }

      // Fallback: start a bounded discovery subscription on top relays without hashtag filters,
      // then continue strict local filtering (#starcom_intel + GEOINT) in handleEvent.
      this.activateDiscoveryFallback();
    }, 12000);
  }

  /**
   * Ask every read relay for all this key published, with no time limit,
   * through the same intake: each event is checked and stored as any report.
   * Asked once per key; a key asked for before the intake starts is asked
   * for when it does.
   */
  followAuthor(pubkey: string): void {
    if (!/^[0-9a-f]{64}$/.test(pubkey) || this.followed.has(pubkey)) return;
    this.followed.add(pubkey);
    if (this.active && this.pool) this.subscribeAuthor(pubkey);
  }

  private subscribeAuthor(pubkey: string): void {
    type AuthorFilter = Filter & { ['#t']?: string[] };
    const filter: AuthorFilter = { kinds: [1, 30023], authors: [pubkey], limit: 500, ['#t']: expandHashtagVariants(this.config.hashtags) };
    for (const relay of this.config.relays) {
      try {
        this.subs.push(this.subscribeWithPool(relay, filter, 'author'));
      } catch (error) {
        log.warn('[NostrStarcomIntelIngest] author subscription failed', {
          relay,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        });
      }
    }
  }

  private activateDiscoveryFallback(): void {
    if (!this.active || !this.pool) return;

    const discoveryRelays = this.config.relays.slice(0, 2);
    const cappedWindowMs = Math.min(this.config.sinceWindowMs, 30 * 24 * 60 * 60 * 1000);
    const discoverySince = Math.floor((Date.now() - cappedWindowMs) / 1000);
    const discoveryLimit = Math.max(100, Math.min(800, this.config.maxReports * 4));

    type DiscoveryFilter = Filter;
    const discoveryFilter: DiscoveryFilter = {
      kinds: [1, 30023],
      since: discoverySince,
      limit: discoveryLimit
    };

    log.warn('[NostrStarcomIntelIngest] activating discovery fallback', {
      relays: discoveryRelays,
      discoveryFilter,
      note: 'Local strict filtering remains enabled (#starcom_intel + GEOINT).'
    });

    for (const relay of discoveryRelays) {
      try {
        this.subs.push(this.subscribeWithPool(relay, discoveryFilter, 'discovery'));
        log.info('[NostrStarcomIntelIngest] discovery fallback subscribed', { relay });
      } catch (error) {
        log.warn('[NostrStarcomIntelIngest] discovery fallback subscribe failed', {
          relay,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        });
      }
    }
  }

  /**
   * How many reports to hold (BA6): the report cap's, never under the 200 the
   * intake always held. Raised while reading, each relay is read back past the
   * oldest report it sent, a page at a time, until enough are held, a page
   * brings nothing new, or nothing is left; lowered, nothing more is read.
   */
  setHoldCap(hold: number): void {
    const wanted = Math.max(INGEST_HOLD_FLOOR, hold);
    const raised = wanted > this.config.maxReports;
    this.config.maxReports = wanted;
    if (raised && this.active) for (const relay of this.config.relays) void this.readBack(relay);
  }

  /** Whether the cap asks for more than the intake holds. */
  private wantsMore(): boolean {
    return this.config.maxReports > INGEST_HOLD_FLOOR && this.reportIds.length < this.config.maxReports;
  }

  private noteOldest(relay: string, event: NostrEvent): void {
    if (typeof event.created_at !== 'number' || !Number.isFinite(event.created_at)) return;
    const held = this.oldestAt.get(relay);
    if (held === undefined || event.created_at < held) this.oldestAt.set(relay, event.created_at);
  }

  /** Pages back from one relay, before the oldest it has sent, while the cap wants more. */
  private async readBack(relay: string): Promise<void> {
    if (this.readingBack.has(relay) || !this.pool) return;
    this.readingBack.add(relay);
    this.notifyChange();
    try {
      const since = Math.floor((Date.now() - this.config.sinceWindowMs) / 1000);
      type HashtagFilter = Filter & { ['#t']?: string[] };
      for (let page = 0; page < READ_BACK_MAX_PAGES && this.active && this.wantsMore(); page++) {
        const until = this.oldestAt.get(relay);
        if (until === undefined) return;
        const filter: HashtagFilter = { kinds: [1, 30023], since, until, limit: READ_BACK_LIMIT, ['#t']: expandHashtagVariants(this.config.hashtags) };
        if ((await this.readPage(relay, filter)) === 0) return;
      }
    } finally {
      this.readingBack.delete(relay);
      this.notifyChange();
    }
  }

  /** One page back, closed at its end: how many events it brought that were not seen before. */
  private readPage(relay: string, filter: Filter): Promise<number> {
    return new Promise((resolve) => {
      let fresh = 0;
      let done = false;
      let sub: { close: () => void } | null = null;
      const finish = () => {
        if (done) return;
        done = true;
        sub?.close();
        resolve(fresh);
      };
      sub = this.pool!.subscribeMany([relay], filter, {
        onevent: (event: NostrEvent) => {
          this.noteOldest(relay, event);
          const before = this.seenIds.size;
          this.olderArrival = true;
          try {
            this.handleEvent(event, relay);
          } finally {
            this.olderArrival = false;
          }
          if (this.seenIds.size > before) fresh += 1;
        },
        oneose: finish,
        onclose: () => finish(),
        maxWait: READ_BACK_WAIT_MS,
      });
      if (done) sub.close();
    });
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;

    if (this.debugInterval) {
      clearInterval(this.debugInterval);
      this.debugInterval = null;
    }
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.startupWatchdog) {
      clearTimeout(this.startupWatchdog);
      this.startupWatchdog = null;
    }

    try {
      for (const sub of this.subs) sub.unsub();
    } catch {
      // ignore
    }
    this.subs = [];

    try {
      this.pool?.close(this.config.relays);
    } catch {
      // ignore
    }

    this.pool = null;
    if (this.verboseLogs) {
      log.info('[NostrStarcomIntelIngest] stopped', this.getMetrics());
    }
    this.notifyChange();
  }

  private setRelayProbe(relay: string, status: RelayProbeResult['status'], detail?: string): void {
    const result: RelayProbeResult = { relay, status, detail, ts: Date.now() };
    this.relayProbe.set(relay, result);
  }

  private async probeRelayTransport(relay: string): Promise<void> {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
      this.setRelayProbe(relay, 'unsupported', 'WebSocket unavailable in runtime');
      return;
    }

    this.setRelayProbe(relay, 'pending');

    await new Promise<void>((resolve) => {
      let settled = false;
      let ws: WebSocket | null = null;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.setRelayProbe(relay, 'timeout', 'No WebSocket open within timeout window');
        log.warn('[NostrStarcomIntelIngest] relay probe timeout', { relay });
        try {
          ws?.close();
        } catch {
          // ignore
        }
        resolve();
      }, 8000);

      try {
        ws = new WebSocket(relay);
      } catch (error) {
        clearTimeout(timeoutId);
        settled = true;
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        this.setRelayProbe(relay, 'error', detail);
        log.warn('[NostrStarcomIntelIngest] relay probe constructor error', { relay, detail });
        resolve();
        return;
      }

      ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        this.setRelayProbe(relay, 'open');
        this.markRelay(relay, true);
        log.info('[NostrStarcomIntelIngest] relay probe open', { relay });
        try {
          ws?.close();
        } catch {
          // ignore
        }
        resolve();
      };

      ws.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        this.setRelayProbe(relay, 'error', 'WebSocket onerror');
        this.markRelay(relay, false, 'WebSocket probe error');
        log.warn('[NostrStarcomIntelIngest] relay probe error', { relay });
        try {
          ws?.close();
        } catch {
          // ignore
        }
        resolve();
      };

      ws.onclose = (event) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        const detail = `code=${event.code} reason=${event.reason || 'none'} wasClean=${event.wasClean}`;
        this.setRelayProbe(relay, 'closed', detail);
        this.markRelay(relay, false, detail);
        log.warn('[NostrStarcomIntelIngest] relay probe closed before open', { relay, detail });
        resolve();
      };
    });
  }

  private markRelay(relay: string, connected: boolean, notice?: string): void {
    const prev = this.relayStatus.get(relay) || { url: relay, connected: false };
    const next: NostrRelayState = {
      ...prev,
      connected,
      lastSeen: Date.now(),
      lastNotice: notice ?? prev.lastNotice
    };
    this.relayStatus.set(relay, next);
    const relaysConnected = Array.from(this.relayStatus.values()).filter((r) => r.connected).length;
    this.metrics.relaysConnected = relaysConnected;
    this.notifyChange();
  }

  /** An answer from a relay: an event, or the end of what it holds (BD11). */
  private markAnswered(relay: string): void {
    const prev = this.relayStatus.get(relay) || { url: relay, connected: false };
    if (!prev.connected) prev.lastSeen = Date.now();
    this.relayStatus.set(relay, { ...prev, connected: true, lastAnsweredAt: Date.now() });
    this.metrics.relaysConnected = Array.from(this.relayStatus.values()).filter((r) => r.connected).length;
    this.notifyChange();
  }

  /**
   * The light check (BD11). After its first answer a healthy relay goes quiet,
   * so its light would grey with nothing wrong. Once a minute each connected
   * relay is asked for nothing (limit 0): the end of its answer is the check. A
   * relay that does not answer in ten seconds is marked so. Nothing is asked
   * while the page is hidden, so the lights grey then, which is the truth.
   */
  private checkRelays(): void {
    if (!this.active || !this.pool) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    for (const state of Array.from(this.relayStatus.values())) {
      if (!state.connected) continue;
      const relay = state.url;
      let answered = false;
      const sub = this.pool.subscribeMany([relay], { kinds: [30023], limit: 0 }, {
        oneose: () => {
          answered = true;
          this.markAnswered(relay);
          sub.close();
        },
      });
      setTimeout(() => {
        if (!answered) {
          const prev = this.relayStatus.get(relay);
          if (prev) {
            this.relayStatus.set(relay, { ...prev, lastCheckFailedAt: Date.now() });
            this.notifyChange();
          }
        }
        try { sub.close(); } catch { /* already closed */ }
      }, RELAY_CHECK_TIMEOUT_MS);
    }
  }

  private resetState(): void {
    this.seenIds.clear();
    this.reportIds = [];
    this.oldestAt.clear();
    this.retained.clear();
    this.versions.clear();
    this.addressOfNote.clear();
    this.eventIdOf.clear();
    this.metrics = {
      seen: 0,
      accepted: 0,
    acceptedEvents: 0,
    reducedGeometry: 0,
    droppedOverFeatureCap: 0,
    acceptedPlaceless: 0,
    droppedSuperseded: 0,
    withdrawn: 0,
    droppedScratch: 0,
    droppedOwnMode: 0,
      droppedNoGeo: 0,
      droppedInvalid: 0,
      deduped: 0,
      relaysConnected: 0
    };
  }

  private handleEvent(event: NostrEvent, relay: string): void {
    if (!this.active) return;
    try {
      this.readEvent(event, relay);
    } finally {
      // Every path through readEvent counts something, including the ones that drop it.
      this.notifyChange();
    }
  }

  private readEvent(event: NostrEvent, relay: string): void {

    const safeEvent: NostrEvent = {
      ...event,
      tags: Array.isArray((event as unknown as { tags?: unknown }).tags)
        ? (event as unknown as { tags: NostrEvent['tags'] }).tags
        : []
    };

    this.metrics.seen += 1;

    if (!safeEvent || typeof safeEvent.id !== 'string') {
      this.metrics.droppedInvalid += 1;
      return;
    }

    /*
     * NIP-01 requires created_at, and the event's signature covers it: an event
     * without a readable one is not what it claims to be. The report time below
     * used to fall back to Date.now(), which placed such an event as brand new
     * (D-F step 15). It is malformed, and counted as such.
     */
    if (typeof safeEvent.created_at !== 'number' || !Number.isFinite(safeEvent.created_at)) {
      this.metrics.droppedInvalid += 1;
      return;
    }

    if (this.seenIds.has(safeEvent.id)) {
      this.metrics.deduped += 1;
      return;
    }
    this.seenIds.add(safeEvent.id);

    /*
     * An addressable event is identified by its address, not its event id.
     *
     * This deduplicated on the event id alone, so a peer republishing a note at
     * the same `d` — to close a thread, or to retract it — produced a second
     * report beside the first, and a withdrawn claim stayed on screen next to
     * its own retraction. NIP-01 says the newer version replaces the older.
     *
     * The older version is forgotten as soon as a newer one is seen, before
     * this event has been parsed. That is deliberate: once the publisher has
     * superseded a version, showing it is showing something they withdrew,
     * whether or not this node can read what replaced it.
     */
    const address = addressOf(safeEvent);
    // Withdrawn by its publisher (D-RP, RP7): from the publisher's own t tags, never a #word in the text.
    const retracting = address !== null && retractedByTags(safeEvent.tags);
    if (address) {
      const incoming = { createdAt: safeEvent.created_at, id: safeEvent.id };
      // One note under any of its publisher's keys: a copy carried to a new key and its old-key original are one,
      // the newer kept, and the one it replaces withdrawn from every reader (onWithdrawn).
      const identity = noteIdentity(address);
      const heldAddress = this.addressOfNote.get(identity) ?? address;
      const held = this.versions.get(heldAddress);
      if (held && !supersedes(incoming, held)) {
        this.metrics.droppedSuperseded += 1;
        return;
      }
      if (held && heldAddress !== address) this.withdrawAddress(heldAddress);
      // A withdrawal keeps what it withdraws until retractAddress below tells every reader.
      else if (held && !retracting) this.forgetAddress(address);
      this.versions.delete(heldAddress);
      this.versions.set(address, incoming);
      this.addressOfNote.set(identity, address);
    }
    // The stable identity every downstream consumer replaces by: the globe's
    // marker cache and importReport('overwrite') both key on report id.
    const idBase = address ?? safeEvent.id;

    // An event is an answer, and a relay sending them is connected even if it never sends EOSE.
    this.markAnswered(relay);

    // A report this browser published, read back: the report it came from is here already (decision D-RP, RP5).
    if (address && isOwnPublishedReport(address)) {
      if (retracting) this.forgetAddress(address);
      this.metrics.deduped += 1;
      return;
    }

    /*
     * Withdrawn by its publisher: a newer version at the same address, tagged `retracted` (decision D-RP, RP7; the
     * spec's "Replacement"). It replaces the report on relays that keep the newest version, and here it takes the
     * report off the globe, the lists and storage, whether it was read this session or saved from an earlier one.
     * The withdrawal itself is not a report. Any publisher's note withdrawn this way comes off, not only Starcom's.
     */
    if (address && retracting) {
      this.retractAddress(address);
      this.metrics.withdrawn += 1;
      return;
    }

    const tags = collectHashtags(safeEvent);
    // From the publisher's own t tags alone, never a #word in the text (D-NP; see namesPeople.ts).
    const namesPeople = tagsNamePeople(safeEvent.tags);
    const hasRequired = this.config.hashtags.some((t) => tags.includes(t));
    if (!hasRequired) {
      // Should be rare since relay filter is #t, but keep guard.
      this.metrics.droppedInvalid += 1;
      return;
    }

    /*
     * Our own fixtures are not intel.
     *
     * Three events tagged this way sit on nostr.mom and nos.lol from the
     * cross-node verification runs of 2026-08-06, carrying a placeholder IPFS
     * CID that resolves to nothing and the coordinates of Washington DC because
     * that is what the scratch script hardcoded. They were three of the seven
     * pins a first-time visitor saw on the globe.
     *
     * They are refused here rather than retracted at the source because they
     * CANNOT be retracted: NIP-09 deletion and addressable replacement both
     * require the publishing key's signature, and the three carry three
     * different pubkeys, each minted per-run by uncommitted scratch scripts
     * that are gone. Nobody can unpublish them. This is the only side of it
     * still under our control, which is also why the marker is written into the
     * interchange spec — a peer reading this vocabulary should be able to drop
     * our litter without first discovering these three posts themselves.
     *
     * On the TAG alone, never on the title or the placeholder CID. Content
     * sniffing would eventually refuse a real report for saying "test", and a
     * read path that silently drops real intel is a worse failure than a
     * fixture on the globe.
     */
    if (tags.includes(SCRATCH_MARKER_TAG)) {
      this.metrics.droppedScratch += 1;
      return;
    }

    // AI Watch's own (D-AW, AW1), and Civil Unrest's (D-CU, CU3): they carry starcom_intel too, and are drawn there, not here.
    if (tags.includes(AI_WATCH_TAG) || isCivilUnrest(tags)) {
      this.metrics.droppedOwnMode += 1;
      return;
    }

    /*
     * A report can say WHERE IT IS ABOUT without saying where it is.
     *
     * Everything below wants a coordinate, and an event without one used to be
     * dropped here — which is the gap the interchange spec states as ours: a
     * thread with no spatial component had no surface. An event that names a
     * jurisdiction has stated its place at the resolution it has, so it is kept
     * and drawn as that territory rather than refused for lacking a point it
     * never claimed to have.
     *
     * An event with NEITHER is now kept too, which reverses a deliberate
     * refusal. The refusal was recorded as what stopped this becoming "accept
     * everything", and the thing it guarded — the globe — is guarded anyway:
     * reportToMarker returns null without a coordinate, so a placeless report
     * cannot reach the globe whatever this branch does. What the refusal cost
     * was the report, on a node whose list surfaces never asked for a
     * coordinate. Of the 85 asks on the peer board published 2026-09-20, 69
     * are desk work with no place; refusing them here made most of a
     * federating node's output unreachable and returned a counter instead.
     *
     * So droppedNoGeo no longer means "had no place". It means an event that
     * CLAIMED a position this node could not parse — a defect, not a category.
     */
    if (!hasGeoIntEncoding(safeEvent)) {
      const stated = statedJurisdictions(safeEvent);
      const nowIsoRegion = new Date().toISOString();
      const placeless = stated.length === 0;
      const report: IntelReportUI = {
        id: idBase,
        title: deriveTitle(safeEvent.content || ''),
        content: (safeEvent.content || '').slice(0, 8000),
        author: safeEvent.pubkey || 'nostr',
        category: 'GEOINT',
        tags: Array.from(new Set([
          'nostr',
          `relay:${relay}`,
          // Three different absences, said differently: a territory was stated,
          // or nowhere was. A reader who cannot tell them apart cannot tell a
          // publisher who works nationally from one whose work has no place.
          placeless ? 'geometry:none' : 'geometry:jurisdiction',
        ])),
        hashtags: tags,
        ...(namesPeople ? { namesPeople: true } : {}),
        // No latitude or longitude, deliberately. The publisher gave a
        // territory or nothing, and inventing a point — a centroid, say —
        // would put the report somewhere nobody said anything happened.
        ...(placeless ? {} : { jurisdictions: stated }),
        ...citedBy(safeEvent),
        ...referredBy(safeEvent),
        ...sourcedBy(safeEvent),
        // When it was first published, exactly as the coordinate path uses it; and when this version was signed.
        createdAt: new Date(firstPublishedAt(safeEvent) * 1000),
        updatedAt: new Date(safeEvent.created_at * 1000),
        status: 'SUBMITTED',
        version: 1,
        manualSummary: false,
        history: [{ action: 'IMPORTED', timestamp: nowIsoRegion, user: 'nostr' }],
      } as IntelReportUI;

      this.metrics.accepted += 1;
      this.metrics.acceptedEvents += 1;
      if (placeless) this.metrics.acceptedPlaceless += 1;
      this.retain(report, safeEvent.id, safeEvent.kind);
      this.markRelay(relay, true);
      this.listeners.forEach((listener) => listener(report));
      this.notifyChange();
      return;
    }

    let parsed: ReturnType<typeof parseEvent>;
    try {
      parsed = parseEvent(safeEvent, {
        ...GEOINT_DEFAULT_CONFIG,
        // loosen ingestion caps a bit for intel notes while still bounded
        maxFeaturesPerCollection: 10,
        maxEventsStored: this.config.maxReports,
        freshnessWindowMs: this.config.sinceWindowMs
      });
    } catch (error) {
      this.metrics.droppedInvalid += 1;
      log.warn('[NostrStarcomIntelIngest] dropped (parser error)', {
        id: safeEvent.id,
        relay,
        error
      });
      return;
    }

    // The parser caps a FeatureCollection at maxFeaturesPerCollection (10 here).
    // Anything beyond that never reached this service, and used to be invisible
    // — the cap was applied with a bare .slice() and nothing reported it.
    if (parsed.cappedFeatures) {
      this.metrics.droppedOverFeatureCap += parsed.cappedFeatures;
      log.warn('[NostrStarcomIntelIngest] event exceeded the feature cap', {
        id: safeEvent.id,
        relay,
        discarded: parsed.cappedFeatures,
        kept: parsed.features.length
      });
    }

    if (parsed.features.length === 0) {
      this.metrics.droppedNoGeo += 1;
      if (this.verboseLogs && (this.metrics.droppedNoGeo <= 3 || this.metrics.droppedNoGeo % 25 === 0)) {
        log.info('[NostrStarcomIntelIngest] dropped (no geo)', {
          id: safeEvent.id,
          relay,
          hashtags: tags,
          metrics: this.getMetrics()
        });
      }
      this.markRelay(relay, true);
      return;
    }

    // EVERY feature becomes a report.
    //
    // This used to be `parsed.features[0]`, with the rest discarded — and
    // `accepted` incremented by one while every drop metric read zero, so up to
    // nine claims per event vanished with the metrics clean. A publisher's
    // FeatureCollection is a set of claims, not a container from which one
    // claim is selected, and reading only the first misrepresents what they
    // published.
    //
    // Feed identity is what makes this safe: eventsAdapter keys feedId on the
    // author, so all of one publisher's reports are ONE corroboration feed.
    // Without that, splitting an event into N reports would let a single event
    // corroborate itself N times — turning a data-loss bug into a
    // confidence-fabrication one.
    const emitted: IntelReportUI[] = [];
    // When it was first published: a note carried to its publisher's new key keeps its time (firstPublished.ts).
    const createdAt = new Date(firstPublishedAt(safeEvent) * 1000);
    const signedAt = new Date(safeEvent.created_at * 1000);
    const nowIso = new Date().toISOString();

    for (let i = 0; i < parsed.features.length; i++) {
      const feature = parsed.features[i];

      /*
       * One point per report. A line or polygon used to be reduced to its FIRST
       * coordinate, so a district sat on a corner; it now stands at its centroid
       * or halfway point, falling back to that first vertex only where the better
       * point would mislead (D-F step 17). The tag below says which, either way.
       */
      const reducible = feature.kind === 'point'
        ? { kind: 'point' as const, point: feature.geometry as ParsedPoint }
        : feature.kind === 'line'
          ? { kind: 'line' as const, coords: (feature.geometry as ParsedLine).coords }
          : { kind: 'polygon' as const, rings: (feature.geometry as ParsedPolygon).rings };

      const { point, how } = representativePoint(reducible);
      /*
       * The shape, kept as a bounded outline instead of thrown away.
       *
       * The point above still places the report and is unchanged — this is
       * what it looks like, not where it is. Bounded because the parser admits
       * 2000 vertices per polygon and the workspace serialises every report
       * into one localStorage key; see boundedOutline for the budget and for
       * the counts that stop a simplified shape being drawn as an exact one.
       */
      const outline = reducible.kind === 'point' ? null : boundedOutline(reducible);
      const jurisdictions = statedJurisdictions(safeEvent);
      const reduced = how !== 'point';
      // How precisely it was placed: stated, or the geohash cell it came from.
      const geoPrecisionM = precisionForEvent(safeEvent.tags, feature.props.geoSource);

      const lat = point?.lat;
      const lon = point?.lon;

      if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        this.metrics.droppedNoGeo += 1;
        continue;
      }

      if (reduced) this.metrics.reducedGeometry += 1;

      // A single-feature event keeps the bare event id, so existing stored
      // reports and their dedup keys are unchanged. Only multi-feature events
      // need the suffix, which is also where collisions would otherwise occur:
      // the parser gives every POINT feature the bare event id.
      const reportId = parsed.features.length === 1 ? idBase : `${idBase}#${i}`;

      const report: IntelReportUI = {
        id: reportId,
        title: deriveTitle(safeEvent.content || ''),
        content: (safeEvent.content || '').slice(0, 8000),
        author: safeEvent.pubkey || 'nostr',
        category: 'GEOINT',
        // `tags` carries internal/synthetic provenance markers only; external hashtags go in
        // `hashtags` instead, so untrusted event content can't spoof internal taxonomy (e.g. a
        // post tagged #relay:evil could otherwise collide with the synthetic relay marker below).
        //
        // The geometry marker states that this coordinate is a representative
        // vertex of a line or polygon rather than a point somebody published as
        // a point. Reducing silently is the same class of defect as dropping
        // the other features silently.
        tags: Array.from(new Set([
          'nostr',
          `relay:${relay}`,
          ...(reduced ? [`geometry:${how}`] : []),
        ])),
        hashtags: tags,
        ...(namesPeople ? { namesPeople: true } : {}),
          latitude: lat,
        longitude: lon,
        ...(outline ? { outline } : {}),
        ...(jurisdictions.length ? { jurisdictions } : {}),
        ...(geoPrecisionM !== null ? { geoPrecisionM } : {}),
        ...citedBy(safeEvent),
        ...referredBy(safeEvent),
        ...sourcedBy(safeEvent),
        createdAt,
        updatedAt: signedAt,
        status: 'SUBMITTED',
        version: 1,
        manualSummary: false,
        history: [{ action: 'IMPORTED', timestamp: nowIso, user: 'nostr' }]
      };

      this.metrics.accepted += 1;
      emitted.push(report);

      this.retain(report, safeEvent.id, safeEvent.kind);
    }

    if (emitted.length === 0) {
      this.markRelay(relay, true);
      return;
    }

    this.metrics.acceptedEvents += 1;
    this.markRelay(relay, true);

    if (this.verboseLogs && (this.metrics.acceptedEvents <= 3 || this.metrics.acceptedEvents % 25 === 0)) {
      log.info('[NostrStarcomIntelIngest] accepted', {
        id: safeEvent.id,
        reports: emitted.length,
        hashtags: tags,
        relay,
        metrics: this.getMetrics()
      });
    }

    for (const report of emitted) {
      this.listeners.forEach((listener) => {
        try {
          listener(report);
        } catch {
          // ignore listener error
        }
      });
    }
  }
}

export const nostrStarcomIntelIngest = new NostrStarcomIntelIngest();
