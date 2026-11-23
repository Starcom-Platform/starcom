/**
 * The pipeline's ORDER and its refusals.
 *
 * ─── WHAT THIS FILE CANNOT PROVE ───────────────────────────────────────────
 *
 * Not that the card looks right. jsdom has no canvas and cannot decode an
 * image, so every pixel here comes from a recorder. The picture is proven by
 * `scripts/smoke-share-card.mjs`, which now calls this very function in a real
 * browser and writes a PNG for a person to open.
 *
 * What IS worth pinning here is the sequence, because the sequence is where
 * this file can be silently wrong:
 *
 *   - bounds measured against the CAPTURE's frame, not the live canvas
 *   - the sphere bounds padded by the stated fraction
 *   - the canvas sized before anything is drawn on it
 *   - capturedAt read from the clock, never from the caller
 *   - a blank frame refused rather than composed into a card
 *
 * Each of those produces a plausible-looking card when it is wrong, which is
 * exactly the class of defect this feature exists to refuse.
 */
import { describe, it, expect, vi } from 'vitest';
import { IMAGERY } from '../../../../globe-engine/imagery';
import * as THREE from 'three';
import {
  composeShareCard,
  planCardPicture,
  DEFAULT_PAD_FRACTION,
  ShareCardCompositionError,
  type ComposeDeps,
  type ShareCardCanvas,
  type ShareCardTarget,
} from '../composeShareCard';
import { computeGlobeScreenBounds } from '../globeScreenBounds';
import { CARD_PRESETS, CARD_TYPE_LARGER } from '../shareCardLayout';
import { GlobeCaptureError } from '../captureGlobeFrame';
import { readXmp, withCardRecord } from '../cardFileRecord';
import { onStill } from '../../../../globe-engine/captureClock';
import { encodeQr } from '../cardQr';
import type { CardInset } from '../closeUpInset';
import { stripModel } from '../timestreamStrip';
import { chartForCard } from '../chartCard';
import { kpRecord } from '../../../../services/psiWatch/timestream/kp';

const RADIUS = 100;
const CANVAS_W = 1400;
const CANVAS_H = 708;

const NOW = new Date('2026-09-10T12:00:00.000Z');

/** A real camera, positioned like the globe's, plus a stub renderer. */
function makeTarget(opts: { blankPixels?: boolean; log?: string[] } = {}) {
  const canvas = {
    width: CANVAS_W,
    height: CANVAS_H,
    toDataURL: vi.fn(() => 'data:image/png;base64,' + 'A'.repeat(4000)),
  };
  let readCount = 0;
  const gl = {
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    readPixels: (
      _x: number, _y: number, w: number, h: number, _f: number, _t: number, out: Uint8Array,
    ) => {
      // Every pixel of the read: a blank frame is read whole before it is called blank.
      const v = opts.blankPixels ? 7 : (readCount++ % 251);
      for (let k = 0; k < w * h * 4; k += 4) { out[k] = v; out[k + 1] = v; out[k + 2] = v; out[k + 3] = 255; }
    },
  };
  const events: string[] = opts.log ?? [];
  const renderer = {
    domElement: canvas,
    getContext: () => gl,
    getPixelRatio: () => 1,
    setPixelRatio: vi.fn(),
    setSize: vi.fn((w: number, h: number) => { canvas.width = w; canvas.height = h; }),
    render: vi.fn(() => { events.push('render'); }),
  };

  const camera = new THREE.PerspectiveCamera(50, CANVAS_W / CANVAS_H, 0.1, 10000);
  camera.position.set(0, 0, RADIUS * 3.5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const target = {
    renderer: () => renderer,
    scene: () => ({}),
    camera: () => camera,
    getGlobeRadius: () => RADIUS,
  } as unknown as ShareCardTarget;

  return { target, canvas, renderer, camera, events };
}

/** A canvas that records what was asked of it, and when. */
function makeDeps(over: { noContext?: boolean; log?: string[] } = {}) {
  const events: string[] = over.log ?? [];
  const drawn: Array<Record<string, number>> = [];
  const ctx = {
    fillStyle: '', strokeStyle: '', font: '', textBaseline: 'alphabetic' as CanvasTextBaseline,
    fillRect: vi.fn(), fillText: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    // The key's swatches are drawn as arcs.
    arc: vi.fn(), fill: vi.fn(), closePath: vi.fn(), lineWidth: 1,
    // An event chart's wheel (PW87) draws dashed, faded and centred.
    save: vi.fn(), restore: vi.fn(), setLineDash: vi.fn(), strokeRect: vi.fn(), globalAlpha: 1, textAlign: 'start' as CanvasTextAlign,
    // Roughly proportional to the real thing; enough for wrapping to behave.
    measureText: (t: string) => ({ width: t.length * 8 }),
    drawImage: vi.fn((
      _img: unknown, sx: number, sy: number, sw: number, sh: number,
      dx: number, dy: number, dw: number, dh: number,
    ) => {
      events.push(`drawImage@${canvas.width}x${canvas.height}`);
      drawn.push({ sx, sy, sw, sh, dx, dy, dw, dh });
    }),
  };
  const canvas: ShareCardCanvas = {
    width: 300,
    height: 150,
    getContext: () => (over.noContext ? null : (ctx as never)),
    toDataURL: vi.fn(() => 'data:image/png;base64,CARD'),
  };
  const deps: ComposeDeps = {
    createCanvas: () => canvas,
    loadImage: async (dataUrl) => {
      events.push(`loadImage:${dataUrl.slice(0, 22)}`);
      return {} as CanvasImageSource;
    },
    now: () => NOW,
    appearance: () => ({ skin: 'Blue Marble', lightMode: 'sun' as const }),
    legend: () => [],
  };
  return { deps, canvas, ctx, events, drawn };
}

const INPUT = {
  camera: { lat: 0, lon: 0, altitude: 2.5 },
  layers: [
    { label: 'Intel Reports', active: true, implemented: true },
    { label: 'Comm Hubs', active: true, implemented: false },
    { label: 'Satellites', active: false, implemented: true },
  ],
  feeds: [],
};

describe('composeShareCard', () => {
  it('renders the card\'s window at the card\'s own resolution, and scale times that', async () => {
    /*
     * The frame IS the card's picture (block I, item 2): the window is rendered
     * through the camera's view offset at the card's size, so the card draws it
     * whole, never letterboxed and never upscaled. Scale multiplies its pixels.
     */
    const at1 = makeTarget();
    const d1 = makeDeps();
    await composeShareCard(at1.target, INPUT, d1.deps);
    const at2 = makeTarget();
    const d2 = makeDeps();
    await composeShareCard(at2.target, { ...INPUT, scale: 2 }, d2.deps);

    // The default size is the link preview (IM28): its picture square beside its text while the text fits (IM27).
    expect(at1.renderer.setSize.mock.calls[0]).toEqual([630, 630, false]);
    expect(at2.renderer.setSize.mock.calls[0]).toEqual([1260, 1260, false]);
    const one = d1.drawn[0];
    const two = d2.drawn[0];
    expect(one).toMatchObject({ sx: 0, sy: 0, sw: 630, sh: 630, dx: 0, dy: 0, dw: 630, dh: 630 });
    expect(two).toMatchObject({ sx: 0, sy: 0, sw: 1260, sh: 1260, dw: 630, dh: 630 });
  });

  it('pads the sphere by the stated fraction', async () => {
    /*
     * Both padBounds and expandToAspect are centre-preserving proportional
     * growths, so they commute exactly. The claim worth pinning is that the
     * padding happens at all, and by 0.12 rather than the 0.06 that clipped
     * the atmosphere's glow.
     */
    const { target, camera } = makeTarget();
    const { deps } = makeDeps();
    const raw = computeGlobeScreenBounds(target, { width: CANVAS_W, height: CANVAS_H });
    const offsets = vi.spyOn(camera, 'setViewOffset');
    await composeShareCard(target, INPUT, deps);
    const [fullWidth, fullHeight, x, y, , height] = offsets.mock.calls[0];
    expect([fullWidth, fullHeight]).toEqual([CANVAS_W, CANVAS_H]);
    expect(DEFAULT_PAD_FRACTION).toBe(0.12);
    expect(y).toBeLessThan(raw.minY);
    expect(x).toBeLessThan(raw.minX);
    expect(height).toBeGreaterThanOrEqual(raw.height * (1 + DEFAULT_PAD_FRACTION * 2) - 1);
  });

  it('frames the planet, not the whole canvas, when the planet fits in it', async () => {
    const { target, camera } = makeTarget();
    const { deps } = makeDeps();
    const offsets = vi.spyOn(camera, 'setViewOffset');
    await composeShareCard(target, INPUT, deps);
    const [, , , , width] = offsets.mock.calls[0];
    expect(width / CANVAS_W).toBeLessThan(0.9);
  });

  it('never letterboxes: a square picture at the floor shows the middle square the camera framed, whole', async () => {
    // At one globe radius the planet is taller than the canvas: the view fit's window is the canvas's middle square.
    const { target, camera } = makeTarget();
    camera.position.set(0, 0, RADIUS * 2);
    camera.updateMatrixWorld();
    const offsets = vi.spyOn(camera, 'setViewOffset');
    const { deps, drawn } = makeDeps();
    // Discord's size, whose picture is square while its text fits beside it (IM27).
    await composeShareCard(target, { ...INPUT, preset: 'embed', fit: 'view' }, deps);
    expect(offsets.mock.calls[0]).toEqual([CANVAS_W, CANVAS_H, (CANVAS_W - CANVAS_H) / 2, 0, CANVAS_H, CANVAS_H]);
    expect(drawn[0]).toMatchObject({ sx: 0, sy: 0, sw: 800, sh: 800, dx: 0, dy: 0, dw: 800, dh: 800 });
  });

  it('shows the whole planet for the planet fit, its window reaching past the canvas', async () => {
    const { target, camera } = makeTarget();
    camera.position.set(0, 0, RADIUS * 2);
    camera.updateMatrixWorld();
    const offsets = vi.spyOn(camera, 'setViewOffset');
    const { deps, drawn } = makeDeps();
    await composeShareCard(target, { ...INPUT, preset: 'embed', fit: 'planet' }, deps);
    const [, , , y, width, height] = offsets.mock.calls[0];
    expect(y).toBeLessThan(0);
    expect(height).toBeGreaterThan(CANVAS_H);
    expect(width).toBeCloseTo(height, 6);
    expect(drawn[0]).toMatchObject({ sw: 800, sh: 800 });
  });

  it('refuses a scale that is not a positive number, rather than rendering an empty frame', async () => {
    for (const scale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { target } = makeTarget();
      const { deps } = makeDeps();
      await expect(composeShareCard(target, { ...INPUT, scale }, deps), String(scale)).rejects.toThrow(/scale/);
    }
  });

  // IM9 (the owner's choice of 2026-10-02): a card about one item shows the view; one about none, the planet.
  it('frames the view when it features an item, and the whole planet when it features none', async () => {
    const atFloor = () => {
      const made = makeTarget();
      made.camera.position.set(0, 0, RADIUS * 2);
      made.camera.updateMatrixWorld();
      return made;
    };
    const plain = atFloor();
    const plainOffsets = vi.spyOn(plain.camera, 'setViewOffset');
    await composeShareCard(plain.target, { ...INPUT, preset: 'embed' }, makeDeps().deps);
    expect(plainOffsets.mock.calls[0][3]).toBeLessThan(0);

    const about = atFloor();
    const aboutOffsets = vi.spyOn(about.camera, 'setViewOffset');
    const item = { id: 'evt1', title: 'Grant closes Friday', position: { lat: 0, lng: 0 }, lines: [] };
    await composeShareCard(about.target, { ...INPUT, preset: 'embed', featured: item }, makeDeps().deps);
    expect(aboutOffsets.mock.calls[0].slice(2)).toEqual([(CANVAS_W - CANVAS_H) / 2, 0, CANVAS_H, CANVAS_H]);
  });

  // IM12: the key names only the layers drawing in the card's picture, measured in the window it renders.
  it('keys only the layers drawing in the picture, measured in the window it renders', async () => {
    const { target, camera } = makeTarget();
    const offsets = vi.spyOn(camera, 'setViewOffset');
    const { deps, ctx } = makeDeps();
    const eco = { layerId: 'EcologicalDisasters', layer: 'Eco Disasters', swatches: [{ color: '#ff4d4f', label: 'Earthquake' }] };
    const borders = { layerId: 'NationalTerritories:borders', layer: 'Borders', swatches: [{ color: '#c9d4e3', label: 'international boundary', shape: 'line' }] };
    deps.legend = () => [eco, borders];
    const asked: unknown[] = [];
    deps.layersInPicture = vi.fn((_target, frame, crop) => { asked.push({ frame, crop }); return ['Borders']; });
    await composeShareCard(target, INPUT, deps);
    const [, , x, y, width, height] = offsets.mock.calls[0];
    // A card of fixed size is keyed before and after its picture's shape is known; the last is the window it renders.
    expect(asked.at(-1)).toEqual({ frame: { width: CANVAS_W, height: CANVAS_H }, crop: { x, y, width, height } });
    const texts = ctx.fillText.mock.calls.map((c) => c[0]);
    expect(texts).toContain('Borders:');
    expect(texts).not.toContain('Eco Disasters:');
  });

  it('keys every layer when it cannot tell which are in the picture', async () => {
    const { target } = makeTarget();
    const { deps, ctx } = makeDeps();
    deps.legend = () => [{ layerId: 'EcologicalDisasters', layer: 'Eco Disasters', swatches: [{ color: '#ff4d4f', label: 'Earthquake' }] }];
    await composeShareCard(target, INPUT, deps);
    expect(ctx.fillText.mock.calls.map((c) => c[0])).toContain('Eco Disasters:');
  });

  // IM5, IM14: the template's badge on the card, and who chose it in its provenance.
  it('badges a card with its template, and records who chose it', async () => {
    const { target } = makeTarget();
    const { deps, ctx } = makeDeps();
    const card = await composeShareCard(target, { ...INPUT, template: { name: 'critical_intel', chosenBy: 'item' } }, deps);
    expect(card.provenance.card).toEqual({ template: 'critical_intel', badge: 'CRITICAL INTEL', chosenBy: 'item' });
    expect(ctx.fillText.mock.calls.map((c) => c[0])).toContain('CRITICAL INTEL');
  });

  // IM16: a front page heads the card with its own title and facts, in place of an item's.
  it('heads a front page\'s card with its title and facts, and records them', async () => {
    const { target } = makeTarget();
    const { deps, ctx } = makeDeps();
    const frontPage = {
      template: 'conflict_brief' as const, day: '2026-10-02', title: 'War & Conflict Brief · 2 Oct 2026',
      lines: ['4 items reported on 2 Oct 2026 (UTC)'], count: 4, theatres: [], noTheatre: 4,
    };
    const card = await composeShareCard(target, { ...INPUT, frontPage, template: { name: 'conflict_brief', chosenBy: 'subject' } }, deps);
    expect(card.provenance.frontPage).toEqual(frontPage);
    const texts = ctx.fillText.mock.calls.map((c) => c[0]);
    expect(texts).toContain('War & Conflict Brief · 2 Oct 2026');
    expect(texts).toContain('WAR & CONFLICT BRIEF');
  });

  // RN3: tonight's page heads its card the same way, with no template and no badge.
  it('heads tonight\'s card with its title and rows, and records the page whole', async () => {
    const { target } = makeTarget();
    const { deps, ctx } = makeDeps();
    const frontPage = {
      kind: 'tonight' as const, fromS: 1_791_600_000, untilS: 1_791_643_200, title: 'Raver Watch · tonight from 10 Oct 2026 02:40Z',
      lines: ['12 scene events start in the twelve hours from 02:40Z, 3 in a hot town', 'US Pacific · 7 events · 3 under heat · first 20:00 PDT'],
      count: 12, underHeat: 3, underWay: 0, regions: [{ name: 'US Pacific', count: 7, underHeat: 3, first: { atS: 1_791_601_200, local: '20:00 PDT' } }],
    };
    const card = await composeShareCard(target, { ...INPUT, frontPage, template: null }, deps);
    expect(card.provenance.frontPage).toEqual(frontPage);
    expect(card.provenance.card).toBeNull();
    const texts = ctx.fillText.mock.calls.map((c) => c[0]);
    expect(texts).toContain('Raver Watch · tonight from 10 Oct 2026 02:40Z');
    expect(texts.join(' ')).toContain('US Pacific · 7 events');
  });

  // IM6: the composed 9:16, its picture captured at the height its text leaves.
  it('composes a 9:16 card at exactly 1080×1920, capturing its picture at the shape its text leaves', async () => {
    const { target, camera } = makeTarget();
    const offsets = vi.spyOn(camera, 'setViewOffset');
    const { deps, ctx } = makeDeps();
    const card = await composeShareCard(target, { ...INPUT, preset: 'story' }, deps);
    expect([card.width, card.height]).toEqual([1080, 1920]);
    expect(card.frame.width).toBe(1080);
    expect(card.frame.height).toBeGreaterThanOrEqual(810);
    expect(card.frame.height).toBeLessThan(1920);
    const [, , , , w, h] = offsets.mock.calls[0];
    expect(w / h).toBeCloseTo(card.frame.width / card.frame.height, 2);
    // Drawn edge to edge at the height captured: the picture is not letterboxed into its place.
    const [, , , , , , , dw, dh] = ctx.drawImage.mock.calls[0];
    expect(dw).toBe(1080);
    expect(dh).toBeCloseTo(card.frame.height, 6);
  });

  it('plans a card\'s picture before the capture as compose makes it', async () => {
    const { target } = makeTarget();
    const { deps } = makeDeps();
    // Every size, stacked or side by side (IM27): the picture planned is the picture captured, at its shape.
    for (const preset of ['story', 'square', 'portrait', 'embed', 'wide'] as const) {
      const plan = planCardPicture(target, { ...INPUT, preset }, deps);
      const card = await composeShareCard(target, { ...INPUT, preset }, deps);
      expect([card.frame.width, card.frame.height], preset).toEqual([plan.pictureWidth, plan.pictureHeight]);
      expect(plan.window.width / plan.window.height, preset).toBeCloseTo(plan.pictureWidth / plan.pictureHeight, 2);
    }
    // A stacked card's picture spans its width; a side card's is square while its text fits beside it.
    expect(planCardPicture(target, { ...INPUT, preset: 'square' }, deps)).toMatchObject({ pictureWidth: 1080 });
    expect(planCardPicture(target, { ...INPUT, preset: 'embed' }, deps)).toMatchObject({ pictureWidth: 800, pictureHeight: 800 });
  });

  it('keys a 9:16 card by what its final picture shows, and sizes the picture for that key', () => {
    const { target } = makeTarget();
    const { deps } = makeDeps();
    const eco = { layerId: 'EcologicalDisasters', layer: 'Eco Disasters', swatches: [{ color: '#ff4d4f', label: 'Earthquake' }] };
    const borders = { layerId: 'NationalTerritories:borders', layer: 'Borders', swatches: [{ color: '#c9d4e3', label: 'international boundary', shape: 'line' }] };
    deps.legend = () => [eco, borders];
    // The square window it starts from shows only the borders; the window it settles on shows both.
    let calls = 0;
    deps.layersInPicture = vi.fn(() => (calls++ === 0 ? ['Borders'] : ['Borders', 'Eco Disasters']));
    const plan = planCardPicture(target, { ...INPUT, preset: 'story' }, deps);
    expect(plan.keyLayers).toEqual(['Borders', 'Eco Disasters']);
    deps.layersInPicture = vi.fn(() => ['Borders']);
    const lessKey = planCardPicture(target, { ...INPUT, preset: 'story' }, deps);
    expect(plan.pictureHeight).toBeLessThan(lessKey.pictureHeight);
  });

  it('keys a side card by what its final picture shows, its window the shape of its picture (IM27)', () => {
    const { target } = makeTarget();
    const { deps } = makeDeps();
    const eco = { layerId: 'EcologicalDisasters', layer: 'Eco Disasters', swatches: [{ color: '#ff4d4f', label: 'Earthquake' }] };
    const borders = { layerId: 'NationalTerritories:borders', layer: 'Borders', swatches: [{ color: '#c9d4e3', label: 'international boundary', shape: 'line' }] };
    deps.legend = () => [eco, borders];
    // The square window it starts from shows only the borders; the window it settles on shows both.
    let calls = 0;
    deps.layersInPicture = vi.fn(() => (calls++ === 0 ? ['Borders'] : ['Borders', 'Eco Disasters']));
    // Twelve facts: more than a column beside a square picture holds, fewer than its floor refuses.
    const lines = Array.from({ length: 12 }, (_, i) => `Fact line number ${i} says something about the item at some length`);
    const featured = { id: 'evt1', title: 'Grant closes Friday', position: { lat: 0, lng: 0 }, lines };
    const plan = planCardPicture(target, { ...INPUT, preset: 'embed', featured }, deps);
    expect(plan.keyLayers).toEqual(['Borders', 'Eco Disasters']);
    expect(plan.pictureWidth).toBeLessThan(800);
    expect(plan.pictureWidth).toBeGreaterThanOrEqual(600);
    expect(plan.window.width / plan.window.height).toBeCloseTo(plan.pictureWidth / plan.pictureHeight, 2);
  });

  // Block I, item 5: alt text from the card's own facts, and the linter's warnings, on every card.
  it('returns the card\'s alt text, written from what it states, and its warnings', async () => {
    const { target } = makeTarget();
    const { deps } = makeDeps();
    const card = await composeShareCard(target, INPUT, deps);
    expect(card.alt).toMatch(/^Intel Reports on the globe\./);
    expect(card.alt).toContain('Made by Starcom, 2026-09-10 12:00Z.');
    for (const caveat of card.provenance.caveatsShort) expect(card.alt).toContain(caveat);
    expect(card.warnings).toEqual([]);
  });

  it('says where its picture is, and the band its footer is in, as drawn', async () => {
    // The last with text wide enough that the footer wraps: its band is all its lines.
    for (const [preset, charPx] of [['wide', 8], ['square', 8], ['story', 8], ['story', 16], ['embed', 12]] as const) {
      const { target } = makeTarget();
      const { deps, ctx } = makeDeps();
      ctx.measureText = (t: string) => ({ width: t.length * charPx });
      // Each line's top and its size: drawn from the top, so it reaches down its size and a little more.
      const drawnText: Array<{ text: string; top: number; px: number }> = [];
      ctx.fillText.mockImplementation((text: string, _x: number, top: number) => {
        drawnText.push({ text, top, px: Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)![1]) });
      });
      const card = await composeShareCard(target, { ...INPUT, preset }, deps);
      const [, , , , , dx, dy, dw, dh] = ctx.drawImage.mock.calls[0];
      expect(card.regions.picture).toEqual({ x: dx, y: dy, width: dw, height: dh });
      // The footer, which changes with every capture and every build, is drawn in its band; the rest of the text above it.
      const { footer } = card.regions;
      // Across the text's width: the card's, or a side card's column, beside its picture (IM27).
      const column = preset === 'wide' || preset === 'embed' ? card.regions.picture.width : 0;
      expect(footer).toMatchObject({ x: column, width: card.width - column });
      expect(footer.y + footer.height).toBeLessThanOrEqual(card.height);
      const stamp = drawnText.findIndex(({ text }) => text.startsWith('STARCOM · '));
      expect(stamp).toBeGreaterThan(0);
      if (charPx > 8) expect(drawnText.length - stamp).toBeGreaterThan(1);
      for (const { top, px } of drawnText.slice(stamp)) {
        expect(top).toBeGreaterThanOrEqual(footer.y);
        expect(top + px * 1.25).toBeLessThanOrEqual(footer.y + footer.height);
      }
      for (const { top, px } of drawnText.slice(0, stamp)) expect(top + px * 1.25).toBeLessThan(footer.y);
    }
  });

  it('warns of a headline shortened to fit', async () => {
    const { target } = makeTarget();
    const { deps } = makeDeps();
    const frontPage = {
      template: 'conflict_brief' as const, day: '2026-10-02', title: `War & Conflict Brief ${'and a very long title '.repeat(30)}`,
      lines: ['4 items'], count: 4, theatres: [], noTheatre: 4,
    };
    const card = await composeShareCard(target, { ...INPUT, frontPage }, deps);
    expect(card.warnings).toContain('The headline was shortened to fit; the whole title is in the alt text and the provenance.');
    expect(card.alt).toContain('and a very long title and a very long title and a very long title');
  });

  // Block I, item 5: the card's record in its own file, so a copy carries it.
  it('writes the card\'s record into its file, as a reader finds it', async () => {
    const { target } = makeTarget();
    const { deps, canvas } = makeDeps();
    canvas.toDataURL = vi.fn(() => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
    const asked: Array<Record<string, unknown>> = [];
    deps.writeRecord = (dataUrl, card) => { asked.push(card); return withCardRecord(dataUrl, card); };
    const card = await composeShareCard(target, INPUT, deps);
    expect(asked[0]).toMatchObject({ mimeType: 'image/png', width: card.width, height: card.height, alt: card.alt });
    const xmp = readXmp(Uint8Array.from(Buffer.from(card.dataUrl.split(',')[1], 'base64')), 'image/png')!;
    expect(xmp).toContain(`<xmp:CreateDate>${NOW.toISOString()}</xmp:CreateDate>`);
    expect(xmp).toContain('Intel Reports on the globe.');
    expect(card.warnings).toEqual([]);
  });

  it('states the type the browser made, which is not always the one asked for', async () => {
    // Safari makes a PNG when asked for a WebP; the stub canvas does the same.
    const { target } = makeTarget();
    const { deps } = makeDeps();
    expect((await composeShareCard(target, { ...INPUT, mimeType: 'image/webp' }, deps)).mimeType).toBe('image/png');
  });

  it('still makes the card when its record cannot be written, and says so', async () => {
    const { target } = makeTarget();
    const { deps } = makeDeps();
    deps.writeRecord = () => { throw new Error('Not a PNG ending in IEND: no record written into it.'); };
    const card = await composeShareCard(target, INPUT, deps);
    expect(card.dataUrl).toBe('data:image/png;base64,CARD');
    expect(card.warnings).toEqual([
      'The record could not be written into the file (Not a PNG ending in IEND: no record written into it.); the card\'s provenance has it.',
    ]);
  });

  it('says what a JPEG\'s copy of the record left out', async () => {
    const { target } = makeTarget();
    const { deps } = makeDeps();
    deps.writeRecord = (dataUrl) => ({ dataUrl, omitted: ['raverWatchItems'] });
    const card = await composeShareCard(target, INPUT, deps);
    expect(card.warnings).toEqual([
      'The file\'s copy of the record leaves out raverWatchItems, too large for a JPEG\'s metadata; the card\'s provenance has them all.',
    ]);
  });

  // IM20, IM23: motion held at the paused timeline's moment when there is one, else the card's own.
  it('stills motion at the moment it is given, else at the moment it states', async () => {
    const seen: number[] = [];
    const leave = onStill({ still: (at) => seen.push(at), release: () => {} });
    try {
      const { target } = makeTarget();
      await composeShareCard(target, { ...INPUT, stillAt: Date.parse('2026-10-02T00:00:00.000Z') }, makeDeps().deps);
      await composeShareCard(makeTarget().target, INPUT, makeDeps().deps);
      expect(seen).toEqual([Date.parse('2026-10-02T00:00:00.000Z'), NOW.getTime()]);
    } finally {
      leave();
    }
  });

  // D-W, step 5d: a card of a paused moment judges its sources against that moment, not its capture.
  it('judges each source against the paused moment it shows', async () => {
    const shown = NOW.getTime() - 26 * 60 * 60 * 1000;
    const feeds = [{ name: 'Clouds', lastUpdated: new Date(shown - 3 * 60 * 60 * 1000).toISOString() }];
    const paused = await composeShareCard(makeTarget().target, { ...INPUT, feeds, stillAt: shown }, makeDeps().deps);
    expect(paused.provenance.caveats.join(' ')).toMatch(/Clouds was last updated 3h 0m before the moment shown/);
    const live = await composeShareCard(makeTarget().target, { ...INPUT, feeds }, makeDeps().deps);
    expect(live.provenance.caveats.join(' ')).toMatch(/Clouds was last updated 1d 5h before this capture/);
  });

  it('draws a QR code of its view link when asked: dark modules on a light square, and says what it opens (IM13, IM30–IM32)', async () => {
    const { target } = makeTarget();
    const { deps, ctx } = makeDeps();
    const fills: Array<{ x: number; y: number; w: number; h: number; style: string }> = [];
    ctx.fillRect.mockImplementation((x: number, y: number, w: number, h: number) => { fills.push({ x, y, w, h, style: String(ctx.fillStyle) }); });
    const link = 'https://starcom.app/?v=1&sub=WarConflict&at=24.1,44.5,1';
    const card = await composeShareCard(target, { ...INPUT, preset: 'square', qr: { link } }, deps);
    expect(card.provenance.qr).toBe(link);
    expect(card.alt).toMatch(/QR code opens this view on Starcom/);
    const box = card.regions.qr!;
    expect(box.size).toBe(CARD_PRESETS.square.qrPx);
    const inside = fills.filter((f) => f.x >= box.x && f.y >= box.y && f.x + f.w <= box.x + box.size + 0.01 && f.y + f.h <= box.y + box.size + 0.01);
    const light = inside.filter((f) => f.w === box.size && f.h === box.size);
    expect(light).toHaveLength(1);
    const modules = await encodeQr(link);
    const dark = inside.filter((f) => f !== light[0] && f.style !== light[0].style);
    expect(dark).toHaveLength(modules.flat().filter(Boolean).length);
    // Centred in its light square, with at least four modules of quiet zone on every side.
    const module = dark[0].w;
    const left = Math.min(...dark.map((f) => f.x)) - box.x;
    const right = box.x + box.size - (Math.max(...dark.map((f) => f.x)) + module);
    const top = Math.min(...dark.map((f) => f.y)) - box.y;
    const bottom = box.y + box.size - (Math.max(...dark.map((f) => f.y)) + module);
    for (const margin of [left, right, top, bottom]) expect(margin).toBeGreaterThanOrEqual(4 * module);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    expect(Math.abs(top - bottom)).toBeLessThanOrEqual(1);
  });

  it('draws no QR code, and says none, unless asked', async () => {
    const { target } = makeTarget();
    const { deps } = makeDeps();
    const card = await composeShareCard(target, { ...INPUT, preset: 'square' }, deps);
    expect(card.provenance.qr).toBeUndefined();
    expect(card.regions.qr).toBeUndefined();
    expect(card.alt).not.toMatch(/QR/);
  });

  it('leaves the alt text off when the shot asks', async () => {
    const { target } = makeTarget();
    const { deps } = makeDeps();
    const card = await composeShareCard(target, { ...INPUT, alt: false }, deps);
    expect('alt' in card).toBe(false);
  });

  it('makes the default card, with no badge, when given no template', async () => {
    const { target } = makeTarget();
    const { deps, ctx } = makeDeps();
    const card = await composeShareCard(target, INPUT, deps);
    expect(card.provenance.card).toBeNull();
    expect(ctx.fillText.mock.calls.map((c) => c[0])).not.toContain('CRITICAL INTEL');
  });

  it('leaves the camera as it found it', async () => {
    const { target, camera } = makeTarget();
    const before = camera.projectionMatrix.clone();
    const { deps } = makeDeps();
    await composeShareCard(target, INPUT, deps);
    expect(camera.view?.enabled ?? false).toBe(false);
    expect(camera.projectionMatrix.equals(before)).toBe(true);
  });

  it('sizes the card canvas before it draws anything on it', async () => {
    // Setting width or height resets a 2D context. A resize after the draw
    // blanks the card, and the returned data URL still looks like a success.
    const { target } = makeTarget();
    const { deps, canvas, events } = makeDeps();

    const card = await composeShareCard(target, INPUT, deps);

    expect(events.some((e) => e === `drawImage@${card.width}x${card.height}`)).toBe(true);
    expect(canvas.width).toBe(card.width);
    expect(canvas.height).toBe(card.height);
  });

  it('renders the frame before it decodes it, and decodes before it draws', async () => {
    /*
     * One log, written by both the renderer and the deps, so the order is read
     * rather than assumed.
     *
     * What this does NOT prove: that nothing awaits between the render and the
     * pixel read. That property lives inside captureGlobeFrame, is enforced by
     * its synchronous signature, and is verified against a real GPU by
     * scripts/smoke-globe-capture.mjs. A fake renderer cannot exhibit the
     * failure, so no assertion here would mean anything about it.
     */
    const log: string[] = [];
    const { target } = makeTarget({ log });
    const { deps } = makeDeps({ log });

    await composeShareCard(target, INPUT, deps);

    const lastRender = log.lastIndexOf('render');
    const decode = log.findIndex((e) => e.startsWith('loadImage:'));
    const draw = log.findIndex((e) => e.startsWith('drawImage@'));

    expect(lastRender).toBeGreaterThanOrEqual(0);
    expect(decode).toBeGreaterThan(lastRender);
    expect(draw).toBeGreaterThan(decode);
  });

  it('stamps capturedAt from the clock, not from the caller', async () => {
    const { target } = makeTarget();
    const { deps } = makeDeps();

    const card = await composeShareCard(
      // A caller trying to set the time has nowhere to put it — the input type
      // has no such field. This asserts the value that ends up on the card.
      target, INPUT, deps,
    );

    expect(card.provenance.capturedAt).toBe(NOW.toISOString());
  });

  it('carries the derived caveats onto the card', async () => {
    const { target } = makeTarget();
    const { deps } = makeDeps();

    const card = await composeShareCard(target, INPUT, deps);

    // Comm Hubs is active but unimplemented — the absence is the app's.
    expect(card.provenance.caveats.some((c) => c.includes('Comm Hubs'))).toBe(true);
    expect(card.provenance.layersShown).toEqual(['Intel Reports']);
    // And the unconditional one, until captures can be signed.
    expect(card.provenance.caveats.at(-1)).toContain('Unsigned client-side capture');
  });

  it('refuses a blank frame rather than composing a card around it', async () => {
    const { target } = makeTarget({ blankPixels: true });
    const { deps, drawn } = makeDeps();

    await expect(composeShareCard(target, INPUT, deps)).rejects.toBeInstanceOf(GlobeCaptureError);
    // And nothing was drawn — no half-made card left behind.
    expect(drawn).toHaveLength(0);
  });

  it('refuses when the card canvas has no 2D context', async () => {
    const { target } = makeTarget();
    const { deps } = makeDeps({ noContext: true });

    await expect(composeShareCard(target, INPUT, deps))
      .rejects.toBeInstanceOf(ShareCardCompositionError);
  });
});

/*
 * A card about one report (decision D-F, section 18, item 2). The glyph is
 * projected through the camera that took the picture, so the label points at it.
 */
describe('composeShareCard — its address, window and Raver Watch items (schema 10)', () => {
  it('carries them into the provenance as the handle gave them', async () => {
    const { target } = makeTarget();
    const { deps } = makeDeps();
    const card = await composeShareCard(target, {
      ...INPUT,
      link: 'https://starcom.app/?v=1&sub=DrugCheckAlerts',
      window: { from: 1_790_899_200, until: 1_791_158_400 },
      raverWatchItems: [{ id: '30023:pk:raver-a', layer: 'DrugCheckAlerts', level: 'red' }],
    }, deps);
    expect(card.provenance).toMatchObject({
      link: 'https://starcom.app/?v=1&sub=DrugCheckAlerts',
      window: { from: 1_790_899_200, until: 1_791_158_400 },
      raverWatchItems: [{ id: '30023:pk:raver-a', layer: 'DrugCheckAlerts', level: 'red' }],
    });
  });
});

describe('composeShareCard — a featured report', () => {
  const featured = (lat: number, lng: number) => ({
    id: 'evt1', title: 'Grant closes Friday', position: { lat, lng },
    lines: ['not assessed · by npub1abcdef…wxyz'],
  });

  it('names the report on the card and points at its glyph', async () => {
    const { target } = makeTarget();
    const { deps, ctx } = makeDeps();
    const card = await composeShareCard(target, { ...INPUT, featured: featured(0, 0) }, deps);

    expect(card.provenance.featured).toEqual({ id: 'evt1', title: 'Grant closes Friday', lines: ['not assessed · by npub1abcdef…wxyz'] });
    const texts = ctx.fillText.mock.calls.map((c) => c[0]);
    // Twice: in the strip, and on the label over the image.
    expect(texts.filter((t) => t === 'Grant closes Friday')).toHaveLength(2);
  });

  it('warns when the label on the picture had to be shortened', async () => {
    const { target } = makeTarget();
    const { deps } = makeDeps();
    const long = { ...featured(0, 0), title: 'A grant for community radio in three counties closes on Friday at noon, with late applications refused' };
    const card = await composeShareCard(target, { ...INPUT, featured: long }, deps);
    expect(card.warnings).toContain('The label on the picture was shortened to fit; the headline below carries the title.');
    const short = await composeShareCard(target, { ...INPUT, featured: featured(0, 0) }, makeDeps().deps);
    expect(short.warnings).toEqual([]);
  });

  it('refuses a card whose featured report is on the far side of the planet', async () => {
    const { target } = makeTarget();
    const { deps } = makeDeps();
    await expect(composeShareCard(target, { ...INPUT, featured: featured(0, 180) }, deps))
      .rejects.toThrow(/not in the picture.*frameReports/s);
  });

  it('refuses one outside the frame, though on the near side', async () => {
    const { target, camera } = makeTarget();
    // Close in, so a report 60° away is on the near side and off the edge.
    camera.position.set(0, 0, RADIUS * 1.6);
    camera.updateMatrixWorld();
    const { deps } = makeDeps();
    await expect(composeShareCard(target, { ...INPUT, featured: featured(0, 60) }, deps))
      .rejects.toThrow(/not in the picture/);
  });

  /*
   * The planet fit's window reaches past the canvas: what is on the near side
   * of the planet is in its picture. At 1.6 radii the horizon is about 51°
   * from the centre and the canvas's top edge about 25° up, so a report 45°
   * north is on the near side, above the canvas.
   */
  it('takes one above the canvas, on the near side, into the planet fit\'s picture, and not the view fit\'s', async () => {
    const close = () => {
      const made = makeTarget();
      made.camera.position.set(0, 0, RADIUS * 1.6);
      made.camera.updateMatrixWorld();
      return made;
    };
    const planet = await composeShareCard(close().target, { ...INPUT, fit: 'planet', featured: featured(45, 0) }, makeDeps().deps);
    expect(planet.provenance.featured?.id).toBe('evt1');
    await expect(composeShareCard(close().target, { ...INPUT, fit: 'view', featured: featured(45, 0) }, makeDeps().deps))
      .rejects.toThrow(/not in the picture/);
  });
});

/*
 * The close-up inset (block I, item 4; IM34–IM36): drawn in the picture's
 * corner when compose is handed one, said in the card's record, its alt text
 * and its warnings, and refused when it is not the featured item's.
 */
describe('composeShareCard — a close-up inset', () => {
  const featured = { id: 'venue-night', title: 'House at The Midway, San Francisco', position: { lat: 0, lng: 0 }, lines: ['Scene event'] };
  const VIOLET = '#c77dff';
  const inset: CardInset = {
    kind: 'venues',
    featured: { id: 'venue-night', lat: 0, lon: 0, color: VIOLET, cancelled: false, label: 'The Midway' },
    others: [
      { id: 'a', lat: 0.01, lon: 0.01, color: VIOLET, cancelled: false },
      { id: 'b', lat: -0.01, lon: 0.005, color: VIOLET, cancelled: true },
    ],
    outlines: [],
    bounds: { west: -0.03, south: -0.03, east: 0.03, north: 0.03 },
    title: 'Public venues the same night',
    within: 'within 25 km',
    placedTo: 'about 150 m',
    gridKm: 1,
  };

  it('draws it in a corner of the picture, a square of 0.42 of its shorter side, and says where', async () => {
    const { target } = makeTarget();
    const { deps, ctx } = makeDeps();
    const card = await composeShareCard(target, { ...INPUT, preset: 'square', featured, inset }, deps);
    const box = card.regions.inset!;
    const picture = card.regions.picture;
    expect(box.width).toBe(Math.round(0.42 * Math.min(picture.width, picture.height)));
    expect(box.height).toBe(box.width);
    expect(box.x).toBeGreaterThanOrEqual(picture.x);
    expect(box.y).toBeGreaterThanOrEqual(picture.y);
    expect(box.x + box.width).toBeLessThanOrEqual(picture.x + picture.width);
    expect(box.y + box.height).toBeLessThanOrEqual(picture.y + picture.height);
    const texts = ctx.fillText.mock.calls.map((c) => c[0]);
    expect(texts).toContain('Public venues the same night');
    expect(texts).toContain('The Midway');
  });

  it('keeps off the country names drawn in the picture, where the corners are otherwise as good', async () => {
    const look = await import('../../../../globe-engine/countryNamesLook');
    const meets = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    const make = async (boxes: Array<{ x: number; y: number; width: number; height: number }>) => {
      const { target, renderer } = makeTarget();
      renderer.render.mockImplementation(() => look.noteCountryNamesDrawn({ drawn: true, codes: boxes.map(() => 'FRA'), boxes }));
      return composeShareCard(target, { ...INPUT, preset: 'square', featured, inset, scale: 2 }, makeDeps().deps);
    };
    try {
      look.setCardCountryNames(true);
      const before = await make([]);
      const corner = before.regions.inset!;
      const picture = before.regions.picture;
      // A name over that corner, in the capture's pixels: the card's, less the picture's place, at the frame's scale.
      const sx = before.frame.width / picture.width;
      const sy = before.frame.height / picture.height;
      const name = { x: (corner.x + 20 - picture.x) * sx, y: (corner.y + 20 - picture.y) * sy, width: 120, height: 30 };
      const after = await make([name]);
      expect(after.regions.inset).not.toEqual(corner);
      const onCard = { x: picture.x + name.x / sx, y: picture.y + name.y / sy, width: name.width / sx, height: name.height / sy };
      expect(meets(onCard, after.regions.inset!)).toBe(false);
    } finally {
      look.resetCountryNamesLookForTest();
    }
  });

  it('states what it draws in the record (capture schema 16), and the alt text says it', async () => {
    const { target } = makeTarget();
    const { deps } = makeDeps();
    const card = await composeShareCard(target, { ...INPUT, preset: 'square', featured, inset }, deps);
    expect(card.provenance.schemaVersion).toBe(38);
    expect(card.provenance.inset).toEqual({
      kind: 'venues', featured: 'venue-night', shown: 3, within: 'within 25 km', placedTo: 'about 150 m',
      gridKm: 1, scale: expect.stringMatching(/^\d+ (m|km)$/),
    });
    expect(card.alt).toMatch(/An inset shows the featured venue among 2 other public venues open the same night within 25 km, placed to about 150 m, on a 1 km grid, with a \d+ (m|km) scale bar\./);
  });

  it('a heat town\'s, in its words', async () => {
    const { target } = makeTarget();
    const { deps } = makeDeps();
    const heat: CardInset = {
      ...inset, kind: 'heat', title: 'California: HeatRisk the same day', within: 'California', placedTo: 'about 11 km', gridKm: null,
      featured: { ...inset.featured, label: null }, bounds: { west: -5, south: -5, east: 5, north: 5 },
    };
    const card = await composeShareCard(target, { ...INPUT, preset: 'square', featured, inset: heat }, deps);
    expect(card.provenance.inset).toMatchObject({ kind: 'heat', shown: 3, within: 'California', gridKm: null });
    expect(card.alt).toMatch(/An inset shows 3 heat towns of California the same day by level, the featured one ringed, placed to about 11 km, with a \d+ km scale bar\./);
  });

  it('none, and none said, unless handed one', async () => {
    const { target } = makeTarget();
    const { deps } = makeDeps();
    const card = await composeShareCard(target, { ...INPUT, preset: 'square', featured }, deps);
    expect(card.regions.inset).toBeUndefined();
    expect(card.provenance.inset).toBeUndefined();
    expect(card.alt).not.toMatch(/inset/);
  });

  it('refused without a featured item, or for another item than the featured one', async () => {
    const { target } = makeTarget();
    await expect(composeShareCard(target, { ...INPUT, preset: 'square', inset }, makeDeps().deps))
      .rejects.toThrow(/close-up.*featured item/);
    await expect(composeShareCard(target, { ...INPUT, preset: 'square', featured: { ...featured, id: 'another' }, inset }, makeDeps().deps))
      .rejects.toThrow(/close-up of venue-night.*card features another/);
  });

  it('keeps clear of the picture\'s marks where a corner can, and warns when none could', async () => {
    const { target } = makeTarget();
    const { deps } = makeDeps();
    const asked: Array<{ frame: unknown; crop: { x: number; y: number; width: number; height: number } }> = [];
    // Marks everywhere in the canvas: every corner of the picture holds some.
    deps.marksInPicture = (_target, frame, crop) => {
      asked.push({ frame, crop });
      const marks: Array<{ x: number; y: number }> = [];
      for (let x = 10; x < CANVAS_W; x += 40) for (let y = 10; y < CANVAS_H; y += 40) marks.push({ x, y });
      return marks;
    };
    const card = await composeShareCard(target, { ...INPUT, preset: 'square', featured, inset }, deps);
    expect(asked).toHaveLength(1);
    expect(asked[0].frame).toEqual({ width: CANVAS_W, height: CANVAS_H });
    expect(card.warnings.find((w) => /close-up inset covers \d+ marks on the globe/.test(w))).toBeDefined();
    // With nothing under any corner, no warning.
    const clear = makeDeps().deps;
    clear.marksInPicture = () => [];
    const clean = await composeShareCard(makeTarget().target, { ...INPUT, preset: 'square', featured, inset }, clear);
    expect(clean.warnings.filter((w) => /close-up/.test(w))).toEqual([]);
  });
});

/*
 * IM38, Mecha Jono's reply to IM29: one type step larger where it fits, IM29's
 * compact type where the larger would be refused, so no card that draws today
 * is refused. Decided where the picture is planned, so a dry run and the card
 * agree; the card says which it used.
 */
describe('type one step larger where it fits (IM38)', () => {
  const lines = (n: number) => Array.from({ length: n }, (_, i) => `War & Conflict · line ${i} with a fair amount of words in it to wrap`);
  const about = (n: number) => ({
    id: 'evt1', title: 'EASA issues a Conflict Zone Information Bulletin for the airspace of Saudi Arabia', position: { lat: 0, lng: 0 }, lines: lines(n),
  });
  // A measure that grows with the type, as a real font's does.
  const measure = (text: string, fontPx: number) => text.length * fontPx * 0.5;
  const plan = (preset: 'square' | 'story' | 'embed', n: number, style?: object) =>
    planCardPicture(makeTarget().target, { ...INPUT, preset, featured: about(n), ...(style ? { style } : {}) }, makeDeps().deps, { measure, key: false });

  it('takes the larger type where it fits', () => {
    const picture = plan('square', 3);
    expect(picture.typeStep).toBe('larger');
    expect(picture.style).toMatchObject({ headlinePx: 42, bodyPx: 21, caveatPx: 17, footerPx: 15 });
    expect(CARD_TYPE_LARGER.embed).toEqual({ headlinePx: 34, bodyPx: 19, caveatPx: 15, footerPx: 14 });
    expect(CARD_TYPE_LARGER.wide).toEqual({ headlinePx: 30, bodyPx: 17, caveatPx: 14, footerPx: 13 });
    expect(CARD_TYPE_LARGER.portrait).toEqual({ headlinePx: 44, bodyPx: 22, caveatPx: 18, footerPx: 16 });
  });

  it('falls back to the compact type where the larger would be refused, and refuses only what neither holds', () => {
    const picture = plan('square', 11);
    expect(picture.typeStep).toBe('compact');
    expect(picture.style).toMatchObject({ headlinePx: 36, bodyPx: 19, caveatPx: 15, footerPx: 14 });
    expect(picture.pictureHeight).toBeGreaterThanOrEqual(Math.round(0.45 * 1080));
    expect(() => plan('square', 13)).toThrow(/Refusing rather than cutting/);
  });

  it('the 9:16 keeps its one size (IM18), and a style the caller states wins', () => {
    const story = plan('story', 3);
    expect(story.typeStep).toBeUndefined();
    expect(story.style).toMatchObject({ headlinePx: 48, bodyPx: 24 });
    expect(plan('square', 3, { headlinePx: 20 }).style).toMatchObject({ headlinePx: 20, bodyPx: 21 });
  });

  it('draws in the type it chose, and says which (capture schema 17)', async () => {
    const { target } = makeTarget();
    const { deps, ctx } = makeDeps();
    const card = await composeShareCard(target, { ...INPUT, preset: 'embed', featured: about(1) }, deps);
    expect(card.provenance.typeStep).toBe('larger');
    expect(card.provenance.schemaVersion).toBe(38);
    const fonts = ctx.fillText.mock.calls.map((_, i) => ctx.fillText.mock.contexts?.[i]);
    expect(fonts).toBeDefined();
    const headline = ctx.fillText.mock.calls.findIndex((c) => String(c[0]).startsWith('EASA issues'));
    expect(headline).toBeGreaterThanOrEqual(0);
  });
});

describe('the imagery a card credits (capture schema 21; TX10)', () => {
  it('is what the globe says it is drawing, read as the card is made, and none when nothing says', async () => {
    const { target } = makeTarget();
    const { deps } = makeDeps();
    const drawing = () => [IMAGERY.blueMarble.source, IMAGERY.earthTopology.source, IMAGERY.earthWater.source];
    const card = await composeShareCard(target, INPUT, { ...deps, imagery: drawing });
    expect(card.provenance.imagery).toEqual(['NASA']);
    const none = await composeShareCard(makeTarget().target, INPUT, makeDeps().deps);
    expect(none.provenance.imagery).toEqual([]);
  });
});

describe('a card\'s country names, checked once its frame is taken (decision K5, TS10)', () => {
  it('is refused when its shot asked for names and none were drawn in its render', async () => {
    const { setCardCountryNames, resetCountryNamesLookForTest } = await import('../../../../globe-engine/countryNamesLook');
    try {
      setCardCountryNames(true);
      const { target } = makeTarget();
      const { deps } = makeDeps();
      await expect(composeShareCard(target, INPUT, deps)).rejects.toThrow(/asked for country names and the names were not drawn/);
    } finally {
      resetCountryNamesLookForTest();
    }
  });

  it('is made as before when its shot asked for none', async () => {
    const { target } = makeTarget();
    const { deps } = makeDeps();
    const card = await composeShareCard(target, INPUT, deps);
    expect(card.provenance.appearance).not.toHaveProperty('countryNames');
  });

  /*
   * The names are placed in the capture's render, before the card draws its label:
   * so compose places the label first, by the layout's own rule, and hands its box
   * and its leader's to the names, in the render's pixels (decision K5, TS11).
   */
  it('keeps the names clear of the featured item\'s label and leader, in the render\'s pixels, for that capture only', async () => {
    const look = await import('../../../../globe-engine/countryNamesLook');
    const clock = await import('../../../../globe-engine/captureClock');
    try {
      look.setCardCountryNames(true);
      const { target, renderer } = makeTarget();
      const seen: Array<readonly { x: number; y: number; width: number; height: number }[]> = [];
      renderer.render.mockImplementation(() => {
        seen.push(look.cardNameObstacles());
        look.noteCountryNamesDrawn({ drawn: true, codes: [], boxes: [] });
      });
      const featured = { id: 'evt1', title: 'Grant closes Friday', position: { lat: 0, lng: 0 }, lines: ['not assessed'] };
      // At 2, and at scales that round the frame off the picture's aspect, so the card letterboxes it.
      for (const scale of [2, 1.37, 1.55, 1.73]) {
        seen.length = 0;
        const { deps, ctx } = makeDeps();
        const card = await composeShareCard(target, { ...INPUT, preset: 'square', featured, scale }, deps);

        const boxes = seen.find((b) => b.length > 0)!;
        expect(boxes).toHaveLength(2);
        const picture = card.regions.picture;
        const toCard = (b: { x: number; y: number; width: number; height: number }) => ({
          x: picture.x + b.x * (picture.width / card.frame.width),
          y: picture.y + b.y * (picture.height / card.frame.height),
          width: b.width * (picture.width / card.frame.width),
          height: b.height * (picture.height / card.frame.height),
        });
        const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
        // The label: the very box the card fills behind its words.
        const [label, leader] = boxes.map(toCard);
        expect(ctx.fillRect.mock.calls.some(([x, y, w, h]) => near(x, label.x) && near(y, label.y) && near(w, label.width) && near(h, label.height))).toBe(true);
        // The leader: the box its stroke spans.
        const starts = ctx.moveTo.mock.calls;
        const ends = ctx.lineTo.mock.calls;
        const spans = starts.some(([fx, fy]) => ends.some(([tx, ty]) => near(Math.min(fx, tx), leader.x) && near(Math.min(fy, ty), leader.y)
          && near(Math.abs(tx - fx), leader.width) && near(Math.abs(ty - fy), leader.height)));
        expect(spans).toBe(true);
      }
      // Gone once the frame is taken.
      clock.stillMotion(1);
      expect(look.cardNameObstacles()).toEqual([]);
      clock.releaseMotion();
    } finally {
      look.resetCountryNamesLookForTest();
    }
  });

  it('hands the names no obstacles on a card that did not ask for them', async () => {
    const look = await import('../../../../globe-engine/countryNamesLook');
    const { target, renderer } = makeTarget();
    const seen: unknown[] = [];
    renderer.render.mockImplementation(() => { seen.push(look.cardNameObstacles()); });
    const featured = { id: 'evt1', title: 'Grant closes Friday', position: { lat: 0, lng: 0 }, lines: ['not assessed'] };
    await composeShareCard(target, { ...INPUT, preset: 'square', featured }, makeDeps().deps);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((b) => Array.isArray(b) && b.length === 0)).toBe(true);
  });
});

// The licences the notes in the picture carry (Interchange 3.25; the owner's pick of 26 Oct; schema 29).
describe('the licences a card credits', () => {
  it('credits the licence of a note in the picture, and not one on the far side', async () => {
    const { target } = makeTarget();
    const card = await composeShareCard(target, {
      ...INPUT,
      licensed: [
        { id: 'near', lat: 0, lng: 0, licence: 'Open Database License (ODbL) 1.0 (Que faire à Paris, Ville de Paris (opendata.paris.fr))' },
        { id: 'far', lat: 0, lng: 180, licence: 'CC BY 4.0' },
      ],
    }, makeDeps().deps);
    expect(card.provenance.licences).toEqual(['Open Database License (ODbL) 1.0 (Que faire à Paris, Ville de Paris (opendata.paris.fr))']);
    expect(card.provenance.credits).toContain('Open Database License (ODbL) 1.0 (Que faire à Paris, Ville de Paris (opendata.paris.fr))');
    expect(card.provenance.credits).not.toContain('CC BY 4.0');
  });

  it('credits a featured note\'s licence alone, whatever else is in the picture', async () => {
    const { target } = makeTarget();
    const card = await composeShareCard(target, {
      ...INPUT,
      featured: { id: 'paris', title: 'Music festival in Paris', lines: [], position: { lat: 0, lng: 0 } },
      licensed: [
        { id: 'paris', lat: 0, lng: 0, licence: 'Open Database License (ODbL) 1.0 (Que faire à Paris, Ville de Paris (opendata.paris.fr))' },
        { id: 'beside', lat: 1, lng: 1, licence: 'CC BY 4.0' },
      ],
    }, makeDeps().deps);
    expect(card.provenance.licences).toEqual(['Open Database License (ODbL) 1.0 (Que faire à Paris, Ville de Paris (opendata.paris.fr))']);
  });

  it('measures a composed card\'s text with the same licences it draws', async () => {
    const { target } = makeTarget();
    const licensed = [{ id: 'near', lat: 0, lng: 0, licence: 'CC BY 4.0' }];
    const card = await composeShareCard(target, { ...INPUT, preset: 'story', licensed }, makeDeps().deps);
    expect(card.provenance.licences).toEqual(['CC BY 4.0']);
  });
});

describe('composeShareCard — a Timestream strip (D-PW, PW62, PW77)', () => {
  it('draws it in its band under the picture, keeps it in the record, credits its sources and says it in the alt text', async () => {
    const at = Date.UTC(2026, 10, 1, 12);
    const timestream = stripModel({
      atMs: at, items: [], kp: kpRecord(null, [{ fromMs: at, untilMs: at + 3 * 3_600_000, kp: 5.33, basis: 'observed' }], []),
      bodies: ['Venus'], frame: 'galactic', columns: 20,
    });
    const { target } = makeTarget();
    const { deps } = makeDeps();
    const card = await composeShareCard(target, { ...INPUT, preset: 'square', timestream }, deps);
    expect(card.provenance.timestream).toMatchObject({ atS: at / 1000, lanes: ['windows', 'kp', 'bodies'], bodies: ['Venus'], frame: 'galactic', windows: 0 });
    expect(card.provenance.credits).toEqual(expect.arrayContaining([expect.stringMatching(/GFZ Potsdam/), 'NOAA SWPC', 'Astronomy Engine']));
    expect(card.alt).toMatch(/Under it, the Timestream from .+Z to .+Z: Kp and Venus in the Galactic Centre frame, the card's moment marked\./);
    const plain = await composeShareCard(target, { ...INPUT, preset: 'square' }, makeDeps().deps);
    expect(plain.provenance.timestream).toBeUndefined();
  });
});

describe('composeShareCard — an event chart (D-PW, PW87)', () => {
  it('draws the wheel over a lower corner of the picture, keeps the chart in the record, says it in the text and credits it', async () => {
    const chart = chartForCard({ at: Date.UTC(2026, 10, 10, 6) / 1000, lat: 3, lng: 41, title: 'Mandera attack' }, Date.UTC(2026, 10, 11, 12) / 1000);
    const { target } = makeTarget();
    const card = await composeShareCard(target, { ...INPUT, preset: 'square', chart }, makeDeps().deps);
    expect(card.provenance.schemaVersion).toBe(38);
    expect(card.provenance.chart).toMatchObject({
      title: 'Mandera attack', atS: Date.UTC(2026, 10, 10, 6) / 1000, place: { lat: 3, lng: 41 }, cursorAtS: Date.UTC(2026, 10, 11, 12) / 1000,
      frame: 'galactic', houses: 'Placidus',
    });
    expect(card.provenance.chart!.across.length).toBeLessThanOrEqual(5);
    expect(card.provenance.chart!.lines[0]).toBe('Event chart. Inside: Mandera attack, 10 Nov 2026 06:00Z, 3.0° N, 41.0° E.');
    expect(card.provenance.credits).toContain('Astronomy Engine');
    const { picture, chart: square } = card.regions;
    expect(square).toBeDefined();
    // Inside the picture, at its foot.
    expect(square!.x).toBeGreaterThanOrEqual(picture.x);
    expect(square!.y + square!.height).toBeLessThanOrEqual(picture.y + picture.height);
    expect(square!.y).toBeGreaterThan(picture.y + picture.height / 3);
    const plain = await composeShareCard(target, { ...INPUT, preset: 'square' }, makeDeps().deps);
    expect(plain.provenance.chart).toBeUndefined();
    expect(plain.regions.chart).toBeUndefined();
  });
  it("is headed by the chart's title when the card features no item", async () => {
    const chart = chartForCard({ at: Date.UTC(2026, 10, 10, 6) / 1000, lat: 3, lng: 41, title: 'Mandera attack' }, Date.UTC(2026, 10, 11, 12) / 1000);
    const { target } = makeTarget();
    const made = makeDeps();
    await composeShareCard(target, { ...INPUT, featured: null, preset: 'wide', chart }, made.deps);
    const ctx = (made.deps.createCanvas() as unknown as { getContext: () => { fillText: ReturnType<typeof vi.fn> } }).getContext();
    expect(ctx.fillText.mock.calls.map((c) => c[0])).toContain('Mandera attack');
  });
});
