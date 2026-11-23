/**
 * A card about a War & Conflict theatre through the share handle (theatre-lens.md,
 * TL3; contract v36): `subject.theatre`, framed over its countries round the
 * smallest (TL14), its lens on while the card is made and the person's put back.
 * The countries are Starcom's own outlines, so the frame is checked on Ukraine's
 * and Russia's real shapes.
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
}));
vi.mock('../../../../features/globe/capture/composeShareCard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/globe/capture/composeShareCard')>()),
  composeShareCard: async (_target: unknown, input: { featured: { id: string; title: string; lines: string[] } | null; fit?: string }) => {
    composed.inputs.push(input);
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

type Result = { ok: boolean; reason?: string; shot?: { subject: unknown; framing: unknown } };
type Handle = {
  getView: () => { lat: number; lng: number; altitude: number };
  planShot: (shot: unknown, o?: { timeoutMs?: number }) => Promise<Result>;
  renderShot: (shot: unknown, o?: { timeoutMs?: number }) => Promise<Result>;
  renderBatch: (requests: unknown, o?: { timeoutMs?: number }) => Promise<Result[]>;
};
const handle = () => (window as unknown as Record<string, Handle>)[SHARE_HANDLE];

const item = (id: string, variant: string, lat: number, lng: number, title = `Item ${id}`): ShareReportInfo => ({
  id, layer: 'WarConflict', title, variant, variantMeans: variant, author: 'npub1abcdef…wxyz',
  time: { iso: '2026-10-09T08:00:00.000Z', basis: 'written' }, precisionM: 11000, lat, lng, sharesPlaceWith: 0,
});
const KRAMATORSK = item('k', 'deadly', 48.7, 37.6, 'Missile strike on Kramatorsk');
const BELGOROD = item('b', 'report', 50.6, 36.6);

/**
 * The War & Conflict layer as the handle sees it: its theatres; the person's pick,
 * which a card never sets; and a card's own lens over it, lit as soon as it is set
 * unless told not to.
 */
function lens(person: string | null = null) {
  const state = { person, cardLens: null as readonly string[] | null, lights: true };
  const shown = () => state.cardLens ?? (state.person ? [state.person] : []);
  const theatres: TheatreLens = {
    facts: (slug) => (slug === 'russia-ukraine'
      ? { slug, name: 'Russia–Ukraine war', reports: [KRAMATORSK, BELGOROD], war: { name: 'Russo-Ukrainian war', tierLabel: 'Major war' }, countries: [country('ua'), country('ru')] }
      : null),
    slugs: () => ['russia-ukraine', 'sudan'],
    lens: (slugs) => { state.cardLens = slugs; },
    lit: () => (state.lights ? shown() : (state.person ? [state.person] : [])),
  };
  composed.lensNow = () => shown();
  return { state, theatres };
}

const warFeed = (over: Partial<FeedProvenance> = {}): FeedProvenance => ({
  name: 'War & Conflict, war news posted on The Record', shortName: 'War & Conflict', lastUpdated: '2026-10-09T09:00:00.000Z', error: null, loading: false, ...over,
});
const mount = (theatres: TheatreLens, feeds: FeedProvenance[] = [warFeed()]) => renderHook(() => useGlobeShareCard({
  globeRef: fakeGlobe() as never, feeds, marks: null, onViewChosen: vi.fn(), shareReports: [KRAMATORSK, BELGOROD], theatres,
}));

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE];
  composed.inputs.length = 0;
  composed.lens.length = 0;
});

describe('a card about a theatre (TL3, v36)', () => {
  it('says what stands in it and its war, framed on Ukraine, with its lens on while it is made and the person\'s put back', async () => {
    const { state, theatres } = lens('sudan');
    mount(theatres);
    const made = await handle().renderShot({ subject: { theatre: 'russia-ukraine' } }, { timeoutMs: 2000 });
    expect(made.reason).toBeUndefined();
    const { featured, fit } = composed.inputs[0];
    expect(fit).toBe('view');
    expect(featured).toEqual({
      id: 'theatre:russia-ukraine',
      title: 'Russia–Ukraine war',
      position: expect.objectContaining({ lat: expect.any(Number), lng: expect.any(Number) }),
      lines: [
        '2 items standing in it: 1 with deaths reported, 1 report',
        'Most serious: Missile strike on Kramatorsk',
        'War: Russo-Ukrainian war (major war on Wikipedia\'s list)',
        'From War & Conflict\'s reports on The Record',
      ],
    });
    // Ukraine, not a far planet with Russia across it (TL14).
    const view = handle().getView();
    expect(view.lat).toBeGreaterThan(44);
    expect(view.lat).toBeLessThan(53);
    expect(view.lng).toBeGreaterThan(22);
    expect(view.lng).toBeLessThan(41);
    expect(view.altitude).toBeLessThan(1.6);
    // A hair above the floor, as frameReports aims: never read back below one radius.
    expect(view.altitude).toBeGreaterThan(1);
    expect(composed.lens).toEqual([['russia-ukraine']]);
    // Handed back: the person's pick shows again, never set by the card.
    expect(state.cardLens).toBeNull();
    expect(state.person).toBe('sudan');
  });

  it('turns the person\'s lens off for a card about something else, and puts it back', async () => {
    const { state, theatres } = lens('sudan');
    mount(theatres);
    const made = await handle().renderShot({ subject: { view: { lat: 10, lng: 20, altitude: 2 } } }, { timeoutMs: 2000 });
    expect(made.reason).toBeUndefined();
    expect(composed.lens).toEqual([[]]);
    expect(state.cardLens).toBeNull();
    expect(state.person).toBe('sudan');
  });

  it('is staged on a dry run too, and renderBatch takes a theatre as a request', async () => {
    const { state, theatres } = lens();
    mount(theatres);
    const plan = await handle().planShot({ subject: { theatre: 'russia-ukraine' } }, { timeoutMs: 2000 });
    expect(plan.shot).toMatchObject({ subject: { theatre: 'russia-ukraine' }, framing: { fit: 'view' } });
    expect(state.cardLens).toBeNull();
    const [result] = await handle().renderBatch([{ theatre: 'russia-ukraine', preset: 'square' }], { timeoutMs: 2000 });
    expect(result.reason).toBeUndefined();
    expect(composed.inputs[0].featured).toMatchObject({ id: 'theatre:russia-ukraine' });
  });

  it('refuses a theatre nothing read names, naming those read', async () => {
    mount(lens().theatres);
    const made = await handle().renderShot({ subject: { theatre: 'atlantis' } }, { timeoutMs: 2000 });
    expect(made.reason).toMatch(/^No theatre "atlantis" in what War & Conflict has read; it has read russia-ukraine, sudan\.$/);
    expect(composed.inputs).toEqual([]);
  });

  it('refuses when War & Conflict could not be read, or has not loaded in time', async () => {
    mount(lens().theatres, [warFeed({ error: 'no relay answered' })]);
    expect((await handle().renderShot({ subject: { theatre: 'russia-ukraine' } }, { timeoutMs: 2000 })).reason)
      .toMatch(/War & Conflict could not be read \(no relay answered\), so there is no theatre to draw/);
    delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE];
    mount(lens().theatres, [warFeed({ loading: true })]);
    expect((await handle().renderShot({ subject: { theatre: 'russia-ukraine' } }, { timeoutMs: 300 })).reason)
      .toMatch(/War & Conflict had not loaded after 300 ms, so there is no theatre to draw/);
  });

  it('refuses a card whose lens the globe never lit, and puts the person\'s back', async () => {
    const { state, theatres } = lens('sudan');
    state.lights = false;
    mount(theatres);
    const made = await handle().renderShot({ subject: { theatre: 'russia-ukraine' } }, { timeoutMs: 2000 });
    expect(made.reason).toMatch(/"russia-ukraine" was chosen for the lens and the globe had not lit it after 3 s/);
    expect(composed.inputs).toEqual([]);
    expect(state.cardLens).toBeNull();
    expect(state.person).toBe('sudan');
  });
});
