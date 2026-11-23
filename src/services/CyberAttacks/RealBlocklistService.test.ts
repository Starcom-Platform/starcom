/**
 * The Cyber Threats layer reading its snapshot.
 *
 * This file used to fetch the real blocklists and DB-IP's table over the network
 * from inside the unit suite, and so lived in the quarantine. The fetching now
 * happens at build time (scripts/snapshot-threats.mjs; tested through
 * threatSources/threatSnapshot), and what is tested here is what the app does
 * with the file — including when there is no file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REAL_COUNTRY_CENTROIDS } from '../../testing/realCountryCentroids.fixtures';

vi.mock('../../geopolitical/services/NationalTerritoriesService', () => ({
  nationalTerritoriesService: { getCountryCentroids: async () => REAL_COUNTRY_CENTROIDS },
}));

import {
  getRealCyberAttacks,
  getLastFetchHealth,
  markNewEntries,
  clearThreatSnapshotCache,
  type RealBlocklistEntry,
} from './RealBlocklistService';
import { THREAT_SOURCES } from './threatSources';
import { buildThreatSnapshot, THREAT_SNAPSHOT_URL } from './threatSnapshot';

const REAL = fs.readFileSync(path.join(__dirname, '__tests__/fixtures/firehol-blocklist_de_bruteforce.2026-09-11.ipset'), 'utf8');
const [ssh, brute, , mail] = THREAT_SOURCES;
const ALL_USA = () => 'USA';

function snapshotOf(countryOf: (ip: string) => string | null = ALL_USA, retrievedAt = new Date('2026-09-11T18:00:00Z'), sshText = '9.9.9.9\n8.8.8.8\n') {
  return buildThreatSnapshot({
    fetched: [
      { def: brute, text: REAL },
      { def: ssh, text: sshText },
      { def: mail, text: null, error: 'HTTP 404' },
    ],
    countryOf,
    retrievedAt,
    geolocation: { source: 'test', terms: 'test' },
    listDateOf: (f) => (f.def === brute ? new Date('2026-09-11T06:13:14Z') : f.def === ssh ? new Date('2026-09-10T09:27:26Z') : null),
  });
}

const json = (body: unknown) => ({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => JSON.parse(JSON.stringify(body)),
});
const fetchMock = vi.fn();

describe('RealBlocklistService — reading the snapshot', () => {
  beforeEach(() => { clearThreatSnapshotCache(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('reads one file from our own origin — no blocklist, no 12 MB IP table', async () => {
    fetchMock.mockResolvedValue(json(snapshotOf()));
    await getRealCyberAttacks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(THREAT_SNAPSHOT_URL);
  });

  it('places each indicator at its country\'s centroid, dated by its list', async () => {
    fetchMock.mockResolvedValue(json(snapshotOf()));
    const [first] = await getRealCyberAttacks();
    const usa = REAL_COUNTRY_CENTROIDS.get('USA')!;
    expect(first.location).toEqual({ latitude: usa.lat, longitude: usa.lng });
    expect(first.timestamp.toISOString()).toBe('2026-09-11T06:13:14.000Z');
    expect(first.trajectory.target.organization).toBe('Unknown'); // no invented victim
  });

  it('skips an indicator DB-IP could not place, rather than putting it somewhere', async () => {
    fetchMock.mockResolvedValue(json(snapshotOf((ip) => (ip === '9.9.9.9' ? null : 'USA'))));
    const attacks = await getRealCyberAttacks(1000);
    expect(attacks.some((a) => a.metadata.realIp === '9.9.9.9')).toBe(false);
    expect(attacks.some((a) => a.metadata.realIp === '8.8.8.8')).toBe(true);
  });

  it('takes a capped number from every list, not the first list alone', async () => {
    fetchMock.mockResolvedValue(json(snapshotOf()));
    const attacks = await getRealCyberAttacks(4);
    expect(attacks.map((a) => a.metadata.source)).toContain(ssh.label);
  });

  it('reports which lists it drew, how many IPs they held, which it did not and why, and the oldest date', async () => {
    fetchMock.mockResolvedValue(json(snapshotOf()));
    await getRealCyberAttacks();
    const health = getLastFetchHealth()!;
    expect(health).toMatchObject({ total: 3, succeeded: 2, listedIps: 1312 + 2 });
    expect(health.failedSources).toEqual([expect.stringMatching(/^Blocklist\.de \(Mail\) — could not be fetched \(HTTP 404\)/)]);
    expect(health.asOf.toISOString()).toBe('2026-09-10T09:27:26.000Z');
  });

  it('says so when the build carries no snapshot — it returns no attacks', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, headers: new Headers(), json: async () => ({}) });
    await expect(getRealCyberAttacks()).rejects.toThrow(/carries no threat snapshot/);
  });

  describe('what counts as new', () => {
    beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); });
    afterEach(() => { vi.useRealTimers(); });
    const reread = () => vi.setSystemTime(Date.now() + 31 * 60 * 1000); // past the re-read interval

    it('nothing, on a re-read of the same snapshot', async () => {
      fetchMock.mockResolvedValue(json(snapshotOf()));
      await getRealCyberAttacks(1000);
      reread();
      const again = await getRealCyberAttacks(1000);
      expect(fetchMock).toHaveBeenCalledTimes(2); // it really was read again
      expect(again.some((a) => a.metadata.isNew)).toBe(false);
    });

    it('what a later snapshot added, and only that', async () => {
      fetchMock.mockResolvedValueOnce(json(snapshotOf()));
      await getRealCyberAttacks(1000);
      reread();
      fetchMock.mockResolvedValueOnce(json(snapshotOf(ALL_USA, new Date('2026-09-12T18:00:00Z'), '9.9.9.9\n8.8.8.8\n7.7.7.7\n')));
      const later = await getRealCyberAttacks(1000);
      expect(later.filter((a) => a.metadata.isNew).map((a) => a.metadata.realIp)).toEqual(['7.7.7.7']);
    });
  });
});

describe('markNewEntries', () => {
  const entry = (ip: string): RealBlocklistEntry => ({
    ip, country: 'USA', attackType: 'Unknown', severity: 3, confidence: 0.9, sources: ['x'], observedAt: new Date(0), isNew: false,
  });

  it('marks nothing new on a cold start — no previous snapshot to compare with', () => {
    expect(markNewEntries([entry('1.1.1.1')], null).some((e) => e.isNew)).toBe(false);
  });

  it('marks an IP new only if the previous snapshot did not have it', () => {
    const marked = markNewEntries([entry('1.1.1.1'), entry('2.2.2.2')], new Set(['1.1.1.1']));
    expect(marked.map((e) => e.isNew)).toEqual([false, true]);
  });
});
