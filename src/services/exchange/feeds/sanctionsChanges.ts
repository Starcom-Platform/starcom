/**
 * OFAC's sanctions changes of the last 30 days, counted by programme (decision D-BF, BF1, BF2): each
 * publication's additions and removals by type, its programmes, and the organisations, vessels and
 * aircraft it names. People are counted, never named.
 *
 * The browser reads OFAC's list of publications itself (its change history answers any site), then
 * Mecha Jono's notes on The Record (`t=sanctions_changes`, a note per publication, proposed to them),
 * and fetches public/data/sanctions-changes.json, made at each build from OFAC's delta files
 * (scripts/snapshot-ofac.mjs), only for publications the notes do not hold. The delta files themselves
 * sit on S3, which sends no CORS header.
 */
import type { Event, Filter, SimplePool } from 'nostr-tools';
import { MECHA_JONO_KEYS } from '../../../config/publicInfrastructure';
import { boardFeedRelays } from '../../nostr/publishTargets';
import { createRelayPool } from '../../nostr/relayPool';
import { readNotesOnce } from '../../nostr/readNotesOnce';
import type { NamedChange, SanctionsPublication, Tally } from './ofacDelta';
import type { Archetype } from '../opportunityAudience';

export type { NamedChange, SanctionsPublication, Tally } from './ofacDelta';

export const SANCTIONS_FILE_URL = '/data/sanctions-changes.json';
export const OFAC_HISTORY_URL = 'https://sanctionslistservice.ofac.treas.gov/changes/history';
export const SANCTIONS_NOTE_TOPIC = 'sanctions_changes';
export const WINDOW_DAYS = 30;
export const RECORD_WAIT_MS = 6_000;
/** Who a sanctions publication is offered to, worked out here from what it is. */
export const SANCTIONS_AUDIENCES: readonly Archetype[] = ['compliance_analyst', 'sanctions_researcher', 'journalist'];

/** The file, as scripts/snapshot-ofac.mjs writes it. */
export interface SanctionsFile {
  version: 1;
  source: string;
  url: string;
  license: string;
  retrievedAt: string;
  /** The first day of the window it covers, YYYY-MM-DD. */
  from: string;
  publications: SanctionsPublication[];
  /** Publications in the window whose delta file did not arrive. */
  missing: number[];
}

export interface SanctionsChanges {
  /** Newest first, each saying where it was read. */
  publications: Array<SanctionsPublication & { via: 'record' | 'file' }>;
  from: string;
  /** Publications OFAC lists in the window that neither the notes nor the file hold. */
  missing: number[];
}

const TYPES = ['Entity', 'Vessel', 'Aircraft'] as const;
const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

function tallyOf(raw: unknown): Tally | null {
  const t = raw as Record<string, unknown> | null;
  if (!t || typeof t !== 'object') return null;
  const keys = ['entities', 'individuals', 'vessels', 'aircraft', 'other'] as const;
  return keys.every((k) => isCount(t[k])) ? Object.fromEntries(keys.map((k) => [k, t[k]])) as unknown as Tally : null;
}

function namedOf(raw: unknown): NamedChange | null {
  const n = raw as Record<string, unknown> | null;
  if (!n || (n.action !== 'add' && n.action !== 'remove') || !TYPES.includes(n.type as (typeof TYPES)[number])) return null;
  if (typeof n.name !== 'string' || !n.name.trim()) return null;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : []);
  return { action: n.action, type: n.type as NamedChange['type'], name: n.name.trim(), countries: strings(n.countries), programmes: strings(n.programmes) };
}

/** A publication as the file or a note carries it, checked; one that does not read is left out. */
export function publicationOf(raw: unknown): SanctionsPublication | null {
  const p = raw as Record<string, unknown> | null;
  if (!p || !isCount(p.id) || !isDay(p.date) || !isCount(p.amended)) return null;
  const added = tallyOf(p.added);
  const removed = tallyOf(p.removed);
  if (!added || !removed || !Array.isArray(p.programmes) || !Array.isArray(p.named)) return null;
  const programmes = p.programmes.flatMap((x) => {
    const r = x as Record<string, unknown>;
    return typeof r?.code === 'string' && isCount(r.added) && isCount(r.removed) ? [{ code: r.code, added: r.added, removed: r.removed }] : [];
  });
  return { id: p.id, date: p.date, kind: typeof p.kind === 'string' ? p.kind : '', added, removed, amended: p.amended, programmes, named: p.named.flatMap((n) => namedOf(n) ?? []) };
}

export function parseSanctionsFile(json: unknown): { publications: SanctionsPublication[]; missing: number[] } {
  const f = json as Partial<SanctionsFile> | null;
  if (!f || f.version !== 1 || !Array.isArray(f.publications)) return { publications: [], missing: [] };
  return {
    publications: f.publications.flatMap((p) => publicationOf(p) ?? []),
    missing: Array.isArray(f.missing) ? f.missing.filter(isCount) : [],
  };
}

const tagsOf = (event: Event, name: string) => event.tags.filter((t) => t[0] === name);
const first = (event: Event, name: string) => tagsOf(event, name)[0]?.[1];
const counts = (tag: string[] | undefined) => {
  const [entities, individuals, vessels, aircraft, other] = (tag ?? []).slice(1).map(Number);
  return { entities, individuals, vessels, aircraft, other };
};
const list = (value: string | undefined) => (value ? value.split(';').map((s) => s.trim()).filter(Boolean) : []);

/**
 * One of Mecha Jono's notes (kind 30023, `t=sanctions_changes`, `d=ofac-<publication>`): `publication`,
 * `published` (YYYY-MM-DD), `kind`; `added` and `removed` as counts of entities, individuals, vessels,
 * aircraft and other; `amended`; a `programme` tag per programme (code, added, removed); and a `named`
 * tag per organisation, vessel or aircraft (action, type, name, countries and programmes `;`-joined).
 * Never a person's name. Null for a note that is not one, or does not read.
 */
export function readSanctionsNote(event: Event, publishers: readonly string[] = MECHA_JONO_KEYS): SanctionsPublication | 'retracted' | null {
  if (event.kind !== 30023 || !publishers.includes(event.pubkey)) return null;
  const topics = tagsOf(event, 't').map((t) => t[1]);
  if (!topics.includes(SANCTIONS_NOTE_TOPIC)) return null;
  if (topics.includes('retracted')) return 'retracted';
  return publicationOf({
    id: Number(first(event, 'publication')),
    date: first(event, 'published'),
    kind: first(event, 'kind') ?? '',
    added: counts(tagsOf(event, 'added')[0]),
    removed: counts(tagsOf(event, 'removed')[0]),
    amended: Number(first(event, 'amended')),
    programmes: tagsOf(event, 'programme').map(([, code, added, removed]) => ({ code, added: Number(added), removed: Number(removed) })),
    named: tagsOf(event, 'named').map(([, action, type, name, countries, programmes]) => ({ action, type, name, countries: list(countries), programmes: list(programmes) })),
  });
}

/** The newest note at each address stands; a retraction withdraws its publication. */
export function standingNotes(events: readonly Event[], publishers: readonly string[] = MECHA_JONO_KEYS): SanctionsPublication[] {
  const newest = new Map<string, Event>();
  for (const event of events) {
    const d = first(event, 'd');
    if (!d) continue;
    const held = newest.get(d);
    if (!held || event.created_at > held.created_at) newest.set(d, event);
  }
  return [...newest.values()].flatMap((event) => {
    const read = readSanctionsNote(event, publishers);
    return read && read !== 'retracted' ? [read] : [];
  });
}

export interface SanctionsSources {
  pool?: Pick<SimplePool, 'subscribeMany'>;
  relays?: string[];
  json?: (url: string) => Promise<unknown>;
  now?: Date;
  waitMs?: number;
}

const jsonDefault = async (url: string): Promise<unknown> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
};

const dayOf = (date: Date) => date.toISOString().slice(0, 10);

/** OFAC's publications in the window, by its own list; null when the list does not answer. */
async function listed(json: (url: string) => Promise<unknown>, from: string, now: Date): Promise<number[] | null> {
  const years = [...new Set([Number(from.slice(0, 4)), now.getUTCFullYear()])];
  try {
    const answers = await Promise.all(years.map((year) => json(`${OFAC_HISTORY_URL}/${year}`)));
    return answers.flatMap((answer) => (Array.isArray(answer) ? answer : []))
      .filter((p) => isCount(p?.publicationID) && typeof p?.datePublished === 'string' && p.datePublished.slice(0, 10) >= from)
      .map((p) => p.publicationID as number);
  } catch {
    return null;
  }
}

export async function readSanctionsChanges(sources: SanctionsSources = {}): Promise<SanctionsChanges> {
  const json = sources.json ?? jsonDefault;
  const now = sources.now ?? new Date();
  const from = dayOf(new Date(now.getTime() - WINDOW_DAYS * 86_400_000));
  const [wanted, events] = await Promise.all([
    listed(json, from, now),
    readNotesOnce(
      sources.pool ?? createRelayPool(),
      sources.relays ?? boardFeedRelays(),
      { kinds: [30023], authors: [...MECHA_JONO_KEYS], '#t': [SANCTIONS_NOTE_TOPIC] } satisfies Filter,
      sources.waitMs ?? RECORD_WAIT_MS,
    ),
  ]);
  const held = new Map<number, SanctionsPublication & { via: 'record' | 'file' }>();
  for (const p of standingNotes(events)) if (p.date >= from) held.set(p.id, { ...p, via: 'record' });

  let fileMissing: number[] = [];
  if (!wanted || wanted.some((id) => !held.has(id))) {
    try {
      const file = parseSanctionsFile(await json(SANCTIONS_FILE_URL));
      for (const p of file.publications) if (p.date >= from && !held.has(p.id)) held.set(p.id, { ...p, via: 'file' });
      fileMissing = file.missing;
    } catch {
      // No file in this build: what OFAC lists and nothing holds is named below.
    }
  }

  const publications = [...held.values()].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const missing = [...new Set([...(wanted ?? []), ...fileMissing])].filter((id) => !held.has(id)).sort((a, b) => b - a);
  return { publications, from, missing };
}
