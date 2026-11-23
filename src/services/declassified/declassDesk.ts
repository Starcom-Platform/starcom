/**
 * Declassified records, as Mecha Jono posts them on The Record (plan H9; their spec of 25 Oct): one note a release,
 * kind 30023 with `t=declass_desk`, from the archives Mecha Jono reads, by their codes `frus`, `nsarchive`, `cia`, `osti`
 * and `ntrs`. Each carries its title (who released what, the record's own year in it), a summary
 * that leads with its source's name, `published_at`, its licence and one or more `r` links to the record itself.
 *
 * A source is named as its summary names it, never from a list here (CR6): a source with no such lead is named by its
 * code. Almost none has a place, so a release is listed and put on a card, never drawn.
 */
import type { Event, Filter, SimplePool } from 'nostr-tools';
import { MECHA_JONO_KEYS } from '../../config/publicInfrastructure';
import { boardFeedRelays } from '../nostr/publishTargets';
import { createRelayPool } from '../nostr/relayPool';
import { readNotesOnce } from '../nostr/readNotesOnce';

export const DECLASS_TOPIC = 'declass_desk';
/** How long The Record may take to answer. */
export const DECLASS_WAIT_MS = 6_000;
/** How many days of releases are read: a week, and the day it began. */
export const DECLASS_DAYS = 8;

const NOTE_KIND = 30023;
const DAY_MS = 86_400_000;
const SOURCE = /^source:([a-z_]+)$/;
const BRANCH = /^category:declassified\.([a-z_]+)$/;

export interface DeclassRecord {
  d: string;
  /** Who released what, as its publisher wrote it. */
  title: string;
  /** Its source's code, `ntrs`, and its name as its summary gives it. */
  source: string;
  sourceName: string;
  /** `diplomatic`, `archive`, `intelligence` or `technical`, or null when it names none. */
  branch: string | null;
  /** When it was released, ms. */
  publishedAt: number;
  licence: string;
  /** The record's own pages, first the one it names first. */
  links: string[];
  createdAt: number;
}

export type DeclassNote = { ok: true; record: DeclassRecord } | { ok: true; retracted: string; createdAt: number } | { ok: false; reason: string };

const tagValue = (event: Event, name: string) => event.tags.find((t) => t[0] === name)?.[1]?.trim() ?? '';

/** One of Mecha Jono's declassified notes. */
export function readDeclassNote(event: Event, publishers: readonly string[] = MECHA_JONO_KEYS): DeclassNote {
  if (event.kind !== NOTE_KIND) return { ok: false, reason: 'not a note' };
  if (!publishers.includes(event.pubkey)) return { ok: false, reason: 'not a named publisher' };
  const topics = event.tags.filter((t) => t[0] === 't').map((t) => t[1] ?? '');
  if (!topics.includes(DECLASS_TOPIC)) return { ok: false, reason: `not tagged ${DECLASS_TOPIC}` };
  const d = tagValue(event, 'd');
  if (!d) return { ok: false, reason: 'no address' };
  if (topics.includes('retracted')) return { ok: true, retracted: d, createdAt: event.created_at };
  const title = tagValue(event, 'title');
  const licence = tagValue(event, 'license');
  const published = Number(tagValue(event, 'published_at'));
  if (!title || !licence || !Number.isInteger(published) || published <= 0) return { ok: false, reason: 'missing its title, day or licence' };
  const source = topics.map((t) => SOURCE.exec(t)?.[1]).find(Boolean) ?? '';
  if (!source) return { ok: false, reason: 'no source' };
  // The summary leads with its source's name, then the title: "NASA's Technical Reports Server: NASA added …".
  const summary = tagValue(event, 'summary');
  const lead = summary.endsWith(`: ${title}`) ? summary.slice(0, -(title.length + 2)).trim() : '';
  // The publisher's own desk is credited to nobody (the operator, 24 Oct; record D-L): a lead naming the note's own
  // client names no source, whoever the client is, and the source goes by its code.
  const client = tagValue(event, 'client');
  const ownDesk = !!client && lead.includes(client);
  return {
    ok: true,
    record: {
      d, title, source, sourceName: (!ownDesk && lead) || source,
      branch: topics.map((t) => BRANCH.exec(t)?.[1]).find(Boolean) ?? null,
      publishedAt: published * 1000, licence,
      links: event.tags.filter((t) => t[0] === 'r' && /^https:\/\//.test(t[1] ?? '')).map((t) => t[1]),
      createdAt: event.created_at,
    },
  };
}

/** The newest note at each address stands; a retraction withdraws its release. */
export function standingRecords(events: readonly Event[]): DeclassRecord[] {
  const newest = new Map<string, Exclude<DeclassNote, { ok: false }>>();
  for (const event of events) {
    const read = readDeclassNote(event);
    if (!read.ok) continue;
    const d = 'record' in read ? read.record.d : read.retracted;
    const at = 'record' in read ? read.record.createdAt : read.createdAt;
    const held = newest.get(d);
    const heldAt = held ? ('record' in held ? held.record.createdAt : held.createdAt) : -1;
    if (at > heldAt) newest.set(d, read);
  }
  return [...newest.values()].flatMap((read) => ('record' in read ? [read.record] : []));
}

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The releases of one UTC day, newest first: the latest day with any, or the day asked; null when there are none. */
export function declassDay(records: readonly DeclassRecord[], day: string): { day: string; records: DeclassRecord[] } | null {
  const newestFirst = [...records].sort((a, b) => b.publishedAt - a.publishedAt);
  const chosen = day === 'latest' ? (newestFirst[0] ? dayOf(newestFirst[0].publishedAt) : null) : day;
  if (!chosen) return null;
  const of = newestFirst.filter((r) => dayOf(r.publishedAt) === chosen);
  return of.length ? { day: chosen, records: of } : null;
}

export interface DeclassSources {
  pool?: Pick<SimplePool, 'subscribeMany'>;
  relays?: string[];
  waitMs?: number;
  now?: number;
}

/** The releases of the last week as they stand on The Record; empty when it does not answer in time. */
export async function readDeclassified(sources: DeclassSources = {}): Promise<DeclassRecord[]> {
  const now = sources.now ?? Date.now();
  const filter: Filter = {
    kinds: [NOTE_KIND], authors: [...MECHA_JONO_KEYS], '#t': [DECLASS_TOPIC],
    since: Math.floor(now / 1000) - DECLASS_DAYS * (DAY_MS / 1000),
  };
  const events = await readNotesOnce(sources.pool ?? createRelayPool(), sources.relays ?? boardFeedRelays(), filter, sources.waitMs ?? DECLASS_WAIT_MS);
  return standingRecords(events);
}
