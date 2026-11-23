/**
 * EIA's production of crude oil, dry natural gas and renewables, by country (decision D-DP, DP17).
 *
 * Read on demand, never carried in the app. First as Mecha Jono posts it on The Record: a signed note
 * per series (kind 30023, `t=energy_production`), which any peer can read too. For a series not found
 * there, or when The Record does not answer, from public/data/eia-production.json, 3.3 KB compressed,
 * which `npm run data:eia` makes from EIA's keyless bulk file (eiaBulk.ts). Both carry EIA's own
 * figures, a U.S. Government work in the public domain. No one needs an EIA key for them.
 *
 * Resource Zones ranks countries by these (EIAInternationalService.ts) and Diplomacy's country brief
 * states them, so the layer and the brief agree.
 */
import type { Event, Filter, SimplePool } from 'nostr-tools';
import { MECHA_JONO_KEYS } from '../../config/publicInfrastructure';
import { energyRelays } from '../nostr/publishTargets';
import { createRelayPool } from '../nostr/relayPool';
import { readNotesOnce } from '../nostr/readNotesOnce';

export type EnergySeries = 'oil' | 'gas' | 'renewable';
export const ENERGY_SERIES: readonly EnergySeries[] = ['oil', 'gas', 'renewable'];

export interface EnergySeriesData {
  /** EIA's name for it. */
  name: string;
  /** EIA's unit, in its words: "thousand barrels per day". */
  unit: string;
  /** The year every figure is for. */
  year: number;
  /** Production by country, ISO 3166-1 alpha-3 as EIA codes them; producers only, each above zero. */
  values: Record<string, number>;
  /** Where it was read: Mecha Jono's note on The Record, or the file. */
  via: 'record' | 'file';
  /** ISO, UTC: when these figures were written, the note's own time or the day EIA last updated the file. */
  written?: string;
}

export type EnergyProduction = Partial<Record<EnergySeries, EnergySeriesData>>;

/** The fallback file, as `npm run data:eia` writes it. */
export interface EnergyFile {
  version: 1;
  source: string;
  url: string;
  license: string;
  /** When EIA last updated its bulk file, as it says. */
  updated: string;
  series: Partial<Record<EnergySeries, Omit<EnergySeriesData, 'via'>>>;
}

export const ENERGY_FILE_URL = '/data/eia-production.json';
/** The tag Mecha Jono's notes carry. */
export const ENERGY_NOTE_TOPIC = 'energy_production';
/** How long The Record may take before the file is read instead. */
export const RECORD_WAIT_MS = 6_000;

const NOTE_KIND = 30023;
const COUNTRY = /^[A-Z]{3}$/;

const isSeries = (value: unknown): value is EnergySeries => ENERGY_SERIES.includes(value as EnergySeries);

/** A country's figure, kept only when it is a real amount above zero. */
function producers(entries: Iterable<[string, unknown]>): Record<string, number> | null {
  const values: Record<string, number> = {};
  for (const [code, raw] of entries) {
    const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
    if (!COUNTRY.test(code) || typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
    values[code] = value;
  }
  return Object.keys(values).length ? values : null;
}

function seriesOf(raw: unknown, via: EnergySeriesData['via'], written?: string): EnergySeriesData | null {
  if (!raw || typeof raw !== 'object') return null;
  const { name, unit, year, values } = raw as Record<string, unknown>;
  if (typeof name !== 'string' || !name || typeof unit !== 'string' || !unit) return null;
  if (typeof year !== 'number' || !Number.isInteger(year) || !values || typeof values !== 'object') return null;
  const kept = producers(Object.entries(values));
  return kept ? { name, unit, year, values: kept, via, ...(written ? { written } : {}) } : null;
}

/** The file's series, each checked; a series that does not read is left out, never guessed. */
export function parseEnergyFile(json: unknown): EnergyProduction {
  if (!json || typeof json !== 'object' || (json as EnergyFile).version !== 1) return {};
  const series = (json as EnergyFile).series ?? {};
  const updated = (json as EnergyFile).updated;
  // EIA gives the day only: the start of that day, UTC.
  const written = typeof updated === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(updated) ? `${updated}T00:00:00.000Z` : undefined;
  const out: EnergyProduction = {};
  for (const key of ENERGY_SERIES) {
    const read = seriesOf(series[key], 'file', written);
    if (read) out[key] = read;
  }
  return out;
}

export type EnergyNote =
  | { ok: true; d: string; createdAt: number; series: EnergySeries; data: EnergySeriesData }
  | { ok: true; d: string; createdAt: number; retracted: true }
  | { ok: false; reason: string };

const tagValue = (event: Event, name: string) => event.tags.find((t) => t[0] === name)?.[1];

/**
 * One of Mecha Jono's notes: `series` (oil, gas or renewable), `name`, `unit`, `year`, and a `v` tag
 * per producing country (`["v", "USA", "13221.4"]`). `t=retracted` withdraws the series at its address.
 */
export function readEnergyNote(event: Event, publishers: readonly string[] = MECHA_JONO_KEYS): EnergyNote {
  if (event.kind !== NOTE_KIND) return { ok: false, reason: 'not a note' };
  if (!publishers.includes(event.pubkey)) return { ok: false, reason: 'not a named publisher' };
  const topics = event.tags.filter((t) => t[0] === 't').map((t) => t[1]);
  if (!topics.includes(ENERGY_NOTE_TOPIC)) return { ok: false, reason: 'not energy production' };
  const d = tagValue(event, 'd');
  if (!d) return { ok: false, reason: 'no address' };
  if (topics.includes('retracted')) return { ok: true, d, createdAt: event.created_at, retracted: true };
  const series = tagValue(event, 'series');
  if (!isSeries(series)) return { ok: false, reason: `unknown series ${String(series)}` };
  const year = Number(tagValue(event, 'year'));
  const values = Object.fromEntries(event.tags.filter((t) => t[0] === 'v' && t.length >= 3).map((t) => [t[1], t[2]]));
  const data = seriesOf({ name: tagValue(event, 'name'), unit: tagValue(event, 'unit'), year, values }, 'record', new Date(event.created_at * 1000).toISOString());
  if (!data) return { ok: false, reason: 'missing name, unit, year or figures' };
  return { ok: true, d, createdAt: event.created_at, series, data };
}

/** The newest note at each address stands; a series is the newest standing note that names it. */
export function standingSeries(notes: EnergyNote[]): EnergyProduction {
  const newest = new Map<string, Extract<EnergyNote, { ok: true }>>();
  for (const note of notes) {
    if (!note.ok) continue;
    const held = newest.get(note.d);
    if (!held || note.createdAt > held.createdAt) newest.set(note.d, note);
  }
  const out: EnergyProduction = {};
  const at: Partial<Record<EnergySeries, number>> = {};
  for (const note of newest.values()) {
    if ('retracted' in note) continue;
    if ((at[note.series] ?? -1) >= note.createdAt) continue;
    at[note.series] = note.createdAt;
    out[note.series] = note.data;
  }
  return out;
}

export interface EnergySources {
  pool?: Pick<SimplePool, 'subscribeMany'>;
  relays?: string[];
  fetchFile?: () => Promise<unknown>;
  waitMs?: number;
}

const fetchFileDefault = async (): Promise<unknown> => {
  const response = await fetch(ENERGY_FILE_URL);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

/** Mecha Jono's notes first; the file for any series they do not hold. Empty when neither answers. */
export async function readEnergyProduction(sources: EnergySources = {}): Promise<EnergyProduction> {
  const filter: Filter = { kinds: [NOTE_KIND], authors: [...MECHA_JONO_KEYS], '#t': [ENERGY_NOTE_TOPIC] };
  const events = await readNotesOnce(sources.pool ?? createRelayPool(), sources.relays ?? energyRelays(), filter, sources.waitMs ?? RECORD_WAIT_MS);
  const noted = standingSeries(events.map((event) => readEnergyNote(event)));
  if (ENERGY_SERIES.every((s) => noted[s])) return noted;
  let filed: EnergyProduction = {};
  try {
    filed = parseEnergyFile(await (sources.fetchFile ?? fetchFileDefault)());
  } catch {
    // Neither answered for this series: it is left out, and whoever reads it says so.
  }
  return { ...filed, ...noted };
}

let loaded: Promise<EnergyProduction> | null = null;

/** Read once a session; asked again after a read that found nothing. */
export function loadEnergyProduction(): Promise<EnergyProduction> {
  loaded ??= readEnergyProduction().then((production) => {
    if (!Object.keys(production).length) loaded = null;
    return production;
  });
  return loaded;
}
