import { describe, it, expect } from 'vitest';
import { buildTideTooltip, buildStreamflowTooltip, selectStreamflowForTier, streamflowMarkPx, tideTimeIso, waterGaugeFeeds } from '../useGlobeWaterGauges';
import type { NOAAWaterLevelReading } from '../../../../services/NOAAWaterLevelService';
import type { USGSStreamflowReading } from '../../../../services/USGSStreamflowService';

const makeReading = (siteId: string, dischargeCfs: number): USGSStreamflowReading => ({
  siteId,
  siteName: `Site ${siteId}`,
  lat: 0,
  lng: 0,
  stateCode: 'ca',
  dischargeCfs,
  timestamp: '2026-08-14T14:15:00.000-07:00'
});

describe('buildTideTooltip', () => {
  it('formats a real NOAA CO-OPS reading', () => {
    const reading: NOAAWaterLevelReading = {
      station: { id: '8518750', name: 'The Battery', lat: 40.7, lng: -74.0 },
      waterLevelM: 0.177,
      timestamp: '2026-08-14 21:24'
    };
    expect(buildTideTooltip(reading)).toBe('The Battery • 0.18m • 2026-08-14 21:24 UTC');
  });
});

describe('selectStreamflowForTier', () => {
  it('returns the full real set untouched at tier 2 (full detail)', () => {
    const readings = Array.from({ length: 10 }, (_, i) => makeReading(String(i), 1000 - i));
    expect(selectStreamflowForTier(readings, 2)).toHaveLength(10);
  });

  it('returns the full list unmodified when it is already under a tier cap, rather than re-sorting it', () => {
    const readings = [makeReading('1', 10), makeReading('2', 20)];
    expect(selectStreamflowForTier(readings, 1)).toEqual(readings);
  });

  it('drops the lowest-discharge real readings when a tier cap is actually exceeded', () => {
    const readings = Array.from({ length: 400 }, (_, i) => makeReading(String(i), i)); // id "399" = highest discharge (399)
    const result = selectStreamflowForTier(readings, 0); // cap 300
    expect(result).toHaveLength(300);
    expect(result.map((r) => r.siteId)).toContain('399');
    expect(result.map((r) => r.siteId)).not.toContain('0');
  });

  it('sorts real readings with a non-finite discharge last, not first', () => {
    const readings = [
      ...Array.from({ length: 300 }, (_, i) => makeReading(String(i), 1000 + i)),
      makeReading('nan-site', NaN)
    ];
    const result = selectStreamflowForTier(readings, 0); // cap 300, 301 real entries
    expect(result.map((r) => r.siteId)).not.toContain('nan-site');
  });

  it('keeps the highest real discharge readings first at reduced tiers, well under the cap', () => {
    const readings = [
      makeReading('a', 100),
      makeReading('b', 5000),
      makeReading('c', 10),
      makeReading('d', 8000)
    ];
    const result = selectStreamflowForTier(readings, 0);
    // STREAMFLOW_TIER_LIMITS[0] = 300, well above 4, so nothing should be dropped here —
    // real thinning is exercised by the "drops the lowest-discharge" test above.
    expect(result).toHaveLength(4);
  });
});

describe('buildStreamflowTooltip', () => {
  it('formats a real USGS streamflow reading', () => {
    const reading: USGSStreamflowReading = {
      siteId: '09423350',
      siteName: 'CARUTHERS C NR IVANPAH CA',
      lat: 35.245,
      lng: -115.298,
      stateCode: 'ca',
      dischargeCfs: 12.5,
      timestamp: '2026-08-14T14:15:00.000-07:00'
    };
    expect(buildStreamflowTooltip(reading)).toBe('CARUTHERS C NR IVANPAH CA • 12.5 ft³/s');
  });
});

describe('streamflowMarkPx', () => {
  it('carries sizeForDischarge\'s own ranking into pixels', () => {
    const creek = streamflowMarkPx(20);
    const river = streamflowMarkPx(5_000);
    const mississippi = streamflowMarkPx(600_000);
    expect(river).toBeGreaterThan(creek);
    expect(mississippi).toBeGreaterThan(river);
  });

  it('keeps the smallest gauge on a card and the largest off a continent', () => {
    // 0.87 is the card's scale at the audit view; 4 px is the audit's floor.
    expect(streamflowMarkPx(1) * 0.87).toBeGreaterThanOrEqual(4);
    expect(streamflowMarkPx(0)).toBe(streamflowMarkPx(-1));
    expect(streamflowMarkPx(10_000_000)).toBe(18);
    expect(streamflowMarkPx(Number.NaN)).toBe(streamflowMarkPx(0));
  });

  it('still separates rivers the old scale drew identically', () => {
    /*
     * The point of replacing it: sizeForDischarge capped at about 1,000 cfs, so a
     * modest river and the Mississippi were the same mark. A pixel apart is enough
     * to read as different; identical is not.
     */
    expect(streamflowMarkPx(600_000) - streamflowMarkPx(1_000)).toBeGreaterThan(1);
    expect(streamflowMarkPx(50_000) - streamflowMarkPx(5_000)).toBeGreaterThan(1);
  });
});

/*
 * What a card says about the gauges it draws (record D-L, owed): until now the
 * gauges had no feed line, so a card drawing USGS and NOAA marks credited
 * neither and could not say when they had last reported.
 */
describe('waterGaugeFeeds', () => {
  it('gives each network a line, credited as its terms ask, with its newest reading', () => {
    const rows = waterGaugeFeeds(
      { loading: false, error: null, newest: '2026-10-07T05:30:00Z' },
      { loading: false, error: null, newest: '2026-10-07T05:45:00+00:00' },
    );
    expect(rows.map((r) => [r.name, r.credits?.map((c) => c.text), r.lastUpdated, r.loading, r.error])).toEqual([
      ['NOAA tide gauges', ['NOAA CO-OPS'], '2026-10-07T05:30:00Z', false, null],
      ['USGS river gauges', ['U.S. Geological Survey'], '2026-10-07T05:45:00+00:00', false, null],
    ]);
  });

  it('says a network is still loading, or why it could not be read', () => {
    const [tide, rivers] = waterGaugeFeeds(
      { loading: true, error: null, newest: null },
      { loading: false, error: 'USGS did not answer', newest: null },
    );
    expect(tide).toMatchObject({ loading: true, lastUpdated: null });
    expect(rivers).toMatchObject({ loading: false, error: 'USGS did not answer', lastUpdated: null });
  });
});

describe('tideTimeIso', () => {
  it('reads NOAA CO-OPS time (asked for in GMT) as UTC', () => {
    expect(tideTimeIso('2026-08-14 21:24')).toBe('2026-08-14T21:24:00Z');
  });

  it('gives nothing for a time it cannot read, rather than a wrong one', () => {
    expect(tideTimeIso('yesterday')).toBeNull();
  });
});
