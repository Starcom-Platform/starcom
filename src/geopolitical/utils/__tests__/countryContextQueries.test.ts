import { describe, it, expect } from 'vitest';
import { getActiveResourceTypeForCountry, getActiveEventsForCountry } from '../countryContextQueries';
import type { GeoPoliticalConfig } from '../../../hooks/useGeoPoliticalSettings';
import type { CountryResourceRank } from '../../theme/resourceZoneTheme';
import type { RealGdeltEvent } from '../../../services/geopolitical/GDELTEventService';

function resourceZonesConfig(overrides: Partial<GeoPoliticalConfig['resourceZones']> = {}): GeoPoliticalConfig['resourceZones'] {
  return {
    resourceTypes: { oil: true, gas: true, minerals: true, water: false, renewable: false },
    showProductionRates: true,
    showReserveData: false,
    zoneOpacity: 60,
    showTradeRoutes: true,
    tradeRouteIntensity: 50,
    conflictZones: { show: true, highlightDisputed: true, alertLevel: 'medium' },
    ...overrides
  };
}

function diplomaticEventsConfig(overrides: Partial<GeoPoliticalConfig['diplomaticEvents']> = {}): GeoPoliticalConfig['diplomaticEvents'] {
  return {
    eventTypes: { intent: true, consult: true, diplomatic: true, agreement: true, material: true, aid: true, yield: true },
    markerSize: 1.0,
    showConnections: true,
    connectionOpacity: 40,
    animateEvents: true,
    filters: { minOutlets: 1 as const, saidOrDone: 'both' as const, minConfidence: 0 as const, leadOnly: false }, placeBy: 'event' as const,
    ...overrides
  };
}

describe('getActiveResourceTypeForCountry', () => {
  const usaRanks: CountryResourceRank[] = [
    { resourceType: 'oil', percentile: 95 },
    { resourceType: 'gas', percentile: 70 }
  ];
  const percentiles = () => new Map([['USA', usaRanks]]);

  it('returns the active resource type the country ranks highest in', () => {
    const result = getActiveResourceTypeForCountry('USA', resourceZonesConfig(), percentiles());
    expect(result).toBe('oil');
  });

  it('returns null when the country has no real data', () => {
    const result = getActiveResourceTypeForCountry('ZZZ', resourceZonesConfig(), percentiles());
    expect(result).toBeNull();
  });

  it('returns null when zoneOpacity is 0, even if resource types are active', () => {
    const result = getActiveResourceTypeForCountry('USA', resourceZonesConfig({ zoneOpacity: 0 }), percentiles());
    expect(result).toBeNull();
  });

  it('returns null when no resource types are active', () => {
    const result = getActiveResourceTypeForCountry('USA', resourceZonesConfig({
      resourceTypes: { oil: false, gas: false, minerals: false, water: false, renewable: false }
    }), percentiles());
    expect(result).toBeNull();
  });

  it('is deterministic for the same country, config, and percentile data', () => {
    const config = resourceZonesConfig();
    const p = percentiles();
    expect(getActiveResourceTypeForCountry('RUS', config, p)).toBe(getActiveResourceTypeForCountry('RUS', config, p));
  });
});

describe('getActiveEventsForCountry', () => {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  // The span the globe shows: here the year to now (useGdeltSpan gives the real one).
  const span = { start: now - 365 * DAY, end: now + 60_000 };

  function timestampDaysAgo(n: number): string {
    const d = new Date(now - n * 24 * 60 * 60 * 1000);
    const pad = (v: number) => String(v).padStart(2, '0');
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  }

  function realEvent(overrides: Partial<RealGdeltEvent> = {}): RealGdeltEvent {
    return {
      id: 'e1',
      actor1ISO3: 'USA',
      actor2ISO3: 'CHN',
      eventCode: '057', // treaty
      eventRootCode: '05',
      goldsteinScale: 5,
      lat: 1,
      lng: 1,
      sourceUrl: 'https://example.com',
      dateAdded: timestampDaysAgo(5),
      ...overrides
    };
  }

  it('returns only events involving the given country', () => {
    const events: RealGdeltEvent[] = [
      realEvent({ id: 'has-usa', actor1ISO3: 'USA', actor2ISO3: 'CHN' }),
      realEvent({ id: 'no-usa', actor1ISO3: 'RUS', actor2ISO3: 'CHN' })
    ];
    const result = getActiveEventsForCountry('USA', diplomaticEventsConfig(), events, span);
    expect(result.map((e) => e.id)).toEqual(['has-usa']);
  });

  it('matches a country whether it is actor1 or actor2', () => {
    const events: RealGdeltEvent[] = [
      realEvent({ id: 'as-actor2', actor1ISO3: 'CHN', actor2ISO3: 'USA' })
    ];
    const result = getActiveEventsForCountry('USA', diplomaticEventsConfig(), events, span);
    expect(result.map((e) => e.id)).toEqual(['as-actor2']);
  });

  it('respects eventTypes filtering — disabling all types returns nothing', () => {
    const events: RealGdeltEvent[] = [realEvent()];
    const result = getActiveEventsForCountry('USA', diplomaticEventsConfig({
      eventTypes: { intent: false, consult: false, diplomatic: false, agreement: false, material: false, aid: false, yield: false }
    }), events, span);
    expect(result).toEqual([]);
  });

  it('respects the span shown — a shorter span returns fewer or equal results than a longer one', () => {
    const events: RealGdeltEvent[] = [realEvent({ dateAdded: timestampDaysAgo(200) })];
    const short = getActiveEventsForCountry('USA', diplomaticEventsConfig(), events, { start: now - DAY, end: now });
    const long = getActiveEventsForCountry('USA', diplomaticEventsConfig(), events, span);
    expect(short).toEqual([]);
    expect(long).toHaveLength(1);
  });

  it('returns an empty array for a country with no matching events', () => {
    const events: RealGdeltEvent[] = [realEvent()];
    const result = getActiveEventsForCountry('ZZZ', diplomaticEventsConfig(), events, span);
    expect(result).toEqual([]);
  });
});
