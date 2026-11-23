/**
 * Every card at the exact size Mecha Jono posts (decisions IM27, IM28,
 * 2026-10-03). The contact sheet showed every card but the 9:16 taller than
 * its size: the presets named the picture, and the text grew under it. Now:
 *
 *   - square 1080×1080 and portrait 1080×1350 stack like the 9:16: the badge
 *     and headline above the picture, the rest below, the picture what the
 *     text leaves;
 *   - Discord's 1280×800 and the link preview's 1200×630 put the picture on
 *     the left, square while the text fits beside it, and the text in a column
 *     on the right; a column that needs more room takes it from the picture.
 *
 * Every caveat stays, as ever: a card that cannot hold its text without its
 * picture falling under its floor is refused, never cut.
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
  type CardPreset,
  type LayoutInput,
} from '../shareCardLayout';
import { drawShareCard } from '../drawShareCard';
import { TEMPLATE_SPECS } from '../cardTemplates';

const AT = new Date('2026-10-03T01:00:00.000Z');
const provenanceInput = (over: Partial<BuildProvenanceInput> = {}): BuildProvenanceInput => ({
  capturedAt: AT,
  camera: { lat: 24.1, lon: 44.5, altitude: 1 },
  frame: { width: 1080, height: 1080 },
  layers: [{ label: 'War & Conflict', active: true, implemented: true }],
  feeds: [{ name: 'War & Conflict', lastUpdated: AT.toISOString() }],
  build: { sha: 'a'.repeat(40), builtAt: AT.toISOString() },
  featured: { id: 'x', title: 'EASA issues a Conflict Zone Information Bulletin for the airspace of Saudi Arabia', lines: ['War & Conflict · A report', 'Reported 1 Oct 2026 10:58Z from EASA conflict zone bulletins'] },
  now: AT,
  ...over,
});
/** Roughly a real font's width: half the size per character. */
const measure = (text: string, fontPx: number) => text.length * fontPx * 0.5;
const at = (preset: CardPreset, over: Partial<LayoutInput> = {}, provenanceOver: Partial<BuildProvenanceInput> = {}): LayoutInput => ({
  provenance: buildGlobeViewProvenance(provenanceInput(provenanceOver)),
  bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000, width: 1000, height: 1000 },
  frame: { width: 1000, height: 1000 },
  measure,
  style: { ...CARD_PRESETS[preset] },
  badge: TEMPLATE_SPECS.critical_intel.badge,
  ...over,
});
const staleFeeds = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Feed number ${i} of the stale ones`, lastUpdated: null }));
const SIZES: Record<CardPreset, [number, number]> = {
  wide: [1200, 630], square: [1080, 1080], portrait: [1080, 1350], embed: [1280, 800], story: [1080, 1920],
};
const textBottom = (layout: ReturnType<typeof computeShareCardLayout>) =>
  Math.max(...layout.lines.map((l) => l.y), ...(layout.badge ? [layout.badge.y + layout.badge.height] : []));

describe('every size is exact (IM27)', () => {
  it('is the size Mecha Jono posts, whatever the card has to say', () => {
    for (const [preset, size] of Object.entries(SIZES) as Array<[CardPreset, [number, number]]>) {
      for (const feeds of [1, 3]) {
        const layout = computeShareCardLayout(at(preset, {}, { feeds: [...staleFeeds(feeds - 1), { name: 'War & Conflict', lastUpdated: AT.toISOString() }] }));
        expect([layout.width, layout.height], `${preset} with ${feeds} feeds`).toEqual(size);
        expect(textBottom(layout), preset).toBeLessThanOrEqual(size[1]);
      }
    }
  });

  it('says the picture\'s size before the capture as the layout draws it', () => {
    for (const preset of Object.keys(SIZES) as CardPreset[]) {
      const input = at(preset);
      const layout = computeShareCardLayout(input);
      expect(pictureSizeFor(input), preset).toEqual({ width: layout.globeArea.width, height: layout.globeArea.height });
    }
  });
});

describe('square and portrait stack like the 9:16', () => {
  for (const preset of ['square', 'portrait'] as const) {
    it(`${preset}: the badge and headline above the picture, the rest below, the picture the full width`, () => {
      const layout = computeShareCardLayout(at(preset));
      const { globeArea } = layout;
      expect(globeArea.x).toBe(0);
      expect(globeArea.width).toBe(1080);
      expect(layout.badge!.y + layout.badge!.height).toBeLessThan(globeArea.y);
      for (const line of layout.lines) {
        if (line.kind === 'featured') expect(line.y, line.text).toBeLessThan(globeArea.y);
        else expect(line.y - line.fontPx, line.text).toBeGreaterThan(globeArea.y + globeArea.height);
      }
    });
  }

  it('gives the planet less room, never a caveat less, when there is more to say', () => {
    const short = computeShareCardLayout(at('square'));
    const longer = computeShareCardLayout(at('square', {}, { feeds: staleFeeds(2) }));
    expect(longer.globeArea.height).toBeLessThan(short.globeArea.height);
    expect(longer.lines.filter((l) => l.kind === 'caveat').length).toBeGreaterThan(short.lines.filter((l) => l.kind === 'caveat').length);
  });
});

describe('the wide sizes put the picture beside the text', () => {
  for (const preset of ['embed', 'wide'] as const) {
    it(`${preset}: the picture on the left, square while the text fits, the text in a column on the right`, () => {
      const [width, height] = SIZES[preset];
      const layout = computeShareCardLayout(at(preset, {}, { featured: { id: 'x', title: 'A short title', lines: [] } }));
      expect(layout.globeArea).toEqual({ x: 0, y: 0, width: height, height });
      expect(layout.strip).toEqual({ x: height, y: 0, width: width - height, height });
      expect(layout.badge!.x).toBeGreaterThanOrEqual(height);
      for (const line of layout.lines) expect(line.x, line.text).toBeGreaterThan(height);
      for (const chip of layout.chips) expect(chip.x).toBeGreaterThan(height);
    });
  }

  it('gives a column that needs more room the picture\'s width, down to its floor, and keeps every line inside the card', () => {
    const roomy = computeShareCardLayout(at('embed', {}, { featured: { id: 'x', title: 'A short title', lines: [] } }));
    // Twelve facts: more than a column beside a square picture holds, and fewer than its floor refuses.
    const facts = Array.from({ length: 12 }, (_, i) => `Fact line number ${i} says something about the item at some length`);
    const crowded = computeShareCardLayout(at('embed', {}, { featured: { id: 'x', title: 'EASA issues a Conflict Zone Information Bulletin for the airspace of Saudi Arabia', lines: facts } }));
    expect(crowded.globeArea.width).toBeLessThan(roomy.globeArea.width);
    expect(crowded.globeArea.width).toBeGreaterThanOrEqual(Math.round(800 * CARD_PRESETS.embed.minPictureShare));
    expect(crowded.strip.x).toBe(crowded.globeArea.width);
    for (const line of crowded.lines) {
      expect(line.x).toBeGreaterThan(crowded.globeArea.width);
      expect(line.x + measure(line.text, line.fontPx), line.text).toBeLessThanOrEqual(1280 - CARD_PRESETS.embed.padding + 1);
      expect(line.y, line.text).toBeLessThanOrEqual(800 - CARD_PRESETS.embed.padding / 2);
    }
  });

  it('draws the picture inside its area, never stretched', () => {
    const layout = computeShareCardLayout(at('embed', {
      frame: { width: 800, height: 760 }, bounds: { minX: 0, minY: 0, maxX: 800, maxY: 760, width: 800, height: 760 },
    }));
    expect(layout.globeRect.width / layout.globeRect.height).toBeCloseTo(800 / 760, 3);
    expect(layout.globeRect.x).toBeGreaterThanOrEqual(0);
    expect(layout.globeRect.x + layout.globeRect.width).toBeLessThanOrEqual(layout.globeArea.width + 0.5);
  });

  it('puts the label on the picture inside the picture, not across the column', () => {
    const layout = computeShareCardLayout(at('embed', { featuredAt: { x: 500, y: 500 } }));
    expect(layout.callout).toBeDefined();
    expect(layout.callout!.label.x + layout.callout!.label.width).toBeLessThanOrEqual(layout.globeArea.width);
  });

  it('rules the picture off from its column with an upright line', () => {
    const layout = computeShareCardLayout(at('wide'));
    const xs: number[] = [];
    let path: Array<[number, number]> = [];
    const ctx = {
      fillStyle: '', strokeStyle: '', font: '', lineWidth: 0, textBaseline: 'alphabetic' as CanvasTextBaseline,
      fillRect: () => {}, fillText: () => {}, drawImage: () => {}, arc: () => {}, fill: () => {},
      beginPath: () => { path = []; }, moveTo: (x: number, y: number) => { path.push([x, y]); }, lineTo: (x: number, y: number) => { path.push([x, y]); },
      stroke: () => { if (path.length === 2 && path[0][0] === path[1][0]) xs.push(path[0][0]); },
    };
    drawShareCard(ctx, {} as CanvasImageSource, layout);
    expect(xs).toContain(layout.strip.x + 0.5);
  });
});

describe('framing plans for the picture at its floor', () => {
  it('frames items for the most extreme shape the picture can take, so they fit whatever the text leaves', () => {
    for (const preset of ['square', 'portrait', 'story'] as const) {
      const { width, height, minPictureShare } = CARD_PRESETS[preset];
      expect(CARD_PRESETS[preset].globeAspect, preset).toBeCloseTo(width / Math.round(width * minPictureShare), 2);
      expect(height).toBeGreaterThan(0);
    }
    for (const preset of ['embed', 'wide'] as const) {
      expect(CARD_PRESETS[preset].globeAspect, preset).toBeCloseTo(CARD_PRESETS[preset].minPictureShare, 2);
    }
  });
});

describe('refused, never cut, at every size', () => {
  it('refuses a card whose text would leave its picture under the floor, saying the floor and offering the 9:16', () => {
    for (const preset of ['square', 'portrait', 'embed', 'wide'] as const) {
      expect(() => computeShareCardLayout(at(preset, {}, { feeds: staleFeeds(30) })), preset).toThrow(ShareCardLayoutError);
      expect(() => computeShareCardLayout(at(preset, {}, { feeds: staleFeeds(30) })), preset).toThrow(/9:16/);
    }
    expect(() => computeShareCardLayout(at('embed', {}, { feeds: staleFeeds(30) }))).toThrow(/600px/);
  });

  it('says a card too full for the 9:16 is too full for any size', () => {
    expect(() => computeShareCardLayout(at('story', {}, { feeds: staleFeeds(60) }))).toThrow(/any size/);
  });
});
