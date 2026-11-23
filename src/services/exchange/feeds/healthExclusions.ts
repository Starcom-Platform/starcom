/**
 * HHS-OIG's exclusions from federal health care programs, the last three monthly supplements to the
 * LEIE (decision D-BF, BF1, BF2): counted by state, category and basis in law, organisations named,
 * people counted, never named.
 *
 * oig.hhs.gov sends no CORS header, so the browser reads Mecha Jono's notes on The Record first
 * (`t=health_exclusions`, a note per month, proposed to them) and fetches
 * public/data/health-exclusions.json, made at each build by scripts/snapshot-leie.mjs, when the notes
 * hold fewer than three months.
 */
import type { Event, SimplePool } from 'nostr-tools';
import { MECHA_JONO_KEYS } from '../../../config/publicInfrastructure';
import { boardFeedRelays } from '../../nostr/publishTargets';
import { createRelayPool } from '../../nostr/relayPool';
import { readNotesOnce } from '../../nostr/readNotesOnce';
import type { ExcludedOrganisation, ExclusionMonth } from './leieSupplement';
import type { Archetype } from '../opportunityAudience';

export type { ExcludedOrganisation, ExclusionMonth } from './leieSupplement';
export { EXCLUSION_BASES } from './leieSupplement';

export const EXCLUSIONS_FILE_URL = '/data/health-exclusions.json';
export const EXCLUSIONS_NOTE_TOPIC = 'health_exclusions';
export const MONTHS_SHOWN = 3;
export const RECORD_WAIT_MS = 6_000;
/** Who a month of exclusions is offered to, worked out here from what it is. */
export const EXCLUSIONS_AUDIENCES: readonly Archetype[] = ['qui_tam_relator', 'insurance_siu', 'compliance_analyst', 'private_investigator', 'journalist'];

export interface ExclusionsFile {
  version: 1;
  source: string;
  url: string;
  license: string;
  retrievedAt: string;
  /** Newest first. */
  months: ExclusionMonth[];
  /** Months looked for whose supplement did not arrive, YYYY-MM. */
  missing: string[];
}

export interface HealthExclusions {
  months: Array<ExclusionMonth & { via: 'record' | 'file' }>;
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v);
const countsOf = (raw: unknown): Record<string, number> | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  return entries.every(([k, v]) => k && isCount(v)) ? Object.fromEntries(entries) as Record<string, number> : null;
};
const organisationOf = (raw: unknown): ExcludedOrganisation | null => {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o.name !== 'string' || !o.name.trim()) return null;
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  return { name: o.name.trim(), state: s(o.state), category: s(o.category), basis: s(o.basis), date: s(o.date) };
};

/** A month as the file or a note carries it, checked; one that does not read is left out. */
export function monthOf(raw: unknown): ExclusionMonth | null {
  const m = raw as Record<string, unknown> | null;
  if (!m || !isMonth(m.month) || ![m.exclusions, m.reinstatements, m.people, m.practicesCounted].every(isCount)) return null;
  const byState = countsOf(m.byState);
  const byCategory = countsOf(m.byCategory);
  const byBasis = countsOf(m.byBasis);
  if (!byState || !byCategory || !byBasis || !Array.isArray(m.organisations)) return null;
  return {
    month: m.month, exclusions: m.exclusions as number, reinstatements: m.reinstatements as number,
    people: m.people as number, practicesCounted: m.practicesCounted as number, byState, byCategory, byBasis,
    organisations: m.organisations.flatMap((o) => organisationOf(o) ?? []),
  };
}

export function parseExclusionsFile(json: unknown): ExclusionMonth[] {
  const f = json as Partial<ExclusionsFile> | null;
  if (!f || f.version !== 1 || !Array.isArray(f.months)) return [];
  return f.months.flatMap((m) => monthOf(m) ?? []);
}

const tags = (event: Event, name: string) => event.tags.filter((t) => t[0] === name);
const value = (event: Event, name: string) => tags(event, name)[0]?.[1];
const tally = (event: Event, name: string) => Object.fromEntries(tags(event, name).map(([, key, n]) => [key, Number(n)]));

/**
 * One of Mecha Jono's notes (kind 30023, `t=health_exclusions`, `d=leie-<YYYY-MM>`): `month`,
 * `exclusions`, `reinstatements`, `people`, `practices`; a `state`, `category` and `basis` tag per
 * count (key, n); an `organisation` tag per business named (name, state, category, basis, date). Never
 * a person. Null for a note that is not one, or does not read.
 */
export function readExclusionsNote(event: Event, publishers: readonly string[] = MECHA_JONO_KEYS): ExclusionMonth | 'retracted' | null {
  if (event.kind !== 30023 || !publishers.includes(event.pubkey)) return null;
  const topics = tags(event, 't').map((t) => t[1]);
  if (!topics.includes(EXCLUSIONS_NOTE_TOPIC)) return null;
  if (topics.includes('retracted')) return 'retracted';
  return monthOf({
    month: value(event, 'month'),
    exclusions: Number(value(event, 'exclusions')),
    reinstatements: Number(value(event, 'reinstatements')),
    people: Number(value(event, 'people')),
    practicesCounted: Number(value(event, 'practices')),
    byState: tally(event, 'state'),
    byCategory: tally(event, 'category'),
    byBasis: tally(event, 'basis'),
    organisations: tags(event, 'organisation').map(([, name, state, category, basis, date]) => ({ name, state, category, basis, date })),
  });
}

function standing(events: readonly Event[]): ExclusionMonth[] {
  const newest = new Map<string, Event>();
  for (const event of events) {
    const d = value(event, 'd');
    if (!d) continue;
    const held = newest.get(d);
    if (!held || event.created_at > held.created_at) newest.set(d, event);
  }
  return [...newest.values()].flatMap((event) => {
    const read = readExclusionsNote(event);
    return read && read !== 'retracted' ? [read] : [];
  });
}

export interface ExclusionsSources {
  pool?: Pick<SimplePool, 'subscribeMany'>;
  relays?: string[];
  json?: (url: string) => Promise<unknown>;
  waitMs?: number;
}

const jsonDefault = async (url: string): Promise<unknown> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
};

/** The last three months: Mecha Jono's notes first, the file for the rest. */
export async function readHealthExclusions(sources: ExclusionsSources = {}): Promise<HealthExclusions> {
  const events = await readNotesOnce(
    sources.pool ?? createRelayPool(),
    sources.relays ?? boardFeedRelays(),
    { kinds: [30023], authors: [...MECHA_JONO_KEYS], '#t': [EXCLUSIONS_NOTE_TOPIC] },
    sources.waitMs ?? RECORD_WAIT_MS,
  );
  const held = new Map<string, ExclusionMonth & { via: 'record' | 'file' }>();
  for (const m of standing(events)) held.set(m.month, { ...m, via: 'record' });
  if (held.size < MONTHS_SHOWN) {
    try {
      for (const m of parseExclusionsFile(await (sources.json ?? jsonDefault)(EXCLUSIONS_FILE_URL))) {
        if (!held.has(m.month)) held.set(m.month, { ...m, via: 'file' });
      }
    } catch {
      // No file in this build: what the notes hold is all there is, and the board says so.
    }
  }
  const months = [...held.values()].sort((a, b) => b.month.localeCompare(a.month)).slice(0, MONTHS_SHOWN);
  return { months };
}
