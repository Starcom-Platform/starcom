// OTXEnrichmentService.ts — real, per-IP threat-intel enrichment for CyberAttacks entries
// via AlienVault OTX's indicator lookup. Verified live before building this: unlike OTX's
// bulk "pulses/subscribed" feed (requires an API key, 403 without one),
// otx.alienvault.com/api/v1/indicators/IPv4/{ip}/general is real, keyless, and CORS-open
// (confirmed Access-Control-Allow-Origin: * on a live response) — tested against a real IP
// already coming out of RealBlocklistService's own blocklist_de_ssh source and got back 13
// real community "pulses" with real malware_families/attack_ids/targeted_countries.
//
// This is a per-indicator lookup, not a bulk feed — enriching every real attack IP in a
// refresh cycle means one real request per IP. Deliberately capped (maxIPs) and
// concurrency-bounded (small batches, not 150+ simultaneous requests) to stay a good
// citizen of a free public service, and cached longer (24h) than the 30-minute blocklist
// refresh cycle — OTX community pulse data for a given IP doesn't change nearly as fast as
// blocklist membership does, so re-querying it every 30 minutes for the same recurring IPs
// would be wasted real requests for no new real signal.
import { sourceAllowed } from '../../legal/buildProfile';
import axios from 'axios';
import { createLogger } from '@utils/logger';
import type { OTXEnrichment, OTXPulse } from '../../types/ThreatIntelOTX';

const log = createLogger({ prefix: 'OTXEnrichmentService' });

const OTX_BASE_URL = 'https://otx.alienvault.com/api/v1/indicators/IPv4';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_IPS = 30; // bounded real per-cycle cost, not every IP needs enrichment to convey real signal
const MAX_PULSES_PER_IP = 10; // a real IP can carry 50+ pulses; capped subset, not fabricated truncation
const BATCH_SIZE = 8; // bounded concurrency

interface RawOTXPulse {
  id?: unknown;
  name?: unknown;
  malware_families?: unknown;
  attack_ids?: unknown;
  targeted_countries?: unknown;
  industries?: unknown;
  TLP?: unknown;
}

interface RawOTXResponse {
  pulse_info?: {
    count?: unknown;
    pulses?: unknown;
  };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

/** Exported for direct unit testing — parses OTX's real response shape into our own real,
 * honestly-capped enrichment record. Defensive against missing/malformed fields (the API
 * response isn't a contract we control) rather than throwing. */
/**
 * Whether OTX may be drawn (decision D-CS, CS9; the owner, 11 Nov 2026): not until LevelBlue grants it in writing. Its
 * user agreement bars displaying or distributing "all or any portion of OTX", even for free. No switch ever offered
 * the enrichment ring; this closes the path a stored setting could still open, and keeps the code for the day it is
 * permitted.
 */
export function otxPermitted(): boolean {
  return OTX_GRANTED_IN_WRITING && sourceAllowed('otx');
}

/** Set true only once LevelBlue grants it in writing (CS9). */
const OTX_GRANTED_IN_WRITING = false;

export function parseOTXResponse(data: unknown, ip: string, maxPulses: number = MAX_PULSES_PER_IP): OTXEnrichment | null {
  if (!data || typeof data !== 'object') return null;
  const pulseInfo = (data as RawOTXResponse).pulse_info;
  if (!pulseInfo || typeof pulseInfo !== 'object') return null;

  const rawPulses = Array.isArray(pulseInfo.pulses) ? pulseInfo.pulses : [];
  const pulses: OTXPulse[] = rawPulses.slice(0, maxPulses).map((raw: RawOTXPulse) => ({
    id: typeof raw.id === 'string' ? raw.id : '',
    name: typeof raw.name === 'string' ? raw.name : '',
    malwareFamilies: toStringArray(raw.malware_families),
    attackIds: toStringArray(raw.attack_ids),
    targetedCountries: toStringArray(raw.targeted_countries),
    industries: toStringArray(raw.industries),
    tlp: typeof raw.TLP === 'string' ? raw.TLP : ''
  }));

  const malwareFamilies = Array.from(new Set(pulses.flatMap(p => p.malwareFamilies))).sort();

  return {
    ip,
    pulseCount: typeof pulseInfo.count === 'number' ? pulseInfo.count : pulses.length,
    pulses,
    malwareFamilies
  };
}

async function fetchOneIP(ip: string): Promise<OTXEnrichment | null> {
  try {
    const response = await axios.get(`${OTX_BASE_URL}/${ip}/general`, { timeout: 10000 });
    return parseOTXResponse(response.data, ip);
  } catch (error) {
    log.warn(`OTX lookup failed, skipping: ${ip}`, error);
    return null;
  }
}

interface CacheEntry {
  enrichment: OTXEnrichment | null;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

function isCacheFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

/** Real, per-IP OTX enrichment for a bounded subset of real attack IPs. Cache-first (24h
 * TTL, independent of the caller's own refresh cadence); a per-IP failure is skipped, not
 * fatal to the batch (matches RealBlocklistService.fetchOneSource's resilience pattern). */
export async function enrichWithOTX(ips: string[], maxIPs: number = DEFAULT_MAX_IPS): Promise<Map<string, OTXEnrichment>> {
  const result = new Map<string, OTXEnrichment>();
  const toFetch: string[] = [];

  for (const ip of ips.slice(0, maxIPs)) {
    const cached = cache.get(ip);
    if (cached && isCacheFresh(cached)) {
      if (cached.enrichment) result.set(ip, cached.enrichment);
    } else {
      toFetch.push(ip);
    }
  }

  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);
    const enrichments = await Promise.all(batch.map(fetchOneIP));
    batch.forEach((ip, idx) => {
      const enrichment = enrichments[idx];
      cache.set(ip, { enrichment, fetchedAt: Date.now() });
      if (enrichment) result.set(ip, enrichment);
    });
  }

  return result;
}
