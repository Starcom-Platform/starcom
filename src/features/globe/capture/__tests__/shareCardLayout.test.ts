/**
 * Card layout, with the load-bearing property first: every caveat is laid out.
 *
 * The measurer is deterministic (a fixed width per character) rather than a
 * real canvas, so wrapping arithmetic is checked against arithmetic I can
 * reason about instead of against a font.
 */
import { describe, it, expect } from 'vitest';
import {
  calloutInPicture,
  CARD_PRESETS,
  computeShareCardLayout,
  wrapStampText,
  pictureSizeFor,
  wrapText,
  ShareCardLayoutError,
  DEFAULT_CARD_STYLE,
  FEATURED_WEIGHT,
  type LayoutInput,
} from '../shareCardLayout';
import { buildGlobeViewProvenance } from '../shareCardProvenance';
import { CREDITS } from '../sourceCredits';
import { IMAGERY } from '../../../../globe-engine/imagery';

/** 0.5px per character per font pixel — proportional, predictable, not a font. */
const measure = (text: string, fontPx: number) => text.length * fontPx * 0.5;

const AT = new Date('2026-09-10T12:00:00.000Z');

const provenance = (over: Parameters<typeof buildGlobeViewProvenance>[0] extends never ? never : Partial<Parameters<typeof buildGlobeViewProvenance>[0]>) =>
  buildGlobeViewProvenance({
    capturedAt: AT,
    camera: { lat: 38.9072, lon: -77.0369, altitude: 2.5 },
    frame: { width: 1400, height: 708 },
    layers: [{ label: 'Intel Reports', active: true, implemented: true }],
    feeds: [{ name: 'NOAA', lastUpdated: AT.toISOString() }],
    now: AT,
    ...over,
  });

const input = (over: Partial<LayoutInput> = {}): LayoutInput => ({
  provenance: provenance({}),
  bounds: { minX: 400, minY: 60, maxX: 1000, maxY: 660, width: 600, height: 600 },
  frame: { width: 1400, height: 708 },
  measure,
  ...over,
});

describe('every caveat is laid out — the property the card exists for', () => {
  it('emits a line for each caveat, whatever the count', () => {
    for (const feedCount of [1, 3, 8]) {
      const feeds = Array.from({ length: feedCount }, (_, i) => ({
        name: `FEED_${i}`, lastUpdated: null, error: 'unreachable',
      }));
      const p = provenance({ feeds });
      const layout = computeShareCardLayout(input({ provenance: p }));
      const caveatText = layout.lines.filter((l) => l.kind === 'caveat').map((l) => l.text).join(' ');
      // Every caveat that applies, in the short form the card prints (IM11).
      expect(p.caveatsShort).toHaveLength(p.caveats.length);
      for (const c of p.caveatsShort) {
        // Wrapping may split a caveat, so check its distinctive words survive.
        const firstWords = c.split(/\s+/).slice(0, 3).join(' ');
        expect(caveatText).toContain(firstWords);
      }
    }
  });

  it('grows the card rather than trimming', () => {
    const few = computeShareCardLayout(input());
    const many = computeShareCardLayout(input({
      provenance: provenance({
        feeds: Array.from({ length: 6 }, (_, i) => ({
          name: `SOURCE_${i}`, lastUpdated: null, error: 'connection refused',
        })),
      }),
    }));
    expect(many.height).toBeGreaterThan(few.height);
    expect(many.width).toBe(few.width);
  });

  /**
   * The refusal. Reached only when there is a lot to disclose — exactly when
   * dropping some would do the most harm.
   */
  it('refuses rather than truncating when it cannot fit', () => {
    const p = provenance({
      feeds: Array.from({ length: 200 }, (_, i) => ({
        name: `SOURCE_${i}`, lastUpdated: null, error: 'a rather long explanation of why this feed could not be reached',
      })),
    });
    expect(() => computeShareCardLayout(input({ provenance: p })))
      .toThrow(ShareCardLayoutError);
    expect(() => computeShareCardLayout(input({ provenance: p })))
      .toThrow(/Refusing rather than truncating/);
  });

  it('names how many caveats it could not fit, so the cause is actionable', () => {
    const p = provenance({
      feeds: Array.from({ length: 200 }, (_, i) => ({ name: `S_${i}`, lastUpdated: null, error: 'x'.repeat(60) })),
    });
    expect(() => computeShareCardLayout(input({ provenance: p })))
      .toThrow(new RegExp(`all ${p.caveats.length} caveats`));
  });

  it('always carries the unsigned note through to a line', () => {
    const layout = computeShareCardLayout(input());
    expect(layout.lines.map((l) => l.text).join(' ')).toMatch(/Unsigned capture/);
  });

  it('prints the full wording when a provenance has no short forms, as one from before schema 12', () => {
    const p = provenance({});
    const older = { ...p, caveatsShort: undefined } as unknown as typeof p;
    const layout = computeShareCardLayout(input({ provenance: older }));
    expect(layout.lines.map((l) => l.text).join(' ')).toMatch(/Unsigned client-side capture/);
  });

  it('prints the full wording when the short forms do not pair with the caveats one for one', () => {
    const p = provenance({});
    const layout = computeShareCardLayout(input({ provenance: { ...p, caveatsShort: p.caveatsShort.slice(1) } }));
    const printed = layout.lines.filter((l) => l.kind === 'caveat').map((l) => l.text).join(' ');
    for (const caveat of p.caveats) expect(printed).toContain(caveat.split(/\s+/).slice(0, 3).join(' '));
  });

  // IM11: small and muted, every one kept; the footer is the quietest line of all.
  it('prints the caveats smaller than the facts, and the footer smaller still', () => {
    const layout = computeShareCardLayout(input());
    const sizes = (kind: string) => [...new Set(layout.lines.filter((l) => l.kind === kind).map((l) => l.fontPx))];
    expect(sizes('caveat')).toEqual([DEFAULT_CARD_STYLE.caveatPx]);
    expect(sizes('footer')).toEqual([DEFAULT_CARD_STYLE.footerPx]);
    expect(DEFAULT_CARD_STYLE.caveatPx).toBeLessThan(DEFAULT_CARD_STYLE.bodyPx);
    expect(DEFAULT_CARD_STYLE.footerPx).toBeLessThanOrEqual(DEFAULT_CARD_STYLE.caveatPx);
  });

  it('sets the caveats and the footer apart from what is above them by more than a line\'s gap', () => {
    const layout = computeShareCardLayout(input());
    const gapAbove = (i: number) => (layout.lines[i].y - layout.lines[i].fontPx) - layout.lines[i - 1].y;
    const firstCaveat = layout.lines.findIndex((l) => l.kind === 'caveat');
    const footer = layout.lines.findIndex((l) => l.kind === 'footer');
    expect(gapAbove(firstCaveat)).toBeGreaterThan(gapAbove(firstCaveat + 1));
    expect(gapAbove(footer)).toBeGreaterThan(gapAbove(firstCaveat + 1));
  });

  it('names the data\'s sources on a line of their own above the footer, in its quiet type (record D-L, L5)', () => {
    const p = provenance({ feeds: [{ name: 'NOAA GFS temperature', lastUpdated: AT.toISOString(), credits: [CREDITS.noaaGfs, CREDITS.openMeteo] }] });
    const footers = computeShareCardLayout(input({ provenance: p })).lines.filter((l) => l.kind === 'footer');
    expect(footers[0].text).toBe('Data: NOAA GFS · Open-Meteo.com (CC BY 4.0)');
    expect(footers[1].text).toMatch(/^STARCOM · /);
    expect(footers[0].fontPx).toBe(footers[1].fontPx);
    // No source named, no line.
    const bare = computeShareCardLayout(input({ provenance: provenance({ feeds: [] }) }));
    expect(bare.lines.some((l) => l.text.startsWith('Data:'))).toBe(false);
  });

  it('names who made the imagery on the same line, after the data (TX10): a line of its own would cost the picture', () => {
    const p = provenance({
      feeds: [{ name: 'NOAA GFS temperature', lastUpdated: AT.toISOString(), credits: [CREDITS.noaaGfs] }],
      imagery: [IMAGERY.earthDay.source, IMAGERY.earthTopology.source],
    });
    const footers = computeShareCardLayout(input({ provenance: p })).lines.filter((l) => l.kind === 'footer');
    expect(footers.map((l) => l.text)).toEqual([
      'Data: NOAA GFS. Imagery: Solar System Scope (CC BY 4.0) · NASA',
      expect.stringMatching(/^STARCOM · /),
    ]);
    // Imagery alone still has its line, and costs no more height than a Data line alone.
    const imageryOnly = computeShareCardLayout(input({ provenance: provenance({ feeds: [], imagery: [IMAGERY.blueMarble.source] }) }));
    expect(imageryOnly.lines.filter((l) => l.kind === 'footer')[0].text).toBe('Imagery: NASA');
    const dataOnly = computeShareCardLayout(input({ provenance: provenance({ feeds: [{ name: 'NOAA GFS temperature', lastUpdated: AT.toISOString(), credits: [CREDITS.noaaGfs] }] }) }));
    expect(computeShareCardLayout(input({ provenance: p })).bottom).toBe(dataOnly.bottom);
  });

  it('marks a build from uncommitted changes with a "+" after its sha in the footer', () => {
    const footerOf = (treeDirty: boolean) => computeShareCardLayout(input({
      provenance: provenance({ build: { sha: 'c'.repeat(40), builtAt: AT.toISOString(), treeDirty } }),
    })).lines.filter((l) => l.kind === 'footer').map((l) => l.text).join(' ');
    expect(footerOf(true)).toContain(`build ${'c'.repeat(8)}+`);
    expect(footerOf(false)).toContain(`build ${'c'.repeat(8)} `);
    expect(footerOf(false)).not.toContain('+');
  });

  it('wraps the stamp the same whatever the build\'s hash, so a card\'s layout does not move with its build', () => {
    // A face where "f" is narrow: "ffffffff" fits where "dddddddd" does not, so the wrap followed the hash.
    const proportional = (text: string, fontPx: number) => [...text].reduce((w, c) => w + (c === 'f' ? 0.2 : 0.6) * fontPx, 0);
    const stamp = (hash: string) => `STARCOM · 2026-10-11 08:27:55Z · build ${hash} · built 2026-10-11`;
    const width = proportional('STARCOM · 2026-10-11 08:27:55Z · build ffffffff', 10) + 1;
    const narrow = wrapStampText(stamp('ffffffff'), 'ffffffff', width, 10, proportional);
    const wide = wrapStampText(stamp('dddddddd'), 'dddddddd', width, 10, proportional);
    expect(narrow.map((line) => line.replace('ffffffff', '#'))).toEqual(wide.map((line) => line.replace('dddddddd', '#')));
    expect(narrow.join(' ')).toContain('build ffffffff');
    // Every line drawn fits: the real hash is never wider than the one measured.
    for (const line of [...narrow, ...wide]) expect(proportional(line, 10)).toBeLessThanOrEqual(width);
    expect(wrapStampText('no build here', null, 1000, 10, proportional)).toEqual(['no build here']);
  });

  it('lays a card out the same from two builds whose hashes differ in width', () => {
    // A wide face, so the stamp wraps over lines, and a narrow "f", so the line holding the hash takes more or less.
    const proportional = (text: string, fontPx: number) => [...text].reduce((w, c) => w + (c === 'f' ? 0.05 : 1.1) * fontPx, 0);
    const laid = (hash: string) => computeShareCardLayout(input({
      provenance: provenance({ build: { sha: hash.repeat(40), builtAt: AT.toISOString() } }), measure: proportional, qr: true,
    }));
    // The stamp wraps here, and the hash's line has room the narrow hash would fill.
    expect(laid('d').lines.filter((l) => l.kind === 'footer' && /STARCOM|build/.test(l.text)).length).toBe(2);
    const geometry = (hash: string) => laid(hash).lines.map((l) => [l.kind, l.y, l.text.replace(hash.repeat(8), '#')]);
    expect(geometry('f')).toEqual(geometry('d'));
  });

  it('counts the analysis marks in the footer when there are any', () => {
    const footerOf = (shown: number) => computeShareCardLayout(input({
      provenance: provenance({ marks: { shown, fabricated: 0, totalObservations: 10, emptyReason: null } }),
    })).lines.filter((l) => l.kind === 'footer').map((l) => l.text).join(' ');
    expect(footerOf(7)).toContain('Marks: 7');
    expect(footerOf(0)).not.toContain('Marks');
  });
});

describe('wrapText', () => {
  it('breaks on width without dropping words', () => {
    const text = 'the quick brown fox jumps over the lazy dog';
    const lines = wrapText(text, 100, 20, measure);
    expect(lines.join(' ').split(/\s+/)).toEqual(text.split(' '));
  });

  /**
   * A word too long to fit overflows rather than vanishing. A caveat with a
   * word missing can invert its sense — "NOAA was unreachable" losing
   * "unreachable" reads as a statement that NOAA was fine.
   */
  it('keeps an over-long word rather than dropping it', () => {
    const lines = wrapText('short supercalifragilisticexpialidocious end', 60, 20, measure);
    expect(lines.join(' ')).toContain('supercalifragilisticexpialidocious');
  });

  it('returns nothing for empty input', () => {
    expect(wrapText('', 100, 20, measure)).toEqual([]);
    expect(wrapText('   ', 100, 20, measure)).toEqual([]);
  });

  it('keeps words joined by a no-break space on one line', () => {
    const lines = wrapText('alpha beta Yemen and the Red Sea\u00a01 · gamma', 40 * 5, 10, measure);
    expect(lines.some((l) => l.includes('Sea\u00a01'))).toBe(true);
    expect(lines.some((l) => /^1\b/.test(l))).toBe(false);
  });

  it('collapses runs of whitespace', () => {
    expect(wrapText('a    b', 1000, 20, measure)).toEqual(['a b']);
  });
});

describe('geometry', () => {
  it('sizes the globe area to the configured aspect', () => {
    const layout = computeShareCardLayout(input());
    // The AREA is the card's shape. What gets drawn into it takes the crop's
    // shape, which is only the same when the crop already matches — see the
    // distortion tests below for why those are two different things.
    expect(layout.globeArea.width / layout.globeArea.height)
      .toBeCloseTo(DEFAULT_CARD_STYLE.globeAspect, 1);
  });

  it('draws inside the area it reserved, never outside it', () => {
    const layout = computeShareCardLayout(input());
    expect(layout.globeRect.x).toBeGreaterThanOrEqual(layout.globeArea.x);
    expect(layout.globeRect.y).toBeGreaterThanOrEqual(layout.globeArea.y);
    expect(layout.globeRect.x + layout.globeRect.width)
      .toBeLessThanOrEqual(layout.globeArea.x + layout.globeArea.width + 0.01);
    expect(layout.globeRect.y + layout.globeRect.height)
      .toBeLessThanOrEqual(layout.globeArea.y + layout.globeArea.height + 0.01);
  });

  it('puts the strip directly below the globe, filling the rest', () => {
    const layout = computeShareCardLayout(input());
    expect(layout.strip.y).toBe(layout.globeArea.height);
    expect(layout.strip.y + layout.strip.height).toBe(layout.height);
    expect(layout.strip.width).toBe(layout.width);
  });

  it('crops from the globe bounds, not the whole frame', () => {
    const layout = computeShareCardLayout(input());
    expect(layout.sourceRect).toMatchObject({ x: 400, y: 60, width: 600, height: 600 });
  });

  /**
   * Bounds may legitimately extend past the frame at low altitude — that is
   * real information — but a draw cannot read outside the source image.
   */
  it('clamps a crop that runs off the frame', () => {
    const layout = computeShareCardLayout(input({
      bounds: { minX: -200, minY: -100, maxX: 2000, maxY: 1200, width: 2200, height: 1300 },
    }));
    expect(layout.sourceRect.x).toBe(0);
    expect(layout.sourceRect.y).toBe(0);
    expect(layout.sourceRect.width).toBeLessThanOrEqual(1400);
    expect(layout.sourceRect.height).toBeLessThanOrEqual(708);
  });

  it('lays text out inside the padding', () => {
    const layout = computeShareCardLayout(input());
    for (const line of layout.lines) {
      expect(line.x).toBe(DEFAULT_CARD_STYLE.padding);
      expect(measure(line.text, line.fontPx))
        .toBeLessThanOrEqual(layout.width - DEFAULT_CARD_STYLE.padding * 2 + 0.001);
    }
  });

  it('orders lines down the strip, never overlapping', () => {
    const layout = computeShareCardLayout(input({
      provenance: provenance({ feeds: [{ name: 'NOAA', lastUpdated: null, error: 'down' }] }),
    }));
    for (let i = 1; i < layout.lines.length; i++) {
      expect(layout.lines[i].y).toBeGreaterThan(layout.lines[i - 1].y);
    }
  });
});

describe('the headline and the footer (IM10)', () => {
  it('states the product and the capture moment in the footer, last', () => {
    const layout = computeShareCardLayout(input());
    const footer = layout.lines.filter((l) => l.kind === 'footer');
    expect(footer.map((l) => l.text).join(' ')).toContain('STARCOM');
    expect(footer.map((l) => l.text).join(' ')).toContain('2026-09-10 12:00:00Z');
    expect(layout.lines.at(-1)?.kind).toBe('footer');
  });

  it('states where the camera was, in the footer', () => {
    const footer = computeShareCardLayout(input()).lines.filter((l) => l.kind === 'footer');
    expect(footer.map((l) => l.text).join(' ')).toContain('38.91°N 77.04°W');
  });

  it('heads a card that features nothing with what it shows, or "The globe" with no layer on', () => {
    const shows = computeShareCardLayout(input());
    expect(shows.lines[0]).toMatchObject({ kind: 'featured', text: 'Intel Reports', fontPx: DEFAULT_CARD_STYLE.headlinePx });
    const none = computeShareCardLayout(input({ provenance: provenance({ layers: [] }) }));
    expect(none.lines[0].text).toBe('The globe');
    expect(none.lines.filter((l) => l.kind === 'caveat').map((l) => l.text).join(' ')).toContain('No data layer');
  });

  it('shortens a headline past its lines at a word, the full title kept in the provenance', () => {
    const long = 'word '.repeat(80).trim();
    const p = provenance({});
    const layout = computeShareCardLayout(input({
      provenance: { ...p, featured: { id: 'x', title: long, lines: [] } },
    }));
    const headline = layout.lines.filter((l) => l.kind === 'featured' && l.fontPx === DEFAULT_CARD_STYLE.headlinePx);
    expect(headline).toHaveLength(DEFAULT_CARD_STYLE.headlineMaxLines);
    expect(headline.at(-1)?.text.endsWith('…')).toBe(true);
  });

  it('does not list a layer that renders nothing as shown', () => {
    const layout = computeShareCardLayout(input({
      provenance: provenance({
        layers: [
          { label: 'Intel Reports', active: true, implemented: true },
          { label: 'Comm Hubs', active: true, implemented: false },
        ],
      }),
    }));
    const headlineText = layout.lines.filter((l) => l.kind === 'featured').map((l) => l.text).join(' ');
    expect(headlineText).toContain('Intel Reports');
    expect(headlineText).not.toContain('Comm Hubs');
    // But it IS disclosed, as a caveat.
    expect(layout.lines.filter((l) => l.kind === 'caveat').map((l) => l.text).join(' '))
      .toContain('Comm Hubs');
  });
});

describe('refusals', () => {
  it.each([0, -100])('refuses a card width of %s', (width) => {
    expect(() => computeShareCardLayout(input({ style: { width } }))).toThrow(/width must be positive/);
  });

  it('refuses padding that leaves no room for text', () => {
    expect(() => computeShareCardLayout(input({ style: { width: 100, padding: 60 } })))
      .toThrow(/no room for text/);
  });
});

describe('the crop stays inside the frame and never distorts the globe', () => {
  const FRAME = { width: 1400, height: 708 };

  /**
   * ─── WHY THIS IS NOT AN EDGE CASE ──────────────────────────────────────
   *
   * `bounds` is deliberately allowed to extend past the frame — that is real
   * information about the view, and computeGlobeScreenBounds says so. It
   * happens whenever the globe is larger than the viewport (low altitude), and
   * it will happen far more often once the card supports aspects taller than
   * 1.91, because expandToAspect grows the short axis to reach them.
   *
   * So what the layout does with an oversized box is not a corner: it is the
   * portrait case and the zoomed-in case.
   */
  it('never reads past the right or bottom edge of the frame', () => {
    // A box hanging off the right-hand side, as an off-centre globe produces.
    const layout = computeShareCardLayout(input({
      bounds: { minX: 900, minY: 100, maxX: 1900, maxY: 1100, width: 1000, height: 1000 },
      frame: FRAME,
    }));
    const s = layout.sourceRect;
    expect(s.x).toBeGreaterThanOrEqual(0);
    expect(s.y).toBeGreaterThanOrEqual(0);
    expect(s.x + s.width).toBeLessThanOrEqual(FRAME.width);
    expect(s.y + s.height).toBeLessThanOrEqual(FRAME.height);
  });

  /**
   * drawShareCard maps sourceRect onto globeRect with a single drawImage. If
   * their aspects differ, the Earth is drawn stretched — and a stretched Earth
   * is not a subtle defect, it is the first thing anyone sees.
   */
  it('keeps the drawn aspect equal to the cropped aspect', () => {
    const layout = computeShareCardLayout(input({
      // Far larger than the frame, so clamping certainly changes the aspect.
      bounds: { minX: -600, minY: -400, maxX: 2000, maxY: 1100, width: 2600, height: 1500 },
      frame: FRAME,
    }));
    const sourceAspect = layout.sourceRect.width / layout.sourceRect.height;
    const drawnAspect = layout.globeRect.width / layout.globeRect.height;
    expect(drawnAspect).toBeCloseTo(sourceAspect, 2);
  });

  it('keeps the globe inside the card, centred, when it cannot fill it', () => {
    const layout = computeShareCardLayout(input({
      bounds: { minX: -600, minY: -400, maxX: 2000, maxY: 1100, width: 2600, height: 1500 },
      frame: FRAME,
    }));
    const g = layout.globeRect;
    expect(g.x).toBeGreaterThanOrEqual(0);
    expect(g.y).toBeGreaterThanOrEqual(0);
    expect(g.x + g.width).toBeLessThanOrEqual(layout.width + 0.01);
    expect(g.y + g.height).toBeLessThanOrEqual(layout.globeArea.height + 0.01);
    // Centred within the globe area rather than pinned to a corner.
    expect(g.x).toBeCloseTo((layout.width - g.width) / 2, 1);
  });

  it('still fills the frame edge to edge in the ordinary case', () => {
    // The everyday capture: box fits, so nothing is letterboxed away.
    const layout = computeShareCardLayout(input({
      bounds: { minX: 200, minY: 40, maxX: 1272, maxY: 601, width: 1072, height: 561 },
      frame: FRAME,
    }));
    expect(layout.globeRect.x).toBe(0);
    expect(layout.globeRect.width).toBe(DEFAULT_CARD_STYLE.width);
  });
});

describe('the legend — how to read the marks', () => {
  const ecoLegend = [{
    layerId: 'EcologicalDisasters',
    layer: 'Eco Disasters',
    sizeMeans: 'severity — wildfires by burned acreage',
    colorMeans: 'hazard type',
    swatches: [
      { color: '#ff4d4f', label: 'Earthquake' },
      { color: '#fa8c16', label: 'Wildfire' },
      { color: '#1890ff', label: 'Flood' },
    ],
  }];

  // IM12: the layer's name and its swatches; the sentences explaining its encodings stay in the app's key.
  it('names the layer, then draws a dot per category, with no explanatory sentence', () => {
    const layout = computeShareCardLayout(input({ provenance: provenance({ legend: ecoLegend }) }));

    const legendLines = layout.lines.filter((l) => l.kind === 'legend').map((l) => l.text);
    expect(legendLines).toEqual(['Eco Disasters:', 'Earthquake', 'Wildfire', 'Flood']);
    expect(layout.lines.map((l) => l.text).join(' ')).not.toContain('hazard type');
    expect(layout.chips.map((c) => c.color)).toEqual(['#ff4d4f', '#fa8c16', '#1890ff']);
  });

  it('draws a run of unlabelled swatches close together, named once by the label after them, on one row', () => {
    const countries = {
      layerId: 'NationalTerritories:countries', layer: 'Countries',
      swatches: ['#00ff41', '#00b37a', '#0094ff', '#8a6cff'].map((color, i) => ({ color, label: i < 3 ? '' : 'one colour each; neighbours never share one', shape: 'area' })),
    };
    // Narrow, so a row that wrapped per swatch would break the run.
    const layout = computeShareCardLayout(input({ provenance: provenance({ legend: [...ecoLegend, countries] }), style: { width: 470 } }));
    const legendLines = layout.lines.filter((l) => l.kind === 'legend').map((l) => l.text);
    // Too long for what the run leaves of so narrow a row, the label wraps under itself rather than off the card.
    const named = legendLines.slice(legendLines.indexOf('Countries:') + 1);
    expect(named.join(' ')).toBe('one colour each; neighbours never share one');
    // On one line it ended 41 px past the card's padding.
    for (const line of layout.lines.filter((l) => l.kind === 'legend')) {
      expect(line.x + measure(line.text, line.fontPx)).toBeLessThanOrEqual(layout.width - DEFAULT_CARD_STYLE.padding + 1);
    }
    const run = layout.chips.slice(-4);
    expect(new Set(run.map((c) => c.y)).size).toBe(1);
    const step = run[1].x - run[0].x;
    expect(step).toBeLessThan(run[0].radius * 3);
    const eco = layout.chips.slice(0, 2);
    expect(eco[1].x - eco[0].x).toBeGreaterThan(step * 2);
    const label = layout.lines.find((l) => l.text === named[0])!;
    expect(label.x).toBeGreaterThan(run[3].x);
    expect(label.y).toBe(run[3].y + layout.lines.find((l) => l.text === 'Countries:')!.fontPx / 2);
  });

  it('names the moment a weather row holds for after the layer\'s name (D-W, step 5a)', () => {
    const temperature = {
      layerId: 'EarthWeather', layer: 'Temperature', when: 'forecast for 7 Oct 06:00Z',
      swatches: [{ color: '#3b6fd8', label: '-20 °C' }, { color: '#f2c94c', label: '20 °C' }],
    };
    const layout = computeShareCardLayout(input({ provenance: provenance({ legend: [temperature] }), keyLayers: ['Temperature'] }));
    const legendLines = layout.lines.filter((l) => l.kind === 'legend').map((l) => l.text);
    expect(legendLines).toEqual(['Temperature, forecast for 7 Oct 06:00Z:', '-20 °C', '20 °C']);
  });

  it('keys only the layers drawing in the picture, when it is told which', () => {
    const borders = { layerId: 'NationalTerritories:borders', layer: 'Borders', swatches: [{ color: '#c9d4e3', label: 'international boundary', shape: 'line' }] };
    const layout = computeShareCardLayout(input({
      provenance: provenance({ legend: [...ecoLegend, borders] }),
      keyLayers: ['Borders'],
    }));
    const legendLines = layout.lines.filter((l) => l.kind === 'legend').map((l) => l.text);
    expect(legendLines).toEqual(['Borders:', 'international boundary']);
    expect(layout.chips).toHaveLength(1);
  });

  it('keys every layer when it is not told which are in the picture', () => {
    const layout = computeShareCardLayout(input({ provenance: provenance({ legend: ecoLegend }), keyLayers: null }));
    expect(layout.chips).toHaveLength(3);
  });

  it('grows the card to fit the swatches rather than dropping any', () => {
    const without = computeShareCardLayout(input({ provenance: provenance({}) }));
    const with3 = computeShareCardLayout(input({ provenance: provenance({ legend: ecoLegend }) }));
    const many = computeShareCardLayout(input({
      provenance: provenance({
        legend: [{
          ...ecoLegend[0],
          // Long enough to need several rows at the test measurer's width.
          swatches: Array.from({ length: 14 }, (_, i) => ({ color: '#ff4d4f', label: `Category number ${i}` })),
        }],
      }),
    }));

    expect(with3.height).toBeGreaterThan(without.height);
    expect(many.height).toBeGreaterThan(with3.height);
    expect(many.chips).toHaveLength(14);
  });

  it('wraps a row rather than running swatches off the card', () => {
    const many = computeShareCardLayout(input({
      provenance: provenance({
        legend: [{
          ...ecoLegend[0],
          swatches: Array.from({ length: 14 }, (_, i) => ({ color: '#13c2c2', label: `Category number ${i}` })),
        }],
      }),
    }));

    for (const chip of many.chips) {
      expect(chip.x - chip.radius).toBeGreaterThanOrEqual(DEFAULT_CARD_STYLE.padding - 1);
      expect(chip.y).toBeLessThan(many.height);
    }
    for (const line of many.lines.filter((l) => l.kind === 'legend')) {
      expect(line.x + measure(line.text, line.fontPx))
        .toBeLessThanOrEqual(many.width - DEFAULT_CARD_STYLE.padding + 1);
    }
    // More than one row: the labels do not all share a baseline.
    const rows = new Set(many.lines.filter((l) => l.kind === 'legend').map((l) => l.y));
    expect(rows.size).toBeGreaterThan(1);
  });

  // Seen on the first card keying War & Conflict's arcs: one label longer than a row ran off the card's edge.
  it('wraps a label too long for a row under itself, never off the card, and drops no word', () => {
    const label = 'an arc: a state\'s forces named in an item, from their country to where it happened, '
      + 'which is not a path anything took and says nothing of when they arrived';
    const long = computeShareCardLayout(input({
      provenance: provenance({ legend: [{ ...ecoLegend[0], swatches: [{ color: '#ff4d4f', label: 'Earthquake' }, { color: '#13c2c2', label }, { color: '#1890ff', label: 'Flood' }] }] }),
    }));
    const legendLines = long.lines.filter((l) => l.kind === 'legend');
    for (const line of legendLines) {
      expect(line.x + measure(line.text, line.fontPx)).toBeLessThanOrEqual(long.width - DEFAULT_CARD_STYLE.padding + 1);
    }
    const parts = legendLines.filter((l) => !['Eco Disasters:', 'Earthquake', 'Flood'].includes(l.text));
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.map((l) => l.text).join(' ')).toBe(label);
    // Each part under the one before, at the same indent: the label's own column, beside its chip.
    expect(new Set(parts.map((l) => l.x)).size).toBe(1);
    expect(parts.every((l, i) => i === 0 || l.y > parts[i - 1].y)).toBe(true);
    const chip = long.chips[1];
    expect(chip.x).toBeLessThan(parts[0].x);
    expect(Math.abs(chip.y - (parts[0].y - parts[0].fontPx / 2))).toBeLessThan(1);
    // The next swatch follows the label's last line, never over it.
    const last = parts[parts.length - 1];
    const next = long.chips[2];
    expect(next.y > last.y || next.x - next.radius >= last.x + measure(last.text, last.fontPx)).toBe(true);
    expect(next.y + next.radius).toBeGreaterThan(last.y - last.fontPx);
  });

  it('sits between the details and the caveats', () => {
    const layout = computeShareCardLayout(input({ provenance: provenance({ legend: ecoLegend }) }));
    const kinds = layout.lines.map((l) => l.kind);
    const lastDetail = kinds.lastIndexOf('detail');
    const firstLegend = kinds.indexOf('legend');
    const firstCaveat = kinds.indexOf('caveat');

    expect(firstLegend).toBeGreaterThan(lastDetail);
    // The caveats stay last, where they carry the most weight.
    expect(firstCaveat).toBeGreaterThan(kinds.lastIndexOf('legend'));
  });

  it('draws nothing at all when no layer published an encoding', () => {
    const layout = computeShareCardLayout(input({ provenance: provenance({}) }));
    expect(layout.chips).toEqual([]);
    expect(layout.lines.some((l) => l.kind === 'legend')).toBe(false);
  });
});

/**
 * The shape travels from the layer onto its chips (decision D-F, step 7), so
 * drawShareCard can draw a swatch as the layer drew it rather than as a dot.
 */
describe('a chip carries the shape its layer declared', () => {
  const legendOf = (shapeMeans?: string) => [{
    layerId: 'CyberThreats', layer: 'Cyber Threats', shapeMeans,
    swatches: [{ color: '#ff4d4f', label: 'severity 5 of 5' }],
  }];

  it('carries the declared shape onto every swatch of that layer', () => {
    const layout = computeShareCardLayout(input({ provenance: provenance({ legend: legendOf('ring') }) }));

    expect(layout.chips.map((c) => c.shape)).toEqual(['ring']);
  });

  /*
   * Most layers draw one kind of mark and declare nothing. Their chips carry no
   * shape and the card fills a disc, which is what it drew before any of this.
   */
  it('leaves the shape unset when the layer declared none', () => {
    const layout = computeShareCardLayout(input({ provenance: provenance({ legend: legendOf(undefined) }) }));

    expect(layout.chips[0].shape).toBeUndefined();
  });
});

describe('a swatch\'s own shape wins over its entry\'s', () => {
  it('carries the border swatches\' solid and dashed shapes onto their chips', () => {
    const legend = [{
      layerId: 'NationalTerritories:borders', layer: 'Borders',
      swatches: [
        { color: '#c9d4e3', label: 'international boundary', shape: 'line' },
        { color: '#ff5555', label: 'disputed', shape: 'dashed' },
      ],
    }];
    const layout = computeShareCardLayout(input({ provenance: provenance({ legend }) }));

    expect(layout.chips.map((c) => c.shape)).toEqual(['line', 'dashed']);
  });
});

/*
 * A card about one report (decision D-F, section 18, item 2).
 *
 * The strip names the report under the heading, and the image points at its
 * glyph. Both come from provenance.featured, which the app derives from the
 * report on the globe; nothing here is authored by a caller.
 */
describe('a featured report', () => {
  const featured = {
    id: 'evt1',
    title: 'Limited Competition: Small Grant Program for the NCATS Clinical and Translational Science Award closes in 24 days',
    lines: ['not assessed · by npub1abcdef…wxyz', 'Written 2026-09-24 12:00Z; when it happened was not stated'],
  };
  // The glyph at frame (700, 360): inside the crop box, left of its centre line.
  const withFeatured = (at: { x: number; y: number } | null = { x: 650, y: 360 }) => input({
    provenance: provenance({ featured }),
    featuredAt: at,
  });

  it('leads with the report\'s title as the headline, its facts after it (IM10)', () => {
    const layout = computeShareCardLayout(withFeatured());
    const kinds = layout.lines.map((l) => l.kind);
    expect(kinds[0]).toBe('featured');
    expect(layout.lines[0].text.startsWith('Limited Competition')).toBe(true);
    expect(layout.lines[0].fontPx).toBe(DEFAULT_CARD_STYLE.headlinePx);
    const text = layout.lines.map((l) => l.text).join(' ');
    expect(text).toContain('not assessed · by npub1abcdef…wxyz');
    expect(kinds.indexOf('detail')).toBeGreaterThan(kinds.lastIndexOf('featured'));
  });

  it('points at the glyph, mapped from the frame into the card', () => {
    const layout = computeShareCardLayout(withFeatured());
    const { globeRect, sourceRect } = layout;
    const expectX = globeRect.x + (650 - sourceRect.x) * (globeRect.width / sourceRect.width);
    const expectY = globeRect.y + (360 - sourceRect.y) * (globeRect.height / sourceRect.height);
    expect(layout.callout!.anchor.x).toBeCloseTo(expectX, 5);
    expect(layout.callout!.anchor.y).toBeCloseTo(expectY, 5);
  });

  it('keeps the label inside the image and off the glyph', () => {
    for (const at of [{ x: 420, y: 80 }, { x: 980, y: 640 }, { x: 700, y: 360 }]) {
      const layout = computeShareCardLayout(withFeatured(at));
      const { label, anchor } = layout.callout!;
      const g = layout.globeRect;
      expect(label.x).toBeGreaterThanOrEqual(g.x);
      expect(label.y).toBeGreaterThanOrEqual(g.y);
      expect(label.x + label.width).toBeLessThanOrEqual(g.x + g.width + 0.001);
      expect(label.y + label.height).toBeLessThanOrEqual(g.y + g.height + 0.001);
      const overGlyph = anchor.x > label.x - 12 && anchor.x < label.x + label.width + 12
        && anchor.y > label.y - 12 && anchor.y < label.y + label.height + 12;
      expect(overGlyph).toBe(false);
    }
  });

  it('shortens a long title on the image, at a word, and keeps it whole in the strip', () => {
    const layout = computeShareCardLayout(withFeatured());
    const onImage = layout.callout!.text;
    expect(onImage.endsWith('…')).toBe(true);
    expect(onImage.length).toBeLessThanOrEqual(61);
    const strip = layout.lines.filter((l) => l.kind === 'featured').map((l) => l.text).join(' ');
    expect(strip).toContain('closes in 24 days');
  });

  /*
   * Compose places the country names before the capture, and they keep clear of the
   * label and its leader (decision K5, TS11): so the label is placed before the
   * layout is, by the same code, and must land where the layout puts it.
   */
  it('is placed before the layout, by the same rule, where the layout puts it, at any scale', () => {
    for (const preset of ['square', 'wide'] as const) {
      const style = CARD_PRESETS[preset];
      const p = provenance({ featured });
      const picture = pictureSizeFor({ provenance: p, measure, style });
      // Fractional scales round the frame off the picture's aspect: a letterbox a fraction of a pixel wide.
      for (const scale of [1, 2, 1.37, 1.55, 1.73]) {
        const frame = { width: Math.round(picture.width * scale), height: Math.round(picture.height * scale) };
        for (const at of [{ x: 0.2, y: 0.15 }, { x: 0.85, y: 0.9 }, { x: 0.5, y: 0.5 }]) {
          const featuredAt = { x: at.x * frame.width, y: at.y * frame.height };
          const layout = computeShareCardLayout({
            provenance: p, measure, style, featuredAt, frame,
            bounds: { minX: 0, minY: 0, maxX: frame.width, maxY: frame.height, ...frame },
          });
          const predicted = calloutInPicture({ featuredAt, frame, picture, title: featured.title, fontPx: style.bodyPx, measure })!;
          const { x, y } = layout.globeArea;
          const moved = (point: { x: number; y: number }) => ({ x: point.x + x, y: point.y + y });
          // To a millionth of a pixel: moved back by the picture's place on the card.
          const fine = (o: unknown) => JSON.parse(JSON.stringify(o, (_k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v)));
          expect(fine(moved(predicted.anchor))).toEqual(fine(layout.callout!.anchor));
          expect(fine({ ...predicted.label, ...moved(predicted.label) })).toEqual(fine(layout.callout!.label));
          expect(fine({ from: moved(predicted.leader.from), to: moved(predicted.leader.to) })).toEqual(fine(layout.callout!.leader));
          expect(predicted.text).toBe(layout.callout!.text);
        }
      }
    }
  });

  it('is not placed before the layout when the glyph is outside the picture', () => {
    const picture = { width: 400, height: 300 };
    expect(calloutInPicture({ featuredAt: { x: -5, y: 10 }, frame: picture, picture, title: 'A', fontPx: 15, measure })).toBeUndefined();
  });

  it('draws no callout when the glyph is not in the picture', () => {
    const layout = computeShareCardLayout(withFeatured(null));
    expect(layout.callout).toBeUndefined();
  });

  it('heads a card that features nothing with what it shows, with no facts and no label on the picture', () => {
    const layout = computeShareCardLayout(input());
    expect(layout.lines.filter((l) => l.kind === 'featured').map((l) => l.text)).toEqual(['Intel Reports']);
    expect(layout.lines.some((l) => l.kind === 'detail')).toBe(false);
    expect(layout.callout).toBeUndefined();
  });
});

/*
 * Bold text measured as bold. The featured title and its label are drawn at
 * weight 600 and were measured at the regular weight, so on the first real card
 * (2026-09-25, Racine, WI) the title ran off the strip's right edge and the label
 * off the image. A measurer that makes bold wider catches it; one that ignores
 * weight cannot.
 */
describe('a featured report, measured at the weight it is drawn in', () => {
  const boldWider = (text: string, fontPx: number, weight?: number) =>
    text.length * fontPx * 0.5 * (weight && weight >= 600 ? 1.25 : 1);
  const featured = {
    id: 'evt1',
    title: '6 charities in Racine, WI lost their 501(c)(3) exemption in the last 18 months -- 33% of every revocation ever recorded there, against 11% nationally',
    lines: ['not assessed'],
  };

  it('wraps the title so no bold line is wider than the strip', () => {
    const layout = computeShareCardLayout(input({ provenance: provenance({ featured }), featuredAt: { x: 650, y: 360 }, measure: boldWider }));
    const textWidth = DEFAULT_CARD_STYLE.width - DEFAULT_CARD_STYLE.padding * 2;
    for (const line of layout.lines.filter((l) => l.kind === 'featured')) {
      expect(boldWider(line.text, line.fontPx, FEATURED_WEIGHT)).toBeLessThanOrEqual(textWidth);
    }
  });

  it('sizes the label box for the bold text it holds', () => {
    const layout = computeShareCardLayout(input({ provenance: provenance({ featured }), featuredAt: { x: 650, y: 360 }, measure: boldWider }));
    const { label, text, fontPx } = layout.callout!;
    expect(label.width).toBeGreaterThanOrEqual(boldWider(text, fontPx, FEATURED_WEIGHT));
  });
});

describe('a Timestream strip under the picture (D-PW, PW62, PW77)', () => {
  it('takes a band at the picture\'s foot, the picture fitted to what is left, the text where it was', () => {
    for (const preset of ['wide', 'square', 'portrait', 'embed', 'story'] as const) {
      const style = CARD_PRESETS[preset];
      const plain = computeShareCardLayout(input({ style }));
      const withStrip = computeShareCardLayout(input({ style, timestream: true }));
      const band = withStrip.timestream!;
      expect(band.y + band.height, preset).toBe(plain.globeArea.y + plain.globeArea.height);
      expect(band.height, preset).toBeGreaterThanOrEqual(104);
      expect(band.height, preset).toBeLessThanOrEqual(210);
      expect(withStrip.globeArea, preset).toEqual({ ...plain.globeArea, height: plain.globeArea.height - band.height });
      expect(withStrip.globeRect.y + withStrip.globeRect.height, preset).toBeLessThanOrEqual(band.y + 0.5);
      expect(withStrip.lines, preset).toEqual(plain.lines);
      // Planned the same way, so a capture made at the planned size fills its place.
      const planned = pictureSizeFor({ provenance: provenance({}), measure, style, timestream: true });
      expect(planned, preset).toEqual({ width: withStrip.globeArea.width, height: withStrip.globeArea.height });
    }
    expect(computeShareCardLayout(input()).timestream).toBeUndefined();
  });
});
