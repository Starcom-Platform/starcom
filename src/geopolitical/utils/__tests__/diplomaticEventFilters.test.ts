import { describe, it, expect } from 'vitest';
import {
  eventTypeEnabled,
  saidOrDoneOf,
  filterDiplomaticEvents,
  diplomaticFilterCounts,
} from '../diplomaticEventFilters';
import type { RealGdeltEvent } from '../../../services/geopolitical/GDELTEventService';
import type { GeoPoliticalConfig } from '../../../hooks/useGeoPoliticalSettings';

function timestampDaysAgo(n: number): string {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

/** The span shown: here the thirty days to now. The shared time's rules are gdeltTimeSpan.test.ts's. */
const SPAN = { start: Date.now() - 30 * 86_400_000, end: Date.now() + 60_000 };

function event(overrides: Partial<RealGdeltEvent> = {}): RealGdeltEvent {
  return {
    id: 'e1',
    actor1ISO3: 'USA',
    actor2ISO3: 'CHN',
    eventCode: '057', // a formal agreement signed
    eventRootCode: '05',
    goldsteinScale: 5,
    lat: 38.9,
    lng: -77.0,
    sourceUrl: 'https://example.com/article',
    dateAdded: timestampDaysAgo(5),
    ...overrides
  };
}

const NO_FILTERS: GeoPoliticalConfig['diplomaticEvents']['filters'] = { minOutlets: 1, saidOrDone: 'both', minConfidence: 0, leadOnly: false };

const ALL_ON: GeoPoliticalConfig['diplomaticEvents']['eventTypes'] = {
  intent: true, consult: true, diplomatic: true, agreement: true, material: true, aid: true, yield: true,
};

function diplomaticConfig(overrides: Partial<GeoPoliticalConfig['diplomaticEvents']> = {}): GeoPoliticalConfig['diplomaticEvents'] {
  return {
    eventTypes: ALL_ON,
    markerSize: 1.0,
    showConnections: true,
    connectionOpacity: 40,
    animateEvents: true,
    filters: NO_FILTERS,
    placeBy: 'event',
    ...overrides
  };
}

describe('eventTypeEnabled', () => {
  it('maps each CAMEO category to its own toggle', () => {
    const eventTypes = { ...ALL_ON, consult: false, aid: false };
    expect(eventTypeEnabled(event({ eventCode: '057', eventRootCode: '05' }), eventTypes)).toBe(true);
    expect(eventTypeEnabled(event({ eventCode: '042', eventRootCode: '04' }), eventTypes)).toBe(false);
    expect(eventTypeEnabled(event({ eventCode: '061', eventRootCode: '06' }), eventTypes)).toBe(true);
    expect(eventTypeEnabled(event({ eventCode: '073', eventRootCode: '07' }), eventTypes)).toBe(false);
  });

  // D-DP, DP4: roots 03, 07 and 08, and 05 but for 057, were loaded and never shown.
  it('shows the roots that were dropped, each by its own toggle', () => {
    for (const [root, code] of [['03', '036'], ['05', '051'], ['07', '073'], ['08', '087']]) {
      expect(eventTypeEnabled(event({ eventCode: code, eventRootCode: root }), ALL_ON), code).toBe(true);
    }
    expect(eventTypeEnabled(event({ eventCode: '036', eventRootCode: '03' }), { ...ALL_ON, intent: false })).toBe(false);
    expect(eventTypeEnabled(event({ eventCode: '087', eventRootCode: '08' }), { ...ALL_ON, yield: false })).toBe(false);
  });

  it('excludes an event outside the cooperative roots', () => {
    expect(eventTypeEnabled(event({ eventCode: '145', eventRootCode: '14' }), ALL_ON)).toBe(false);
  });
});

describe('filterDiplomaticEvents', () => {
  it('applies the kinds of event and the time window together (AND, not OR)', () => {
    const events: RealGdeltEvent[] = [
      event({ id: 'pass', eventCode: '057', eventRootCode: '05', dateAdded: timestampDaysAgo(5) }),
      event({ id: 'fail-type', eventCode: '042', eventRootCode: '04', dateAdded: timestampDaysAgo(5) }),
      event({ id: 'fail-time', eventCode: '057', eventRootCode: '05', dateAdded: timestampDaysAgo(100) })
    ];
    const config = diplomaticConfig({ eventTypes: { ...ALL_ON, consult: false } });
    expect(filterDiplomaticEvents(events, config, SPAN).map((e) => e.id)).toEqual(['pass']);
  });

  /*
   * D-DP, DP9: the Goldstein floor is gone. Goldstein scores a type of event, so 'medium' hid 90% of
   * consultations and almost all diplomatic cooperation, and nothing in the app set or showed it.
   */
  it('hides nothing by its Goldstein score', () => {
    const events = [event({ id: 'low', eventCode: '042', eventRootCode: '04', goldsteinScale: 1.9 })];
    expect(filterDiplomaticEvents(events, diplomaticConfig(), SPAN).map((e) => e.id)).toEqual(['low']);
  });

  // D-DP, DP10: corroboration, by distinct outlets per story.
  it('keeps only the stories told by at least as many outlets as asked', () => {
    const events = [
      event({ id: 'told-twice-1', sourceUrl: 'https://a.example/1' }),
      event({ id: 'told-twice-2', sourceUrl: 'https://b.example/2' }),
      event({ id: 'told-once', actor2ISO3: 'GBR', sourceUrl: 'https://a.example/3' }),
    ];
    const config = diplomaticConfig({ filters: { ...NO_FILTERS, minOutlets: 2 } });
    expect(filterDiplomaticEvents(events, config, SPAN).map((e) => e.id)).toEqual(['told-twice-1', 'told-twice-2']);
  });

  it('counts outlets in the span shown only', () => {
    const events = [
      event({ id: 'recent', sourceUrl: 'https://a.example/1' }),
      event({ id: 'old', sourceUrl: 'https://b.example/2', dateAdded: timestampDaysAgo(100) }),
    ];
    const config = diplomaticConfig({ filters: { ...NO_FILTERS, minOutlets: 2 } });
    expect(filterDiplomaticEvents(events, config, SPAN)).toEqual([]);
  });

  // D-DP, DP10: GDELT's QuadClass, from the CAMEO root: 03–05 verbal cooperation, 06–08 material.
  it('keeps what was said, or what was done', () => {
    const events = [
      event({ id: 'agreement', eventCode: '057', eventRootCode: '05' }),
      event({ id: 'consult', eventCode: '042', eventRootCode: '04' }),
      event({ id: 'aid', eventCode: '073', eventRootCode: '07' }),
    ];
    const said = diplomaticConfig({ filters: { ...NO_FILTERS, saidOrDone: 'said' } });
    const done = diplomaticConfig({ filters: { ...NO_FILTERS, saidOrDone: 'done' } });
    expect(filterDiplomaticEvents(events, said, SPAN).map((e) => e.id)).toEqual(['agreement', 'consult']);
    expect(filterDiplomaticEvents(events, done, SPAN).map((e) => e.id)).toEqual(['aid']);
  });
});

/*
 * D-DP, DP10: the coder's confidence and the lead paragraph come with snapshot version 3. An event
 * without them is unknown, and an unknown never passes a filter that asks for it.
 */
describe('the coder\'s confidence and the lead paragraph', () => {
  const events = [
    event({ id: 'sure', confidence: 80, lead: true }),
    event({ id: 'unsure', confidence: 20, lead: false, actor2ISO3: 'GBR' }),
    event({ id: 'unknown', actor2ISO3: 'FRA' }),
  ];

  it('keeps the events the coder was at least as sure of', () => {
    const config = diplomaticConfig({ filters: { ...NO_FILTERS, minConfidence: 50 } });
    expect(filterDiplomaticEvents(events, config, SPAN).map((e) => e.id)).toEqual(['sure']);
  });

  it('keeps the events found in a lead paragraph', () => {
    const config = diplomaticConfig({ filters: { ...NO_FILTERS, leadOnly: true } });
    expect(filterDiplomaticEvents(events, config, SPAN).map((e) => e.id)).toEqual(['sure']);
  });

  it('keeps every event, known or not, when neither is asked for', () => {
    expect(filterDiplomaticEvents(events, diplomaticConfig(), SPAN)).toHaveLength(3);
  });
});

describe('diplomaticFilterCounts — the confidence and the lead paragraph', () => {
  const events = [
    event({ id: 'sure-lead', confidence: 80, lead: true, sourceUrl: 'https://a.example/1' }),
    event({ id: 'half', confidence: 50, lead: false, actor2ISO3: 'GBR' }),
    event({ id: 'unsure', confidence: 20, lead: true, actor2ISO3: 'FRA' }),
    event({ id: 'unknown', actor2ISO3: 'DEU' }),
  ];

  it('counts each confidence and the lead paragraph as if chosen', () => {
    const counts = diplomaticFilterCounts(events, diplomaticConfig(), SPAN);
    expect(counts.minConfidence).toEqual({ 0: 4, 50: 2, 80: 1 });
    expect(counts.lead).toEqual({ any: 4, only: 2 });
  });

  it('says how many events GDELT gave each for, so a snapshot without them offers neither', () => {
    expect(diplomaticFilterCounts(events, diplomaticConfig(), SPAN).known).toEqual({ confidence: 3, lead: 3 });
    expect(diplomaticFilterCounts([event()], diplomaticConfig(), SPAN).known).toEqual({ confidence: 0, lead: 0 });
  });
});

describe('saidOrDoneOf', () => {
  it('follows GDELT\'s QuadClass', () => {
    expect(['intent', 'consult', 'diplomatic', 'agreement', 'material', 'aid', 'yield'].map((c) => saidOrDoneOf(c as 'intent')))
      .toEqual(['said', 'said', 'said', 'said', 'done', 'done', 'done']);
  });
});

/* D-DP, DP10: each choice says how many events it keeps, the others as they are. */
describe('diplomaticFilterCounts', () => {
  const events = [
    event({ id: 'a', eventCode: '042', eventRootCode: '04', sourceUrl: 'https://a.example/1' }),
    event({ id: 'b', eventCode: '042', eventRootCode: '04', sourceUrl: 'https://b.example/2' }),
    event({ id: 'c', eventCode: '073', eventRootCode: '07', sourceUrl: 'https://a.example/3' }),
    event({ id: 'old', eventCode: '073', eventRootCode: '07', dateAdded: timestampDaysAgo(100) }),
  ];

  it('counts each choice as if it were chosen', () => {
    const counts = diplomaticFilterCounts(events, diplomaticConfig(), SPAN);
    expect(counts.minOutlets).toEqual({ 1: 3, 2: 2, 5: 0 });
    expect(counts.saidOrDone).toEqual({ both: 3, said: 2, done: 1 });
    expect(counts.categories).toMatchObject({ consult: 2, aid: 1, agreement: 0 });
  });

  it('counts a kind of event that is turned off as what turning it on would show', () => {
    const counts = diplomaticFilterCounts(events, diplomaticConfig({ eventTypes: { ...ALL_ON, consult: false } }), SPAN);
    expect(counts.categories.consult).toBe(2);
    expect(counts.minOutlets[1]).toBe(1);
  });

  it('counts with the other choices as they are', () => {
    const counts = diplomaticFilterCounts(events, diplomaticConfig({ filters: { ...NO_FILTERS, saidOrDone: 'done' } }), SPAN);
    expect(counts.minOutlets).toEqual({ 1: 1, 2: 0, 5: 0 });
    expect(counts.categories.consult).toBe(0);
  });
});

/* D-DP, DP15: nothing is shown before the snapshot is read and a span exists. */
describe('before the snapshot is read', () => {
  it('shows nothing and counts nothing', () => {
    expect(filterDiplomaticEvents([event()], diplomaticConfig(), null)).toEqual([]);
    expect(diplomaticFilterCounts([event()], diplomaticConfig(), null).minOutlets[1]).toBe(0);
  });
});
