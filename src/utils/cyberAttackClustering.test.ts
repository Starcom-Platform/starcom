import { describe, it, expect } from 'vitest';
import { clusterAttacksByCountry, applyOTXEnrichment } from './cyberAttackClustering';
import type { CyberAttackData, SeverityLevel } from '../types/CyberAttacks';
import type { OTXEnrichment } from '../types/ThreatIntelOTX';

function makeAttack(overrides: {
  id?: string;
  countryCode?: string;
  lat?: number;
  lng?: number;
  severity?: SeverityLevel;
  attackType?: CyberAttackData['attack_type'];
  source?: string;
  isNew?: boolean;
  realIp?: string;
} = {}): CyberAttackData {
  const {
    id = `attack-${Math.random()}`,
    countryCode = 'USA',
    lat = 38,
    lng = -97,
    severity = 3,
    attackType = 'NetworkIntrusion',
    source = 'Test Source',
    isNew = false,
    realIp = '1.2.3.4'
  } = overrides;

  return {
    id,
    type: 'CyberAttacks',
    location: { latitude: lat, longitude: lng },
    timestamp: new Date('2026-08-14T00:00:00Z'),
    metadata: { source, confidence: 0.8, isNew, realIp },
    priority: 'high',
    status: 'active',
    attack_type: attackType,
    attack_vector: 'Network',
    attack_phase: 'Initial_Access',
    severity,
    attack_status: 'detected',
    trajectory: {
      source: { latitude: lat, longitude: lng, countryCode, confidence: 0.8 },
      target: { latitude: lat, longitude: lng, countryCode, organization: 'Unknown', sector: 'Other', criticality: 0 },
      duration: 0
    },
    timeline: { firstDetected: new Date('2026-08-14T00:00:00Z'), lastSeen: new Date('2026-08-14T00:00:00Z') },
    technical_data: { mitre_tactic: [], protocols: [], ports: [], systems_affected: 0 }
  } as unknown as CyberAttackData;
}

describe('clusterAttacksByCountry (bug-injection verified)', () => {
  it('returns an empty array for empty input', () => {
    expect(clusterAttacksByCountry([])).toEqual([]);
  });

  it('groups a single country into one cluster with the right count', () => {
    const attacks = [makeAttack({ countryCode: 'USA' }), makeAttack({ countryCode: 'USA' })];
    const clusters = clusterAttacksByCountry(attacks);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].countryCode).toBe('USA');
    expect(clusters[0].count).toBe(2);
  });

  it('splits attacks from different countries into separate clusters', () => {
    const attacks = [makeAttack({ countryCode: 'USA' }), makeAttack({ countryCode: 'CHN' })];
    const clusters = clusterAttacksByCountry(attacks);
    expect(clusters.map(c => c.countryCode).sort()).toEqual(['CHN', 'USA']);
  });

  it('takes the real maximum severity across a cluster\'s members, not the first or last', () => {
    const attacks = [
      makeAttack({ countryCode: 'USA', severity: 2 }),
      makeAttack({ countryCode: 'USA', severity: 5 }),
      makeAttack({ countryCode: 'USA', severity: 3 })
    ];
    const clusters = clusterAttacksByCountry(attacks);
    expect(clusters[0].maxSeverity).toBe(5);
  });

  it('collects distinct, sorted attack types', () => {
    const attacks = [
      makeAttack({ countryCode: 'USA', attackType: 'Malware' }),
      makeAttack({ countryCode: 'USA', attackType: 'DDoS' }),
      makeAttack({ countryCode: 'USA', attackType: 'Malware' })
    ];
    const clusters = clusterAttacksByCountry(attacks);
    expect(clusters[0].attackTypes).toEqual(['DDoS', 'Malware']);
  });

  it('splits and dedupes comma-joined per-entry source labels into a distinct, sorted list', () => {
    const attacks = [
      makeAttack({ countryCode: 'USA', source: 'Blocklist.de (SSH), AbuseIPDB' }),
      makeAttack({ countryCode: 'USA', source: 'AbuseIPDB' })
    ];
    const clusters = clusterAttacksByCountry(attacks);
    expect(clusters[0].sources).toEqual(['AbuseIPDB', 'Blocklist.de (SSH)']);
  });

  it('counts only members actually marked new, not the whole cluster', () => {
    const attacks = [
      makeAttack({ countryCode: 'USA', isNew: true }),
      makeAttack({ countryCode: 'USA', isNew: false }),
      makeAttack({ countryCode: 'USA', isNew: true })
    ];
    const clusters = clusterAttacksByCountry(attacks);
    expect(clusters[0].newCount).toBe(2);
    expect(clusters[0].count).toBe(3);
  });

  it('uses the real source centroid coordinates for the cluster location', () => {
    const attacks = [makeAttack({ countryCode: 'FRA', lat: 46, lng: 2 })];
    const clusters = clusterAttacksByCountry(attacks);
    expect(clusters[0].location).toEqual({ latitude: 46, longitude: 2 });
  });

  it('keeps the real underlying per-IP records for a future drill-down, not a summary-only shape', () => {
    const attacks = [makeAttack({ countryCode: 'USA' }), makeAttack({ countryCode: 'USA' })];
    const clusters = clusterAttacksByCountry(attacks);
    expect(clusters[0].attacks).toHaveLength(2);
    expect(clusters[0].attacks[0]).toBe(attacks[0]);
  });

  it('does not throw on a falsy/missing countryCode — buckets it rather than crashing', () => {
    const attacks = [makeAttack({ countryCode: '' })];
    expect(() => clusterAttacksByCountry(attacks)).not.toThrow();
    expect(clusterAttacksByCountry(attacks)[0].countryCode).toBe('');
  });

  it('defaults enrichedCount to 0 and realMalwareFamilies to empty before applyOTXEnrichment runs', () => {
    const attacks = [makeAttack({ countryCode: 'USA' })];
    const clusters = clusterAttacksByCountry(attacks);
    expect(clusters[0].enrichedCount).toBe(0);
    expect(clusters[0].realMalwareFamilies).toEqual([]);
  });
});

function makeEnrichment(ip: string, malwareFamilies: string[] = []): OTXEnrichment {
  return { ip, pulseCount: malwareFamilies.length, pulses: [], malwareFamilies };
}

describe('applyOTXEnrichment (bug-injection verified)', () => {
  it('returns clusters unchanged when the enrichment map is empty', () => {
    const clusters = clusterAttacksByCountry([makeAttack({ countryCode: 'USA' })]);
    const result = applyOTXEnrichment(clusters, new Map());
    expect(result).toBe(clusters);
  });

  it('counts only members with real OTX-confirmed data, not the whole cluster', () => {
    const attacks = [
      makeAttack({ countryCode: 'USA', realIp: '1.1.1.1' }),
      makeAttack({ countryCode: 'USA', realIp: '2.2.2.2' }),
      makeAttack({ countryCode: 'USA', realIp: '3.3.3.3' })
    ];
    const clusters = clusterAttacksByCountry(attacks);
    const enrichmentByIp = new Map([['1.1.1.1', makeEnrichment('1.1.1.1', ['Mirai'])]]);

    const result = applyOTXEnrichment(clusters, enrichmentByIp);
    expect(result[0].enrichedCount).toBe(1);
    expect(result[0].count).toBe(3);
  });

  it('dedupes and sorts real malware families collected across enriched members', () => {
    const attacks = [
      makeAttack({ countryCode: 'USA', realIp: '1.1.1.1' }),
      makeAttack({ countryCode: 'USA', realIp: '2.2.2.2' })
    ];
    const clusters = clusterAttacksByCountry(attacks);
    const enrichmentByIp = new Map([
      ['1.1.1.1', makeEnrichment('1.1.1.1', ['Zeus', 'Mirai'])],
      ['2.2.2.2', makeEnrichment('2.2.2.2', ['Mirai', 'Emotet'])]
    ]);

    const result = applyOTXEnrichment(clusters, enrichmentByIp);
    expect(result[0].realMalwareFamilies).toEqual(['Emotet', 'Mirai', 'Zeus']);
  });

  it('leaves a cluster with no real matches unmodified rather than a fabricated zero-state', () => {
    const clusters = clusterAttacksByCountry([makeAttack({ countryCode: 'USA', realIp: '9.9.9.9' })]);
    const result = applyOTXEnrichment(clusters, new Map([['1.1.1.1', makeEnrichment('1.1.1.1')]]));
    expect(result[0]).toBe(clusters[0]);
  });

  it('does not mutate the input clusters', () => {
    const clusters = clusterAttacksByCountry([makeAttack({ countryCode: 'USA', realIp: '1.1.1.1' })]);
    applyOTXEnrichment(clusters, new Map([['1.1.1.1', makeEnrichment('1.1.1.1', ['Mirai'])]]));
    expect(clusters[0].enrichedCount).toBe(0);
  });
});

/**
 * Source labels contain commas — "AbuseIPDB (aggregated, 1 day)" — and this read them
 * by splitting the record's comma-joined `source` string, which tore them in half. It
 * showed the moment a mark grew a tooltip: "· 1 day), AbuseIPDB (aggregated, ...".
 */
describe('source labels that contain commas', () => {
  const withLabels = (labels: string[]) => ({
    id: 'a', type: 'CyberAttacks', attack_type: 'DDoS', severity: 3,
    metadata: { source: labels.join(', '), sourceLabels: labels, confidence: 0.9 },
    trajectory: { source: { latitude: 1, longitude: 2, countryCode: 'USA', confidence: 0.9 } },
  } as never);

  it('keeps a label whole', () => {
    const [cluster] = clusterAttacksByCountry([withLabels(['AbuseIPDB (aggregated, 1 day)', 'Blocklist.de (SSH)'])]);
    expect(cluster.sources).toEqual(['AbuseIPDB (aggregated, 1 day)', 'Blocklist.de (SSH)']);
  });

  it('still reads a record that carries no list, as records from before this did', () => {
    const legacy = {
      id: 'b', type: 'CyberAttacks', attack_type: 'DDoS', severity: 3,
      metadata: { source: 'Spamhaus DROP, Blocklist.de (Mail)', confidence: 0.9 },
      trajectory: { source: { latitude: 1, longitude: 2, countryCode: 'USA', confidence: 0.9 } },
    } as never;
    const [cluster] = clusterAttacksByCountry([legacy]);
    // Sorted, as this has always returned them.
    expect(cluster.sources).toEqual(['Blocklist.de (Mail)', 'Spamhaus DROP']);
  });
});
