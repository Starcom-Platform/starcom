/**
 * What a click on a cyber threat cluster opens (critique C5, D-CT's open list): how many of its country's addresses
 * each threat list names, in the sample the map draws, with each list's own file. Never an address: a listed
 * address is often someone's compromised device, and naming it points at them.
 */
import { describe, it, expect } from 'vitest';
import { cyberClusterNoteSet } from '../cyberClusterNote';
import type { CyberAttackCountryCluster } from '../../../../utils/cyberAttackClustering';
import type { CyberAttackData } from '../../../../types/CyberAttacks';

const listed = (ip: string, labels: string[], at: string): CyberAttackData => ({
  id: `real-blocklist-${ip}`, type: 'CyberAttacks', timestamp: new Date(at),
  metadata: { source: labels.join(', '), sourceLabels: labels, realIp: ip, confidence: 0.85 },
} as unknown as CyberAttackData);

const cluster = (over: Partial<CyberAttackCountryCluster> = {}): CyberAttackCountryCluster => ({
  countryCode: 'NLD', location: { latitude: 52.1, longitude: 5.3 }, count: 3, maxSeverity: 5,
  attackTypes: [], sources: ['Blocklist.de (SSH)', 'Spamhaus DROP (hijacked netblocks)'], newCount: 0,
  attacks: [
    listed('203.0.113.7', ['Blocklist.de (SSH)'], '2026-10-16T04:48:04.000Z'),
    listed('203.0.113.8', ['Blocklist.de (SSH)'], '2026-10-15T01:00:00.000Z'),
    listed('198.51.100.0', ['Spamhaus DROP (hijacked netblocks)'], '2026-10-16T09:00:00.000Z'),
  ],
  enrichedCount: 0, realMalwareFamilies: [], ...over,
});

describe('cyberClusterNoteSet', () => {
  it('opens a country\'s listed addresses, counted by the list that names them, most first', () => {
    const set = cyberClusterNoteSet(cluster());
    expect(set.heading).toBe('Cyber Threats · NLD');
    const note = set.notes[0];
    expect(note).toMatchObject({ id: 'cyber-NLD', kind: 'Threat lists', title: '3 listed addresses in NLD' });
    expect(note.text.split('\n').slice(0, 2)).toEqual(['Blocklist.de (SSH): 2', 'Spamhaus DROP (hijacked netblocks): 1']);
    expect(note.text).toContain('A sample of each list, taken when this build was made, drawn at the country\'s middle.');
    // The newest listing among them.
    expect(note.timeMs).toBe(Date.parse('2026-10-16T09:00:00.000Z'));
  });

  it('links each list that named them, in the same order, to its own file', () => {
    expect(cyberClusterNoteSet(cluster()).notes[0].sources).toEqual([
      'https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/blocklist_de_ssh.ipset',
      'https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/spamhaus_drop.netset',
    ]);
  });

  it('never names an address', () => {
    const { text, title } = cyberClusterNoteSet(cluster()).notes[0];
    for (const ip of ['203.0.113.7', '203.0.113.8', '198.51.100.0']) {
      expect(text).not.toContain(ip);
      expect(title).not.toContain(ip);
    }
  });

  it('says what AlienVault OTX corroborates, when it does', () => {
    const plain = cyberClusterNoteSet(cluster()).notes[0].text;
    expect(plain).not.toContain('OTX');
    const corroborated = cyberClusterNoteSet(cluster({ enrichedCount: 2, realMalwareFamilies: ['Mirai', 'Mozi'] })).notes[0].text;
    expect(corroborated).toContain('2 of them also in AlienVault OTX community pulses');
    expect(corroborated).toContain('Malware families named there: Mirai, Mozi');
  });

  it('counts one address once, and a list it does not know without a link', () => {
    const note = cyberClusterNoteSet(cluster({
      count: 1, sources: ['A list no one configured'],
      attacks: [listed('192.0.2.1', ['A list no one configured', 'A list no one configured'], 'not a date')],
    })).notes[0];
    expect(note.title).toBe('1 listed address in NLD');
    expect(note.text.split('\n')[0]).toBe('A list no one configured: 1');
    expect(note.sources).toEqual([]);
    expect(note.timeMs).toBeNull();
  });
});
