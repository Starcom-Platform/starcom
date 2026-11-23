/**
 * The threat snapshot: which lists it draws, which it will not, and the age it
 * gives the picture. Built from a real list (the firehol fixture) so the
 * sampling and dating run on data a list actually served.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { THREAT_SOURCES, fireholListDate, STALE_LIST_MS } from '../threatSources';
import { buildThreatSnapshot, readThreatSnapshot, ThreatSnapshotError, type FetchedList } from '../threatSnapshot';

const REAL = fs.readFileSync(path.join(__dirname, 'fixtures/firehol-blocklist_de_bruteforce.2026-09-11.ipset'), 'utf8');
const REAL_DATE = new Date('2026-09-11T06:13:14Z');
const BUILT = new Date('2026-09-11T18:00:00Z');
const [ssh, brute, apache, mail] = THREAT_SOURCES;

const build = (fetched: FetchedList[], dates: Map<FetchedList['def'], Date | null>) => buildThreatSnapshot({
  fetched,
  countryOf: (ip) => (ip.startsWith('1.') ? 'CHN' : 'USA'),
  retrievedAt: BUILT,
  geolocation: { source: 'test', terms: 'test' },
  listDateOf: (f) => (f.def.hasFireholHeader ? dates.get(f.def) ?? fireholListDate(f.text ?? '') : null),
});

describe('which lists a snapshot draws', () => {
  const snapshot = build([
    { def: brute, text: REAL },
    { def: ssh, text: null, error: 'HTTP 404' },
    { def: apache, text: '1.2.3.4\n' },                       // no date header
    { def: mail, text: '5.6.7.8\n' },
  ], new Map([[mail, new Date(BUILT.getTime() - STALE_LIST_MS - 1)]]));
  const status = Object.fromEntries(snapshot.lists.map((l) => [l.label, l]));

  it('draws a dated, recent list — sampled to its cap, with its size recorded', () => {
    expect(status[brute.label]).toMatchObject({ status: 'drawn', total: 1312, sampled: brute.maxEntries, listDate: REAL_DATE.toISOString() });
  });

  it('records a list that could not be fetched, and why', () => {
    expect(status[ssh.label]).toMatchObject({ status: 'failed', sampled: 0 });
    expect(status[ssh.label].reason).toMatch(/HTTP 404/);
  });

  it('does not draw a list that does not say when it was made', () => {
    expect(status[apache.label]).toMatchObject({ status: 'undated', sampled: 0 });
  });

  /** Two lists last updated 17 and 21 months earlier were drawn as current threats. */
  it('does not draw a list more than a week old, and says when it was last updated', () => {
    expect(status[mail.label]).toMatchObject({ status: 'stale', sampled: 0 });
    expect(status[mail.label].reason).toMatch(/last updated \d{4}-\d{2}-\d{2}/);
  });

  it('carries indicators only from the list it drew, each placed', () => {
    expect(snapshot.indicators).toHaveLength(brute.maxEntries);
    expect(snapshot.indicators.every((i) => i.sources.length === 1 && i.sources[0] === brute.label)).toBe(true);
    expect(snapshot.indicators.every((i) => i.country === 'CHN' || i.country === 'USA')).toBe(true);
  });
});

describe('the age the picture is given', () => {
  it('is the date of the OLDEST list drawn — never the build time', () => {
    const older = new Date('2026-09-10T09:27:26Z');
    const s = build([{ def: brute, text: REAL }, { def: mail, text: '5.6.7.8\n' }], new Map([[mail, older]]));
    expect(readThreatSnapshot(s).asOf).toBe(older.getTime());
  });
});

describe('what readThreatSnapshot refuses', () => {
  const good = () => JSON.parse(JSON.stringify(build([{ def: brute, text: REAL }], new Map())));

  it('another schema or version', () => {
    expect(() => readThreatSnapshot({ ...good(), version: 2 })).toThrow(ThreatSnapshotError);
  });

  it('a snapshot that draws from no list', () => {
    const s = good();
    s.lists = s.lists.map((l: { status: string }) => ({ ...l, status: 'stale' }));
    expect(() => readThreatSnapshot(s)).toThrow(/no list/);
  });

  it('a malformed indicator, rather than drawing part of the file', () => {
    const s = good();
    s.indicators[2].listedAt = 'not a date';
    expect(() => readThreatSnapshot(s)).toThrow(/indicator 2/);
  });
});
