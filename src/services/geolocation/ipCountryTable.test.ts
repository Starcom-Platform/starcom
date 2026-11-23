/**
 * DB-IP's country table, parsed and searched — the functions the threat snapshot
 * build uses to place each listed IP. Moved from IPCountryService.test.ts, whose
 * live-network half went with the service: the app no longer downloads the table.
 */
import { describe, it, expect } from 'vitest';
import { ipToUint32, parseCountryRangesCsv, binarySearchCountry } from './ipCountryTable';

describe('ipToUint32 (bug-injection verified)', () => {
  it('converts a real IPv4 address to its correct unsigned 32-bit integer', () => {
    expect(ipToUint32('1.0.0.0')).toBe(16777216);
    expect(ipToUint32('255.255.255.255')).toBe(4294967295);
    expect(ipToUint32('0.0.0.0')).toBe(0);
  });

  it('returns null for malformed input rather than a wrong number', () => {
    expect(ipToUint32('not-an-ip')).toBeNull();
    expect(ipToUint32('1.2.3')).toBeNull();
    expect(ipToUint32('1.2.3.4.5')).toBeNull();
    expect(ipToUint32('1.2.3.256')).toBeNull();
    expect(ipToUint32('1.2.3.-1')).toBeNull();
  });
});

describe('parseCountryRangesCsv (bug-injection verified)', () => {
  it('parses real-shaped CSV rows into parallel typed arrays', () => {
    const csv = '1.0.0.0,1.0.0.255,AU\n1.0.1.0,1.0.3.255,CN\n';
    const table = parseCountryRangesCsv(csv);
    expect(Array.from(table.starts)).toEqual([ipToUint32('1.0.0.0'), ipToUint32('1.0.1.0')]);
    expect(Array.from(table.ends)).toEqual([ipToUint32('1.0.0.255'), ipToUint32('1.0.3.255')]);
    expect(table.countries).toEqual(['AU', 'CN']);
  });

  it('skips a malformed row instead of crashing or inserting garbage', () => {
    const csv = '1.0.0.0,1.0.0.255,AU\nnot,a,valid,row\n1.0.1.0,1.0.3.255,CN\n\n';
    const table = parseCountryRangesCsv(csv);
    expect(table.countries).toEqual(['AU', 'CN']);
  });

  it('skips a row with a non-2-letter country field', () => {
    const csv = '1.0.0.0,1.0.0.255,AUS\n1.0.1.0,1.0.3.255,CN\n';
    const table = parseCountryRangesCsv(csv);
    expect(table.countries).toEqual(['CN']);
  });
});

describe('binarySearchCountry (bug-injection verified)', () => {
  const table = parseCountryRangesCsv(
    '1.0.0.0,1.0.0.255,AU\n1.0.1.0,1.0.3.255,CN\n1.0.4.0,1.0.7.255,AU\n'
  );

  it('finds the correct range for an IP in the middle of a range', () => {
    expect(binarySearchCountry(table, ipToUint32('1.0.2.128')!)).toBe('CN');
  });

  it('finds the correct range at the exact start and end boundaries', () => {
    expect(binarySearchCountry(table, ipToUint32('1.0.1.0')!)).toBe('CN');
    expect(binarySearchCountry(table, ipToUint32('1.0.3.255')!)).toBe('CN');
  });

  it('returns null for an IP that falls in a real gap between ranges', () => {
    // 1.0.0.255 is the last address of range 1; 1.0.1.0 is the first of range 2 — no gap
    // here, but construct a table with a deliberate gap to prove the "not found" path.
    const gapTable = parseCountryRangesCsv('1.0.0.0,1.0.0.10,AU\n1.0.0.20,1.0.0.30,CN\n');
    expect(binarySearchCountry(gapTable, ipToUint32('1.0.0.15')!)).toBeNull();
  });

  it('returns null for an IP before the first range or after the last', () => {
    expect(binarySearchCountry(table, ipToUint32('0.0.0.1')!)).toBeNull();
    expect(binarySearchCountry(table, ipToUint32('9.9.9.9')!)).toBeNull();
  });

  it('returns null for an empty table rather than throwing', () => {
    const empty = parseCountryRangesCsv('');
    expect(binarySearchCountry(empty, ipToUint32('1.0.0.1')!)).toBeNull();
  });
});
