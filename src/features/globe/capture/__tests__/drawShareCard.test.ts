/**
 * The drawing step, against a recording context.
 *
 * A test can only assert that the right calls were made in the right order —
 * it cannot see the result. That limit is why drawShareCard holds almost no
 * logic, and why the end-to-end proof is a rendered PNG somebody looks at
 * (scripts/smoke-share-card.mjs). These cover the few things here that could
 * still be wrong.
 */
import { describe, it, expect } from 'vitest';
import { drawShareCard, canvasMeasurer, DEFAULT_CARD_THEME } from '../drawShareCard';
import type { ShareCardLayout } from '../shareCardLayout';
import type { InsetLayout } from '../closeUpInset';
import { GUNMETAL } from '../../../../styles/tokens';

type Call = { op: string; args: unknown[]; fill?: string; font?: string; lineWidth?: number };

/*
 * `lineWidth` is part of Drawable2D and was missing here until step 7 needed
 * it. Nothing caught that: tsconfig.app.json excludes every test file, so no
 * test in this repo is typechecked, and a double can drift from the interface
 * it doubles without a word. Recorded on the stroke calls so the weight a
 * swatch is drawn with is assertable rather than merely assumed.
 */
function recorder() {
  const calls: Call[] = [];
  const ctx = {
    fillStyle: '', strokeStyle: '', font: '', lineWidth: 0, textBaseline: 'alphabetic' as CanvasTextBaseline,
    fillRect: (...a: unknown[]) => calls.push({ op: 'fillRect', args: a, fill: ctx.fillStyle }),
    fillText: (...a: unknown[]) => calls.push({ op: 'fillText', args: a, fill: ctx.fillStyle, font: ctx.font }),
    drawImage: (...a: unknown[]) => calls.push({ op: 'drawImage', args: a }),
    beginPath: () => calls.push({ op: 'beginPath', args: [] }),
    moveTo: (...a: unknown[]) => calls.push({ op: 'moveTo', args: a }),
    lineTo: (...a: unknown[]) => calls.push({ op: 'lineTo', args: a }),
    stroke: () => calls.push({ op: 'stroke', args: [], fill: ctx.strokeStyle, lineWidth: ctx.lineWidth }),
    arc: (...a: unknown[]) => calls.push({ op: 'arc', args: a }),
    fill: () => calls.push({ op: 'fill', args: [], fill: ctx.fillStyle }),
  };
  return { ctx, calls };
}

const layout: ShareCardLayout = {
  width: 1200, height: 900,
  globeArea: { x: 0, y: 0, width: 1200, height: 628 },
  globeRect: { x: 0, y: 0, width: 1200, height: 628 },
  sourceRect: { x: 400, y: 60, width: 600, height: 600 },
  strip: { x: 0, y: 628, width: 1200, height: 272 },
  lines: [
    { text: 'STARCOM · 2026-09-10 12:00:00Z', x: 32, y: 686, fontPx: 26, kind: 'heading' },
    { text: '38.91°N 77.04°W · alt 2.50R', x: 32, y: 718, fontPx: 20, kind: 'detail' },
    { text: 'Earthquake', x: 58, y: 742, fontPx: 18, kind: 'legend' },
    { text: '· NOAA was unreachable', x: 32, y: 774, fontPx: 20, kind: 'caveat' },
  ],
  chips: [{ x: 37, y: 733, radius: 5, color: '#ff4d4f' }],
};

const frame = {} as CanvasImageSource;

describe('the legend swatches', () => {
  it('draws each dot in the colour the layer drew that category in', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, layout);

    const arc = calls.find((c) => c.op === 'arc');
    expect(arc?.args.slice(0, 3)).toEqual([37, 733, 5]);
    // The colour comes from the mark, never from the theme: a swatch this file
    // chose could disagree with the image beside it.
    const filled = calls.filter((c) => c.op === 'fill');
    expect(filled.map((c) => c.fill)).toEqual(['#ff4d4f']);
  });

  it('sets the legend labels apart from details and caveats', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, layout);
    const label = calls.find((c) => c.op === 'fillText' && c.args[0] === 'Earthquake');
    expect(label?.fill).toBe(DEFAULT_CARD_THEME.legend);
    expect(label?.fill).not.toBe(DEFAULT_CARD_THEME.detail);
    expect(label?.fill).not.toBe(DEFAULT_CARD_THEME.caveat);
  });
});

describe('what gets drawn', () => {
  it('crops from the source rect onto the globe rect', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, layout);
    const draw = calls.find((c) => c.op === 'drawImage');
    expect(draw?.args).toEqual([frame, 400, 60, 600, 600, 0, 0, 1200, 628]);
  });

  it('fills the whole card before anything else', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, layout);
    expect(calls[0]).toMatchObject({ op: 'fillRect', args: [0, 0, 1200, 900] });
    expect(calls.findIndex((c) => c.op === 'drawImage')).toBeGreaterThan(0);
  });

  it('draws every line', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, layout);
    const texts = calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    expect(texts).toEqual(layout.lines.map((l) => l.text));
  });

  /**
   * The caveat colour has to differ from the detail colour, or the part a
   * viewer must not skim past looks like the part they can.
   */
  it('sets caveats apart from details', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, layout);
    const byKind = Object.fromEntries(
      calls.filter((c) => c.op === 'fillText').map((c, i) => [layout.lines[i].kind, c.fill]),
    );
    expect(byKind.caveat).toBe(DEFAULT_CARD_THEME.caveat);
    expect(byKind.detail).toBe(DEFAULT_CARD_THEME.detail);
    expect(byKind.caveat).not.toBe(byKind.detail);
  });

  it('draws the footer in its own colour, apart from the details', () => {
    const { ctx, calls } = recorder();
    const withFooter: ShareCardLayout = {
      ...layout,
      lines: [...layout.lines, { text: 'STARCOM · 2026-09-10 12:00:00Z', x: 32, y: 800, fontPx: 15, kind: 'footer' }],
    };
    drawShareCard(ctx, frame, withFooter);
    const footer = calls.filter((c) => c.op === 'fillText').at(-1);
    expect(footer?.fill).toBe(DEFAULT_CARD_THEME.footer);
    expect(footer?.fill).not.toBe(DEFAULT_CARD_THEME.detail);
  });

  // IM5: a card is gunmetal from the token set, as the app's own panels are.
  it('takes every colour of the card from the token set', () => {
    const { fontFamily, ...colours } = DEFAULT_CARD_THEME;
    expect(fontFamily).toBeTruthy();
    for (const [part, colour] of Object.entries(colours)) {
      expect(Object.values(GUNMETAL), part).toContain(colour);
    }
  });

  it('uses each line\'s own font size', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, layout);
    const fonts = calls.filter((c) => c.op === 'fillText').map((c) => c.font);
    expect(fonts[0]).toContain('26px');
    expect(fonts[1]).toContain('20px');
  });

  /**
   * The layout accumulates y as a line's BOTTOM. With the canvas default
   * `alphabetic` baseline every line would sit an ascent too low and the last
   * would fall off the card — a defect only visible in a rendered image.
   */
  it('sets a top baseline and offsets each line by its own size', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, layout);
    expect(ctx.textBaseline).toBe('top');
    const first = calls.find((c) => c.op === 'fillText');
    expect(first?.args[2]).toBe(686 - 26);
  });

  it('keeps every line inside the card', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, layout);
    for (const c of calls.filter((x) => x.op === 'fillText')) {
      expect(c.args[2] as number).toBeGreaterThanOrEqual(0);
      expect(c.args[2] as number).toBeLessThan(layout.height);
    }
  });

  it('rules off the strip from the globe', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, layout);
    expect(calls.some((c) => c.op === 'moveTo' && (c.args[1] as number) === 628.5)).toBe(true);
    expect(calls.some((c) => c.op === 'stroke')).toBe(true);
  });
});

describe('canvasMeasurer', () => {
  /**
   * Setting the font on every call is the point. A stale font measures against
   * the wrong size, and wrapping then produces lines that overflow — silently,
   * because nothing checks the rendered width afterwards.
   */
  it('sets the font before each measurement', () => {
    const seen: string[] = [];
    const ctx = {
      font: '',
      measureText(t: string) { seen.push(this.font); return { width: t.length }; },
    };
    const measure = canvasMeasurer(ctx);
    measure('abc', 20);
    measure('abc', 26);
    expect(seen[0]).toContain('20px');
    expect(seen[1]).toContain('26px');
  });

  it('returns the measured width', () => {
    const ctx = { font: '', measureText: (t: string) => ({ width: t.length * 7 }) };
    expect(canvasMeasurer(ctx)('abcd', 20)).toBe(28);
  });
});

/**
 * A swatch is drawn in the shape its layer drew (decision D-F, step 7).
 *
 * Every swatch here was a filled dot, which was true enough when every layer
 * drew discs. Step 6.3 let a person put a layer on rings, and step 7 made the
 * in-app key draw its swatches as shapes — so a card printing "shape: ring"
 * beside a row of DOTS disagreed both with the globe in its own image and with
 * the app the reader had just left.
 */
describe('a swatch takes the shape its layer drew', () => {
  const withChips = (chips: ShareCardLayout['chips']): ShareCardLayout => ({ ...layout, chips });

  it('fills a disc, as it always has', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, withChips([{ x: 37, y: 733, radius: 5, color: '#ff4d4f', shape: 'disc' }]));

    expect(calls.filter((c) => c.op === 'fill').map((c) => c.fill)).toEqual(['#ff4d4f']);
    // The card strokes its own divider rule, so only strokes in the MARK's
    // colour count as a swatch here.
    expect(calls.filter((c) => c.op === 'stroke' && c.fill === '#ff4d4f')).toHaveLength(0);
  });

  /*
   * A chip with no shape is a layer that never declared one, which is most of
   * them — they draw discs, so it fills, exactly as before this existed.
   */
  it('fills a disc when the layer declared no shape', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, withChips([{ x: 37, y: 733, radius: 5, color: '#ff4d4f' }]));

    expect(calls.filter((c) => c.op === 'fill').map((c) => c.fill)).toEqual(['#ff4d4f']);
  });

  it('strokes a ring rather than filling it', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, withChips([{ x: 37, y: 733, radius: 5, color: '#00e5ff', shape: 'ring' }]));

    const ring = calls.filter((c) => c.op === 'stroke' && c.fill === '#00e5ff');
    expect(ring).toHaveLength(1);
    // A ring drawn at zero weight is an invisible swatch beside a visible mark.
    expect(ring[0].lineWidth).toBeGreaterThan(0);
    // Nothing filled in the mark's colour: a filled ring is a disc, which is the
    // shape it is not.
    expect(calls.filter((c) => c.op === 'fill' && c.fill === '#00e5ff')).toHaveLength(0);
  });

  // Diplomacy's place GDELT put only at a country, under the Ring style (D-DP, DP13).
  it('strokes a dashed ring as eight dashes, never a fill', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, withChips([{ x: 37, y: 733, radius: 5, color: '#00e5ff', shape: 'dashedRing' }]));

    expect(calls.filter((c) => c.op === 'arc' && (c.args[3] as number) - (c.args[4] as number) !== 0)).toHaveLength(8);
    expect(calls.filter((c) => c.op === 'stroke' && c.fill === '#00e5ff')).toHaveLength(1);
    expect(calls.filter((c) => c.op === 'fill' && c.fill === '#00e5ff')).toHaveLength(0);
  });

  /*
   * A glow is a core with light around it — the two parts the shader draws in
   * one object. On a card that is a filled core inside a fainter outer ring;
   * a plain dot would lose what distinguishes it from a disc entirely.
   */
  it('draws a glow as a core inside a fainter halo', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, withChips([{ x: 37, y: 733, radius: 5, color: '#ffcc00', shape: 'glow' }]));

    expect(calls.filter((c) => c.op === 'fill').map((c) => c.fill)).toEqual(['#ffcc00']);
    const haloes = calls.filter((c) => c.op === 'stroke' && String(c.fill).startsWith('#ffcc00'));
    expect(haloes).toHaveLength(1);
    // The halo carries the mark's colour at reduced alpha, never a theme colour.
    expect(String(haloes[0].fill)).toMatch(/^#ffcc00/);
    expect(String(haloes[0].fill)).not.toBe('#ffcc00');
  });

  /*
   * shapeMeans is a free-form string on LayerLegend — a layer states it, and a
   * layer could state anything. An unknown value draws the disc every layer
   * draws by default rather than nothing at all.
   */
  it('falls back to a disc for a shape it cannot draw', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, withChips([
      { x: 37, y: 733, radius: 5, color: '#ff4d4f', shape: 'hexagon' as never },
    ]));

    expect(calls.filter((c) => c.op === 'fill').map((c) => c.fill)).toEqual(['#ff4d4f']);
  });
});

/**
 * Border swatches are lines (decision D-F, 2026-09-19): a settled boundary
 * solid, a provisional one dashed. The dash is the distinction the border key
 * exists to show, so on the card it has to be drawn as separate strokes.
 */
describe('a border swatch is drawn as a line', () => {
  const withChips = (chips: ShareCardLayout['chips']): ShareCardLayout => ({ ...layout, chips });
  const strokesIn = (calls: Call[], colour: string) => calls.filter((c) => c.op === 'stroke' && c.fill === colour);
  const segmentsIn = (calls: Call[]) => calls.filter((c) => c.op === 'moveTo').length;

  it('strokes a settled boundary as one unbroken line, and fills nothing', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, withChips([{ x: 40, y: 733, radius: 5, color: '#c9d4e3', shape: 'line' }]));

    expect(strokesIn(calls, '#c9d4e3')).toHaveLength(1);
    expect(calls.filter((c) => c.op === 'fill' && c.fill === '#c9d4e3')).toHaveLength(0);
  });

  it('draws a provisional boundary as several separate dashes', () => {
    const solid = recorder();
    drawShareCard(solid.ctx, frame, withChips([{ x: 40, y: 733, radius: 5, color: '#c9d4e3', shape: 'line' }]));
    const dashed = recorder();
    drawShareCard(dashed.ctx, frame, withChips([{ x: 40, y: 733, radius: 5, color: '#ff5555', shape: 'dashed' }]));

    // The card's divider is one moveTo in both, so the difference is the dashes.
    expect(segmentsIn(dashed.calls) - segmentsIn(solid.calls)).toBeGreaterThanOrEqual(2);
    expect(strokesIn(dashed.calls, '#ff5555')).toHaveLength(1);
  });
});

/**
 * An area swatch (War & Conflict's war map, decision WC1): a filled square,
 * since what it keys is a country's fill, not a mark or a line.
 */
describe('an area swatch is drawn as a filled square', () => {
  const withChips = (chips: ShareCardLayout['chips']): ShareCardLayout => ({ ...layout, chips });

  it('fills one square in its colour, and strokes nothing in it', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, withChips([{ x: 40, y: 733, radius: 5, color: '#FB594D', shape: 'area' }]));
    const squares = calls.filter((c) => c.op === 'fillRect' && c.fill === '#FB594D');
    expect(squares).toHaveLength(1);
    const [, , w, h] = squares[0].args as number[];
    expect(w).toBe(h);
    expect(calls.filter((c) => c.op === 'stroke' && c.fill === '#FB594D')).toHaveLength(0);
  });
});

/**
 * A hatched swatch (War & Conflict's outer countries, theatre-lens.md, TL5): a
 * square's outline with diagonals across it, as the globe hatches a country and
 * outlines its edge. Strokes only: nothing in it is filled.
 */
describe('a hatched swatch is drawn as an outlined square with diagonals', () => {
  const withChips = (chips: ShareCardLayout['chips']): ShareCardLayout => ({ ...layout, chips });

  it('strokes its outline and three diagonals in its colour, inside the square, and fills nothing in it', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, withChips([{ x: 40, y: 733, radius: 5, color: '#FB594D', shape: 'hatch' }]));
    expect(calls.filter((c) => c.op === 'stroke' && c.fill === '#FB594D')).toHaveLength(1);
    expect(calls.filter((c) => (c.op === 'fill' || c.op === 'fillRect') && c.fill === '#FB594D')).toHaveLength(0);
    const plain = recorder();
    drawShareCard(plain.ctx, frame, withChips([]));
    const moves = (cs: typeof calls) => cs.filter((c) => c.op === 'moveTo');
    // One move for the outline, one for each diagonal.
    expect(moves(calls).length - moves(plain.calls).length).toBe(4);
    const half = (5 * 1.8) / 2;
    const points = calls.filter((c) => c.op === 'moveTo' || c.op === 'lineTo').map((c) => c.args as number[])
      .filter(([x, y]) => Math.abs(x - 40) <= half + 1e-9 && Math.abs(y - 733) <= half + 1e-9);
    expect(points.length).toBeGreaterThanOrEqual(11);
  });
});

/** An arc swatch (War & Conflict's state forces, theatre-lens.md, TL6): a stroke bowed upward, as the arcs rise. */
describe('an arc swatch is drawn as a bowed stroke', () => {
  const withChips = (chips: ShareCardLayout['chips']): ShareCardLayout => ({ ...layout, chips });

  it('strokes one curve in its colour, bowed over the chip, and fills nothing', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, withChips([{ x: 40, y: 733, radius: 5, color: '#FB594D', shape: 'arc' }]));
    expect(calls.filter((c) => c.op === 'stroke' && c.fill === '#FB594D')).toHaveLength(1);
    expect(calls.filter((c) => (c.op === 'fill' || c.op === 'fillRect') && c.fill === '#FB594D')).toHaveLength(0);
    const arcs = calls.filter((c) => c.op === 'arc').map((c) => c.args as number[]);
    expect(arcs).toHaveLength(1);
    const [cx, cy, r, from, to] = arcs[0];
    expect(cx).toBe(40);
    // Its centre below the chip, so the curve bows up through it; the top half of a circle, in part.
    expect(cy - r).toBeLessThan(733);
    expect(cy).toBeGreaterThan(733);
    expect(from).toBeGreaterThan(Math.PI);
    expect(to).toBeLessThan(2 * Math.PI);
  });
});

/**
 * A swatch shaped like the mark it keys.
 *
 * Intel Report glyphs are documents and RLSH glyphs are people. With no case
 * for either, a legend saying `shape: document` would still have drawn its
 * swatch as a dot — the fallback for any shape the card cannot draw — and a
 * key whose chip is a disc while the image shows pages is the same
 * contradiction Mecha Jono reported, one level down.
 */
describe('document and person swatches', () => {
  const withChips = (chips: ShareCardLayout['chips']): ShareCardLayout => ({ ...layout, chips });

  it('draws a document as a filled outline, not a dot', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, withChips([{ x: 37, y: 733, radius: 5, color: '#8fa3b0', shape: 'document' }]));

    expect(calls.some((c) => c.op === 'arc')).toBe(false);
    const fills = calls.filter((c) => c.op === 'fill');
    expect(fills.some((c) => c.fill === '#8fa3b0')).toBe(true);
    // A page with a folded corner has at least five corners to visit.
    expect(calls.filter((c) => c.op === 'lineTo').length).toBeGreaterThanOrEqual(4);
  });

  it('draws a person with a head, not as a single dot', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, withChips([{ x: 37, y: 733, radius: 5, color: '#ff6ad5', shape: 'person' }]));

    // Head and shoulders: two separately filled parts.
    expect(calls.filter((c) => c.op === 'fill' && c.fill === '#ff6ad5').length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * A swatch drawn in its layer's style (decision D-F, section 18, item 1.1).
 *
 * The glyphs now sit on a disc, a glow or a ring. A key showing a bare page
 * beside an image of pages on dark discs is a mark that is not in the picture.
 */
describe('a document swatch in its style', () => {
  const withChips = (chips: ShareCardLayout['chips']): ShareCardLayout => ({ ...layout, chips });
  const chip = (style: string) => ({ x: 37, y: 733, radius: 5, color: '#ff4d4f', shape: 'document', style });

  it('puts the page on a dark disc edged in its colour', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, withChips([chip('disc')]));

    const firstArc = calls.findIndex((c) => c.op === 'arc');
    const pageFill = calls.findIndex((c) => c.op === 'fill' && c.fill === '#ff4d4f');
    expect(firstArc).toBeGreaterThanOrEqual(0);
    // The backing is drawn first, so the page sits on it.
    expect(firstArc).toBeLessThan(pageFill);
    expect(calls.some((c) => c.op === 'fill' && c.fill === '#08121a')).toBe(true);
    expect(calls.some((c) => c.op === 'stroke' && c.fill === '#ff4d4f')).toBe(true);
  });

  it('draws a ring as an edge with no dark fill', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, withChips([chip('ring')]));
    expect(calls.some((c) => c.op === 'stroke' && c.fill === '#ff4d4f')).toBe(true);
    expect(calls.some((c) => c.op === 'fill' && c.fill === '#08121a')).toBe(false);
  });

  it('draws a glow as a faint halo in its colour', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, withChips([chip('glow')]));
    expect(calls.some((c) => c.op === 'stroke' && typeof c.fill === 'string' && c.fill.startsWith('#ff4d4f') && c.fill.length === 9)).toBe(true);
  });

  it('keeps the page at its own size inside the backing', () => {
    const bare = recorder();
    drawShareCard(bare.ctx, frame, withChips([{ x: 37, y: 733, radius: 5, color: '#ff4d4f', shape: 'document' }]));
    const styled = recorder();
    drawShareCard(styled.ctx, frame, withChips([chip('disc')]));
    const xs = (calls: typeof bare.calls) => calls.filter((c) => c.op === 'lineTo').map((c) => c.args[0] as number);
    const span = (calls: typeof bare.calls) => Math.max(...xs(calls)) - Math.min(...xs(calls));
    expect(span(styled.calls)).toBeCloseTo(span(bare.calls), 5);
  });
});

/*
 * The featured report on the image (decision D-F, section 18, item 2): a label
 * and a line to its glyph, drawn over the globe and under nothing.
 */
describe('the featured callout', () => {
  const callout = {
    anchor: { x: 300, y: 200 },
    label: { x: 330, y: 230, width: 200, height: 36 },
    text: 'Grant closes Friday',
    fontPx: 20,
    leader: { from: { x: 313, y: 213 }, to: { x: 330, y: 230 } },
  };

  it('draws the leader, the label box and its text, after the globe', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, { ...layout, callout });

    const image = calls.findIndex((c) => c.op === 'drawImage');
    const leaderStart = calls.findIndex((c) => c.op === 'moveTo' && c.args[0] === 313 && c.args[1] === 213);
    const box = calls.findIndex((c) => c.op === 'fillRect' && c.args[0] === 330 && c.args[1] === 230);
    const text = calls.findIndex((c) => c.op === 'fillText' && c.args[0] === 'Grant closes Friday');
    expect(image).toBeGreaterThanOrEqual(0);
    expect(leaderStart).toBeGreaterThan(image);
    expect(box).toBeGreaterThan(image);
    // The text on top of its box.
    expect(text).toBeGreaterThan(box);
  });

  it('draws nothing extra without a callout', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, layout);
    expect(calls.some((c) => c.op === 'fillText' && c.args[0] === 'Grant closes Friday')).toBe(false);
  });

  it('sets the featured title apart from the detail lines', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, { ...layout, lines: [
      { text: 'Grant closes Friday', x: 32, y: 700, fontPx: 22, kind: 'featured' },
      { text: 'not assessed', x: 32, y: 730, fontPx: 20, kind: 'detail' },
    ] });
    const title = calls.find((c) => c.op === 'fillText' && c.args[0] === 'Grant closes Friday')!;
    const detail = calls.find((c) => c.op === 'fillText' && c.args[0] === 'not assessed')!;
    expect(title.fill).not.toBe(detail.fill);
    expect(String(title.font)).toMatch(/^600 /);
  });
});

/*
 * The close-up inset (IM34, IM35): every decision is closeUpInset's layout, so
 * these hold the drawing to it, primitive by primitive, in the theme's tones and
 * the marks' own colours.
 */
describe('the close-up inset', () => {
  const inset: InsetLayout = {
    rect: { x: 22, y: 400, width: 200, height: 200 },
    map: { x: 30, y: 430, width: 184, height: 120 },
    covers: 0,
    overLabel: false,
    pxPerKm: 40,
    gridKm: 1,
    leader: { from: { x: 300, y: 300 }, to: { x: 222, y: 400 } },
    grid: [{ x1: 70, y1: 430, x2: 70, y2: 550 }, { x1: 30, y1: 470, x2: 214, y2: 470 }],
    fills: [[{ x: 40, y: 440 }, { x: 200, y: 440 }, { x: 120, y: 540 }]],
    strokes: [{ x1: 40, y1: 440, x2: 200, y2: 440 }],
    marks: [
      { x: 60, y: 480, radius: 4, color: '#c77dff', cancelled: false },
      { x: 90, y: 500, radius: 4, color: '#c77dff', cancelled: true },
    ],
    featured: { x: 120, y: 490, radius: 6, ringRadius: 10, color: '#c77dff', cancelled: false },
    label: { text: 'Bill Graham Civic Auditorium', x: 134, y: 484, fontPx: 12, box: { x: 130, y: 480, width: 80, height: 20 } },
    title: { text: 'Public venues the same night', x: 30, y: 408, fontPx: 13 },
    scale: { x: 30, y: 562, width: 80, text: '2 km', fontPx: 11, textX: 115, textY: 556 },
    note: { text: 'within 25 km · placed to about 150 m · 1 km grid', fontPx: 11, lines: [{ text: 'within 25 km · placed to about 150 m · 1 km grid', x: 30, y: 576 }] },
  };
  const drawn = () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, layout, DEFAULT_CARD_THEME, { inset });
    return calls;
  };

  it('on its own ground over the picture, framed, before the text below', () => {
    const calls = drawn();
    const image = calls.findIndex((c) => c.op === 'drawImage');
    const ground = calls.findIndex((c) => c.op === 'fillRect' && c.args.join() === '22,400,200,200');
    expect(ground).toBeGreaterThan(image);
    expect(calls[ground].fill).toBe(DEFAULT_CARD_THEME.background);
    const frameAt = calls.findIndex((c) => c.op === 'moveTo' && c.args.join() === '22.5,400.5');
    expect(frameAt).toBeGreaterThan(ground);
    // Its text over its ground; the strip after it.
    const title = calls.findIndex((c) => c.op === 'fillText' && c.args[0] === 'Public venues the same night');
    expect(title).toBeGreaterThan(ground);
    const strip = calls.findIndex((c) => c.op === 'fillRect' && c.args.join() === '0,628,1200,272');
    expect(strip).toBeGreaterThan(title);
  });

  it('under the featured item\'s label, so the label covers the leader where they cross', () => {
    const { ctx, calls } = recorder();
    const callout = {
      anchor: { x: 300, y: 300 }, label: { x: 330, y: 230, width: 200, height: 36 }, text: 'Grant closes Friday', fontPx: 20,
      leader: { from: { x: 313, y: 287 }, to: { x: 330, y: 248 } },
    };
    drawShareCard(ctx, frame, { ...layout, callout }, DEFAULT_CARD_THEME, { inset });
    const ground = calls.findIndex((c) => c.op === 'fillRect' && c.args.join() === '22,400,200,200');
    const labelBox = calls.findIndex((c) => c.op === 'fillRect' && c.args.join() === '330,230,200,36');
    expect(ground).toBeGreaterThanOrEqual(0);
    expect(labelBox).toBeGreaterThan(ground);
  });

  it('a leader from the item\'s mark on the globe to the inset', () => {
    const calls = drawn();
    const from = calls.findIndex((c) => c.op === 'moveTo' && c.args.join() === '300,300');
    expect(from).toBeGreaterThanOrEqual(0);
    expect(calls[from + 1]).toMatchObject({ op: 'lineTo', args: [222, 400] });
  });

  it('its grid and state lines in the theme\'s quiet tones, a state filled', () => {
    const calls = drawn();
    const gridLine = calls.findIndex((c) => c.op === 'moveTo' && c.args.join() === '70,430');
    expect(calls[gridLine + 1]).toMatchObject({ op: 'lineTo', args: [70, 550] });
    const gridStroke = calls.slice(gridLine).find((c) => c.op === 'stroke');
    expect(gridStroke?.fill).toBe(DEFAULT_CARD_THEME.rule);
    const land = calls.findIndex((c) => c.op === 'moveTo' && c.args.join() === '40,440');
    expect(calls.slice(land, land + 4).map((c) => c.op)).toEqual(['moveTo', 'lineTo', 'lineTo', 'fill']);
    expect(calls[land + 3].fill).toBe(DEFAULT_CARD_THEME.rule);
  });

  it('each neighbour in its own colour, a cancelled one as a ring, the featured one ringed', () => {
    const calls = drawn();
    const arcAt = (x: number, y: number) => calls.findIndex((c) => c.op === 'arc' && c.args[0] === x && c.args[1] === y);
    const live = arcAt(60, 480);
    expect(calls[live].args[2]).toBe(4);
    expect(calls[live + 1]).toMatchObject({ op: 'fill', fill: '#c77dff' });
    const cancelled = arcAt(90, 500);
    expect(calls[cancelled + 1]).toMatchObject({ op: 'stroke', fill: '#c77dff' });
    const rings = calls.filter((c) => c.op === 'arc' && c.args[0] === 120 && c.args[1] === 490);
    expect(rings.map((c) => c.args[2])).toEqual([6, 10]);
    const ring = calls.findIndex((c) => c.op === 'arc' && c.args[2] === 10);
    expect(calls[ring + 1]).toMatchObject({ op: 'stroke', fill: DEFAULT_CARD_THEME.heading });
  });

  it('the venue named over a box of its ground, the scale bar with its length, and the note', () => {
    const calls = drawn();
    const box = calls.findIndex((c) => c.op === 'fillRect' && c.args.join() === '130,480,80,20');
    const name = calls.findIndex((c) => c.op === 'fillText' && c.args[0] === 'Bill Graham Civic Auditorium');
    expect(box).toBeGreaterThanOrEqual(0);
    expect(name).toBeGreaterThan(box);
    expect(calls[name]).toMatchObject({ args: ['Bill Graham Civic Auditorium', 134, 484], fill: DEFAULT_CARD_THEME.featured });
    expect(String(calls[name].font)).toMatch(/^600 12px /);
    const bar = calls.findIndex((c) => c.op === 'moveTo' && c.args.join() === '30,562');
    expect(calls[bar + 1]).toMatchObject({ op: 'lineTo', args: [110, 562] });
    expect(calls.find((c) => c.op === 'fillText' && c.args[0] === '2 km')?.args.slice(1)).toEqual([115, 556]);
    const note = calls.find((c) => c.op === 'fillText' && c.args[0] === inset.note.lines[0].text)!;
    expect(note.fill).toBe(DEFAULT_CARD_THEME.caveat);
    expect(String(note.font)).toMatch(/^11px /);
  });

  it('nothing of it without one', () => {
    const { ctx, calls } = recorder();
    drawShareCard(ctx, frame, layout);
    expect(calls.some((c) => c.op === 'fillRect' && c.args.join() === '22,400,200,200')).toBe(false);
  });
});
