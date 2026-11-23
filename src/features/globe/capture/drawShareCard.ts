/**
 * Put the composed card on a canvas.
 *
 * Deliberately the thinnest file in this feature. Every decision that could be
 * wrong — where the globe is, what the card may claim, whether the caveats fit
 * — was made and tested before anything got here:
 *
 *   globeScreenBounds     where the globe is in the frame
 *   shareCardProvenance   what the image is allowed to claim
 *   shareCardLayout       where each line goes, and the refusal to truncate
 *
 * What remains is drawing calls, which a test can only verify by asserting the
 * calls were made — so this file keeps the logic it could get wrong down to
 * almost nothing, and the end-to-end proof is a rendered PNG a person looks at
 * (scripts/smoke-share-card.mjs).
 *
 * Takes a 2D context rather than a canvas so it works with OffscreenCanvas in
 * a worker as readily as with a DOM canvas.
 */
import { BADGE_WEIGHT, FEATURED_WEIGHT, type ShareCardLayout, type TextLine } from './shareCardLayout';
import { drawTimestreamStrip } from './drawTimestreamStrip';
import type { StripModel } from './timestreamStrip';
import { FONTS, GUNMETAL } from '../../../styles/tokens';
import type { InsetLayout, Segment } from './closeUpInset';

export interface ShareCardTheme {
  /** Behind the strip. The globe area is covered by the frame itself. */
  background: string;
  heading: string;
  /** The featured report's title: the subject of the card, so the brightest line. */
  featured: string;
  detail: string;
  /** Caveats are set apart — they are the part a viewer must not skim past. */
  caveat: string;
  /**
   * The legend's labels. Brighter than a detail line and quieter than a caveat:
   * it is a reading aid for the image, not a warning about it.
   */
  legend: string;
  /** Hairline between the globe and the strip. */
  rule: string;
  /** The footer: the product, the moment, the camera and the build. The quietest line. */
  footer: string;
  fontFamily: string;
}

/**
 * Matches the app's own dark surface, so a card reads as coming from Starcom
 * rather than from a generic template: gunmetal from the token set, as the app's
 * own panels are (plan item 8.1; decision IM5).
 *
 * The caveat colour is deliberately not red. Red reads as an error in the
 * product; these are disclosures about the data, and a wall of red would train
 * a viewer to dismiss them — which is the opposite of why they are there. Nor is
 * it amber (IM11): every caveat that applies is printed, and amber is the colour
 * of caution, which most of them are not. They are muted instead.
 */
export const DEFAULT_CARD_THEME: ShareCardTheme = {
  background: GUNMETAL[900],
  heading: GUNMETAL[100],
  featured: GUNMETAL[100],
  detail: GUNMETAL[300],
  caveat: GUNMETAL[400],
  legend: GUNMETAL[200],
  rule: GUNMETAL[700],
  footer: GUNMETAL[400],
  // The text font of the tokens (plan item 8.2); a canvas reads no CSS variable.
  fontFamily: FONTS.text,
};

/**
 * The brief's glyph, War & Conflict's newspaper (Lucide's, as the globe draws
 * it), in straight strokes: Drawable2D has no curves, and at a badge's size the
 * page, its headline box and its lines are what reads.
 */
function drawBadgeGlyph(ctx: Drawable2D, box: { x: number; y: number; size: number }, ink: string): void {
  const { x, y, size: s } = box;
  const left = x + s * 0.12;
  const right = x + s * 0.88;
  const top = y + s * 0.12;
  const bottom = y + s * 0.88;
  const outline = (l: number, t: number, r: number, b: number) => {
    ctx.moveTo(l, t);
    ctx.lineTo(r, t);
    ctx.lineTo(r, b);
    ctx.lineTo(l, b);
    ctx.lineTo(l, t);
  };
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1, Math.round(s / 10));
  ctx.beginPath();
  outline(left, top, right, bottom);
  outline(left + s * 0.16, top + s * 0.16, right - s * 0.16, top + s * 0.34);
  for (const row of [0.56, 0.7]) {
    ctx.moveTo(left + s * 0.16, y + s * row);
    ctx.lineTo(right - s * 0.16, y + s * row);
  }
  ctx.stroke();
}

/** The 2D drawing surface this needs — DOM and Offscreen contexts both satisfy it. */
export interface Drawable2D {
  /*
   * The real API's types, not `string`. Declared as `string` this was not
   * satisfied by an actual CanvasRenderingContext2D — composeShareCard only
   * compiled because it casts its canvas — so the first caller handing it a
   * real context hit a type error that a cast would have hidden.
   */
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textBaseline: CanvasTextBaseline;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  drawImage(
    image: CanvasImageSource,
    sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
  ): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  /** Ring and glow swatches are stroked, so their weight has to be settable. */
  lineWidth: number;
  /** For the legend's swatches, which are drawn as the layer drew its marks. */
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  fill(): void;
}

/**
 * How much of a glow's halo shows through, as an 8-digit hex suffix.
 *
 * The shader's halo is ADDITIVE light falling off around the core. A canvas
 * swatch four pixels across cannot reproduce that, and should not pretend to —
 * this is a key, not a rendering. A fainter outer ring in the mark's own colour
 * is what distinguishes a glow from a disc at this size.
 */
const GLOW_HALO_ALPHA = '66';

/** The callout's box: the glyph outline's dark, mostly opaque, so a label reads over any ground. */
const CALLOUT_FILL = 'rgba(8, 18, 26, 0.86)';
/** Under the leader, for contrast on bright land. */
const CALLOUT_SHADOW = 'rgba(8, 18, 26, 0.9)';
/** The label's text inset — the layout's CALLOUT_PAD_PX. */
const CALLOUT_TEXT_INSET = 8;

/** A styled glyph's backing, as a multiple of the glyph's radius: 1 / 0.75, as on the globe. */
const BACKING_SCALE = 4 / 3;

/** The dark the glyphs are outlined in and the disc is filled with (intelReportSprites' OUTLINE). */
const GLYPH_OUTLINE = '#08121a';

const colourFor = (kind: TextLine['kind'], theme: ShareCardTheme): string =>
  kind === 'heading' ? theme.heading
    : kind === 'featured' ? theme.featured
    : kind === 'caveat' ? theme.caveat
      : kind === 'legend' ? theme.legend
        : kind === 'footer' ? theme.footer
          : theme.detail;

export function drawShareCard(
  ctx: Drawable2D,
  frame: CanvasImageSource,
  layout: ShareCardLayout,
  theme: ShareCardTheme = DEFAULT_CARD_THEME,
  extras?: { qr?: boolean[][]; inset?: InsetLayout; timestream?: StripModel },
): void {
  // The whole card first, so any part the globe does not cover is the card's
  // colour rather than whatever the canvas happened to hold.
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, layout.width, layout.height);

  const { sourceRect: s, globeRect: g } = layout;
  ctx.drawImage(frame, s.x, s.y, s.width, s.height, g.x, g.y, g.width, g.height);

  // The Timestream strip, in its band under the picture (D-PW, PW62).
  if (extras?.timestream && layout.timestream) drawTimestreamStrip(ctx, layout.timestream, extras.timestream, theme, layout.timestream.fontPx);

  // The close-up, over the picture's corner (IM35): under the featured item's
  // label, which covers its leader where they cross, and the text below it.
  if (extras?.inset) drawInset(ctx, extras.inset, theme);

  /*
   * The featured report named on the image, so a crop that loses the strip still
   * says which mark the post is about. A dark underline beneath the light leader
   * keeps it visible on bright land and on dark ocean alike — the same reason
   * every glyph has a dark outline.
   */
  if (layout.callout) {
    const { leader, label, text, fontPx } = layout.callout;
    for (const [colour, width] of [[CALLOUT_SHADOW, 4], [theme.heading, 2]] as const) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(leader.from.x, leader.from.y);
      ctx.lineTo(leader.to.x, leader.to.y);
      ctx.stroke();
    }
    ctx.fillStyle = CALLOUT_FILL;
    ctx.fillRect(label.x, label.y, label.width, label.height);
    ctx.strokeStyle = theme.heading;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(label.x, label.y);
    ctx.lineTo(label.x + label.width, label.y);
    ctx.lineTo(label.x + label.width, label.y + label.height);
    ctx.lineTo(label.x, label.y + label.height);
    ctx.lineTo(label.x, label.y);
    ctx.stroke();
    ctx.textBaseline = 'top';
    ctx.fillStyle = theme.featured;
    ctx.font = `${FEATURED_WEIGHT} ${fontPx}px ${theme.fontFamily}`;
    ctx.fillText(text, label.x + CALLOUT_TEXT_INSET, label.y + (label.height - fontPx) / 2);
  }

  ctx.fillStyle = theme.background;
  ctx.fillRect(layout.strip.x, layout.strip.y, layout.strip.width, layout.strip.height);

  ctx.strokeStyle = theme.rule;
  ctx.beginPath();
  if (layout.strip.y === 0 && layout.strip.x > 0) {
    // A side card's column (IM27), ruled off from its picture by an upright line.
    ctx.moveTo(layout.strip.x + 0.5, 0);
    ctx.lineTo(layout.strip.x + 0.5, layout.height);
  } else {
    ctx.moveTo(0, layout.strip.y + 0.5);
    ctx.lineTo(layout.width, layout.strip.y + 0.5);
  }
  ctx.stroke();
  // A composed card's title band sits above its picture (IM6), ruled off as the facts are below it.
  if (layout.globeArea.y > 0) {
    ctx.beginPath();
    ctx.moveTo(0, layout.globeArea.y - 0.5);
    ctx.lineTo(layout.width, layout.globeArea.y - 0.5);
    ctx.stroke();
  }

  // `top` baseline so a line's y is its top edge, matching how the layout
  // accumulated it. With the default `alphabetic` baseline every line would
  // sit one ascent too low and the last would fall outside the card.
  ctx.textBaseline = 'top';

  // The badge: its box in its tone, its word over it in its ink (IM5).
  if (layout.badge) {
    const b = layout.badge;
    ctx.fillStyle = b.tone;
    ctx.fillRect(b.x, b.y, b.width, b.height);
    if (b.glyph && b.glyphBox) drawBadgeGlyph(ctx, b.glyphBox, b.ink);
    ctx.fillStyle = b.ink;
    ctx.font = `${BADGE_WEIGHT} ${b.fontPx}px ${theme.fontFamily}`;
    ctx.fillText(b.text, b.textX, b.textY);
  }
  for (const line of layout.lines) {
    ctx.fillStyle = colourFor(line.kind, theme);
    ctx.font = `${line.kind === 'featured' ? `${FEATURED_WEIGHT} ` : ''}${line.fontPx}px ${theme.fontFamily}`;
    ctx.fillText(line.text, line.x, line.y - line.fontPx);
  }

  /*
   * The legend's swatches, in the colour AND the shape the layer drew that
   * category in — both passed through from the mark, never re-derived here. A
   * swatch this file decided would be a legend that can disagree with the image
   * beside it.
   *
   * Shape arrived with step 7. Before it every swatch was a filled dot, which
   * was true enough while every layer drew discs; step 6.3 let a person put a
   * layer on rings, and a card printing "shape: ring" beside a row of dots
   * disagreed with its own image and with the app the reader had just left.
   */
  for (const chip of layout.chips) {
    /*
     * Lines, for the borders (decision D-F, 2026-09-19). A settled boundary is
     * one stroke; a provisional one is drawn as separate dashes, by hand rather
     * than with setLineDash, which would widen Drawable2D for this one caller.
     * The dash is the distinction the border key exists to show.
     */
    if (chip.shape === 'line' || chip.shape === 'dashed') {
      const half = chip.radius * 1.6;
      ctx.strokeStyle = chip.color;
      ctx.lineWidth = Math.max(1, Math.round(chip.radius * 0.4));
      ctx.beginPath();
      if (chip.shape === 'line') {
        ctx.moveTo(chip.x - half, chip.y);
        ctx.lineTo(chip.x + half, chip.y);
      } else {
        const dash = (half * 2) / 5;
        for (let i = 0; i < 5; i += 2) {
          ctx.moveTo(chip.x - half + i * dash, chip.y);
          ctx.lineTo(chip.x - half + (i + 1) * dash, chip.y);
        }
      }
      ctx.stroke();
      continue;
    }

    /*
     * A dashed ring (Diplomacy's place GDELT put only at a country, under the Ring
     * style; D-DP, DP13): eight dashes round the ring, by hand, as the dashed line is.
     */
    if (chip.shape === 'dashedRing') {
      ctx.strokeStyle = chip.color;
      ctx.lineWidth = Math.max(1, Math.round(chip.radius * 0.4));
      ctx.beginPath();
      const step = (Math.PI * 2) / 8;
      for (let i = 0; i < 8; i++) {
        const from = i * step;
        ctx.moveTo(chip.x + chip.radius * Math.cos(from), chip.y + chip.radius * Math.sin(from));
        ctx.arc(chip.x, chip.y, chip.radius, from, from + step / 2);
      }
      ctx.stroke();
      continue;
    }

    /*
     * A hatched country (War & Conflict's outer countries, theatre-lens.md, TL5): the
     * square's outline and three diagonals rising to the right, as the globe hatches.
     */
    if (chip.shape === 'hatch') {
      const half = (chip.radius * 1.8) / 2;
      const [l, r, t, b] = [chip.x - half, chip.x + half, chip.y - half, chip.y + half];
      ctx.strokeStyle = chip.color;
      ctx.lineWidth = Math.max(1, Math.round(chip.radius * 0.25));
      ctx.beginPath();
      ctx.moveTo(l, t);
      ctx.lineTo(r, t);
      ctx.lineTo(r, b);
      ctx.lineTo(l, b);
      ctx.lineTo(l, t);
      ctx.moveTo(l, b - half);
      ctx.lineTo(l + half, b);
      ctx.moveTo(l, b);
      ctx.lineTo(r, t);
      ctx.moveTo(r - half, t);
      ctx.lineTo(r, t + half);
      ctx.stroke();
      continue;
    }

    // A state force's arc (War & Conflict, theatre-lens.md, TL6): a stroke bowed upward, as the arcs rise.
    if (chip.shape === 'arc') {
      const r = chip.radius * 2;
      ctx.strokeStyle = chip.color;
      ctx.lineWidth = Math.max(1, Math.round(chip.radius * 0.4));
      ctx.beginPath();
      ctx.arc(chip.x, chip.y + r * 0.6, r, Math.PI + 0.6, 2 * Math.PI - 0.6);
      ctx.stroke();
      continue;
    }

    // A country's fill (War & Conflict's war map, decision WC1): a filled square.
    if (chip.shape === 'area') {
      const side = chip.radius * 1.8;
      ctx.fillStyle = chip.color;
      ctx.fillRect(chip.x - side / 2, chip.y - side / 2, side, side);
      continue;
    }

    /*
     * The backing a glyph sits on, drawn first so the glyph sits on it —
     * the same three the globe draws (intelReportSprites.styledGlyphSvg). Drawn
     * outside the glyph's own radius so the page keeps the size it has bare.
     */
    if ((chip.shape === 'document' || chip.shape === 'person') && chip.style) {
      const r = chip.radius * BACKING_SCALE;
      ctx.beginPath();
      ctx.arc(chip.x, chip.y, r, 0, Math.PI * 2);
      if (chip.style === 'disc') {
        ctx.fillStyle = GLYPH_OUTLINE;
        ctx.fill();
        ctx.strokeStyle = chip.color;
        ctx.lineWidth = Math.max(1, Math.round(chip.radius * 0.25));
        ctx.stroke();
      } else if (chip.style === 'ring') {
        ctx.strokeStyle = chip.color;
        ctx.lineWidth = Math.max(1, Math.round(chip.radius * 0.3));
        ctx.stroke();
      } else if (chip.style === 'glow') {
        ctx.strokeStyle = `${chip.color}${GLOW_HALO_ALPHA}`;
        ctx.lineWidth = Math.max(1, Math.round(chip.radius * 0.6));
        ctx.stroke();
      }
    }

    /*
     * A page with a folded corner, for the Intel Report glyphs. Without it a
     * legend reading `shape: document` drew its swatch as a dot, which is the
     * image-contradicts-key problem Mecha Jono reported, one level down.
     */
    if (chip.shape === 'document') {
      const w = chip.radius * 1.5;
      const h = chip.radius * 2;
      const fold = w * 0.4;
      const left = chip.x - w / 2;
      const top = chip.y - h / 2;
      ctx.beginPath();
      ctx.moveTo(left, top);
      ctx.lineTo(left + w - fold, top);
      ctx.lineTo(left + w, top + fold);
      ctx.lineTo(left + w, top + h);
      ctx.lineTo(left, top + h);
      ctx.lineTo(left, top);
      ctx.fillStyle = chip.color;
      ctx.fill();
      continue;
    }

    /* Head and shoulders, for the RLSH glyphs. */
    if (chip.shape === 'person') {
      ctx.fillStyle = chip.color;
      ctx.beginPath();
      ctx.arc(chip.x, chip.y - chip.radius * 0.45, chip.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(chip.x, chip.y + chip.radius * 0.9, chip.radius * 0.85, Math.PI, 0);
      ctx.fill();
      continue;
    }

    ctx.beginPath();
    ctx.arc(chip.x, chip.y, chip.radius, 0, Math.PI * 2);

    if (chip.shape === 'ring') {
      ctx.strokeStyle = chip.color;
      ctx.lineWidth = Math.max(1, Math.round(chip.radius * 0.4));
      ctx.stroke();
      continue;
    }

    // disc, glow, and anything a layer named that this cannot draw: the mark
    // every layer draws by default, rather than nothing at all.
    ctx.fillStyle = chip.color;
    ctx.fill();

    if (chip.shape === 'glow') {
      ctx.beginPath();
      ctx.arc(chip.x, chip.y, chip.radius * 1.6, 0, Math.PI * 2);
      ctx.strokeStyle = `${chip.color}${GLOW_HALO_ALPHA}`;
      ctx.lineWidth = Math.max(1, Math.round(chip.radius * 0.5));
      ctx.stroke();
    }
  }

  /*
   * The QR code, when the card has one (IM32): dark modules on a light square,
   * the theme's own ink and ground, with the four modules of quiet zone a reader
   * needs inside the square, each module whole pixels so its edges stay sharp.
   */
  if (layout.qr && extras?.qr?.length) {
    const { x, y, size } = layout.qr;
    const modules = extras.qr;
    const count = modules.length;
    const module = Math.max(1, Math.floor(size / (count + 8)));
    const inset = Math.floor((size - module * (count + 8)) / 2) + module * 4;
    ctx.fillStyle = theme.featured;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = theme.background;
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (modules[row][col]) ctx.fillRect(x + inset + col * module, y + inset + row * module, module, module);
      }
    }
  }
}

/**
 * The close-up inset (IM34, IM35), as closeUpInset laid it out: a leader from
 * the item's mark on the globe, then the inset's own ground and frame over the
 * picture; its grid and state lines in the theme's quiet tones, a heat town's
 * state filled; each mark in its layer's own colour, a cancelled night as a
 * ring, the featured one ringed in the heading's tone; the venue named over a
 * box of the ground, the title, a scale bar with its length, and the note.
 */
function drawInset(ctx: Drawable2D, inset: InsetLayout, theme: ShareCardTheme): void {
  // The leader first, so the inset's ground closes over its end.
  for (const [colour, width] of [[CALLOUT_SHADOW, 3], [theme.detail, 1]] as const) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(inset.leader.from.x, inset.leader.from.y);
    ctx.lineTo(inset.leader.to.x, inset.leader.to.y);
    ctx.stroke();
  }
  const { rect } = inset;
  ctx.fillStyle = theme.background;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  // On the half pixel, so a one-pixel frame is sharp.
  ctx.strokeStyle = theme.detail;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rect.x + 0.5, rect.y + 0.5);
  ctx.lineTo(rect.x + rect.width - 0.5, rect.y + 0.5);
  ctx.lineTo(rect.x + rect.width - 0.5, rect.y + rect.height - 0.5);
  ctx.lineTo(rect.x + 0.5, rect.y + rect.height - 0.5);
  ctx.lineTo(rect.x + 0.5, rect.y + 0.5);
  ctx.stroke();

  ctx.fillStyle = theme.rule;
  for (const ring of inset.fills) {
    ctx.beginPath();
    ring.forEach((point, i) => (i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    ctx.fill();
  }
  const segments = (list: readonly Segment[], colour: string) => {
    if (!list.length) return;
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const segment of list) {
      ctx.moveTo(segment.x1, segment.y1);
      ctx.lineTo(segment.x2, segment.y2);
    }
    ctx.stroke();
  };
  segments(inset.grid, theme.rule);
  segments(inset.strokes, theme.footer);

  const dot = (mark: { x: number; y: number; radius: number; color: string; cancelled: boolean }) => {
    ctx.beginPath();
    ctx.arc(mark.x, mark.y, mark.radius, 0, Math.PI * 2);
    if (mark.cancelled) {
      ctx.strokeStyle = mark.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = mark.color;
      ctx.fill();
    }
  };
  inset.marks.forEach(dot);
  const { featured } = inset;
  dot(featured);
  ctx.beginPath();
  ctx.arc(featured.x, featured.y, featured.ringRadius, 0, Math.PI * 2);
  ctx.strokeStyle = theme.heading;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textBaseline = 'top';
  if (inset.label) {
    const { box } = inset.label;
    ctx.fillStyle = theme.background;
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.fillStyle = theme.featured;
    ctx.font = `${FEATURED_WEIGHT} ${inset.label.fontPx}px ${theme.fontFamily}`;
    ctx.fillText(inset.label.text, inset.label.x, inset.label.y);
  }
  ctx.fillStyle = theme.legend;
  ctx.font = `${inset.title.fontPx}px ${theme.fontFamily}`;
  ctx.fillText(inset.title.text, inset.title.x, inset.title.y);

  // The scale bar, with a tick at each end, and its length beside it.
  const { scale } = inset;
  const tick = Math.max(2, Math.round(scale.fontPx / 3));
  ctx.strokeStyle = theme.legend;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(scale.x, scale.y);
  ctx.lineTo(scale.x + scale.width, scale.y);
  for (const x of [scale.x, scale.x + scale.width]) {
    ctx.moveTo(x, scale.y - tick);
    ctx.lineTo(x, scale.y + tick);
  }
  ctx.stroke();
  ctx.font = `${scale.fontPx}px ${theme.fontFamily}`;
  ctx.fillText(scale.text, scale.textX, scale.textY);

  ctx.fillStyle = theme.caveat;
  ctx.font = `${inset.note.fontPx}px ${theme.fontFamily}`;
  for (const line of inset.note.lines) ctx.fillText(line.text, line.x, line.y);
}

/**
 * Measure text with a real canvas context, for `computeShareCardLayout`.
 *
 * Sets the font before measuring on every call. Leaving a stale font set is
 * the classic way wrapping silently measures against the wrong size and
 * produces lines that overflow the card.
 */
export function canvasMeasurer(
  ctx: { font: string; measureText(text: string): { width: number } },
  fontFamily: string = DEFAULT_CARD_THEME.fontFamily,
): (text: string, fontPx: number, weight?: number) => number {
  return (text, fontPx, weight) => {
    // The weight as drawn: bold is wider, and a line measured regular overflows.
    ctx.font = `${weight ? `${weight} ` : ''}${fontPx}px ${fontFamily}`;
    return ctx.measureText(text).width;
  };
}

/** `#rrggbb` → `rgba(r, g, b, a)`. The theme stores hex; a scrim needs alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return `rgba(0, 0, 0, ${alpha})`;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

/**
 * One page of a clip's end card, over the clip's own final frame.
 *
 * The final frame is kept, dimmed, rather than replaced with a flat
 * background: the card should read as the end of THIS footage, not as a
 * separate slide spliced on. The scrim is the card's own background colour so
 * the caveat amber carries the same contrast it does on a still.
 *
 * Thin for the same reason drawShareCard is — every decision that could be
 * wrong was made in layoutEndCard, and the proof here is a frame looked at.
 */
export function drawEndCardPage(
  ctx: Drawable2D,
  background: CanvasImageSource,
  width: number,
  height: number,
  lines: TextLine[],
  theme: ShareCardTheme = DEFAULT_CARD_THEME,
  dim = 0.74,
): void {
  ctx.drawImage(background, 0, 0, width, height, 0, 0, width, height);
  ctx.fillStyle = withAlpha(theme.background, dim);
  ctx.fillRect(0, 0, width, height);

  ctx.textBaseline = 'top';
  for (const line of lines) {
    ctx.fillStyle = colourFor(line.kind, theme);
    ctx.font = `${line.kind === 'featured' ? `${FEATURED_WEIGHT} ` : ''}${line.fontPx}px ${theme.fontFamily}`;
    ctx.fillText(line.text, line.x, line.y - line.fontPx);
  }
}
