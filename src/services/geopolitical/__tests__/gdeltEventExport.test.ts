/**
 * The GDELT export parser, against real rows.
 *
 * The fixture is the first 300 rows of GDELT's 20260911170000 export file,
 * verbatim, plus row 848 of the same file — the first relevant bilateral event
 * GDELT could not locate. Real rows, because the old parser's handling of an
 * unlocated event worked only by coincidence: GDELT leaves the coordinates
 * EMPTY, Number('') is 0, and a 0,0 check happened to catch it. A hand-typed
 * fixture would have written 0,0 and never exercised the real case.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseGdeltExport,
  geoPrecisionOf,
  gdeltStampToMs,
  msToGdeltStamp,
  COOPERATIVE_ROOT_CODES,
  CONFLICT_ROOT_CODES,
} from '../gdeltEventExport';

const REAL = fs.readFileSync(path.join(__dirname, 'fixtures/gdelt-20260911170000.export.sample.csv'), 'utf8');
const events = parseGdeltExport(REAL);
const byId = new Map(events.map((e) => [e.id, e]));

describe('parseGdeltExport — real GDELT rows', () => {
  it('reads a real conflict row exactly', () => {
    expect(byId.get('1322612016')).toEqual({
      id: '1322612016', actor1ISO3: 'EGY', actor2ISO3: 'GBR', eventCode: '192', eventRootCode: '19',
      goldsteinScale: -9.5, lat: 31.1981, lng: 29.9192, dateAdded: '20260911170000',
      sourceUrl: 'https://wror.com/2026/09/11/anthropic-signs-24000-square-foot-lease-in-cambridge/',
      placeName: 'Alexandria, Al Iskandariyah, Egypt', placePrecision: 'city', mentions: 1, sources: 1, articles: 1,
      lead: true,
    });
  });

  // D-DP, DP3: where GDELT placed it, how precisely, and how widely it was reported.
  it('says when GDELT placed an event at a country, for want of a city', () => {
    expect(byId.get('1322612028')).toMatchObject({ placeName: 'United Kingdom', placePrecision: 'country' });
  });

  it('reads GDELT\'s five kinds of place as country, state or city', () => {
    expect(['1', '2', '3', '4', '5', '', '9'].map(geoPrecisionOf)).toEqual(['country', 'state', 'city', 'city', 'state', null, null]);
  });

  it('reads a real cooperative row exactly', () => {
    expect(byId.get('1322612026')).toMatchObject({
      actor1ISO3: 'GBR', actor2ISO3: 'USA', eventCode: '045', eventRootCode: '04', goldsteinScale: 5, lat: 51.5, lng: -0.116667,
    });
  });

  it('drops the real event GDELT could not locate — empty coordinates are not 0,0', () => {
    // Row 848 of the file: KOR–USA, root 05, lat and lng both "".
    expect(REAL).toContain('1322612859\t');
    expect(byId.has('1322612859')).toBe(false);
  });

  /**
   * The case the 0,0 check cannot catch: one coordinate missing. With an empty
   * field read as 0 the real EGY–GBR row would be placed on the equator.
   */
  it('drops a row with only its latitude missing, rather than putting it on the equator', () => {
    const line = REAL.split('\n').find((l) => l.startsWith('1322612016\t'))!;
    const fields = line.split('\t');
    fields[56] = '';
    expect(parseGdeltExport(fields.join('\t'))).toEqual([]);
  });

  it('drops a domestic event (both actors the same country)', () => {
    // Row 200: CAN–CAN, root 17.
    expect(REAL).toContain('1322612212\t');
    expect(byId.has('1322612212')).toBe(false);
  });

  it('keeps only bilateral, located events in the two ranges the layers draw', () => {
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.actor1ISO3).not.toBe('');
      expect(e.actor2ISO3).not.toBe('');
      expect(e.actor1ISO3).not.toBe(e.actor2ISO3);
      expect(COOPERATIVE_ROOT_CODES.has(e.eventRootCode) || CONFLICT_ROOT_CODES.has(e.eventRootCode)).toBe(true);
      expect(e.eventCode.startsWith(e.eventRootCode)).toBe(true);
      expect(Math.abs(e.goldsteinScale)).toBeLessThanOrEqual(10);
      expect(e.lat === 0 && e.lng === 0).toBe(false);
    }
  });

  /**
   * Counted when the fixture was cut, by a separate script written for the
   * purpose rather than by this parser: of the first 300 rows, 31 cooperative
   * and 5 conflict events qualify; 244 lack a country for one actor, 14 are in
   * other CAMEO ranges, 6 are domestic. Pinned so that loosening or tightening
   * any rule shows up here.
   */
  it('finds the events an independent count found', () => {
    expect(events.filter((e) => COOPERATIVE_ROOT_CODES.has(e.eventRootCode))).toHaveLength(COUNTS.cooperative);
    expect(events.filter((e) => CONFLICT_ROOT_CODES.has(e.eventRootCode))).toHaveLength(COUNTS.conflict);
  });

  it('ignores a trailing carriage return, as a CRLF file would carry', () => {
    const crlf = REAL.split('\n').join('\r\n');
    expect(parseGdeltExport(crlf)).toEqual(events);
  });
});

/*
 * D-DP, DP10: whether GDELT found the event in a lead paragraph (IsRootEvent), which its codebook
 * calls a rough proxy for importance. Counted independently: of the 36 events the parser keeps
 * from the fixture, 10 are lead events and 26 are not.
 */
describe('the lead paragraph', () => {
  it('is read from IsRootEvent, for every event', () => {
    expect(events).toHaveLength(36);
    expect(events.filter((e) => e.lead === true)).toHaveLength(10);
    expect(events.filter((e) => e.lead === false)).toHaveLength(26);
  });

  it('is unknown where GDELT gave neither 1 nor 0', () => {
    const line = REAL.split('\n').find((l) => l.startsWith('1322612028\t'))!;
    const fields = line.split('\t');
    fields[25] = '';
    expect(parseGdeltExport(fields.join('\t'))[0]).not.toHaveProperty('lead');
  });
});

describe('GDELT window stamps', () => {
  it('round-trips a stamp through epoch ms, in UTC', () => {
    expect(gdeltStampToMs('20260911170000')).toBe(Date.UTC(2026, 8, 11, 17, 0, 0));
    expect(msToGdeltStamp(Date.UTC(2026, 8, 11, 17, 0, 0))).toBe('20260911170000');
  });

  it('refuses anything that is not a stamp', () => {
    expect(gdeltStampToMs('2026-09-11')).toBeNull();
    expect(gdeltStampToMs('')).toBeNull();
  });
});

const COUNTS = { cooperative: 31, conflict: 5 };
