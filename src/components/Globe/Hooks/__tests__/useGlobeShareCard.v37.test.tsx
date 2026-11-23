/**
 * The four-theatre front page through the share handle (theatre-lens.md, TL15–TL17;
 * contract v37): a renderBatch request's `{ brief, theatres }`, its theatres lit
 * together as the card's own lens, the planet centred among them, a row each.
 * The countries are Starcom's own outlines.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../../../hooks/useCyberCommandSettings', () => ({
  useCyberCommandSettings: () => ({ config: { markerStyles: {} }, updateMarkerStyle: vi.fn() }),
}));
vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({
    visualizationMode: { mode: 'CyberCommand', subMode: 'IntelReports' },
    setVisualizationMode: vi.fn(),
  }),
}));
const layer = (id: string, category: string, isPrimary: boolean) => ({
  id, label: id, category, description: '', isPrimary, isPinned: false, isActive: true, isImplemented: true,
});
vi.mock('../useGlobeLayerControl', () => ({
  useGlobeLayerControl: () => ({
    layers: [layer('IntelReports', 'CyberCommand', true), layer('WarConflict', 'GeoPolitical', false)],
    pinLayer: vi.fn(), unpinLayer: vi.fn(), clearPins: vi.fn(),
  }),
}));
// A capture that always succeeds, so whenReady reports ready on this fake globe.
vi.mock('../../../../features/globe/capture/captureGlobeFrame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/globe/capture/captureGlobeFrame')>()),
  captureGlobeFrame: () => ({ dataUrl: 'data:image/jpeg;base64,', width: 64, height: 64, mimeType: 'image/jpeg' }),
}));
// What a card is composed from, recorded; the fake globe has no camera to project its bounds or describe its picture.
const composed = vi.hoisted(() => ({
  inputs: [] as Array<{ featured: { id: string; title: string; lines: string[] } | null; fit?: string }>,
  /** The lens when each card was composed. */
  lens: [] as Array<readonly string[]>,
  lensNow: (): readonly string[] => [],
  frontPages: [] as unknown[],
}));
vi.mock('../../../../features/globe/capture/composeShareCard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/globe/capture/composeShareCard')>()),
  composeShareCard: async (_target: unknown, input: { featured: { id: string; title: string; lines: string[] } | null; fit?: string }) => {
    composed.inputs.push(input);
    composed.frontPages.push((input as unknown as { frontPage?: unknown }).frontPage ?? null);
    composed.lens.push(composed.lensNow());
    return {
      dataUrl: 'data:card', width: 1, height: 1, mimeType: 'image/png', provenance: { featured: input.featured },
      sourceRect: {}, frame: { width: 1, height: 1, dataUrl: 'data:frame' },
      regions: { picture: { x: 0, y: 0, width: 1, height: 1 }, footer: { x: 0, y: 1, width: 1, height: 0 } }, warnings: [],
    };
  },
}));
vi.mock('../../../../features/globe/capture/globeScreenBounds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/globe/capture/globeScreenBounds')>()),
  computeGlobeScreenBounds: () => ({ x: 340, y: 0, width: 600, height: 600 }),
}));
vi.mock('../../../../features/globe/capture/describeView', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/globe/capture/describeView')>()),
  describeScene: () => ({ layers: [{ layer: 'Intel Reports', inFrame: 2, drawn: 4, items: [], rankedBy: 'severity' }], notCounted: [] }),
}));
import * as fs from 'node:fs';
import { useGlobeShareCard, SHARE_HANDLE, type TheatreLens } from '../useGlobeShareCard';
import { buildTerritoryIndex } from '../../../../services/intel/coverage/territoryIndex';
import type { RegionOutline } from '../../../../services/raverWatch/usStates';
import type { FeedProvenance } from '../../../../features/globe/capture/shareCardProvenance';
import type { ShareReportInfo } from '../../../../features/globe/capture/shareReports';

const territories = buildTerritoryIndex(JSON.parse(fs.readFileSync('public/geopolitical/world-territories-lod0.geojson', 'utf8')).features);
const country = (code: string) => ({ code, region: territories.byCode(code) as unknown as RegionOutline });

import { briefFrontRows, type WarConflictBrief } from '../../../../services/warConflict/warConflictBrief';

function fakeGlobe() {
  let pov = { lat: 0, lng: 0, altitude: 2.5 };
  const canvas = { isConnected: true, clientWidth: 1280, clientHeight: 608 };
  return {
    current: {
      renderer: () => ({ domElement: canvas }),
      scene: () => ({}),
      camera: () => ({}),
      getGlobeRadius: () => 100,
      pointOfView: (next?: typeof pov) => { if (next) pov = { ...pov, ...next }; return pov; },
      controls: () => undefined,
    },
  };
}

type Result = { ok: boolean; reason?: string };
type Handle = {
  getView: () => { lat: number; lng: number; altitude: number };
  renderBatch: (requests: unknown, o?: { timeoutMs?: number }) => Promise<Result[]>;
};
const handle = () => (window as unknown as Record<string, Handle>)[SHARE_HANDLE];

const BRIEF: WarConflictBrief = {
  day: '2026-10-09', count: 9, noTheatre: 1, ids: [], title: 'War & Conflict Brief · 9 Oct 2026',
  lines: ['9 items reported on 9 Oct 2026 (UTC), posted on The Record'],
  theatres: [
    { slug: 'russia-ukraine', name: 'Russia–Ukraine war', count: 5, tier: 'major_war', mostSerious: { id: 'a', title: 'Missile strike on Kramatorsk' } },
    { slug: 'sudan', name: 'Sudanese civil war', count: 2, tier: 'major_war', mostSerious: { id: 'b', title: 'Shelling of El Fasher' } },
    { slug: 'haiti', name: 'Haiti gang war', count: 1, tier: null, mostSerious: { id: 'c', title: 'Gangs attack Kenscoff' } },
  ],
};
const COUNTRIES: Record<string, string[]> = { 'russia-ukraine': ['ua', 'ru'], sudan: ['sd'] };
const outline = (code: string) => ({ code, region: territories.byCode(code) as unknown as RegionOutline });

function lens() {
  const state = { cardLens: null as readonly string[] | null };
  const theatres: TheatreLens = {
    facts: (slug) => (COUNTRIES[slug]
      ? { slug, name: slug, reports: [], war: null, countries: COUNTRIES[slug].map(outline) }
      : null),
    slugs: () => Object.keys(COUNTRIES),
    lens: (slugs) => { state.cardLens = slugs; },
    lit: () => state.cardLens ?? [],
  };
  composed.lensNow = () => state.cardLens ?? [];
  return { state, theatres };
}

const warFeed: FeedProvenance = { name: 'War & Conflict', shortName: 'War & Conflict', lastUpdated: '2026-10-09T09:00:00.000Z', error: null, loading: false };
const mount = (theatres: TheatreLens) => renderHook(() => useGlobeShareCard({
  globeRef: fakeGlobe() as never, feeds: [warFeed], marks: null, onViewChosen: vi.fn(), shareReports: [], theatres, briefOf: () => BRIEF,
}));

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE];
  composed.inputs.length = 0;
  composed.lens.length = 0;
  composed.frontPages.length = 0;
});

describe('the four-theatre front page (TL15, v37)', () => {
  it('lights the brief\'s worst theatres together, centres the planet among them, and rows each', async () => {
    const { state, theatres } = lens();
    mount(theatres);
    const [result] = await handle().renderBatch([{ brief: 'latest', theatres: 2 }], { timeoutMs: 2000 });
    expect(result.reason).toBeUndefined();
    expect(composed.lens).toEqual([['russia-ukraine', 'sudan']]);
    expect(composed.frontPages[0]).toMatchObject({ day: '2026-10-09', lit: ['russia-ukraine', 'sudan'], lines: briefFrontRows(BRIEF, 2) });
    // Between Ukraine and Sudan, and as far out as the brief card.
    const view = handle().getView();
    expect(view.lat).toBeGreaterThan(20);
    expect(view.lat).toBeLessThan(45);
    expect(view.lng).toBeGreaterThan(20);
    expect(view.lng).toBeLessThan(42);
    expect(view.altitude).toBe(2.5);
    expect(state.cardLens).toBeNull();
  });

  it('lights one it cannot frame all the same, and rows it', async () => {
    const { theatres } = lens();
    mount(theatres);
    const [result] = await handle().renderBatch([{ brief: 'latest', theatres: 3 }], { timeoutMs: 2000 });
    expect(result.reason).toBeUndefined();
    expect(composed.lens).toEqual([['russia-ukraine', 'sudan', 'haiti']]);
    expect((composed.frontPages[0] as { lines: string[] }).lines).toContain('Haiti gang war · 1 item · on no war\'s list');
  });
});
