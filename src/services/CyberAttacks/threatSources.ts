// threatSources.ts — the threat lists the Cyber Threats layer draws from, and how one
// list's text becomes the indicators drawn from it.
//
// Pure: no network. It runs at BUILD time (scripts/snapshot-threats.mjs), which fetches
// the lists and writes the snapshot the app loads — see threatSnapshot.ts for why.
//
// What these lists can and cannot claim: each is a periodically refreshed list of IPs
// reported or observed as malicious — the reported SOURCE of activity, never a target,
// and not per-event telemetry. The layer says so rather than drawing arcs to invented
// victims (see RealBlocklistService.ts).
import type { AttackType, SeverityLevel } from '../../types/CyberAttacks';

export interface ThreatSourceDef {
  url: string;
  /** Human-readable list name — becomes metadata.source. */
  label: string;
  attackType: AttackType;
  baseSeverity: SeverityLevel;
  baseConfidence: number; // 0-1
  /** firehol's .ipset/.netset files carry a '# Source File Date: ...' header. */
  hasFireholHeader: boolean;
  /**
   * For a list without that header: the GitHub repo and path whose last commit dates it.
   * A list whose date cannot be established is not drawn — see STALE_LIST_MS.
   */
  datedByCommit?: { repo: string; path: string };
  /** How many of the list's IPs to draw — sampled across the whole list, not its head. */
  maxEntries: number;
}

/*
 * Two Botvrij.eu lists (C2 destination, C2 source) were here. Their own headers, read on
 * 2026-09-11: last updated 2025-04-03 and 2024-12-08 — 17 and 21 months before. Their IPs
 * were drawn as current, "active", "detected" threats. Removed; STALE_LIST_MS below keeps
 * the next list that stops updating from being drawn the same way.
 */
export const THREAT_SOURCES: ThreatSourceDef[] = [
  {
    url: 'https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/blocklist_de_ssh.ipset',
    label: 'Blocklist.de (SSH)', attackType: 'NetworkIntrusion', baseSeverity: 4, baseConfidence: 0.85,
    hasFireholHeader: true, maxEntries: 25,
  },
  {
    url: 'https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/blocklist_de_bruteforce.ipset',
    label: 'Blocklist.de (Brute Force)', attackType: 'NetworkIntrusion', baseSeverity: 4, baseConfidence: 0.85,
    hasFireholHeader: true, maxEntries: 25,
  },
  {
    url: 'https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/blocklist_de_apache.ipset',
    label: 'Blocklist.de (Apache/Web)', attackType: 'WebAttack', baseSeverity: 3, baseConfidence: 0.8,
    hasFireholHeader: true, maxEntries: 25,
  },
  {
    url: 'https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/blocklist_de_mail.ipset',
    label: 'Blocklist.de (Mail)', attackType: 'Phishing', baseSeverity: 3, baseConfidence: 0.8,
    hasFireholHeader: true, maxEntries: 25,
  },
  // AbuseIPDB's list was dropped on 11 Nov 2026 (decision D-CS, the owner): its terms bar reproducing any part of its
  // data "without express permission", on the free plan too.
  {
    url: 'https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/spamhaus_drop.netset',
    label: 'Spamhaus DROP (hijacked netblocks)', attackType: 'Malware', baseSeverity: 5, baseConfidence: 0.9,
    hasFireholHeader: true, maxEntries: 20,
  },
  {
    url: 'https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/dshield.netset',
    label: 'DShield (top attacking networks)', attackType: 'NetworkIntrusion', baseSeverity: 5, baseConfidence: 0.85,
    hasFireholHeader: true, maxEntries: 20,
  },
  {
    // A community mirror of abuse.ch's ThreatFox malware-C2 IOCs — ThreatFox's own API
    // needs a key and sends no CORS header. The mirror carries no date of its own.
    url: 'https://raw.githubusercontent.com/elliotwutingfeng/ThreatFox-IOC-IPs/main/ips.txt',
    label: 'ThreatFox IOCs (via community mirror)', attackType: 'Malware', baseSeverity: 4, baseConfidence: 0.85,
    hasFireholHeader: false, datedByCommit: { repo: 'elliotwutingfeng/ThreatFox-IOC-IPs', path: 'ips.txt' },
    maxEntries: 25,
  },
];

/** A list last updated longer ago than this is not drawn as a current threat. */
export const STALE_LIST_MS = 7 * 24 * 60 * 60 * 1000;

const DATE_HEADER_RE = /^#\s*Source File Date:\s*(.+)$/m;

/** The date a firehol list declares for itself, or null. Never the fetch time. */
export function fireholListDate(text: string): Date | null {
  const match = DATE_HEADER_RE.exec(text);
  if (!match) return null;
  const parsed = new Date(match[1].trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const IPV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** Every distinct IPv4 in a list, in the list's order — a CIDR contributes its network address. */
export function listIps(text: string): string[] {
  const ips: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const slash = line.indexOf('/');
    const ip = slash === -1 ? line : line.slice(0, slash);
    if (!IPV4.test(ip) || seen.has(ip)) continue;
    seen.add(ip);
    ips.push(ip);
  }
  return ips;
}

/**
 * `count` entries spread evenly across the whole list — not its first `count`.
 *
 * Every one of these lists is sorted by IP address. Taking the head took the
 * numerically lowest addresses: 1.x and 2.x, allocated largely in Asia-Pacific and
 * Europe. AbuseIPDB's first thirty were all 1.12–1.24.x. The layer's geography of
 * threats was the geography of low IP numbers. Deterministic, so a build is
 * reproducible from the same lists.
 */
export function sampleEvenly<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  return Array.from({ length: count }, (_, i) => items[Math.floor((i * items.length) / count)]);
}

export interface SampledList {
  def: ThreatSourceDef;
  /** How many distinct IPs the list holds — what the sample was drawn from. */
  total: number;
  ips: string[];
  /** When the list was made, by its own account. Null when it does not say. */
  listDate: Date | null;
}

export interface MergedIndicator {
  ip: string;
  attackType: AttackType;
  severity: SeverityLevel;
  confidence: number;
  /** Every list this IP was sampled from. */
  sources: string[];
  /** The newest date of the lists it appeared on. */
  listedAt: Date;
}

/**
 * One indicator per IP. An IP independently reported by more than one list is more
 * likely genuinely malicious — its severity and confidence are raised, not invented.
 * Returned interleaved by source, so that any cap on how many are drawn takes from
 * every list rather than from the first one or two.
 */
export function mergeSampledLists(lists: SampledList[]): MergedIndicator[] {
  const byIp = new Map<string, MergedIndicator>();
  const order: MergedIndicator[][] = lists.map(() => []);
  lists.forEach(({ def, ips, listDate }, li) => {
    if (!listDate) return;
    for (const ip of ips) {
      const existing = byIp.get(ip);
      if (existing) {
        existing.severity = Math.min(5, existing.severity + 1) as SeverityLevel;
        existing.confidence = Math.min(1, Math.max(existing.confidence, def.baseConfidence) + 0.05);
        existing.sources.push(def.label);
        if (listDate > existing.listedAt) existing.listedAt = listDate;
      } else {
        const indicator: MergedIndicator = {
          ip, attackType: def.attackType, severity: def.baseSeverity, confidence: def.baseConfidence,
          sources: [def.label], listedAt: listDate,
        };
        byIp.set(ip, indicator);
        order[li].push(indicator);
      }
    }
  });
  const interleaved: MergedIndicator[] = [];
  for (let i = 0; order.some((o) => i < o.length); i++) {
    for (const o of order) if (i < o.length) interleaved.push(o[i]);
  }
  return interleaved;
}
