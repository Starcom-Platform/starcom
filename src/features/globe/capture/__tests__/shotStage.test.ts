/**
 * Staging a shot, and rendering it (decision IM1; globe record, section 21).
 *
 * A shot is staged through the same operations the share handle offers: its
 * layers, then its time, then its look; then it waits for its subject to be
 * drawn, frames it, and features it. What was not stated is left as the page
 * had it, and the shot that comes back states everything as it was drawn, so
 * a card's shot makes the same picture again. A blank frame is tried once
 * more. A card over the bytes asked for is made again at a lower quality, or
 * refused when it is a PNG, which has none.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest';
import { GlobeCaptureError } from '../captureGlobeFrame';
import { planShotWith, renderShotWith, type ShotStageDeps } from '../shotStage';
import { centreOf } from '../../../../services/intel/globe/linkedRecordPlacement';
import { briefFrontRows } from '../../../../services/warConflict/warConflictBrief';

const DECLASSIFIED_PAGE = {
  kind: 'declassified' as const, day: '2026-10-23', title: 'Declassified on 23 Oct 2026: 1 release', lines: ['One release · Archive A'], count: 1,
  records: [{ d: 'a', title: 'One release', source: 'x', sourceName: 'Archive A', publishedAt: '2026-10-23T09:00:00.000Z', licence: 'CC0', link: null }],
  credits: ['Archive A: CC0'],
};
const WEEK_PAGE = {
  kind: 'week' as const, week: '2026-w41', title: 'Hero Watch: the week to 8 October',
  lines: ['Relief: 1 operation and 144 organisations at work, in Ethiopia'], relief: 1, missions: 14, stations: 238,
};
const TONIGHT_PAGE = {
  kind: 'tonight' as const, fromS: 1_791_600_000, untilS: 1_791_643_200, title: 'Raver Watch · tonight from 10 Oct 2026 02:40Z',
  lines: ['12 scene events start in the twelve hours from 02:40Z, 3 in a hot town', 'US Pacific · 7 events · 3 under heat · first 20:00 PDT'],
  count: 12, underHeat: 3, underWay: 2, regions: [{ name: 'US Pacific', count: 7, underHeat: 3, first: { atS: 1_791_601_200, local: '20:00 PDT' } }],
};
const ADDRESS = '30023:pk:starcom-intel-conflict-wikipedia-x';
// A Psi Watch sky event's page (D-PW, PW62), as the handle reads it from the kit.
const PSI_KEY = '86f824c3f1e67c60b1dc15ce110648c4de5c3fb879022fbbcc5e8deb720e402c';
const PSI_SKY = `31923:${PSI_KEY}:psi-sky-aspect-Venus_Jupiter-h6k1-20261104T103121`;
const PSI_WINDOW = `31923:${PSI_KEY}:psi-window-focus-20261101`;
const PSI_PAGE = {
  kind: 'psi_event' as const, address: PSI_SKY, family: 'psi_sky_event' as const, title: 'Venus and Jupiter at ease (sextile)',
  lines: ['Exact 4 Nov 2026 10:31Z · its window 26 Oct 2026 21:36Z to 22 Dec 2026 23:04Z'],
  exactS: 1_793_788_281, window: { fromS: 1_792_980_969, peakS: 1_793_788_281, untilS: 1_796_751_885 }, atS: 1_793_788_281,
  bodies: ['Venus', 'Jupiter'], zones: [],
};
const LAYERS = ['IntelReports', 'WarConflict', 'ConflictZones', 'SceneEvents', 'Relief', 'FieldMissions', 'Lifeboats'];

function page(over: Partial<ShotStageDeps> = {}) {
  const calls: string[] = [];
  const state = {
    primary: 'IntelReports' as string | null,
    pins: [] as string[],
    window: null as null | { from: number; until: number },
    appearance: { skin: 'auto', lightMode: 'sun', nightFill: 0.15 } as { skin: string; lightMode: string; nightFill: number },
    featured: null as string | null,
    lit: null as string | null,
    // The theatre lens (theatre-lens.md, TL2, TL3): a person's own pick, or a card's.
    /** The card's own lens (null: handed back to the person's), and the person's pick, which the stage never sets. */
    cardLens: null as readonly string[] | null,
    person: null as string | null,
    // The card's territories style (decision K5): Quiet unless a shot names one.
    territories: 'quiet' as 'classic' | 'quiet',
    territoriesSet: [] as Array<'classic' | 'quiet' | null>,
    // Whether the card draws country names (decision K5, TS10), and each time it was set.
    namesSet: [] as boolean[],
    // The card's one mark style (plan H4), each time it was set.
    marksSet: [] as Array<string | null>,
    // How many calls had been made each time the stage waited for the marks, kept out of `calls` so the orders above stand.
    marksWaitedAfter: [] as number[],
  };
  const card = (bytes = 1000, quality?: number) => ({
    dataUrl: `data:image/png;base64,${'A'.repeat(Math.ceil((bytes * 4) / 3))}`,
    width: 1200, height: 900, mimeType: 'image/png', provenance: { quality }, sourceRect: { x: 0, y: 0, width: 1, height: 1 }, frame: { width: 1, height: 1 },
  });
  let clock = 1_000;
  const deps: ShotStageDeps = {
    layers: () => LAYERS,
    listLayers: () => LAYERS.map((id) => ({ id, primary: id === state.primary, pinned: state.pins.includes(id) })),
    setLayer: vi.fn((id: string, options?: { clearOtherPins?: boolean }) => {
      calls.push(`setLayer ${id}${options?.clearOtherPins ? ' clear' : ''}`);
      state.primary = id;
      if (options?.clearOtherPins) state.pins = [];
    }),
    pinLayers: vi.fn((ids: string[]) => { calls.push(`pinLayers ${ids.join(',')}`); state.pins = [...ids]; }),
    setTimeWindow: vi.fn(async (window: null | { from: number; until: number }) => { calls.push(`setTimeWindow ${window ? `${window.from}..${window.until}` : 'live'}`); state.window = window; }),
    setTimeMoment: vi.fn(async (at: number) => { calls.push(`setTimeMoment ${at}`); }),
    getTimeWindow: () => (state.window ? { ...state.window, live: false } : { from: null, until: null, live: true }),
    getAppearance: () => ({ ...state.appearance }),
    setAppearance: vi.fn((patch) => { calls.push(`setAppearance ${JSON.stringify(patch)}`); state.appearance = { ...state.appearance, ...patch }; }),
    setCardTerritories: vi.fn((style: 'classic' | 'quiet' | null) => { state.territoriesSet.push(style); state.territories = style ?? 'quiet'; }),
    cardTerritories: () => state.territories,
    setCardCountryNames: vi.fn((asks: boolean) => { state.namesSet.push(asks); }),
    untilCountryNames: vi.fn(async () => { calls.push('untilCountryNames'); }),
    setCardMarkStyle: vi.fn((style: 'disc' | 'glow' | 'ring' | null) => { state.marksSet.push(style); }),
    untilMarkStyleDrawn: vi.fn(async () => { state.marksWaitedAfter.push(calls.length); }),
    whenReady: vi.fn(async (options: { address?: string; timeoutMs: number }) => { calls.push(`whenReady ${options.address ?? ''}`); return { ready: true, waitedMs: 5 }; }),
    frameReports: vi.fn(async (ids: string[], options: { preset: string }) => { calls.push(`frameReports ${ids.join(',')} ${options.preset}`); }),
    setView: vi.fn(async (view) => { calls.push(`setView ${view.lat},${view.lng},${view.altitude}`); }),
    focusReport: vi.fn((id: string | null) => { calls.push(`focusReport ${id}`); state.featured = id; }),
    untilFeatured: vi.fn(async () => { calls.push('untilFeatured'); }),
    // An item that does not say what it is: the default card, unless a shot asks for a template.
    reportOf: vi.fn(() => ({ layer: 'WarConflict' })),
    // Every item may have a close-up, unless a test says otherwise.
    closeUpRefusal: vi.fn(() => null),
    untilBrief: vi.fn(async () => { throw new Error('No brief on this page.'); }),
    // An area's frame and its card's facts (BA22, BA23), once its shape is fetched.
    untilArea: vi.fn(async (code: string, preset: string) => {
      calls.push(`untilArea ${code} ${preset}`);
      return {
        code, name: 'European Union', view: { lat: 50, lng: 14, altitude: 1.2 },
        card: { id: `area:${code}`, title: 'European Union', position: { lat: 47.2, lng: 11.2 }, lines: ['No Intel Reports in it now'] },
      };
    }),
    // Lighting an area is said in the calls; clearing it only in the state, so other shots read as before.
    lightArea: vi.fn((code: string | null) => { if (code) calls.push(`lightArea ${code}`); state.lit = code; }),
    untilLit: vi.fn(async (code: string | null) => { if (code) calls.push(`untilLit ${code}`); }),
    // A theatre's frame and its card's facts (TL3), once War & Conflict has read it.
    untilTheatre: vi.fn(async (slug: string, preset: string) => {
      calls.push(`untilTheatre ${slug} ${preset}`);
      return {
        slug, view: { lat: 48.5, lng: 35, altitude: 1.4 },
        card: { id: `theatre:${slug}`, title: 'Russia–Ukraine war', position: { lat: 48.5, lng: 35 }, lines: ['5 items standing'] },
      };
    }),
    // Tonight's page and where its events centre (raver-nights.md, RN3), once Scene events are read.
    untilTonight: vi.fn(async () => { calls.push('untilTonight'); return { page: TONIGHT_PAGE, centre: { lat: 36, lng: -100 } }; }),
    untilWeek: vi.fn(async () => { calls.push('untilWeek'); return { page: WEEK_PAGE, centre: { lat: 30, lng: -40 } }; }),
    untilDeclassified: vi.fn(async (day: string) => { calls.push(`untilDeclassified ${day}`); return { page: DECLASSIFIED_PAGE }; }),
    untilPsiBriefing: vi.fn(async (atS: number) => {
      calls.push(`untilPsiBriefing ${atS}`);
      return {
        page: { kind: 'psi_briefing' as const, fromS: atS, untilS: atS + 604_800, title: 'PsiOps Briefing · 1 Nov to 8 Nov 2026', lines: ['No Psi Alert open.'], windows: 0, alerts: 0, kpTop: null },
        view: { lat: 15, lng: 5, altitude: 2.5 }, bodies: ['Sun', 'Moon'],
      };
    }),
    stripFor: vi.fn(async (options: { ask: unknown; atS: number; lit: string[]; bodies: string[] }) => {
      calls.push(`stripFor ${options.atS} ${options.lit.join(',')} ${options.bodies.join(',')}`);
      return { fromMs: (options.atS - 259_200) * 1000, untilMs: (options.atS + 259_200) * 1000, atMs: options.atS * 1000, lanes: ['windows', 'kp', 'bodies'], columns: 1, windows: [], kp: [], held: [], bodies: [], frame: 'galactic' as const };
    }),
    untilPsiEvent: vi.fn(async (address: string, at: 'exact' | number) => {
      calls.push(`untilPsiEvent ${address} ${at}`);
      return { page: { ...PSI_PAGE, address, atS: at === 'exact' ? PSI_PAGE.exactS : at }, primary: address.includes(':psi-window-') ? 'PsiWindows' as const : 'PsiLines' as const, view: { lat: -5, lng: 120, altitude: 2.5 } };
    }),
    // Tonight's hours on the timeline, read from their start (RN10).
    showTonight: vi.fn(async (w: { from: number; until: number }) => { calls.push(`showTonight ${w.from}..${w.until}`); }),
    // The person's timeline, held while tonight's card draws tonight, and its put-back (RN10).
    holdTimeline: vi.fn(() => { calls.push('holdTimeline'); return vi.fn(async () => { calls.push('putBack'); }); }),
    // Setting the lens is said in the calls only when a theatre is lit, so other shots read as before.
    setLens: vi.fn((slugs: readonly string[] | null) => { if (slugs?.length) calls.push(`setLens ${slugs.join(',')}`); state.cardLens = slugs; }),
    untilLensLit: vi.fn(async (slugs: readonly string[]) => { if (slugs.length) calls.push(`untilLensLit ${slugs.join(',')}`); }),
    compose: vi.fn(async (options) => { calls.push(`compose ${options.preset} ${options.mimeType} ${options.quality ?? '-'}`); return card(1000, options.quality); }),
    describeView: vi.fn(() => ({
      preset: 'wide',
      layers: [
        { layer: 'War & Conflict', inFrame: 3, drawn: 31, items: [], rankedBy: 'severity' },
        { layer: 'Conflict Zones', inFrame: 0, drawn: 12, items: [], rankedBy: 'severity' },
      ],
      notCounted: [],
    })),
    nextFrame: async () => {},
    now: () => { clock += 10; return clock; },
    ...over,
  };
  return { deps, calls, state, card };
}

describe('staging a shot', () => {
  it('sets its layers, then its time, then its look, waits for its subject, frames it, and features it', async () => {
    const { deps, calls } = page();
    const result = await renderShotWith({
      subject: { address: ADDRESS },
      layers: { primary: 'WarConflict', pins: ['ConflictZones'] },
      time: { window: { from: 100, until: 200 } },
      appearance: { light: 'headlamp' },
      card: { preset: 'square' },
    }, deps);
    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      'setLayer WarConflict clear',
      'pinLayers ConflictZones',
      'setTimeWindow 100..200',
      'setAppearance {"lightMode":"headlamp"}',
      `whenReady ${ADDRESS}`,
      `frameReports ${ADDRESS} square`,
      `focusReport ${ADDRESS}`,
      'untilFeatured',
      'compose square image/png -',
    ]);
  });

  it('leaves what was not stated as the page had it, and says all of it in the shot', async () => {
    const { deps, calls, state } = page();
    state.pins = ['SceneEvents'];
    state.window = { from: 5, until: 6 };
    const result = await renderShotWith({ subject: { address: ADDRESS } }, deps);
    expect(calls.filter((c) => /^(setLayer|pinLayers|setTimeWindow|setAppearance)/.test(c))).toEqual([]);
    expect(result.shot).toEqual({
      v: 1,
      subject: { address: ADDRESS },
      layers: { primary: 'IntelReports', pins: ['SceneEvents'] },
      time: { window: { from: 5, until: 6 } },
      emphasis: { featured: true },
      framing: { fit: 'view' },
      appearance: { skin: 'auto', light: 'sun', nightFill: 0.15, territories: 'quiet' },
      card: { preset: 'wide' },
      output: { type: 'image/png', scale: 1 },
    });
  });

  it('frames the card and describes its picture with the fit asked for', async () => {
    const { deps } = page();
    const result = await renderShotWith({ subject: { address: ADDRESS }, framing: { fit: 'planet' } }, deps);
    expect(result.shot?.framing).toEqual({ fit: 'planet' });
    expect(deps.compose).toHaveBeenCalledWith(expect.objectContaining({ fit: 'planet' }));
    await planShotWith({ subject: { address: ADDRESS }, framing: { fit: 'planet' } }, deps);
    expect(deps.describeView).toHaveBeenCalledWith({ preset: 'wide', fit: 'planet' });
  });

  it('moves the camera to a view, and features nothing', async () => {
    const { deps, calls } = page();
    const result = await renderShotWith({ subject: { view: { lat: 10, lng: 20, altitude: 2 } }, time: { live: true } }, deps);
    expect(result.ok).toBe(true);
    expect(calls).toEqual(['setTimeWindow live', 'whenReady ', 'setView 10,20,2', 'focusReport null', 'untilFeatured', 'compose wide image/png -']);
    expect(result.shot?.emphasis).toEqual({ featured: false });
    // With nothing featured, the whole planet (IM9).
    expect(result.shot?.framing).toEqual({ fit: 'planet' });
  });

  it('refuses before changing anything when the shot cannot be read', async () => {
    const { deps, calls } = page();
    const result = await renderShotWith({ subject: { address: ADDRESS }, layers: { pins: ['NoSuchLayer'] } }, deps);
    expect(result).toMatchObject({ ok: false });
    expect(result.reason).toMatch(/NoSuchLayer/);
    expect(calls).toEqual([]);
  });

  it('says why when its subject is not drawn in time, and makes no card', async () => {
    const { deps, calls } = page({ whenReady: vi.fn(async () => ({ ready: false, waitedMs: 300, reason: 'After 300 ms, "x" is not among the items drawn' })) });
    const result = await renderShotWith({ subject: { address: ADDRESS } }, deps, { timeoutMs: 300 });
    expect(result).toMatchObject({ ok: false, reason: 'After 300 ms, "x" is not among the items drawn' });
    expect(calls.some((c) => c.startsWith('compose'))).toBe(false);
  });

  it('gives a framing\'s refusal as its reason', async () => {
    const { deps } = page({ frameReports: vi.fn(async () => { throw new Error('These reports have no one side of the planet to look at'); }) });
    expect(await renderShotWith({ subject: { address: ADDRESS } }, deps)).toMatchObject({ ok: false, reason: 'These reports have no one side of the planet to look at' });
  });

  it('carries its notes through', async () => {
    const { deps } = page();
    const result = await renderShotWith({ subject: { address: ADDRESS }, card: { callouts: true } }, deps);
    expect(result.ok).toBe(true);
    expect(result.notes).toEqual(['card.callouts is not built yet: only the featured item is labelled']);
  });
});

// Block I, item 5: a render's warnings are the plan's and the card's own.
describe('the territories\' style on the card (decision K5, TS3)', () => {
  it('draws the style the shot names, says it in the shot, and sets it before waiting for the globe', async () => {
    const { deps, state } = page();
    let styleWhenReady: string | null = null;
    deps.whenReady = vi.fn(async () => { styleWhenReady = state.territories; return { ready: true, waitedMs: 5 }; });
    const result = await renderShotWith({ subject: { address: ADDRESS }, appearance: { territories: 'classic' } }, deps);
    expect(result.ok).toBe(true);
    expect(styleWhenReady).toBe('classic');
    expect(result.shot?.appearance.territories).toBe('classic');
  });

  it('draws Quiet where the shot names none, even after a shot that named Classic', async () => {
    const { deps, state } = page();
    await renderShotWith({ subject: { address: ADDRESS }, appearance: { territories: 'classic' } }, deps);
    const result = await renderShotWith({ subject: { address: ADDRESS } }, deps);
    expect(result.shot?.appearance.territories).toBe('quiet');
    expect(state.territoriesSet).toEqual(['classic', null, null, null]);
  });

  it('is the shot\'s alone: a render or a plan that ends, however it ends, leaves the next card Quiet', async () => {
    const { deps, state } = page();
    deps.whenReady = vi.fn(async () => ({ ready: false, waitedMs: 5, reason: 'not drawn' }));
    const failed = await renderShotWith({ subject: { address: ADDRESS }, appearance: { territories: 'classic' } }, deps);
    expect(failed.ok).toBe(false);
    expect(state.territories).toBe('quiet');
    const planned = page();
    await planShotWith({ subject: { address: ADDRESS }, appearance: { territories: 'classic' } }, planned.deps);
    expect(planned.state.territoriesSet.at(-1)).toBeNull();
    expect(planned.state.territories).toBe('quiet');
  });

  it('refuses a style there is none of, naming the styles', async () => {
    const { deps } = page();
    const result = await renderShotWith({ subject: { address: ADDRESS }, appearance: { territories: 'neon' } }, deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/territories "neon": the styles are classic, quiet/);
  });
});

describe('a render\'s warnings', () => {
  it('gives the layers that draw nothing in the picture, and the card\'s own warnings', async () => {
    const { deps, card } = page();
    deps.compose = vi.fn(async () => ({ ...card(), warnings: ['The headline was shortened to fit; the whole title is in the alt text and the provenance.'] }));
    const result = await renderShotWith({ subject: { address: ADDRESS } }, deps);
    expect(result.warnings).toEqual([
      'Conflict Zones draws nothing in this picture (12 elsewhere on the globe)',
      'The headline was shortened to fit; the whole title is in the alt text and the provenance.',
    ]);
  });

  it('still makes the card when its picture cannot be described: the warnings are advice', async () => {
    const { deps } = page({ describeView: vi.fn(() => { throw new Error('no canvas to measure on'); }) });
    const result = await renderShotWith({ subject: { address: ADDRESS } }, deps);
    expect(result).toMatchObject({ ok: true, warnings: [] });
  });

  it('asks the card for its alt text unless the shot says not to', async () => {
    const { deps } = page();
    await renderShotWith({ subject: { address: ADDRESS } }, deps);
    expect(vi.mocked(deps.compose).mock.calls[0][0].alt).toBe(true);
    const off = page();
    const result = await renderShotWith({ subject: { address: ADDRESS }, output: { alt: false } }, off.deps);
    expect(vi.mocked(off.deps.compose).mock.calls[0][0].alt).toBe(false);
    expect(result.shot?.output.alt).toBe(false);
  });
});

describe('a plan that cannot describe its picture', () => {
  it('says why, as a refusal, rather than throwing', async () => {
    const { deps } = page({ describeView: vi.fn(() => { throw new Error('The 1080×1920 card\'s text needs 1222px of it'); }) });
    expect(await planShotWith({ subject: { address: ADDRESS } }, deps)).toMatchObject({ ok: false, reason: expect.stringMatching(/needs 1222px/) });
  });
});

describe('rendering it', () => {
  it('passes the shot, its type, quality and scale to the card, and times each part', async () => {
    const { deps } = page();
    const result = await renderShotWith({ subject: { address: ADDRESS }, output: { type: 'image/webp', quality: 0.8, scale: 2 } }, deps);
    expect(deps.compose).toHaveBeenCalledWith({ preset: 'wide', fit: 'view', scale: 2, mimeType: 'image/webp', quality: 0.8, shot: result.shot, template: null, frontPage: null, alt: true });
    expect(result.timing).toEqual({ stageMs: expect.any(Number), composeMs: expect.any(Number), bytes: 1000 });
  });

  it('asks the card and the dry run for a QR code when the shot does, and says so in the shot (IM13)', async () => {
    const { deps } = page();
    const result = await renderShotWith({ subject: { address: ADDRESS }, card: { qr: true } }, deps);
    expect(deps.compose).toHaveBeenCalledWith(expect.objectContaining({ qr: true }));
    expect(deps.describeView).toHaveBeenCalledWith(expect.objectContaining({ qr: true }));
    expect(result.shot?.card).toMatchObject({ qr: true });
    const plain = page();
    await renderShotWith({ subject: { address: ADDRESS } }, plain.deps);
    expect(plain.deps.compose).toHaveBeenCalledWith(expect.not.objectContaining({ qr: expect.anything() }));
  });

  it('asks the card for a close-up of the featured item when the shot does, and says so in the shot (IM36)', async () => {
    const { deps } = page();
    const result = await renderShotWith({ subject: { address: ADDRESS }, card: { inset: true } }, deps);
    expect(deps.closeUpRefusal).toHaveBeenCalledWith(ADDRESS);
    expect(deps.compose).toHaveBeenCalledWith(expect.objectContaining({ inset: true }));
    expect(result.shot?.card).toMatchObject({ inset: true });
    const plain = page();
    await renderShotWith({ subject: { address: ADDRESS } }, plain.deps);
    expect(plain.deps.compose).toHaveBeenCalledWith(expect.not.objectContaining({ inset: expect.anything() }));
    expect(plain.deps.closeUpRefusal).not.toHaveBeenCalled();
  });

  it('refuses a close-up the item may not have, saying why, before the camera moves (IM2)', async () => {
    const why = 'A close-up is never for an Intel Report, whose place can be a filing address rather than where anything happened (IM2).';
    const { deps, calls } = page({ closeUpRefusal: vi.fn(() => why) });
    const plan = await planShotWith({ subject: { address: ADDRESS }, card: { inset: true } }, deps);
    expect(plan).toMatchObject({ ok: false, reason: why });
    expect(calls.some((c) => c.startsWith('frameReports') || c.startsWith('focusReport'))).toBe(false);
    const render = await renderShotWith({ subject: { address: ADDRESS }, card: { inset: true } }, deps);
    expect(render).toMatchObject({ ok: false, reason: why });
    expect(deps.compose).not.toHaveBeenCalled();
  });

  it('refuses a close-up when the shot features nothing', async () => {
    const view = page();
    const plan = await planShotWith({ subject: { view: { lat: 0, lng: 0, altitude: 2 } }, card: { inset: true } }, view.deps);
    expect(plan).toMatchObject({ ok: false, reason: expect.stringMatching(/card\.inset asks for a close-up of the featured item, and this shot features none/) });
    const unfeatured = page();
    const render = await renderShotWith({ subject: { address: ADDRESS }, emphasis: { featured: false }, card: { inset: true } }, unfeatured.deps);
    expect(render.ok).toBe(false);
    expect(unfeatured.deps.closeUpRefusal).not.toHaveBeenCalled();
  });

  it('tries a blank frame once more, and says so when it is blank again', async () => {
    let blanks = 1;
    const { deps, card } = page({ compose: vi.fn(async () => { if (blanks-- > 0) throw new GlobeCaptureError('the captured frame is blank'); return card(); }) });
    expect((await renderShotWith({ subject: { address: ADDRESS } }, deps)).ok).toBe(true);
    blanks = 2;
    expect(await renderShotWith({ subject: { address: ADDRESS } }, deps)).toMatchObject({ ok: false, reason: expect.stringMatching(/blank/) });
  });

  it('makes a card over its bytes again at a lower quality, and says the quality it used', async () => {
    const { deps, card } = page();
    deps.compose = vi.fn(async (options) => card(options.quality >= 0.7 ? 9_000 : 4_000, options.quality));
    const result = await renderShotWith({ subject: { address: ADDRESS }, output: { type: 'image/webp', quality: 0.9, maxBytes: 5_000 } }, deps);
    expect(result.ok).toBe(true);
    expect(result.timing?.bytes).toBe(4_000);
    expect(result.shot?.output.quality).toBeLessThan(0.7);
    expect(result.notes.join(' ')).toMatch(/over 5000 bytes at quality 0\.9/);
  });

  it('refuses a PNG over its bytes, saying what would fit', async () => {
    const { deps, card } = page();
    deps.compose = vi.fn(async () => card(9_000));
    const result = await renderShotWith({ subject: { address: ADDRESS }, output: { maxBytes: 5_000 } }, deps);
    expect(result).toMatchObject({ ok: false });
    expect(result.reason).toMatch(/9000 bytes.*5000.*image\/webp/);
  });
});

describe('planning it: a dry run', () => {
  it('stages the shot, composes nothing, says what is in frame, and warns of a layer that draws nothing there', async () => {
    const { deps } = page();
    const plan = await planShotWith({ subject: { address: ADDRESS }, layers: { pins: ['ConflictZones'] } }, deps);
    expect(deps.compose).not.toHaveBeenCalled();
    expect(plan).toMatchObject({ ok: true, inFrame: [{ layer: 'War & Conflict', inFrame: 3 }, { layer: 'Conflict Zones', inFrame: 0 }] });
    expect(plan.warnings).toEqual(['Conflict Zones draws nothing in this picture (12 elsewhere on the globe)']);
    expect(plan.shot?.layers.pins).toEqual(['ConflictZones']);
  });

  it('says how long the last card took on this page, once one was made', async () => {
    const { deps } = page();
    expect((await planShotWith({ subject: { address: ADDRESS } }, deps)).estimatedComposeMs).toBeNull();
    await renderShotWith({ subject: { address: ADDRESS } }, deps);
    expect((await planShotWith({ subject: { address: ADDRESS } }, deps)).estimatedComposeMs).toEqual(expect.any(Number));
  });

  it('refuses as rendering would', async () => {
    const { deps } = page();
    expect(await planShotWith({ subject: { mission: 'x' } }, deps)).toMatchObject({ ok: false, reason: expect.stringMatching(/mission/) });
  });
});

// The badge is a claim about the item, so the item decides it where it says (IM14).
describe('the card\'s template', () => {
  const withItem = (item: { layer: string; role?: string } | null) => page({ reportOf: vi.fn(() => item) } as Partial<ShotStageDeps>);
  const composedWith = (deps: ShotStageDeps) => vi.mocked(deps.compose).mock.calls[0][0];

  it('takes it from what the item says it is, when the shot names none, and states it as drawn', async () => {
    const { deps } = withItem({ layer: 'WarConflict', role: 'critical' });
    const result = await renderShotWith({ subject: { address: ADDRESS } }, deps);
    expect(result.shot?.card).toEqual({ preset: 'wide', template: 'critical_intel' });
    expect(composedWith(deps).template).toEqual({ name: 'critical_intel', chosenBy: 'item' });
    expect(vi.mocked(deps.reportOf)).toHaveBeenCalledWith(ADDRESS);
  });

  it('refuses a template the item disagrees with, and composes nothing', async () => {
    const { deps, calls } = withItem({ layer: 'WarConflict', role: 'context' });
    const result = await renderShotWith({ subject: { address: ADDRESS }, card: { template: 'critical_intel' } }, deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/role is context: its card is context_report, not critical_intel/);
    expect(calls.some((c) => c.startsWith('compose'))).toBe(false);
    // Decided before the camera moves: a refusal leaves the view as it was.
    expect(calls.some((c) => c.startsWith('frameReports') || c.startsWith('focusReport'))).toBe(false);
  });

  it('lets the shot choose where the item does not say, and tells the card so', async () => {
    const { deps } = withItem({ layer: 'IntelReports' });
    const result = await renderShotWith({ subject: { address: ADDRESS }, card: { template: 'actionable_intel' } }, deps);
    expect(result.shot?.card.template).toBe('actionable_intel');
    expect(composedWith(deps).template).toEqual({ name: 'actionable_intel', chosenBy: 'shot' });
  });

  it('makes the default card, as before, when neither says', async () => {
    const { deps } = withItem({ layer: 'IntelReports' });
    const result = await renderShotWith({ subject: { address: ADDRESS } }, deps);
    expect(result.shot?.card).toEqual({ preset: 'wide' });
    expect(composedWith(deps).template).toBeNull();
  });

  it('refuses in a plan as the render would', async () => {
    const { deps } = withItem({ layer: 'SceneEvents' });
    const plan = await planShotWith({ subject: { address: ADDRESS }, card: { template: 'critical_intel' } }, deps);
    expect(plan.ok).toBe(false);
    expect(plan.reason).toMatch(/Raver Watch: its card is raver_alert/);
  });

  it('asks nothing of an item on a camera view', async () => {
    const { deps } = withItem(null);
    const result = await renderShotWith({ subject: { view: { lat: 10, lng: 20, altitude: 2 } }, card: { template: 'hazard' } }, deps);
    expect(result.shot?.card).toEqual({ preset: 'wide', template: 'hazard' });
    expect(vi.mocked(deps.reportOf)).not.toHaveBeenCalled();
    expect(composedWith(deps).template).toEqual({ name: 'hazard', chosenBy: 'shot' });
  });
});

// IM16: the War & Conflict Brief's front page, a subject of its own.
describe('the brief\'s front page', () => {
  const BRIEF = {
    day: '2026-10-02', count: 4, noTheatre: 1, ids: ['a', 'b', 'c'],
    theatres: [{ slug: 'x', name: 'X war', count: 3, tier: 'major_war' as const }],
    title: 'War & Conflict Brief · 2 Oct 2026', lines: ['4 items reported on 2 Oct 2026 (UTC)', 'By war, worst first: X war 3', '1 names no war'],
    centre: { lat: 30, lng: 40 } as { lat: number; lng: number } | null,
  };
  const withBrief = (brief = BRIEF) => page({ untilBrief: vi.fn(async () => brief) } as Partial<ShotStageDeps>);

  it('turns War & Conflict on, waits for the day, centres the camera on its items, and features none', async () => {
    const { deps, calls } = withBrief();
    expect((await renderShotWith({ subject: { brief: 'latest' } }, deps)).ok).toBe(true);
    expect(calls.indexOf('setLayer WarConflict')).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf('setLayer WarConflict')).toBeLessThan(calls.indexOf('setView 30,40,2.5'));
    expect(calls).toContain('focusReport null');
    expect(vi.mocked(deps.untilBrief)).toHaveBeenCalledWith('latest', expect.any(Number));
  });

  it('states the day it drew, and the whole planet, as a shot that makes it again', async () => {
    const { deps } = withBrief();
    const result = await renderShotWith({ subject: { brief: 'latest' } }, deps);
    expect(result.shot).toMatchObject({
      subject: { brief: '2026-10-02' }, emphasis: { featured: false }, framing: { fit: 'planet' }, card: { template: 'conflict_brief' },
    });
  });

  it('gives the card its front page, its badge chosen by its subject', async () => {
    const { deps } = withBrief();
    await renderShotWith({ subject: { brief: '2026-10-02' }, card: { template: 'conflict_brief' } }, deps);
    const asked = vi.mocked(deps.compose).mock.calls[0][0];
    expect(asked.template).toEqual({ name: 'conflict_brief', chosenBy: 'subject' });
    expect(asked.frontPage).toEqual({
      template: 'conflict_brief', day: '2026-10-02', title: BRIEF.title, lines: BRIEF.lines, count: 4, noTheatre: 1,
      theatres: [{ name: 'X war', count: 3, tier: 'major_war' }],
    });
  });

  it('leaves the camera where it is when the day\'s items have no one centre', async () => {
    const { deps, calls } = withBrief({ ...BRIEF, centre: null });
    expect((await renderShotWith({ subject: { brief: 'latest' } }, deps)).ok).toBe(true);
    expect(calls.some((c) => c.startsWith('setView'))).toBe(false);
  });

  it('says why when there is no brief for the day', async () => {
    const { deps, calls } = page({ untilBrief: vi.fn(async () => { throw new Error('No War & Conflict items were read for 2026-09-01 (UTC).'); }) } as Partial<ShotStageDeps>);
    expect(await renderShotWith({ subject: { brief: '2026-09-01' } }, deps)).toMatchObject({ ok: false, reason: expect.stringMatching(/No War & Conflict items/) });
    expect(calls.some((c) => c.startsWith('compose'))).toBe(false);
  });

  // The four-theatre front page (theatre-lens.md, TL15–TL17).
  describe('narrowed to its worst theatres', () => {
    const FOUR = {
      ...BRIEF, count: 20,
      theatres: [
        { slug: 'russia-ukraine', name: 'Russia–Ukraine war', count: 8, tier: 'major_war' as const, mostSerious: { id: 'a', title: 'Missile strike on Kramatorsk' } },
        { slug: 'sudan', name: 'Sudanese civil war', count: 5, tier: 'major_war' as const, mostSerious: { id: 'b', title: 'Shelling of El Fasher' } },
        { slug: 'sahel', name: 'Sahel', count: 4, tier: 'minor_war' as const, mostSerious: { id: 'c', title: 'Attack near Gao' } },
        { slug: 'haiti', name: 'Haiti gang war', count: 2, tier: null, mostSerious: { id: 'd', title: 'Gangs attack Kenscoff' } },
        { slug: 'myanmar', name: 'Myanmar', count: 1, tier: 'major_war' as const },
      ],
    };
    const MIDDLES: Record<string, { lat: number; lng: number }> = {
      'russia-ukraine': { lat: 48.7, lng: 31 }, sudan: { lat: 15.5, lng: 30 }, sahel: { lat: 17.5, lng: 1.7 }, haiti: { lat: 18.9, lng: -72.8 },
    };
    const withFour = (unframed: string[] = []) => page({
      untilBrief: vi.fn(async () => FOUR),
      untilTheatre: vi.fn(async (slug: string) => {
        if (unframed.includes(slug)) throw new Error(`${slug} has no country drawn here and no item standing`);
        return { slug, view: { ...MIDDLES[slug], altitude: 1 }, card: { id: `theatre:${slug}`, title: slug, position: MIDDLES[slug], lines: [] } };
      }),
    } as Partial<ShotStageDeps>);
    const setView = (calls: string[]) => calls.find((c) => c.startsWith('setView'))!.slice('setView '.length).split(',').map(Number);

    it('lights the worst four, in the brief\'s order, together, with the planet centred among them', async () => {
      const { deps, calls } = withFour();
      const result = await renderShotWith({ subject: { brief: 'latest', theatres: 4 } }, deps);
      expect(result.ok).toBe(true);
      expect(vi.mocked(deps.untilTheatre).mock.calls.map((c) => c[0])).toEqual(['russia-ukraine', 'sudan', 'sahel', 'haiti']);
      expect(calls).toContain('setLens russia-ukraine,sudan,sahel,haiti');
      expect(calls).toContain('untilLensLit russia-ukraine,sudan,sahel,haiti');
      const centre = centreOf(Object.values(MIDDLES).map((m) => ({ latitude: m.lat, longitude: m.lng })))!;
      const [lat, lng, altitude] = setView(calls);
      expect(lat).toBeCloseTo(centre.lat, 6);
      expect(lng).toBeCloseTo(centre.lng, 6);
      expect(altitude).toBe(2.5);
      expect(result.shot).toMatchObject({ subject: { brief: '2026-10-02', theatres: 4 }, framing: { fit: 'planet' }, card: { template: 'conflict_brief' } });
    });

    it('cards each of them in a row, worst first, and says which it lit', async () => {
      const { deps } = withFour();
      await renderShotWith({ subject: { brief: 'latest', theatres: 4 } }, deps);
      const asked = vi.mocked(deps.compose).mock.calls[0][0];
      expect(asked.frontPage).toEqual({
        template: 'conflict_brief', day: '2026-10-02', title: FOUR.title, lines: briefFrontRows(FOUR, 4), count: 20, noTheatre: 1,
        theatres: FOUR.theatres.map(({ name, count, tier }) => ({ name, count, tier })),
        lit: ['russia-ukraine', 'sudan', 'sahel', 'haiti'],
      });
    });

    it('lights fewer when asked, and one it cannot frame all the same, centred among the rest', async () => {
      const two = withFour();
      await renderShotWith({ subject: { brief: 'latest', theatres: 2 } }, two.deps);
      expect(two.calls).toContain('setLens russia-ukraine,sudan');
      const unframed = withFour(['haiti']);
      expect((await renderShotWith({ subject: { brief: 'latest', theatres: 4 } }, unframed.deps)).ok).toBe(true);
      expect(unframed.calls).toContain('setLens russia-ukraine,sudan,sahel,haiti');
      const centre = centreOf(['russia-ukraine', 'sudan', 'sahel'].map((s) => ({ latitude: MIDDLES[s].lat, longitude: MIDDLES[s].lng })))!;
      expect(setView(unframed.calls)[0]).toBeCloseTo(centre.lat, 6);
    });
  });

  it('gives an item\'s card no front page', async () => {
    const { deps } = withBrief();
    await renderShotWith({ subject: { address: ADDRESS } }, deps);
    expect(vi.mocked(deps.compose).mock.calls[0][0].frontPage).toBeNull();
    expect(vi.mocked(deps.untilBrief)).not.toHaveBeenCalled();
  });
});

// A render lets the page settle a frame after staging: what follows the last change (a refill, a
// relit sun) has drawn before the picture is taken, so the same shot makes the same picture.
describe('settling before the picture', () => {
  it('waits a frame after staging and before composing', async () => {
    const { deps, calls } = page();
    deps.nextFrame = vi.fn(async () => { calls.push('settle'); });
    await renderShotWith({ subject: { address: ADDRESS } }, deps);
    const settled = calls.indexOf('settle');
    expect(settled).toBeGreaterThan(calls.indexOf('untilFeatured'));
    expect(settled).toBeLessThan(calls.findIndex((c) => c.startsWith('compose')));
  });
});

// IM20: a shot's time.at pauses the shared timeline at that moment, before the subject is framed.
describe('a moment in time', () => {
  it('pauses the timeline at it, in the order of the rest, and states it as drawn', async () => {
    const { deps, calls } = page();
    const result = await renderShotWith({ subject: { address: ADDRESS }, time: { at: 1_790_967_291 } }, deps);
    expect(result.ok).toBe(true);
    expect(calls.indexOf('setTimeMoment 1790967291')).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf('setTimeMoment 1790967291')).toBeLessThan(calls.findIndex((c) => c.startsWith('whenReady')));
    expect(result.shot?.time).toEqual({ at: 1_790_967_291 });
  });
});

// BA22, BA23: a card about an area, framed to its largest part and lit, its Intel Reports counted.
describe('an area as the subject', () => {
  it('draws Intel Reports, frames the area, lights it, and cards it with what it says of the area', async () => {
    const { deps, calls, state } = page();
    state.primary = 'WarConflict';
    const result = await renderShotWith({ subject: { area: 'EU' }, card: { preset: 'square' } }, deps);
    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      'setLayer IntelReports',
      'whenReady ',
      'untilArea union:eu square',
      'setView 50,14,1.2',
      'focusReport null',
      'untilFeatured',
      'lightArea union:eu',
      'untilLit union:eu',
      'compose square image/png -',
    ]);
    const asked = (deps.compose as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(asked.area).toEqual({ id: 'area:union:eu', title: 'European Union', position: { lat: 47.2, lng: 11.2 }, lines: ['No Intel Reports in it now'] });
    expect(result.shot).toMatchObject({ subject: { area: 'union:eu' }, emphasis: { featured: false }, framing: { fit: 'view' } });
  });

  it('keeps pins asked beside Intel Reports', async () => {
    const { deps, calls } = page();
    await renderShotWith({ subject: { area: 'union:eu' }, layers: { pins: ['WarConflict'] } }, deps);
    expect(calls.slice(0, 2)).toEqual(['setLayer IntelReports clear', 'pinLayers WarConflict']);
  });

  it('refuses when the area cannot be framed, before the camera moves', async () => {
    const { deps, calls } = page({ untilArea: vi.fn(async () => { throw new Error('The areas\' shapes could not be fetched.'); }) });
    const result = await renderShotWith({ subject: { area: 'union:eu' } }, deps);
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/could not be fetched/) });
    expect(calls.some((c) => c.startsWith('setView'))).toBe(false);
  });

  it('a shot of anything else leaves no area lit, even one that fails', async () => {
    const { deps, state } = page();
    state.lit = 'union:eu';
    await renderShotWith({ subject: { address: ADDRESS } }, deps);
    expect(state.lit).toBeNull();
    const plain = (deps.compose as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(plain.area ?? null).toBeNull();
    const failing = page({ whenReady: vi.fn(async () => ({ ready: false, waitedMs: 5, reason: 'not drawn' })) });
    failing.state.lit = 'union:eu';
    expect((await renderShotWith({ subject: { address: ADDRESS } }, failing.deps)).ok).toBe(false);
    expect(failing.state.lit).toBeNull();
  });

  it('a plan stages it the same way, and composes nothing', async () => {
    const { deps, calls } = page();
    const plan = await planShotWith({ subject: { area: 'union:eu' } }, deps);
    expect(plan.ok).toBe(true);
    expect(calls).toContain('lightArea union:eu');
    expect(calls.some((c) => c.startsWith('compose'))).toBe(false);
  });
});

describe('a theatre as the subject (theatre-lens.md, TL3)', () => {
  it('draws War & Conflict, frames the theatre, lights it, and cards it with what it says of the theatre', async () => {
    const { deps, calls, state } = page();
    state.primary = 'IntelReports';
    const result = await renderShotWith({ subject: { theatre: 'russia-ukraine' }, card: { preset: 'square' } }, deps);
    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      'setLayer WarConflict',
      'whenReady ',
      'untilTheatre russia-ukraine square',
      'setView 48.5,35,1.4',
      'focusReport null',
      'untilFeatured',
      'setLens russia-ukraine',
      'untilLensLit russia-ukraine',
      'compose square image/png -',
    ]);
    const asked = (deps.compose as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(asked.area).toMatchObject({ id: 'theatre:russia-ukraine', title: 'Russia–Ukraine war' });
    expect(result.shot).toMatchObject({ subject: { theatre: 'russia-ukraine' }, emphasis: { featured: false }, framing: { fit: 'view' } });
  });

  it('hands the lens back to the person\'s pick, untouched, however the card ends', async () => {
    const { deps, state } = page();
    state.person = 'sahel';
    await renderShotWith({ subject: { theatre: 'russia-ukraine' } }, deps);
    expect(state.cardLens).toBeNull();
    expect(state.person).toBe('sahel');
    const failing = page({ untilTheatre: vi.fn(async () => { throw new Error('No theatre "nowhere": the War & Conflict Brief names them.'); }) });
    failing.state.cardLens = ['sahel'];
    const result = await renderShotWith({ subject: { theatre: 'nowhere' } }, failing.deps);
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/No theatre/) });
    expect(failing.state.cardLens).toBeNull();
  });

  it('draws no person\'s lens on a card about anything else, and hands it back after', async () => {
    const { deps, state } = page();
    state.person = 'sahel';
    let during: readonly string[] | null = null;
    (deps.compose as ReturnType<typeof vi.fn>).mockImplementation(async () => { during = state.cardLens; return { dataUrl: 'data:image/png;base64,AAAA', width: 1, height: 1, mimeType: 'image/png', provenance: {}, sourceRect: { x: 0, y: 0, width: 1, height: 1 }, frame: { width: 1, height: 1 } }; });
    await renderShotWith({ subject: { address: ADDRESS } }, deps);
    // An empty lens: none, whatever the person picked.
    expect(during).toEqual([]);
    expect(state.cardLens).toBeNull();
    expect(state.person).toBe('sahel');
  });

  it('a plan stages it the same way, puts the lens back, and composes nothing', async () => {
    const { deps, calls, state } = page();
    const plan = await planShotWith({ subject: { theatre: 'russia-ukraine' } }, deps);
    expect(plan.ok).toBe(true);
    expect(calls).toContain('setLens russia-ukraine');
    expect(state.cardLens).toBeNull();
    expect(calls.some((c) => c.startsWith('compose'))).toBe(false);
  });
});

describe('country names on the card (decision K5, TS10)', () => {
  it('asks for them before waiting for the globe, waits until they can be drawn, and says so in the shot', async () => {
    const { deps, calls, state } = page();
    const result = await renderShotWith({ subject: { address: ADDRESS }, appearance: { countryNames: true } }, deps);
    expect(result.ok).toBe(true);
    expect(state.namesSet[0]).toBe(true);
    expect(calls.indexOf('untilCountryNames')).toBeLessThan(calls.indexOf(`whenReady ${ADDRESS}`));
    expect(result.shot?.appearance.countryNames).toBe(true);
  });

  it('draws none where the shot does not ask, waits for nothing, and says nothing of them', async () => {
    const { deps, calls, state } = page();
    const result = await renderShotWith({ subject: { address: ADDRESS } }, deps);
    expect(state.namesSet[0]).toBe(false);
    expect(calls).not.toContain('untilCountryNames');
    expect(result.shot?.appearance).not.toHaveProperty('countryNames');
  });

  it('is the shot\'s alone: the names are off again however its render ends, a refusal included', async () => {
    const { deps, state } = page();
    deps.untilCountryNames = vi.fn(async () => { throw new Error('the territories overlay is off'); });
    const result = await renderShotWith({ subject: { address: ADDRESS }, appearance: { countryNames: true } }, deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/overlay is off/);
    expect(state.namesSet.at(-1)).toBe(false);
    const planned = page();
    await planShotWith({ subject: { address: ADDRESS }, appearance: { countryNames: true } }, planned.deps);
    expect(planned.state.namesSet.at(-1)).toBe(false);
  });

  it('refuses anything but true or false', async () => {
    const { deps } = page();
    const result = await renderShotWith({ subject: { address: ADDRESS }, appearance: { countryNames: 'yes' } }, deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/appearance\.countryNames is true or false/);
  });
});

describe('one mark style on the card (plan H4, contract v54)', () => {
  it('asks for it before waiting for the globe, waits until every layer draws it, and says so in the shot', async () => {
    const { deps, calls, state } = page();
    const result = await renderShotWith({ subject: { address: ADDRESS }, appearance: { markStyle: 'ring' } }, deps);
    expect(result.ok).toBe(true);
    expect(state.marksSet[0]).toBe('ring');
    expect(state.marksWaitedAfter[0]).toBeLessThanOrEqual(calls.indexOf(`whenReady ${ADDRESS}`));
    expect(result.shot?.appearance.markStyle).toBe('ring');
  });

  it('leaves each layer its own where the shot names none, and says nothing of it', async () => {
    const { deps, state } = page();
    const result = await renderShotWith({ subject: { address: ADDRESS } }, deps);
    expect(state.marksSet[0]).toBeNull();
    expect(result.shot?.appearance).not.toHaveProperty('markStyle');
  });

  it("is the shot's alone: each layer's own style is back however its render ends, a refusal included", async () => {
    const { deps, state } = page();
    deps.untilMarkStyleDrawn = vi.fn(async () => { throw new Error('the globe is not showing'); });
    const result = await renderShotWith({ subject: { address: ADDRESS }, appearance: { markStyle: 'glow' } }, deps);
    expect(result.ok).toBe(false);
    expect(state.marksSet.at(-1)).toBeNull();
    const planned = page();
    await planShotWith({ subject: { address: ADDRESS }, appearance: { markStyle: 'glow' } }, planned.deps);
    expect(planned.state.marksSet).toEqual(['glow', null]);
  });

  it('refuses a style the shader does not draw', async () => {
    const { deps } = page();
    const result = await renderShotWith({ subject: { address: ADDRESS }, appearance: { markStyle: 'bloom' } }, deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/markStyle "bloom": the styles are disc, glow, ring/);
  });
});

// Mecha Jono, 30 Oct: a card draws the ψ field's looks the shot names, whoever's panel is open (contract v71).
describe("the ψ field's looks on a card", () => {
  const withLooks = (listed: Array<{ id: string; primary: boolean; pinned: boolean }> | null = null) => {
    const { deps, state } = page();
    const looksSet: Array<readonly string[] | null> = [];
    deps.setCardPsiLooks = vi.fn((looks) => { looksSet.push(looks ? [...looks] : null); });
    if (listed) deps.listLayers = () => listed;
    return { deps, state, looksSet };
  };

  it('draws the looks the shot names, says them in the panel\'s order, and gives the person\'s back after', async () => {
    const { deps, looksSet } = withLooks();
    const result = await renderShotWith({ subject: { address: ADDRESS }, appearance: { psiLooks: ['flow', 'heat'] } }, deps);
    expect(result.ok).toBe(true);
    expect(looksSet[0]).toEqual(['heat', 'flow']);
    expect(looksSet.at(-1)).toBeNull();
    expect(result.shot?.appearance.psiLooks).toEqual(['heat', 'flow']);
  });

  it('draws heat and contours where the shot names none, and says so only where the field is drawn', async () => {
    const plain = withLooks();
    const without = await renderShotWith({ subject: { address: ADDRESS } }, plain.deps);
    expect(plain.looksSet[0]).toEqual(['heat', 'contours']);
    expect(without.shot?.appearance).not.toHaveProperty('psiLooks');
    const field = withLooks([...LAYERS.map((id) => ({ id, primary: false, pinned: false })), { id: 'PsiModel', primary: false, pinned: true }]);
    const withField = await renderShotWith({ subject: { address: ADDRESS } }, field.deps);
    expect(withField.shot?.appearance.psiLooks).toEqual(['heat', 'contours']);
  });

  it('refuses a look the field does not draw, a look named twice, or none', async () => {
    for (const psiLooks of [['glow'], ['heat', 'heat'], []]) {
      const { deps } = withLooks();
      const result = await renderShotWith({ subject: { address: ADDRESS }, appearance: { psiLooks } }, deps);
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/appearance\.psiLooks names the ψ field's looks to draw, each once/);
    }
  });
});

// Hero Watch's week (hero-watch.md, HW10; contract v42).
describe('the week as the subject', () => {
  it('draws Relief with the week\'s other sections pinned, reads the week, turns to it, and cards the week\'s page', async () => {
    const { deps, calls } = page();
    const result = await renderShotWith({ subject: { week: 'latest' } }, deps);
    expect(result.ok).toBe(true);
    expect(calls.slice(0, 5)).toEqual(['setLayer Relief', 'pinLayers FieldMissions,Lifeboats', 'whenReady ', 'untilWeek', 'setView 30,-40,2.5']);
    const asked = vi.mocked(deps.compose).mock.calls[0][0];
    expect(asked.frontPage).toEqual(WEEK_PAGE);
    expect(asked.template).toBeNull();
    expect(result.shot).toMatchObject({ subject: { week: 'latest' }, framing: { fit: 'planet' }, emphasis: { featured: false } });
  });

  it('pins the other sections beside a primary the shot names, and only the shot\'s own pins where it gives them', async () => {
    const named = page();
    await renderShotWith({ subject: { week: 'latest' }, layers: { primary: 'Lifeboats' } }, named.deps);
    expect(named.calls.slice(0, 2)).toEqual(['setLayer Lifeboats', 'pinLayers Relief,FieldMissions']);
    const pinned = page();
    await renderShotWith({ subject: { week: 'latest' }, layers: { primary: 'Relief', pins: ['FieldMissions'] } }, pinned.deps);
    expect(pinned.calls.filter((c) => c.startsWith('pinLayers'))).toEqual(['pinLayers FieldMissions']);
  });

  it('is refused with why, when nothing stands to put on the week\'s card', async () => {
    const { deps } = page({ untilWeek: vi.fn(async () => { throw new Error('Hero Watch has nothing standing to put on a week\'s card.'); }) } as Partial<ShotStageDeps>);
    const result = await renderShotWith({ subject: { week: 'latest' } }, deps);
    expect(result).toMatchObject({ ok: false, reason: 'Hero Watch has nothing standing to put on a week\'s card.' });
  });
});

// The declassified desk's day (plan H9; contract v58).
describe('the declassified day as the subject', () => {
  it('draws Intel Reports, reads the day, leaves the camera, and cards the day\'s page as declassified, chosen by its subject', async () => {
    const { deps, calls } = page();
    const result = await renderShotWith({ subject: { declassified: 'latest' } }, deps);
    expect(result.ok).toBe(true);
    expect(calls.slice(0, 3)).toEqual(['setLayer IntelReports', 'whenReady ', 'untilDeclassified latest']);
    expect(calls.some((c) => c.startsWith('setView'))).toBe(false);
    const asked = vi.mocked(deps.compose).mock.calls[0][0];
    expect(asked.frontPage).toEqual(DECLASSIFIED_PAGE);
    expect(asked.template).toEqual({ name: 'declassified', chosenBy: 'subject' });
    // The day drawn, so the shot makes the same page again.
    expect(result.shot).toMatchObject({ subject: { declassified: '2026-10-23' }, card: { template: 'declassified' }, framing: { fit: 'planet' } });
  });

  it('is refused with why, when the day has no release', async () => {
    const { deps } = page({ untilDeclassified: vi.fn(async () => { throw new Error('The Record holds no declassified release for 2026-10-21.'); }) } as Partial<ShotStageDeps>);
    const result = await renderShotWith({ subject: { declassified: '2026-10-21' } }, deps);
    expect(result).toMatchObject({ ok: false, reason: 'The Record holds no declassified release for 2026-10-21.' });
  });
});

// Tonight's card (raver-nights.md, RN3; contract v38).
describe('tonight as the subject', () => {
  it('draws Scene events, reads tonight, turns the planet to tonight\'s events, and cards tonight\'s page', async () => {
    const { deps, calls, state } = page();
    state.primary = 'IntelReports';
    const result = await renderShotWith({ subject: { tonight: 'latest' } }, deps);
    expect(result.ok).toBe(true);
    // The person's timeline held first, then tonight's twelve hours on it, and the page ready again before the camera moves (RN10).
    expect(calls.slice(0, 7)).toEqual([
      'holdTimeline', 'setLayer SceneEvents', 'whenReady ', 'untilTonight', 'showTonight 1791600000..1791643200', 'whenReady ', 'setView 36,-100,2.5',
    ]);
    const asked = vi.mocked(deps.compose).mock.calls[0][0];
    expect(asked.frontPage).toEqual(TONIGHT_PAGE);
    expect(asked.template).toBeNull();
    // The shot states tonight's start as its moment, so it makes the same card again.
    expect(result.shot).toMatchObject({ subject: { tonight: 'latest' }, time: { at: 1_791_600_000 }, framing: { fit: 'planet' }, emphasis: { featured: false } });
    expect(asked.shot.time).toEqual({ at: 1_791_600_000 });
    // Put back once, after the card is made.
    expect(calls.filter((c) => c === 'putBack')).toHaveLength(1);
    expect(calls.indexOf('putBack')).toBeGreaterThan(calls.findIndex((c) => c.startsWith('compose')));
  });

  it('holds the person\'s timeline from before the shot\'s own moment, and puts it back after a plan as after a card', async () => {
    const { deps, calls } = page();
    const plan = await planShotWith({ subject: { tonight: 'latest' }, time: { at: 1_791_600_000 } }, deps);
    expect(plan.ok).toBe(true);
    expect(calls.indexOf('holdTimeline')).toBeLessThan(calls.indexOf('setTimeMoment 1791600000'));
    expect(calls.at(-1)).toBe('putBack');
  });

  it('puts the timeline back when tonight is refused, and says so when it could not', async () => {
    const refused = page({ untilTonight: vi.fn(async () => { throw new Error('No scene events start in the twelve hours from 10 Oct 2026 02:40Z.'); }) } as Partial<ShotStageDeps>);
    await renderShotWith({ subject: { tonight: 'latest' } }, refused.deps);
    expect(refused.calls.at(-1)).toBe('putBack');
    const stuck = page({ holdTimeline: vi.fn(() => async () => { throw new Error('it had not moved after 15 s'); }) } as Partial<ShotStageDeps>);
    const result = await renderShotWith({ subject: { tonight: 'latest' } }, stuck.deps);
    expect(result.ok).toBe(true);
    expect(result.warnings).toContain('The timeline was not put back as it was: it had not moved after 15 s');
    const plan = await planShotWith({ subject: { tonight: 'latest' } }, stuck.deps);
    expect(plan.warnings).toContain('The timeline was not put back as it was: it had not moved after 15 s');
  });

  it('says why when there is no tonight to draw, and composes nothing', async () => {
    const { deps, calls } = page({ untilTonight: vi.fn(async () => { throw new Error('No scene events start in the twelve hours from 10 Oct 2026 02:40Z.'); }) } as Partial<ShotStageDeps>);
    expect(await renderShotWith({ subject: { tonight: 'latest' } }, deps)).toMatchObject({ ok: false, reason: expect.stringMatching(/No scene events start/) });
    expect(calls.some((c) => c.startsWith('compose'))).toBe(false);
  });

  it('gives any other card no tonight', async () => {
    const { deps } = page();
    await renderShotWith({ subject: { address: ADDRESS } }, deps);
    expect(vi.mocked(deps.untilTonight)).not.toHaveBeenCalled();
    // Any other card leaves the timeline as its shot set it, as before.
    expect(vi.mocked(deps.holdTimeline)).not.toHaveBeenCalled();
  });
});

describe('a psi event as the subject (D-PW, PW62)', () => {
  const PSI_LAYERS = [...LAYERS, 'PsiLines', 'PsiWindows', 'PsiField'];

  it('opens it, draws it on its layer at its moment, waits for it, faces it, and makes the psi card of its page', async () => {
    const { deps, calls } = page({ layers: () => PSI_LAYERS });
    const result = await renderShotWith({ subject: { psiEvent: PSI_SKY } }, deps);
    expect(result.ok).toBe(true);
    expect(calls.slice(0, 5)).toEqual([
      `untilPsiEvent ${PSI_SKY} exact`, 'setLayer PsiLines', `setTimeMoment ${PSI_PAGE.exactS}`, `whenReady ${PSI_SKY}`, 'setView -5,120,2.5',
    ]);
    const asked = (deps.compose as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(asked.template).toEqual({ name: 'psi', chosenBy: 'subject' });
    expect(asked.frontPage).toMatchObject({ kind: 'psi_event', address: PSI_SKY, atS: PSI_PAGE.exactS });
    // As drawn: the moment in unix seconds, repeated as time.at, so the same shot reads back and draws it again.
    expect(result.shot).toMatchObject({ subject: { psiEvent: PSI_SKY, at: PSI_PAGE.exactS }, time: { at: PSI_PAGE.exactS }, framing: { fit: 'planet' } });
  });

  it('draws a window on Windows with Planet lines beside it, unless the shot pins its own', async () => {
    const { deps, calls } = page({ layers: () => PSI_LAYERS });
    await renderShotWith({ subject: { psiEvent: PSI_WINDOW, at: 1_793_560_000 } }, deps);
    expect(calls.slice(0, 4)).toEqual([`untilPsiEvent ${PSI_WINDOW} 1793560000`, 'setLayer PsiWindows', 'pinLayers PsiLines', 'setTimeMoment 1793560000']);
    const pinned = page({ layers: () => PSI_LAYERS });
    await renderShotWith({ subject: { psiEvent: PSI_WINDOW }, layers: { pins: ['PsiField'] } }, pinned.deps);
    expect(pinned.calls.slice(0, 3)).toEqual([`untilPsiEvent ${PSI_WINDOW} exact`, 'setLayer PsiWindows clear', 'pinLayers PsiField']);
  });

  it('refuses with the handle\'s reason when there is no such event', async () => {
    const { deps } = page({ layers: () => PSI_LAYERS, untilPsiEvent: vi.fn(async () => { throw new Error('No Psi Watch event "x"'); }) });
    expect(await renderShotWith({ subject: { psiEvent: PSI_SKY } }, deps)).toMatchObject({ ok: false, reason: 'No Psi Watch event "x"' });
  });
});

describe('a Timestream strip in the card (D-PW, PW62, PW77)', () => {
  const PSI_LAYERS = [...LAYERS, 'PsiLines', 'PsiWindows', 'PsiField'];

  it('makes the strip at the psi event\'s moment, its event lit and its bodies\' lanes, and composes it under the picture', async () => {
    const { deps, calls } = page({ layers: () => PSI_LAYERS });
    const result = await renderShotWith({ subject: { psiEvent: PSI_SKY }, card: { strip: true } }, deps);
    expect(result.ok).toBe(true);
    expect(calls).toContain(`stripFor ${PSI_PAGE.exactS} ${PSI_SKY} Venus,Jupiter`);
    const asked = (deps.compose as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(asked.timestream).toMatchObject({ atMs: PSI_PAGE.exactS * 1000, lanes: ['windows', 'kp', 'bodies'] });
    // As drawn: its span and lanes, so the same shot draws the same strip.
    expect(result.shot?.card.strip).toEqual({ from: PSI_PAGE.exactS - 259_200, until: PSI_PAGE.exactS + 259_200, lanes: ['windows', 'kp', 'bodies'] });
  });

  it('takes any card\'s moment, and makes none unless asked', async () => {
    const asked = page();
    await renderShotWith({ subject: { address: ADDRESS }, time: { at: 1_793_000_000 }, card: { strip: { lanes: ['kp'] } } }, asked.deps);
    expect(asked.calls).toContain('stripFor 1793000000  ');
    const plain = page();
    await renderShotWith({ subject: { address: ADDRESS } }, plain.deps);
    expect(plain.calls.some((c) => c.startsWith('stripFor'))).toBe(false);
    expect((plain.deps.compose as ReturnType<typeof vi.fn>).mock.calls[0][0].timestream).toBeUndefined();
  });

  it('refuses with the handle\'s reason when Psi Watch is off', async () => {
    const { deps } = page({ stripFor: vi.fn(async () => { throw new Error('card.strip draws the Timestream, which shows with Psi Watch on'); }) });
    expect(await renderShotWith({ subject: { address: ADDRESS }, card: { strip: true } }, deps)).toMatchObject({ ok: false, reason: expect.stringMatching(/Psi Watch on/) });
  });
});

describe('an event chart in the card (D-PW, PW87)', () => {
  it('makes the chart with the sky at the shot\'s moment outside, composes it, and states it as drawn', async () => {
    const { deps } = page();
    const at = 1_794_300_000;
    const result = await renderShotWith({ subject: { address: ADDRESS }, time: { at: 1_794_400_000 }, card: { chart: { at, lat: 3, lng: 41, title: 'Mandera' } } }, deps);
    expect(result.ok).toBe(true);
    const asked = (deps.compose as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(asked.chart.drawn).toEqual({ at, lat: 3, lng: 41, title: 'Mandera', cursorAt: 1_794_400_000, frame: 'galactic' });
    expect(asked.chart.wheel.then.points).toHaveLength(11);
    // As drawn: every part stated, so the same shot draws the same chart.
    expect(result.shot?.card.chart).toEqual({ at, lat: 3, lng: 41, title: 'Mandera', cursorAt: 1_794_400_000, frame: 'galactic' });
    const plain = page();
    await renderShotWith({ subject: { address: ADDRESS } }, plain.deps);
    expect((plain.deps.compose as ReturnType<typeof vi.fn>).mock.calls[0][0].chart).toBeUndefined();
  });
});

describe('the PsiOps Briefing as the subject (D-PW, PW77)', () => {
  const PSI_LAYERS = [...LAYERS, 'PsiLines', 'PsiWindows', 'PsiRifts'];

  it('draws Windows with Planet lines and Psi Alerts beside, reads the week at its moment, faces it, and strips it by default', async () => {
    const { deps, calls } = page({ layers: () => PSI_LAYERS });
    const result = await renderShotWith({ subject: { psiBriefing: 'latest' }, time: { at: 1_793_500_000 } }, deps);
    expect(result.ok).toBe(true);
    expect(calls.slice(0, 4)).toEqual(['untilPsiBriefing 1793500000', 'setLayer PsiWindows', 'pinLayers PsiLines,PsiRifts', 'setTimeMoment 1793500000']);
    expect(calls).toEqual(expect.arrayContaining(['setView 15,5,2.5', 'stripFor 1793500000  Sun,Moon']));
    // Its strip spans its week.
    expect((deps.stripFor as ReturnType<typeof vi.fn>).mock.calls[0][0].ask).toEqual({ from: 1_793_500_000, until: 1_793_500_000 + 604_800 });
    const asked = (deps.compose as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(asked.template).toEqual({ name: 'psi', chosenBy: 'subject' });
    expect(asked.frontPage).toMatchObject({ kind: 'psi_briefing', fromS: 1_793_500_000 });
    expect(result.shot?.card.strip).toMatchObject({ lanes: ['windows', 'kp', 'bodies'] });
  });

  it('drops the strip when the shot says strip: false', async () => {
    const { deps, calls } = page({ layers: () => PSI_LAYERS });
    await renderShotWith({ subject: { psiBriefing: 'latest' }, card: { strip: false } }, deps);
    expect(calls.some((c) => c.startsWith('stripFor'))).toBe(false);
  });
});
