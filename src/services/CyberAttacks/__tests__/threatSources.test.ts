/**
 * How one threat list becomes the indicators drawn from it — against a real list.
 *
 * The fixture is firehol's blocklist_de_bruteforce.ipset as served on 2026-09-11:
 * 1,312 addresses, sorted by IP like every list the layer uses. Sorted is the
 * point. The layer took each list's first N entries, which on a sorted list are
 * the lowest-numbered addresses — and so the countries that hold low address
 * space. Measured across all eight lists: China 31% of the map against 8% of
 * the 98,779 listed IPs; the US 9% against 31%.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  listIps,
  sampleEvenly,
  fireholListDate,
  mergeSampledLists,
  THREAT_SOURCES,
  type SampledList,
} from '../threatSources';

const REAL = fs.readFileSync(path.join(__dirname, 'fixtures/firehol-blocklist_de_bruteforce.2026-09-11.ipset'), 'utf8');
const firstOctet = (ip: string) => Number(ip.split('.')[0]);

describe('a real, sorted list', () => {
  const ips = listIps(REAL);

  it('holds every address, in the list\'s own (sorted) order', () => {
    expect(ips).toHaveLength(1312);
    expect(firstOctet(ips[0])).toBeLessThanOrEqual(firstOctet(ips[ips.length - 1]));
  });

  it('is sampled across its whole range — not from the low end, as its head is', () => {
    const head = ips.slice(0, 25);
    const even = sampleEvenly(ips, 25);
    // The head of a sorted list never leaves the bottom of the address space…
    expect(Math.max(...head.map(firstOctet))).toBeLessThan(20);
    // …an even sample spans it, first entry to near the last.
    expect(even[0]).toBe(ips[0]);
    expect(Math.max(...even.map(firstOctet))).toBeGreaterThan(200);
    expect(new Set(even).size).toBe(25);
  });

  it('is sampled the same way every time, so a build can be reproduced', () => {
    expect(sampleEvenly(ips, 25)).toEqual(sampleEvenly(ips, 25));
  });

  it('reads the date the list gives itself', () => {
    expect(fireholListDate(REAL)?.toISOString()).toBe('2026-09-11T06:13:14.000Z');
  });
});

describe('listIps', () => {
  it('takes a CIDR\'s network address, skips comments and junk, and drops repeats', () => {
    expect(listIps('# c\n10.0.0.0/8\n\n1.2.3.4\nnot-an-ip\n1.2.3.4\n')).toEqual(['10.0.0.0', '1.2.3.4']);
  });
});

describe('fireholListDate', () => {
  it('says nothing, rather than a fetch time, when a list gives no date', () => {
    expect(fireholListDate('1.2.3.4\n5.6.7.8\n')).toBeNull();
  });
});

describe('mergeSampledLists', () => {
  const [ssh, brute, apache] = THREAT_SOURCES;
  const at = new Date('2026-09-11T06:00:00Z');
  const list = (def: typeof ssh, ips: string[], listDate: Date | null = at): SampledList => ({ def, total: ips.length, ips, listDate });

  it('raises severity for an IP two lists reported independently, and keeps both names', () => {
    const [merged] = mergeSampledLists([list(ssh, ['9.9.9.9']), list(brute, ['9.9.9.9'])]);
    expect(merged.severity).toBe(Math.min(5, ssh.baseSeverity + 1));
    expect(merged.sources).toEqual([ssh.label, brute.label]);
  });

  /** A cap on how many are drawn used to take the first list's entries first. */
  it('interleaves lists, so a cap takes from every list', () => {
    const merged = mergeSampledLists([list(ssh, ['1.0.0.1', '1.0.0.2', '1.0.0.3']), list(apache, ['2.0.0.1', '2.0.0.2'])]);
    expect(merged.slice(0, 4).map((m) => m.ip)).toEqual(['1.0.0.1', '2.0.0.1', '1.0.0.2', '2.0.0.2']);
  });

  it('draws nothing from a list with no date', () => {
    expect(mergeSampledLists([list(ssh, ['1.1.1.1'], null)])).toEqual([]);
  });

  it('dates a merged IP by the newest list it appeared on', () => {
    const later = new Date('2026-09-11T09:00:00Z');
    const [merged] = mergeSampledLists([list(ssh, ['9.9.9.9']), list(brute, ['9.9.9.9'], later)]);
    expect(merged.listedAt).toEqual(later);
  });
});
