// cyberAttackClustering.ts — pure, presentation-adjacent aggregation for CyberAttacks.
//
// Real per-IP attack data (RealBlocklistService.getRealCyberAttacks()) resolves every entry
// to its source country's centroid — that's the real precision ceiling of IP-to-country
// geolocation, not an implementation shortfall. Multiple real attacks from the same country
// therefore always land on the exact same globe coordinate; rendering one point marker per
// attack just produces exact-overlap occlusion. Clustering by country is both the fix for
// that and a more honest representation of what's actually known (country-level, not
// per-IP precision).
import type { AttackType, CyberAttackData, SeverityLevel } from '../types/CyberAttacks';
import type { OTXEnrichment } from '../types/ThreatIntelOTX';

export interface CyberAttackCountryCluster {
  countryCode: string;
  location: { latitude: number; longitude: number };
  count: number;
  maxSeverity: SeverityLevel;
  attackTypes: AttackType[]; // distinct, sorted
  sources: string[]; // distinct real source labels, as the service listed them
  newCount: number; // members with metadata.isNew === true
  attacks: CyberAttackData[]; // real underlying per-IP records — kept for a future drill-down popup
  enrichedCount: number; // members with real OTX-confirmed community pulse data — 0 until applyOTXEnrichment runs
  realMalwareFamilies: string[]; // distinct, real, from OTX pulses actually present across members
}

/** Groups real attack records by their real source country. Pure and synchronous — no
 * THREE.js or rendering concerns here, just the aggregation shape. */
export function clusterAttacksByCountry(attacks: CyberAttackData[]): CyberAttackCountryCluster[] {
  const byCountry = new Map<string, CyberAttackData[]>();

  for (const attack of attacks) {
    const countryCode = attack.trajectory.source.countryCode;
    const existing = byCountry.get(countryCode);
    if (existing) existing.push(attack);
    else byCountry.set(countryCode, [attack]);
  }

  const clusters: CyberAttackCountryCluster[] = [];
  for (const [countryCode, members] of byCountry) {
    const attackTypes = new Set<AttackType>();
    const sources = new Set<string>();
    let maxSeverity: SeverityLevel = 1;
    let newCount = 0;

    for (const attack of members) {
      attackTypes.add(attack.attack_type);
      /*
       * The labels as a list where the record carries one. Splitting the joined string
       * on ", " tore apart every label containing a comma ("AbuseIPDB (aggregated, 1
       * day)"); the split stays only as a fallback for a record without the list.
       */
      const labels = (attack.metadata as { sourceLabels?: string[] }).sourceLabels
        ?? attack.metadata.source.split(', ');
      for (const label of labels) {
        if (label) sources.add(label);
      }
      if (attack.severity > maxSeverity) maxSeverity = attack.severity;
      if (attack.metadata.isNew === true) newCount++;
    }

    clusters.push({
      countryCode,
      location: {
        latitude: members[0].trajectory.source.latitude,
        longitude: members[0].trajectory.source.longitude
      },
      count: members.length,
      maxSeverity,
      attackTypes: Array.from(attackTypes).sort(),
      sources: Array.from(sources).sort(),
      newCount,
      attacks: members,
      enrichedCount: 0,
      realMalwareFamilies: []
    });
  }

  return clusters;
}

/** Annotates already-built clusters with real OTX per-IP enrichment (see
 * OTXEnrichmentService.ts) — a separate pass, not folded into clusterAttacksByCountry
 * itself, so that function stays free of any OTX-specific knowledge. Looks each member's
 * real IP (metadata.realIp) up in the enrichment map; members with no real OTX data simply
 * don't count toward enrichedCount, they aren't fabricated. Returns new cluster objects
 * (does not mutate the input). */
export function applyOTXEnrichment(
  clusters: CyberAttackCountryCluster[],
  enrichmentByIp: Map<string, OTXEnrichment>
): CyberAttackCountryCluster[] {
  if (enrichmentByIp.size === 0) return clusters;

  return clusters.map(cluster => {
    let enrichedCount = 0;
    const malwareFamilies = new Set<string>();

    for (const attack of cluster.attacks) {
      const realIp = attack.metadata.realIp;
      const enrichment = typeof realIp === 'string' ? enrichmentByIp.get(realIp) : undefined;
      if (!enrichment) continue;
      enrichedCount++;
      for (const family of enrichment.malwareFamilies) malwareFamilies.add(family);
    }

    if (enrichedCount === 0) return cluster;
    return { ...cluster, enrichedCount, realMalwareFamilies: Array.from(malwareFamilies).sort() };
  });
}
