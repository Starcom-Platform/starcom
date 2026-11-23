/**
 * The composed 9:16 card (decision IM6): composed, not cropped. A fixed
 * 1080×1920, its title band above the picture and its facts, key, caveats and
 * footer below; the picture takes what the text leaves. Every caveat stays, so
 * a card with too much to say for a 9:16 is refused, never cut.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { buildGlobeViewProvenance, type BuildProvenanceInput } from '../shareCardProvenance';
import {
  computeShareCardLayout,
  pictureSizeFor,
  CARD_PRESETS,
  ShareCardLayoutError,
  type LayoutInput,
} from '../shareCardLayout';
import { drawShareCard } from '../drawShareCard';
import { TEMPLATE_SPECS } from '../cardTemplates';

const AT = new Date('2026-10-03T01:00:00.000Z');
const provenanceInput = (over: Partial<BuildProvenanceInput> = {}): BuildProvenanceInput => ({
  capturedAt: AT,
  camera: { lat: 35, lon: 71.2, altitude: 1 },
  frame: { width: 1080, height: 1080 },
  layers: [{ label: 'War & Conflict', active: true, implemented: true }],
  feeds: [{ name: 'War & Conflict', lastUpdated: AT.toISOString() }],
  build: { sha: 'a'.repeat(40), builtAt: AT.toISOString() },
  featured: { id: 'x', title: 'Pakistan launches airstrikes in Afghanistan', lines: ['War & Conflict · Airstrike', 'Casualties as reported: 22 killed'] },
  now: AT,
  ...over,
});
const measure = (text: string, fontPx: number) => text.length * fontPx * 0.5;
const STORY = { ...CARD_PRESETS.story };
const layoutInput = (over: Partial<LayoutInput> = {}, provenanceOver: Partial<BuildProvenanceInput> = {}): LayoutInput => ({
  provenance: buildGlobeViewProvenance(provenanceInput(provenanceOver)),
  bounds: { minX: 0, minY: 0, maxX: 1080, maxY: 1080, width: 1080, height: 1080 },
  frame: { width: 1080, height: 1080 },
  measure,
  style: STORY,
  badge: TEMPLATE_SPECS.critical_intel.badge,
  ...over,
});
const staleFeeds = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Feed ${i}`, lastUpdated: null }));

describe('the story preset', () => {
  it('is 1080×1920, in larger type, read full-screen on a phone at about a third of its size', () => {
    expect(STORY.width).toBe(1080);
    expect(STORY.height).toBe(1920);
    expect(STORY.headlinePx).toBeGreaterThan(42);
    expect(STORY.bodyPx).toBeGreaterThan(20);
    expect(STORY.caveatPx).toBeGreaterThan(16);
  });
});

describe('a composed card', () => {
  it('is exactly 1080×1920, whatever it has to say', () => {
    const short = computeShareCardLayout(layoutInput());
    const longer = computeShareCardLayout(layoutInput({}, { feeds: staleFeeds(3) }));
    for (const layout of [short, longer]) expect([layout.width, layout.height]).toEqual([1080, 1920]);
    // More to say, a smaller picture: never a cut caveat.
    expect(longer.globeArea.height).toBeLessThan(short.globeArea.height);
    expect(longer.lines.filter((l) => l.kind === 'caveat').length).toBeGreaterThan(short.lines.filter((l) => l.kind === 'caveat').length);
  });

  it('puts the badge and the headline above the picture, and the rest below it', () => {
    const legend = [{ layerId: 'WarConflict', layer: 'War & Conflict', swatches: [{ color: '#FF7266', label: 'a critical warning (a glow)' }] }];
    const layout = computeShareCardLayout(layoutInput({}, { legend }));
    expect(layout.chips.length).toBeGreaterThan(0);
    const top = layout.globeArea.y;
    const bottom = layout.globeArea.y + layout.globeArea.height;
    expect(layout.badge!.y + layout.badge!.height).toBeLessThan(top);
    for (const line of layout.lines) {
      if (line.kind === 'featured') expect(line.y, line.text).toBeLessThan(top);
      else expect(line.y - line.fontPx, line.text).toBeGreaterThan(bottom);
    }
    for (const chip of layout.chips) expect(chip.y).toBeGreaterThan(bottom);
  });

  it('gives the picture the full width and what the text leaves, the footer at the foot', () => {
    const layout = computeShareCardLayout(layoutInput());
    expect(layout.globeArea.x).toBe(0);
    expect(layout.globeArea.width).toBe(1080);
    const footer = layout.lines.filter((l) => l.kind === 'footer').at(-1)!;
    expect(1920 - (footer.y + STORY.lineGap)).toBeCloseTo(STORY.padding, 0);
    expect(layout.strip.y).toBe(layout.globeArea.y + layout.globeArea.height);
    expect(layout.strip.y + layout.strip.height).toBe(1920);
  });

  it('draws the picture across its whole area: the window was rendered at its shape', () => {
    const layout = computeShareCardLayout(layoutInput({
      frame: { width: 1080, height: 1000 }, bounds: { minX: 0, minY: 0, maxX: 1080, maxY: 1000, width: 1080, height: 1000 },
    }));
    // A frame of another shape is letterboxed inside the area, never stretched.
    expect(layout.globeRect.width / layout.globeRect.height).toBeCloseTo(1080 / 1000, 3);
    expect(layout.globeRect.y).toBeGreaterThanOrEqual(layout.globeArea.y);
    expect(layout.globeRect.y + layout.globeRect.height).toBeLessThanOrEqual(layout.globeArea.y + layout.globeArea.height + 0.5);
  });

  it('says the picture\'s size before the capture as the layout draws it', () => {
    const input = layoutInput();
    const { globeArea } = computeShareCardLayout(input);
    expect(pictureSizeFor(input)).toEqual({ width: globeArea.width, height: globeArea.height });
    expect(pictureSizeFor(input).width).toBe(1080);
  });

  it('refuses a card with too much to say for a 9:16, rather than cut a caveat or shrink the planet past 4:3', () => {
    expect(() => computeShareCardLayout(layoutInput({}, { feeds: staleFeeds(40) }))).toThrow(ShareCardLayoutError);
    // The 9:16 has the most room of any size (IM27): a card too full for it is too full for any.
    expect(() => computeShareCardLayout(layoutInput({}, { feeds: staleFeeds(40) }))).toThrow(/any size/);
    // The floor is 4:3 of the card's width: 810 px on a 1080 card.
    expect(() => computeShareCardLayout(layoutInput({}, { feeds: staleFeeds(40) }))).toThrow(/under the 810px it needs/);
  });

  it('leaves a style with no fixed height growing under its picture, as every card did before IM28', () => {
    const grows = computeShareCardLayout(layoutInput({ style: { width: 1080, globeAspect: 1 } }));
    expect(grows.globeArea).toEqual({ x: 0, y: 0, width: 1080, height: 1080 });
    expect(grows.badge!.y).toBeGreaterThan(1080);
    expect(grows.height).toBeGreaterThan(1080);
  });
});

describe('how a composed card is drawn', () => {
  it('rules the picture off from the title band above it, as from the facts below', () => {
    const layout = computeShareCardLayout(layoutInput());
    const strokes: number[] = [];
    let at: number[] = [];
    const ctx = {
      fillStyle: '', strokeStyle: '', font: '', lineWidth: 0, textBaseline: 'alphabetic' as CanvasTextBaseline,
      fillRect: () => {}, fillText: () => {}, drawImage: () => {}, arc: () => {}, fill: () => {},
      beginPath: () => { at = []; }, moveTo: (_x: number, y: number) => { at.push(y); }, lineTo: () => {},
      stroke: () => { strokes.push(...at); },
    };
    drawShareCard(ctx, {} as CanvasImageSource, layout);
    expect(strokes).toContain(layout.globeArea.y - 0.5);
    expect(strokes).toContain(layout.strip.y + 0.5);
  });
});
