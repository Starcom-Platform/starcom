// threatSnapshot.ts — the threat indicators the Cyber Threats layer loads, built at
// build time by scripts/snapshot-threats.mjs.
//
// ─── WHY A SNAPSHOT ────────────────────────────────────────────────────────
//
// The layer used ~220 IPs. To get them, every visitor downloaded eight whole blocklists
// from GitHub and then DB-IP's entire IPv4 country table — 12.3 MB from
// raw.githubusercontent.com on each activation, measured 2026-09-11 — to look up the
// country of those ~220 addresses. Built once, the same indicators, already located,
// are a few kilobytes from our own origin.
//
// What it costs is freshness: it is as old as the deploy, and the lists are older
// still — each is dated by its own header (or its repo's last commit), never by when
// it was fetched. The snapshot records every list's date and why any list was not
// drawn, and the card states the age of the oldest list it drew from.
import {
  STALE_LIST_MS,
  listIps,
  mergeSampledLists,
  sampleEvenly,
  type SampledList,
  type ThreatSourceDef,
} from './threatSources';
import type { AttackType, SeverityLevel } from '../../types/CyberAttacks';

export const THREAT_SNAPSHOT_SCHEMA = 'starcom.threat-indicators' as const;
/** 1: first version. */
export const THREAT_SNAPSHOT_VERSION = 1 as const;
export const THREAT_SNAPSHOT_URL = '/data/threat-indicators.json';

/** drawn — sampled into the map; the others say why a list is not on it. */
export type ThreatListStatus = 'drawn' | 'failed' | 'stale' | 'undated';

export interface ThreatSnapshotList {
  label: string;
  url: string;
  status: ThreatListStatus;
  /** ISO date the list declares for itself, or null. */
  listDate: string | null;
  /** Distinct IPs the list held; null when it was not read. */
  total: number | null;
  /** How many of them are drawn. */
  sampled: number;
  /** Why a list is not drawn, in words. */
  reason: string | null;
}

export interface ThreatSnapshotIndicator {
  ip: string;
  /** ISO 3166-1 alpha-3, or null when DB-IP places the address nowhere. */
  country: string | null;
  attackType: AttackType;
  severity: SeverityLevel;
  confidence: number;
  sources: string[];
  /** ISO: the newest date among the lists this IP appeared on. */
  listedAt: string;
}

export interface ThreatSnapshot {
  schema: typeof THREAT_SNAPSHOT_SCHEMA;
  version: typeof THREAT_SNAPSHOT_VERSION;
  /** When the build fetched the lists. Not the data's time — see LoadedThreatSnapshot.asOf. */
  retrievedAt: string;
  geolocation: { source: string; terms: string } | null;
  lists: ThreatSnapshotList[];
  indicators: ThreatSnapshotIndicator[];
}

export interface FetchedList {
  def: ThreatSourceDef;
  /** The list's text, or null when it could not be fetched. */
  text: string | null;
  /** Why it could not be fetched. */
  error?: string;
  /** For a list dated by its repository: that repository's last commit to it. */
  commitDate?: Date | null;
}

export class ThreatSnapshotError extends Error {}

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Pure. `countryOf` maps an IP to ISO3 or null; the build supplies DB-IP's table.
 */
export function buildThreatSnapshot(input: {
  fetched: FetchedList[];
  countryOf: (ip: string) => string | null;
  retrievedAt: Date;
  geolocation: ThreatSnapshot['geolocation'];
  listDateOf: (f: FetchedList) => Date | null;
}): ThreatSnapshot {
  const lists: ThreatSnapshotList[] = [];
  const drawn: SampledList[] = [];
  for (const f of input.fetched) {
    const base = { label: f.def.label, url: f.def.url };
    if (f.text === null) {
      lists.push({ ...base, status: 'failed', listDate: null, total: null, sampled: 0, reason: `could not be fetched (${f.error ?? 'unknown error'})` });
      continue;
    }
    const listDate = input.listDateOf(f);
    const ips = listIps(f.text);
    if (!listDate) {
      lists.push({ ...base, status: 'undated', listDate: null, total: ips.length, sampled: 0, reason: 'does not say when it was made, so its age cannot be stated' });
      continue;
    }
    if (input.retrievedAt.getTime() - listDate.getTime() > STALE_LIST_MS) {
      lists.push({ ...base, status: 'stale', listDate: listDate.toISOString(), total: ips.length, sampled: 0, reason: `last updated ${day(listDate)} — too old to draw as a current threat` });
      continue;
    }
    const sample = sampleEvenly(ips, f.def.maxEntries);
    drawn.push({ def: f.def, total: ips.length, ips: sample, listDate });
    lists.push({ ...base, status: 'drawn', listDate: listDate.toISOString(), total: ips.length, sampled: sample.length, reason: null });
  }
  const indicators = mergeSampledLists(drawn).map((m) => ({
    ip: m.ip,
    country: input.countryOf(m.ip),
    attackType: m.attackType,
    severity: m.severity,
    confidence: m.confidence,
    sources: m.sources,
    listedAt: m.listedAt.toISOString(),
  }));
  return {
    schema: THREAT_SNAPSHOT_SCHEMA,
    version: THREAT_SNAPSHOT_VERSION,
    retrievedAt: input.retrievedAt.toISOString(),
    geolocation: input.geolocation,
    lists,
    indicators,
  };
}

export interface LoadedThreatSnapshot {
  indicators: Array<Omit<ThreatSnapshotIndicator, 'listedAt'> & { listedAt: Date }>;
  lists: ThreatSnapshotList[];
  /**
   * The data's time: the date of the OLDEST list drawn. The picture is a merge of
   * lists of different ages, and it is as old as its oldest part.
   */
  asOf: number;
  retrievedAt: number;
}

/** Read a snapshot, or say exactly why it cannot be read. */
export function readThreatSnapshot(json: unknown): LoadedThreatSnapshot {
  const s = json as Partial<ThreatSnapshot> | null;
  if (!s || s.schema !== THREAT_SNAPSHOT_SCHEMA || s.version !== THREAT_SNAPSHOT_VERSION) {
    throw new ThreatSnapshotError(`not a ${THREAT_SNAPSHOT_SCHEMA} v${THREAT_SNAPSHOT_VERSION} snapshot`);
  }
  if (!Array.isArray(s.lists) || !Array.isArray(s.indicators)) {
    throw new ThreatSnapshotError('snapshot has no lists or no indicators');
  }
  const drawnDates = s.lists
    .filter((l) => l.status === 'drawn' && l.listDate)
    .map((l) => Date.parse(l.listDate as string))
    .filter(Number.isFinite);
  if (drawnDates.length === 0) throw new ThreatSnapshotError('snapshot draws from no list');
  const indicators = s.indicators.map((ind, i) => {
    const listedAt = new Date(ind?.listedAt ?? '');
    if (!ind || typeof ind.ip !== 'string' || !Array.isArray(ind.sources) || Number.isNaN(listedAt.getTime())) {
      throw new ThreatSnapshotError(`snapshot indicator ${i} is malformed`);
    }
    return { ...ind, listedAt };
  });
  return {
    indicators,
    lists: s.lists,
    asOf: Math.min(...drawnDates),
    retrievedAt: Date.parse(s.retrievedAt ?? ''),
  };
}
