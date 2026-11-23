/**
 * Diplomacy and Conflict Zones draw a SNAPSHOT of GDELT, built with the deploy.
 * Two things follow, and both were wrong until now.
 *
 *   "The last day" is the day before the data, not before the wall clock.
 *   Both layers filtered GDELT events to `timeRange` days before Date.now(). A
 *   snapshot three days old would therefore filter itself to nothing, and the
 *   layer would draw an empty globe — the "no activity" picture with no caveat.
 *
 *   A data failure reaches the caller. Both layers took only `events` from
 *   their data hooks and dropped `error`, so a GDELT failure reached neither the
 *   settings panel nor the share card.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { getLegends, publishLegend } from '../../../services/globe/globeLegendStore';
import { useCountryPanelTaken } from '../../../context/countryPanel';

const AS_OF = Date.UTC(2026, 8, 11, 17, 0, 0);
const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
/** Where the snapshot's day starts: its oldest window, a day of windows before its newest. */
const FROM = AS_OF - 24 * 60 * 60 * 1000 + 15 * 60 * 1000;

const data = vi.hoisted(() => ({
  diplomatic: { events: [] as unknown[], asOf: null as number | null, from: null as number | null, error: null as string | null, loading: false },
  conflict: { events: [] as unknown[], asOf: null as number | null, from: null as number | null, error: null as string | null, loading: false },
  built: [] as Array<() => Promise<THREE.Group>>,
}));

vi.mock('../useRealDiplomaticEvents', () => ({ useRealDiplomaticEvents: () => data.diplomatic }));
vi.mock('../useRealConflictEvents', () => ({ useRealConflictEvents: () => data.conflict }));
vi.mock('../useRealDisplacementData', () => ({ useRealDisplacementData: () => ({ records: [], error: null, loading: false }) }));
vi.mock('../useSimpleGeoOverlayLayer', () => ({
  prefersReducedMotion: () => true,
  useSimpleGeoOverlayLayer: ({ buildContent }: { buildContent: () => Promise<THREE.Group> }) => {
    data.built.push(buildContent);
    return { loading: false, error: null, groupRef: { current: null } };
  },
}));
// The shared country selection: none unless a test selects one.
const selection = vi.hoisted(() => ({ country: null as { countryCode: string; name?: string } | null, select: vi.fn() }));
vi.mock('../../../context/CountrySelectionContext', () => ({
  useCountrySelection: () => ({ selectedCountry: selection.country, selectCountry: selection.select }),
}));
// The shared time (D-E): live unless a test pauses it on a window.
const temporal = vi.hoisted(() => ({ window: null as { start: number; end: number } | null }));
vi.mock('../../../context/TemporalContext', () => ({
  useTemporalStateOptional: () => (temporal.window
    ? { isLive: false, timeWindow: { start: new Date(temporal.window.start), end: new Date(temporal.window.end) } }
    : { isLive: true, timeWindow: null }),
}));
// The camera's detail tier, 1 (the default view) unless a test comes close; and a stand-in atlas.
const camera = vi.hoisted(() => ({ tier: 1 }));
vi.mock('../../../components/Globe/Hooks/useCameraDetailTier', () => ({ useCameraDetailTier: () => camera.tier }));
vi.mock('../../../components/Globe/diplomacySprites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../components/Globe/diplomacySprites')>()),
  diplomacyAtlas: async () => new THREE.Texture(),
}));
vi.mock('../../services/NationalTerritoriesService', () => ({
  nationalTerritoriesService: {
    getCountryCentroids: async () => new Map([['USA', { lat: 39, lng: -98 }], ['GBR', { lat: 54, lng: -2 }]]),
    getCountryDirectory: async () => [{ countryCode: 'USA', name: 'United States', lat: 39, lng: -98 }, { countryCode: 'GBR', name: 'United Kingdom', lat: 54, lng: -2 }],
  },
}));

import { useDiplomaticEvents3D } from '../useDiplomaticEvents3D';
import { useConflictZones3D } from '../useConflictZones3D';

/** Two hours before the snapshot's own time, as GDELT stamps it. */
const event = (root: string, code: string) => ({
  id: `e-${root}`, actor1ISO3: 'USA', actor2ISO3: 'GBR', eventCode: code, eventRootCode: root,
  goldsteinScale: root === '19' ? -9 : 5, lat: 51.5, lng: -0.1, sourceUrl: 'https://example.test/a', dateAdded: '20260911150000',
});

const diplomacyConfig = {
  eventTypes: { intent: true, consult: true, diplomatic: true, agreement: true, material: true, aid: true, yield: true },
  markerSize: 1, showConnections: false, connectionOpacity: 40, animateEvents: false,
  filters: { minOutlets: 1 as const, saidOrDone: 'both' as const, minConfidence: 0 as const, leadOnly: false }, placeBy: 'event' as const,
};
const conflictConfig = { layerTypes: { warEvents: true, humanitarianCrisis: false }, markerSize: 1 };

/*
 * How many countries a layer drew a mark for. Both layers used to draw one named mesh
 * per (event, country) — this counted those names; they draw one object per layer now,
 * with the countries it covers in userData (see eventAggregation.ts).
 */
const markers = (g: THREE.Group, source: string) => {
  let n = 0;
  g.traverse((o) => {
    // A mark per country, or (Diplomacy from D-DP step 3) per place.
    if (o.userData?.source === source) n += ((o.userData.countries ?? o.userData.places) as string[] | undefined)?.length ?? 0;
  });
  return n;
};

describe('GDELT layers measure "the last day" from the snapshot, not the clock', () => {
  beforeEach(() => {
    data.built.length = 0;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AS_OF + THREE_DAYS); // the snapshot is three days old
    data.diplomatic = { events: [event('04', '042')], asOf: AS_OF, from: FROM, error: null, loading: false };
    data.conflict = { events: [event('19', '190')], asOf: AS_OF, from: FROM, error: null, loading: false };
  });
  afterEach(() => { vi.useRealTimers(); });

  it('Diplomacy still draws a three-day-old snapshot\'s events', async () => {
    renderHook(() => useDiplomaticEvents3D({ enabled: true, scene: null, config: diplomacyConfig }));
    const group = await data.built.at(-1)!();
    expect(markers(group, 'diplomatic-events')).toBe(1); // one event, a mark where it happened
  });

  it('Conflict Zones still draws a three-day-old snapshot\'s war events', async () => {
    renderHook(() => useConflictZones3D({ enabled: true, scene: null, config: conflictConfig, view: 'countries' }));
    const group = await data.built.at(-1)!();
    expect(markers(group, 'conflict-war-event')).toBe(2);
  });

  /*
   * Diplomacy says it honours a chosen mark style (markerStyles.ts), and its build read the style, but
   * did not rebuild when it changed: a style picked showed only after something else changed. Found
   * with D-DP step 3, whose places draw a country-only place in a style chosen from it.
   */
  it('Diplomacy rebuilds its marks in a newly chosen style', async () => {
    const { rerender } = renderHook(({ style }) => useDiplomaticEvents3D({
      enabled: true, scene: null, config: diplomacyConfig, markerStyles: { DiplomaticEvents: style },
    }), { initialProps: { style: 'disc' as 'disc' | 'ring' } });
    const before = data.built.at(-1)!;
    rerender({ style: 'ring' });
    const after = data.built.at(-1)!;
    expect(after).not.toBe(before);
    const group = await after();
    const styles: string[] = [];
    group.traverse((o) => { if (o instanceof THREE.Points) styles.push(Object.keys((o.material as THREE.ShaderMaterial).defines ?? {}).join()); });
    expect(styles).toContain('STYLE_RING');
  });

  // D-DP, DP12: up close, each place is its kind's glyph; with the whole globe in view, a disc.
  it('Diplomacy draws glyphs up close, and discs from afar', async () => {
    camera.tier = 2;
    try {
      renderHook(() => useDiplomaticEvents3D({ enabled: true, scene: null, config: diplomacyConfig }));
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      const types: string[] = [];
      (await data.built.at(-1)!()).traverse((o) => { if (o instanceof THREE.Points) types.push(String(o.userData.type ?? 'disc')); });
      expect(types).toEqual(['diplomacySprites']);
    } finally {
      camera.tier = 1;
    }
    renderHook(() => useDiplomaticEvents3D({ enabled: true, scene: null, config: diplomacyConfig }));
    const types: string[] = [];
    (await data.built.at(-1)!()).traverse((o) => { if (o instanceof THREE.Points) types.push(String(o.userData.type ?? 'disc')); });
    expect(types).not.toContain('diplomacySprites');
  });

  it('and still drops an event from outside the day before the snapshot', async () => {
    data.diplomatic.events = [{ ...event('04', '042'), dateAdded: '20260909150000' }];
    renderHook(() => useDiplomaticEvents3D({ enabled: true, scene: null, config: diplomacyConfig }));
    const group = await data.built.at(-1)!();
    expect(markers(group, 'diplomatic-events')).toBe(0);
  });
});

/*
 * D-E; D-DP, DP15: one shared time. Live, a GDELT layer shows its snapshot's day; paused, the events
 * in the shared window, and its key says when the window reaches past the day.
 */
describe('GDELT layers follow the shared time', () => {
  const HOUR = 3_600_000;
  beforeEach(() => {
    data.built.length = 0;
    data.diplomatic = { events: [event('04', '042')], asOf: AS_OF, from: FROM, error: null, loading: false };
    data.conflict = { events: [event('19', '190')], asOf: AS_OF, from: FROM, error: null, loading: false };
    publishLegend('DiplomaticEvents', null);
    publishLegend('ConflictZones', null);
  });
  afterEach(() => { temporal.window = null; });

  it('Diplomacy shows the events in a paused window, and none outside it', async () => {
    temporal.window = { start: AS_OF - 3 * HOUR, end: AS_OF - HOUR };
    renderHook(() => useDiplomaticEvents3D({ enabled: true, scene: null, config: diplomacyConfig }));
    expect(markers(await data.built.at(-1)!(), 'diplomatic-events')).toBe(1);
    temporal.window = { start: AS_OF - 8 * HOUR, end: AS_OF - 6 * HOUR };
    renderHook(() => useDiplomaticEvents3D({ enabled: true, scene: null, config: diplomacyConfig }));
    expect(markers(await data.built.at(-1)!(), 'diplomatic-events')).toBe(0);
  });

  it('Conflict Zones shows the events in a paused window, and none outside it', async () => {
    temporal.window = { start: AS_OF - 8 * HOUR, end: AS_OF - 6 * HOUR };
    renderHook(() => useConflictZones3D({ enabled: true, scene: null, config: conflictConfig, view: 'countries' }));
    expect(markers(await data.built.at(-1)!(), 'conflict-war-event')).toBe(0);
  });

  // What it holds OF the window: where the two meet, not the whole day (the build's 775 of 897 places).
  it('says in the key when a paused window reaches past the snapshot\'s day, and what of it the snapshot holds', async () => {
    temporal.window = { start: AS_OF - 48 * HOUR, end: AS_OF - HOUR };
    renderHook(() => useDiplomaticEvents3D({ enabled: true, scene: null, config: diplomacyConfig }));
    await data.built.at(-1)!();
    expect(getLegends().find((l) => l.layerId === 'DiplomaticEvents')?.when)
      .toBe('holds only 10 Sep 17:15Z – 11 Sep 16:00Z of the window shown');
  });

  it('says it holds nothing when the window is wholly outside the day', async () => {
    temporal.window = { start: AS_OF - 72 * HOUR, end: AS_OF - 48 * HOUR };
    renderHook(() => useDiplomaticEvents3D({ enabled: true, scene: null, config: diplomacyConfig }));
    await data.built.at(-1)!();
    // Nothing drawn, and still a line in the key: an empty globe there is not a quiet day.
    expect(getLegends().find((l) => l.layerId === 'DiplomaticEvents')).toMatchObject({
      when: 'holds nothing in the window shown; its day is 10 Sep 17:15Z – 11 Sep 17:00Z', swatches: [],
    });
    renderHook(() => useConflictZones3D({ enabled: true, scene: null, config: conflictConfig, view: 'countries' }));
    await data.built.at(-1)!();
    expect(getLegends().find((l) => l.layerId === 'ConflictZones')?.when)
      .toBe('holds nothing in the window shown; its day is 10 Sep 17:15Z – 11 Sep 17:00Z');
  });

  it('says nothing of the day in live mode', async () => {
    renderHook(() => useDiplomaticEvents3D({ enabled: true, scene: null, config: diplomacyConfig }));
    await data.built.at(-1)!();
    expect(getLegends().find((l) => l.layerId === 'DiplomaticEvents')?.when).toBeUndefined();
  });
});

/*
 * D-DP, DP5 and DP16: arcs only for a selected country, to its counterparts, cooperation and conflict
 * from the same snapshot; while drawn, Diplomacy takes the selected country from the popup.
 */
describe('Diplomacy and a selected country', () => {
  const connected = { ...diplomacyConfig, showConnections: true };
  const arcsIn = (group: THREE.Group) => (group.getObjectByName('diplomatic-connections')?.children ?? []).map((c) => c.userData.kind);
  beforeEach(() => {
    data.built.length = 0;
    data.diplomatic = { events: [event('04', '042')], asOf: AS_OF, from: FROM, error: null, loading: false };
    data.conflict = { events: [event('19', '190')], asOf: AS_OF, from: FROM, error: null, loading: false };
    selection.select.mockReset();
    publishLegend('DiplomaticEvents', null);
  });
  afterEach(() => { selection.country = null; });

  it('draws no arcs with no country selected', async () => {
    renderHook(() => useDiplomaticEvents3D({ enabled: true, scene: null, config: connected }));
    expect(arcsIn(await data.built.at(-1)!())).toEqual([]);
  });

  it('draws a selected country\'s cooperation and conflict, and keys them by its name', async () => {
    selection.country = { countryCode: 'USA', name: 'United States' };
    renderHook(() => useDiplomaticEvents3D({ enabled: true, scene: null, config: connected }));
    expect(new Set(arcsIn(await data.built.at(-1)!()))).toEqual(new Set(['cooperation', 'conflict']));
    const labels = getLegends().find((l) => l.layerId === 'DiplomaticEvents')!.swatches.map((sw) => sw.label);
    expect(labels).toEqual(expect.arrayContaining(['cooperation with United States', 'conflict with United States']));
  });

  it('takes the selected country while drawn, and gives it back, cleared, when it goes', () => {
    const { unmount } = renderHook(() => useDiplomaticEvents3D({ enabled: true, scene: null, config: connected }));
    const taken = renderHook(() => useCountryPanelTaken());
    expect(taken.result.current).toBe(true);
    unmount();
    expect(taken.result.current).toBe(false);
    expect(selection.select).toHaveBeenCalledWith(null);
  });
});

describe('a GDELT failure reaches the caller', () => {
  beforeEach(() => { data.built.length = 0; });

  it('Diplomacy reports its data source\'s error', () => {
    data.diplomatic = { events: [], asOf: null, from: null, error: 'this build carries no GDELT snapshot', loading: false };
    const { result } = renderHook(() => useDiplomaticEvents3D({ enabled: true, scene: null, config: diplomacyConfig }));
    expect(result.current.error).toBe('GDELT: this build carries no GDELT snapshot');
  });

  it('Conflict Zones reports it per source, with the snapshot\'s time when there is one', () => {
    data.conflict = { events: [], asOf: null, from: null, error: 'HTTP 503', loading: false };
    const { result } = renderHook(() => useConflictZones3D({ enabled: true, scene: null, config: conflictConfig, view: 'countries' }));
    expect(result.current.warEventsError).toBe('HTTP 503');
    expect(result.current.error).toBe('GDELT: HTTP 503');

    data.conflict = { events: [], asOf: AS_OF, from: FROM, error: null, loading: false };
    const again = renderHook(() => useConflictZones3D({ enabled: true, scene: null, config: conflictConfig, view: 'countries' }));
    expect(again.result.current.warEventsAsOf).toBe(AS_OF);
  });
});
