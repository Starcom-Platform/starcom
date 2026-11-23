/**
 * When NOAA's electric-field data is FROM (decision D-F, step 12).
 *
 * In its own file because noaaSpaceWeather.unit.test.ts is excluded from the
 * stable run — it fetches live NOAA URLs — so tests added there never ran.
 *
 * useSpaceWeatherData stamped its age as the moment it fetched, and as "now"
 * even when NOAA returned no files — presenting an empty result as fresh. The
 * obvious fix, the file's own `time_tag`, is wrong: it is a DATE only
 * ('2026-09-19'), which parses as UTC midnight, so data from 19:54Z would have
 * read as twenty hours old at 20:03Z. The time is in the FILENAME —
 * 20260919T195430-15-Efield-….json is 19:54:30 UTC — read explicitly as UTC,
 * because NOAA's zone-less times are the hazard SpaceWeatherLive.ts records:
 * parsed locally, west of Greenwich, they hide staleness.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractLatestFilename, electricFieldFileTime, fetchLatestElectricFieldData } from '../noaaSpaceWeather';

describe('electricFieldFileTime', () => {
  it('reads the time a file is named for, as UTC', () => {
    expect(electricFieldFileTime('20260919T195430-15-Efield-empirical-EMTF-2022.12-0.5x0.5.json'))
      .toBe(Date.UTC(2026, 8, 19, 19, 54, 30));
    expect(electricFieldFileTime('20260919T195630-15-Efield-US-Canada.json'))
      .toBe(Date.UTC(2026, 8, 19, 19, 56, 30));
  });

  it('is null for a name it cannot read, rather than "now"', () => {
    expect(electricFieldFileTime('latest.json')).toBeNull();
    expect(electricFieldFileTime('20261399T999999-15-Efield-US-Canada.json')).toBeNull();
  });
});

describe('extractLatestFilename — which file is newest', () => {
  /*
   * NOAA's listing is chronological today and the service took the last entry.
   * A sibling NOAA feed turned out to be NEWEST FIRST, and taking its last row
   * gave a reading 24 hours old (SpaceWeatherLive.ts). The names sort as text,
   * so the newest is chosen by name rather than by position.
   */
  it('picks the newest file whatever order the listing is in', () => {
    const html = [
      'href="20260919T195430-15-Efield-US-Canada.json"',
      'href="20260919T080330-15-Efield-US-Canada.json"',
      'href="20260919T120030-15-Efield-US-Canada.json"',
    ].join('\n');

    expect(extractLatestFilename(html, 'US-Canada')).toBe('20260919T195430-15-Efield-US-Canada.json');
  });
});

describe('fetchLatestElectricFieldData — carries the file\'s time', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the time the newest file is named for, not time_tag\'s midnight', async () => {
    const listing = 'href="20260919T080330-15-Efield-US-Canada.json"\nhref="20260919T195630-15-Efield-US-Canada.json"';
    const body = { time_tag: '2026-09-19', cadence: 60, product_version: 'US-Canada-1D', type: 'FeatureCollection', features: [] };
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('/') ? new Response(listing) : new Response(JSON.stringify(body))));

    const data = await fetchLatestElectricFieldData('US-Canada');

    expect(data.observedAt).toBe(Date.UTC(2026, 8, 19, 19, 56, 30));
    expect(data.observedAt).not.toBe(Date.parse('2026-09-19'));
  });
});
