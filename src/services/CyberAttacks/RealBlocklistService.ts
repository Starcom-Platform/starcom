// RealBlocklistService.ts — the Cyber Threats layer's indicators, from the snapshot this
// build carries (see threatSnapshot.ts), placed at each country's centroid.
//
// ─── WHAT THIS REPLACED ────────────────────────────────────────────────────
//
// This fetched eight public blocklists from GitHub in the browser, then DB-IP's whole
// IPv4 country table — 12.3 MB per activation — to place about 220 addresses. It also
// drew the wrong 220: each list is sorted by IP, and it took each list's head, so the
// map showed the countries that own low-numbered address space. Measured against every
// IP on the lists (98,779), China was 8% of listed sources; the head-of-list sample made
// it 31%, and the US 9% against a real 31%. And it dated everything by fetch time, so
// two lists last updated 17 and 21 months earlier were drawn as current.
//
// What these indicators can and cannot claim: an IP was reported or observed as
// malicious — the reported SOURCE, never a target. So `trajectory.target` is the same
// location with criticality 0 and organisation 'Unknown': no invented victim.
import { sourceAllowed } from '../../legal/buildProfile';
import { nationalTerritoriesService } from '../../geopolitical/services/NationalTerritoriesService';
import type { AttackType, CyberAttackData, SeverityLevel } from '../../types/CyberAttacks';
import { THREAT_SNAPSHOT_URL, readThreatSnapshot, type LoadedThreatSnapshot } from './threatSnapshot';

/** How often the snapshot is re-read. It changes only on a deploy. */
export const CACHE_TTL_MS = 30 * 60 * 1000;

export interface RealBlocklistEntry {
  ip: string;
  /** ISO3, or null when DB-IP places the address nowhere. */
  country: string | null;
  attackType: AttackType;
  severity: SeverityLevel;
  confidence: number;
  sources: string[];
  /** The newest date of the lists it appeared on — the list's date, never a fetch time. */
  observedAt: Date;
  /** Absent from the previous snapshot this session read (see markNewEntries). */
  isNew: boolean;
}

/** Marks each entry `isNew` if its IP was absent from the previous snapshot read this
 * session. `previousIps === null` means there is no baseline — nothing is marked new,
 * since "new relative to what?" has no honest answer on a cold start. */
export function markNewEntries(current: RealBlocklistEntry[], previousIps: Set<string> | null): RealBlocklistEntry[] {
  if (previousIps === null) return current;
  return current.map(entry => ({ ...entry, isNew: !previousIps.has(entry.ip) }));
}

export interface SourceHealth {
  total: number;
  /** Lists drawn from. */
  succeeded: number;
  /** Lists not drawn, each with why: "<label> — <reason>". */
  failedSources: string[];
  /** The date of the oldest list drawn — the picture's age. */
  asOf: Date;
  /** Distinct IPs on the lists drawn from — what the drawn sample is a sample of. */
  listedIps: number;
}

let cache: { snapshot: LoadedThreatSnapshot; entries: RealBlocklistEntry[]; loadedAt: number } | null = null;
let inflight: Promise<RealBlocklistEntry[]> | null = null;
let previousIpSet: Set<string> | null = null;
let lastRetrievedAt: number | null = null;

/** Which lists the picture came from and which it did not, or null before the first load. */
export function getLastFetchHealth(): SourceHealth | null {
  if (!cache) return null;
  const { lists, asOf } = cache.snapshot;
  const notDrawn = lists.filter((l) => l.status !== 'drawn');
  return {
    total: lists.length,
    succeeded: lists.length - notDrawn.length,
    failedSources: notDrawn.map((l) => `${l.label} — ${l.reason ?? l.status}`),
    asOf: new Date(asOf),
    listedIps: lists.filter((l) => l.status === 'drawn').reduce((n, l) => n + (l.total ?? 0), 0),
  };
}

async function loadEntries(): Promise<RealBlocklistEntry[]> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.entries;
  inflight ??= (async () => {
    // The commercial build carries no threat snapshot: its lists' terms do not allow it (D-CS, CS1).
    if (!sourceAllowed('dshield') && !sourceAllowed('firehol')) {
      throw new Error('this build does not carry the threat lists: their terms do not allow it');
    }
    const res = await fetch(THREAT_SNAPSHOT_URL);
    // A dev server answers a missing file with index.html and a 200 — see GDELTEventService.
    const isJson = (res.headers.get('content-type') ?? '').includes('json');
    if (res.status === 404 || (res.ok && !isJson)) {
      throw new Error('this build carries no threat snapshot — the lists could not be fetched when it was built');
    }
    if (!res.ok) throw new Error(`the threat snapshot could not be loaded (HTTP ${res.status})`);
    const snapshot = readThreatSnapshot(await res.json());
    const raw: RealBlocklistEntry[] = snapshot.indicators.map((i) => ({
      ip: i.ip, country: i.country, attackType: i.attackType, severity: i.severity,
      confidence: i.confidence, sources: i.sources, observedAt: i.listedAt, isNew: false,
    }));
    // Only a different snapshot has anything new in it; a re-read of the same one does not.
    const sameSnapshot = lastRetrievedAt === snapshot.retrievedAt;
    const entries = sameSnapshot ? (cache?.entries ?? raw) : markNewEntries(raw, previousIpSet);
    if (!sameSnapshot) {
      previousIpSet = new Set(raw.map((e) => e.ip));
      lastRetrievedAt = snapshot.retrievedAt;
    }
    cache = { snapshot, entries, loadedAt: Date.now() };
    return entries;
  })().finally(() => { inflight = null; });
  return inflight;
}

/**
 * Indicators as CyberAttackData, each at its country's centroid. The snapshot is
 * interleaved by list, so `limit` takes from every list rather than the first few.
 */
export async function getRealCyberAttacks(limit = 50): Promise<CyberAttackData[]> {
  const entries = await loadEntries();
  if (entries.length === 0) return [];
  const centroids = await nationalTerritoriesService.getCountryCentroids();

  const attacks: CyberAttackData[] = [];
  for (const entry of entries) {
    const centroid = entry.country ? centroids.get(entry.country) : undefined;
    if (!entry.country || !centroid) continue; // no location resolved — skipped, not faked

    const location = { latitude: centroid.lat, longitude: centroid.lng };
    attacks.push({
      id: `real-blocklist-${entry.ip}-${entry.observedAt.getTime()}`,
      type: 'CyberAttacks',
      location,
      timestamp: entry.observedAt,
      metadata: {
        source: entry.sources.join(', '),
        /*
         * The labels themselves, because several contain a comma — "AbuseIPDB
         * (aggregated, 1 day)" — and the consumer that re-split the joined string on
         * ", " tore them in half. Visible the moment a mark grew a tooltip:
         * "· 1 day), AbuseIPDB (aggregated, Blocklist.de (Apache/Web)".
         */
        sourceLabels: entry.sources,
        confidence: entry.confidence,
        analyst: 'RealBlocklistService',
        realIp: entry.ip,
        isNew: entry.isNew
      },
      priority: entry.severity >= 4 ? 'critical' : entry.severity >= 3 ? 'high' : 'medium',
      status: 'active',

      attack_type: entry.attackType,
      attack_vector: 'Network',
      attack_phase: 'Initial_Access',
      severity: entry.severity,
      attack_status: 'detected',

      trajectory: {
        source: { ...location, countryCode: entry.country, organization: entry.sources.join(', '), confidence: entry.confidence },
        // No target is knowable from a blocklist entry — same location, criticality 0.
        target: { ...location, countryCode: entry.country, organization: 'Unknown', sector: 'Other', criticality: 0 },
        duration: 0 // unknown — not fabricated
      },

      timeline: { firstDetected: entry.observedAt, lastSeen: entry.observedAt },
      technical_data: { mitre_tactic: [], protocols: [], ports: [], systems_affected: 0 }
    });

    if (attacks.length >= limit) break;
  }
  return attacks;
}

/** Test-only. */
export function clearThreatSnapshotCache(): void {
  cache = null;
  inflight = null;
  previousIpSet = null;
  lastRetrievedAt = null;
}
