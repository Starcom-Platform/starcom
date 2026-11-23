/**
 * Where everything goes on a share card — computed, before any drawing.
 *
 * ─── THE DECISION THIS FILE EXISTS TO MAKE ─────────────────────────────────
 *
 * A card has a globe and a provenance strip. The strip's contents are the
 * caveats from shareCardProvenance, and those are the whole reason Phase 2a
 * exists: an image that leaves the app cannot be corrected, so it has to carry
 * what a viewer needs in order not to over-read it.
 *
 * Which creates a design pressure with exactly one honest resolution. Caveat
 * text is variable — an unreachable feed, three stale sources and an
 * unimplemented layer produce a lot of lines — and a fixed-height card cannot
 * hold an unbounded number of them. The tempting answers are all the same
 * defect in different clothes:
 *
 *   truncate the list       -> the dropped caveat is the one that mattered
 *   shrink the font to fit  -> unreadable at the size these get viewed
 *   "+3 more"               -> a published image has no affordance to expand
 *
 * Every one of them trims a warning to fit a layout. So the card GROWS to fit
 * its caveats, and if it cannot grow enough it REFUSES to compose at all.
 * A card that cannot state its caveats is not a card worth publishing.
 *
 * ─── PURE, WITH AN INJECTED MEASURER ───────────────────────────────────────
 *
 * Wrapping needs font metrics, which live on a canvas context. Taking a
 * `measureText` function as an argument keeps all the layout arithmetic
 * testable against a deterministic measurer, and leaves the canvas to the
 * drawing step.
 */
import type { GlobeViewProvenance } from './shareCardProvenance';
import { formatCameraLine } from './shareCardProvenance';
import { CREDITS, creditLine, creditsParagraph } from './sourceCredits';
import { expandToAspect, padBounds, type ScreenBounds } from './globeScreenBounds';
import type { BadgeGlyph, CardBadge } from './cardTemplates';

/** Returns the rendered width of `text` at `fontPx`, in pixels. */
export type MeasureText = (text: string, fontPx: number, weight?: number) => number;

type Rect = { x: number; y: number; width: number; height: number };

/**
 * The weight the featured title and its label are drawn in. Measured at it too:
 * measured at the regular weight, the first real card's title ran off the strip.
 */
export const FEATURED_WEIGHT = 600;
/** A badge's word is set heavier than the headline under it, as a label is. */
export const BADGE_WEIGHT = 700;

export interface ShareCardStyle {
  /** Card width in pixels. Height is computed, never given. */
  width: number;
  /** The globe area's aspect ratio, before the strip is added. */
  globeAspect: number;
  padding: number;
  headingPx: number;
  bodyPx: number;
  /** The headline: the featured item's title, or what the card shows (IM10). */
  headlinePx: number;
  /** The most lines a headline takes before it is shortened at a word; the full title is in the provenance. */
  headlineMaxLines: number;
  /** The short caveats (IM11): small and muted, and every one that applies. */
  caveatPx: number;
  /** The footer: the product, the capture moment, the camera and the build. */
  footerPx: number;
  /** A badge's word (IM5). */
  badgePx: number;
  lineGap: number;
  /** Refuse past this, rather than emit something unusable. */
  maxHeight: number;
  /**
   * A composed card's fixed height (IM6, IM27): its title band above the picture,
   * the rest below, and the picture what the text leaves; or, with `side`, the
   * text in a column beside it. Absent, the card grows to fit under a picture of
   * `globeAspect`; no preset does since IM28.
   */
  height?: number;
  /**
   * The text in a column on the right of the picture (IM27), at the wide sizes:
   * the picture square while the text fits beside it, and narrower, down to its
   * floor, when the column needs more room.
   */
  side?: boolean;
  /**
   * The least the picture may be, as a share of the card's width (stacked) or
   * its height (side), before the card is refused rather than cut.
   */
  minPictureShare?: number;
  /** What a refusal tells its caller to do instead. */
  refusalAdvice?: string;
  /** A QR code's square, quiet zone and all, when a shot asks for one (IM13, IM32). */
  qrPx: number;
}

/**
 * The sizes Mecha Jono posts, each exactly (IM27, IM28).
 *
 * ─── THESE NAME THE FINISHED CARD ──────────────────────────────────────────
 *
 * They once named only the picture, and the card grew under it to fit every
 * caveat: the contact sheet of 3 October showed every card but the 9:16 taller
 * than the size it was posted at (a "square" card was 1080×1703). Now each is
 * its size, and it is the picture that gives way: square and portrait stack
 * like the 9:16, the picture taking what the text leaves; the wide sizes put
 * the text in a column beside the picture, which takes what the column leaves.
 * Below its floor the card is refused, as ever, never cut, and the refusal
 * points at the 9:16, which has the most room. `globeAspect` is the picture's
 * shape at its floor, the most extreme it can take: framing plans for it, so an
 * item framed in stays in whatever the text leaves.
 *
 * Each size's type is its own, set for how large the card is seen: a 9:16 is
 * read full-screen on a phone at about a third of its size (IM18, about 100 px
 * more planet than the next step), and a link preview at about half of its.
 */
/**
 * One type step larger than IM29's compact type (IM38): Mecha Jono's reply,
 * that a card reads better in a feed one step up, where it fits. A card tries
 * these first and falls back to its preset's own, compact, sizes when the
 * larger would leave its picture under its floor (composeShareCard's
 * planCardPicture), so no card that draws in compact type is refused. The 9:16
 * keeps its one size (IM18). The sizes are option B of the comparison the
 * owner chose IM29 from.
 */
export const CARD_TYPE_LARGER: Partial<Record<CardPreset, Pick<ShareCardStyle, 'headlinePx' | 'bodyPx' | 'caveatPx' | 'footerPx'>>> = {
  wide: { headlinePx: 30, bodyPx: 17, caveatPx: 14, footerPx: 13 },
  embed: { headlinePx: 34, bodyPx: 19, caveatPx: 15, footerPx: 14 },
  square: { headlinePx: 42, bodyPx: 21, caveatPx: 17, footerPx: 15 },
  portrait: { headlinePx: 44, bodyPx: 22, caveatPx: 18, footerPx: 16 },
};
/** Which type a card was drawn in (IM38): one step larger, or the compact type it fell back to. */
export type TypeStep = 'larger' | 'compact';

/** A stacked card's picture at its floor: the card's width over the least height it may have. */
const stackedFloorAspect = (width: number, share: number) => width / Math.round(width * share);

export const CARD_PRESETS = {
  /** The link preview (Open Graph), 1200×630, the text beside the picture. */
  wide: {
    width: 1200, globeAspect: 0.75, height: 630, side: true, minPictureShare: 0.75,
    padding: 24, headlinePx: 26, bodyPx: 15, caveatPx: 13, footerPx: 12, badgePx: 14, lineGap: 5, headlineMaxLines: 3, qrPx: 132,
  },
  /** Feed posts, 1080×1080, stacked. */
  square: {
    width: 1080, globeAspect: stackedFloorAspect(1080, 0.45), height: 1080, minPictureShare: 0.45,
    padding: 32, headlinePx: 36, bodyPx: 19, caveatPx: 15, footerPx: 14, badgePx: 17, lineGap: 6, headlineMaxLines: 2, qrPx: 128,
  },
  /** The portrait feed, 4:5, 1080×1350, stacked. */
  portrait: {
    width: 1080, globeAspect: stackedFloorAspect(1080, 0.6), height: 1350, minPictureShare: 0.6,
    padding: 36, headlinePx: 40, bodyPx: 20, caveatPx: 16, footerPx: 15, badgePx: 18, lineGap: 7, headlineMaxLines: 2, qrPx: 160,
  },
  /** Discord's embed, 1280×800: what Mecha Jono calls wide (IM15), the text beside the picture. */
  embed: {
    width: 1280, globeAspect: 0.75, height: 800, side: true, minPictureShare: 0.75,
    padding: 28, headlinePx: 30, bodyPx: 17, caveatPx: 14, footerPx: 13, badgePx: 15, lineGap: 6, headlineMaxLines: 3, qrPx: 150,
  },
  /** Stories and reels (IM6), 1080×1920, stacked, its picture never squatter than 4:3. */
  story: {
    width: 1080, globeAspect: stackedFloorAspect(1080, 0.75), height: 1920, minPictureShare: 0.75,
    padding: 44, headlinePx: 48, bodyPx: 24, caveatPx: 20, footerPx: 18, badgePx: 22, lineGap: 8, headlineMaxLines: 2, qrPx: 180,
    refusalAdvice: 'it is too much to say for a card of any size: resolve what its caveats disclose.',
  },
} as const satisfies Record<string, Pick<ShareCardStyle, 'width' | 'globeAspect' | 'height'> & Partial<ShareCardStyle>>;

export type CardPreset = keyof typeof CARD_PRESETS;

export const DEFAULT_CARD_STYLE: ShareCardStyle = {
  // 1200 wide is the common social-preview width; the globe area below sits at
  // 1.91:1, which is the ratio most link-preview crops assume.
  width: 1200,
  globeAspect: 1.91,
  padding: 32,
  headingPx: 26,
  bodyPx: 20,
  headlinePx: 42,
  headlineMaxLines: 3,
  caveatPx: 16,
  footerPx: 15,
  badgePx: 18,
  lineGap: 8,
  qrPx: 120,
  /*
   * Generous, because the point is to fit the caveats. It exists to catch a
   * pathological case — a hundred stale feeds — not to impose a house style.
   */
  maxHeight: 2400,
};

export interface TextLine {
  text: string;
  x: number;
  y: number;
  fontPx: number;
  /** Caveats are visually distinct from the neutral heading lines; the footer is the quietest. */
  kind: 'heading' | 'featured' | 'detail' | 'caveat' | 'legend' | 'footer';
}

/**
 * One colour swatch in the legend, drawn as the marks are: a filled dot.
 *
 * A square would read as a different kind of thing from what is on the globe. The
 * point of the swatch is that a reader can match it to a mark in the image.
 */
export interface LegendChip {
  /** Centre. */
  x: number;
  y: number;
  radius: number;
  color: string;
  /**
   * The shape its layer drew, when the layer declared one (decision D-F,
   * step 7). Absent for the layers that draw one kind of mark and say nothing,
   * which is most of them — those fill a disc, as every swatch here once did.
   *
   * Carried rather than re-derived: LayerLegend.shapeMeans comes from the code
   * that drew the marks, and a shape this file decided could disagree with the
   * image beside it exactly as a colour could.
   */
  shape?: string;
  /**
   * The style a glyph swatch sits in — disc, glow or ring — when its layer
   * draws glyphs on a backing (decision D-F, section 18). Absent for plain marks,
   * whose style already is their shape.
   */
  style?: string;
}

export interface ShareCardLayout {
  width: number;
  height: number;
  /**
   * The region reserved for the image, at the style's `globeAspect`.
   *
   * Distinct from `globeRect`, and the distinction is the whole point: the
   * area is what the card sets aside, the rect is what actually gets drawn
   * into it. They coincide only when the crop happens to share the card's
   * aspect. Collapsing them is what let a clamped crop stretch the Earth.
   */
  globeArea: { x: number; y: number; width: number; height: number };
  /** Where the cropped globe is drawn — the source's aspect, centred in the area. */
  globeRect: { x: number; y: number; width: number; height: number };
  /** The region of the SOURCE frame to draw from. */
  sourceRect: { x: number; y: number; width: number; height: number };
  strip: { x: number; y: number; width: number; height: number };
  lines: TextLine[];
  /** The legend's dots. Their labels are `lines` of kind 'legend'. */
  chips: LegendChip[];
  /** A label on the image pointing at the featured report's glyph, when it is in the picture. */
  callout?: FeaturedCallout;
  /** The card's badge, opening the band under the picture (IM5, IM10). Absent on the default card. */
  badge?: BadgeBox;
  /** The headline was shortened at a word to fit its lines; the whole title is in the provenance. */
  headlineShortened: boolean;
  /** Where a QR code goes, with the footer, right-aligned, when one was asked for (IM32). */
  qr?: { x: number; y: number; size: number };
  /** The Timestream strip, under the picture, when one was asked for (D-PW, PW62), and its type size. */
  timestream?: { x: number; y: number; width: number; height: number; fontPx: number };
}

/** The share of the picture's area a Timestream strip takes, and its least and most height (PW62). */
const TIMESTREAM_SHARE = 0.26;
const TIMESTREAM_MIN_PX = 104;
const TIMESTREAM_MAX_PX = 210;

/**
 * The picture's area less a Timestream strip at its foot, when one is asked for: the picture is fitted to what is
 * left, so the planet is drawn a little smaller and nothing else on the card moves.
 */
function withTimestream(area: { x: number; y: number; width: number; height: number }, style: ShareCardStyle, asked: boolean | undefined) {
  if (!asked) return { area, timestream: undefined };
  const height = Math.round(Math.min(TIMESTREAM_MAX_PX, Math.max(TIMESTREAM_MIN_PX, area.height * TIMESTREAM_SHARE)));
  return {
    area: { ...area, height: area.height - height },
    timestream: { x: area.x, y: area.y + area.height - height, width: area.width, height, fontPx: Math.max(11, style.footerPx) },
  };
}

/** A badge, placed: its box in its tone, and its word in its ink, top-left of the text. */
export interface BadgeBox {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  textX: number;
  textY: number;
  fontPx: number;
  tone: string;
  ink: string;
  /** The glyph before the word, on a gunmetal badge (IM5), and the square it is drawn in. */
  glyph: BadgeGlyph | null;
  glyphBox: { x: number; y: number; size: number } | null;
}

/** The featured report named on the image itself, with a line to its glyph. */
export interface FeaturedCallout {
  /** The glyph's centre, in card pixels. */
  anchor: { x: number; y: number };
  /** The label's box, in card pixels. */
  label: { x: number; y: number; width: number; height: number };
  /** The title, shortened at a word to fit a label. */
  text: string;
  fontPx: number;
  /** The leader: from the glyph's edge to the label's nearest edge. */
  leader: { from: { x: number; y: number }; to: { x: number; y: number } };
}

export class ShareCardLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShareCardLayoutError';
  }
}

/**
 * Break `text` so no line exceeds `maxWidth`.
 *
 * Never drops a word. A word too long to fit on its own is emitted on its own
 * line and allowed to overflow, because dropping it would remove meaning from
 * a caveat — and a caveat with a word missing can invert its sense.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  fontPx: number,
  measure: MeasureText,
  weight?: number,
): string[] {
  // Every space breaks but a no-break one, which holds a name to its number.
  const words = text.split(/[^\S\u00a0]+/).filter(Boolean);
  if (!words.length) return [];

  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (measure(candidate, fontPx, weight) <= maxWidth) current = candidate;
    else { lines.push(current); current = words[i]; }
  }
  lines.push(current);
  return lines;
}

/** The widest hex digit at a size, by `measure`. */
function widestHexDigit(measure: MeasureText, fontPx: number): string {
  return [...'0123456789abcdef'].reduce((widest, digit) => (measure(digit, fontPx) > measure(widest, fontPx) ? digit : widest));
}

/**
 * The stamp's lines, wrapped as if its build hash were all the widest hex digit, then drawn with the
 * real hash, which is never wider. Wrapped on the real hash, a card's layout moved with the build that
 * made it: a side-by-side card's split between picture and words shifted 8 px from one commit to the
 * next, and its kept golden flipped with every build.
 */
export function wrapStampText(text: string, hash: string | null, maxWidth: number, fontPx: number, measure: MeasureText): string[] {
  if (!hash || !text.includes(hash)) return wrapText(text, maxWidth, fontPx, measure);
  const stand = widestHexDigit(measure, fontPx).repeat(hash.length);
  return wrapText(text.replace(hash, stand), maxWidth, fontPx, measure).map((line) => line.replace(stand, hash));
}

export interface LayoutInput {
  provenance: GlobeViewProvenance;
  /** The globe's bounds within the captured frame, already padded/expanded. */
  bounds: ScreenBounds;
  /** The captured frame's dimensions. */
  frame: { width: number; height: number };
  measure: MeasureText;
  style?: Partial<ShareCardStyle>;
  /**
   * Where the featured report's glyph is in the captured frame, in frame pixels,
   * or null when it is not in the picture. Projected by composeShareCard in the
   * same no-await section as the bounds, so it describes the same camera.
   */
  featuredAt?: { x: number; y: number } | null;
  /**
   * The layers drawing in the picture, by the label their key uses, so the key
   * names only those (IM12). Null when unknown: every layer's key is shown.
   */
  keyLayers?: readonly string[] | null;
  /** The card's badge (IM5, IM14), or none for the default card. */
  badge?: CardBadge | null;
  /** Room for a QR code with the footer, when a shot asks for one (IM13, IM32). */
  qr?: boolean;
  /** Room for a Timestream strip under the picture, when a shot asks for one (D-PW, PW62, PW77). */
  timestream?: boolean;
}

/** A composed card's floor where its style names none: never squatter than 4:3. */
const MIN_COMPOSED_PICTURE_SHARE = 0.75;
/** What a refused card is told to do, unless its style says otherwise: the 9:16 has the most room. */
const REFUSAL_ADVICE = 'make the 9:16 card, which has the most room for what it has to say.';
/** How much wider a side card's column grows at a time, until its text fits. */
const SIDE_STEP_PX = 8;

/** The longest title a label on the image carries, ellipsis included. */
const CALLOUT_MAX_CHARS = 60;
/** Clear of a 35 px glyph drawn at card scale, with room for the leader to read. */
const CALLOUT_GAP_PX = 30;
const CALLOUT_PAD_PX = 8;
/** How far from the anchor the leader starts: the glyph's backing, not its centre. */
export const GLYPH_EDGE_PX = 18;

/** Shorten at a word, never mid-word, to at most `max` characters with the ellipsis. */
export function shortenAtWord(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  let out = '';
  for (const word of flat.split(' ')) {
    const next = out ? `${out} ${word}` : word;
    if (next.length + 1 > max) break;
    out = next;
  }
  // A first word longer than the limit is cut, since a label has to end somewhere.
  return `${(out || flat.slice(0, max - 1)).replace(/[\s,;:.–—-]+$/, '')}…`;
}

/**
 * Place the label beside the glyph: toward the middle of the image, so it does not
 * run off the edge, and never over the glyph it names.
 */
function placeCallout(
  anchor: { x: number; y: number },
  title: string,
  rect: { x: number; y: number; width: number; height: number },
  fontPx: number,
  measure: MeasureText,
): FeaturedCallout {
  let text = shortenAtWord(title, CALLOUT_MAX_CHARS);
  const maxWidth = rect.width - 2 * CALLOUT_PAD_PX;
  while (measure(text, fontPx, FEATURED_WEIGHT) + 2 * CALLOUT_PAD_PX > maxWidth && text.length > 8) {
    text = shortenAtWord(text.replace(/…$/, ''), text.length - 4);
  }
  const width = measure(text, fontPx, FEATURED_WEIGHT) + 2 * CALLOUT_PAD_PX;
  const height = fontPx + 2 * CALLOUT_PAD_PX;

  const toRight = anchor.x < rect.x + rect.width / 2;
  const toBelow = anchor.y < rect.y + rect.height / 2;
  const x = (right: boolean) => (right ? anchor.x + CALLOUT_GAP_PX : anchor.x - CALLOUT_GAP_PX - width);
  const y = (below: boolean) => (below ? anchor.y + CALLOUT_GAP_PX : anchor.y - CALLOUT_GAP_PX - height);
  const candidates = [
    { x: x(toRight), y: y(toBelow) },
    { x: x(toRight), y: y(!toBelow) },
    { x: x(!toRight), y: y(toBelow) },
    { x: x(!toRight), y: y(!toBelow) },
  ];
  const inside = (c: { x: number; y: number }) => c.x >= rect.x && c.y >= rect.y
    && c.x + width <= rect.x + rect.width && c.y + height <= rect.y + rect.height;
  const clamp = (c: { x: number; y: number }) => ({
    x: Math.min(Math.max(c.x, rect.x), rect.x + rect.width - width),
    y: Math.min(Math.max(c.y, rect.y), rect.y + rect.height - height),
  });
  const clearOfGlyph = (c: { x: number; y: number }) => !(anchor.x > c.x - GLYPH_EDGE_PX && anchor.x < c.x + width + GLYPH_EDGE_PX
    && anchor.y > c.y - GLYPH_EDGE_PX && anchor.y < c.y + height + GLYPH_EDGE_PX);
  const chosen = candidates.find(inside)
    ?? candidates.map(clamp).find(clearOfGlyph)
    ?? clamp(candidates[0]);

  const label = { x: chosen.x, y: chosen.y, width, height };
  // The leader runs to the nearest point of the label's box.
  const to = {
    x: Math.min(Math.max(anchor.x, label.x), label.x + width),
    y: Math.min(Math.max(anchor.y, label.y), label.y + height),
  };
  const dx = to.x - anchor.x;
  const dy = to.y - anchor.y;
  const length = Math.hypot(dx, dy) || 1;
  const from = { x: anchor.x + (dx / length) * GLYPH_EDGE_PX, y: anchor.y + (dy / length) * GLYPH_EDGE_PX };
  return { anchor, label, text, fontPx, leader: { from, to } };
}

/**
 * The size a card's picture will be drawn at, before anything is captured: what
 * the text leaves (IM6, IM27), or the preset's for a card that grows. The same
 * layout as the card's, so the picture captured is the picture drawn. Throws as
 * the layout does, when a card cannot fit its text.
 */
export function pictureSizeFor(input: Omit<LayoutInput, 'bounds' | 'frame' | 'featuredAt'>): { width: number; height: number } {
  const unit = { width: 1, height: 1 };
  const { globeArea } = computeShareCardLayout({ ...input, frame: unit, bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1, ...unit } });
  return { width: globeArea.width, height: globeArea.height };
}

/**
 * How a card frames the planet (block I, item 2; globe record, section 21).
 *
 *   view    what the camera framed, cut to the card's shape: the padded planet
 *           where it fits in the canvas, else the largest window of the card's
 *           shape that does, centred on the planet. The framing maths
 *           (shareReports.altitudeToFit) chooses its altitude for this window.
 *   planet  the whole padded planet at the card's shape, reaching past the
 *           canvas where the planet does: never clipped, smaller.
 */
export const CARD_FITS = ['view', 'planet'] as const;
export type CardFit = (typeof CARD_FITS)[number];

/**
 * The part of the view a card shows, in the canvas's pixels: the window the
 * capture renders at the card's own resolution. It may reach past the canvas
 * for the planet fit; the capture extends the view there rather than leaving
 * the card a letterboxed or upscaled crop, as it did before.
 */
export function cardWindow(
  planet: ScreenBounds,
  canvas: { width: number; height: number },
  aspect: number,
  padFraction: number,
  fit: CardFit,
): { x: number; y: number; width: number; height: number } {
  const padded = expandToAspect(padBounds(planet, padFraction), aspect);
  if (fit === 'planet') return { x: padded.minX, y: padded.minY, width: padded.width, height: padded.height };
  const k = Math.min(1, canvas.width / padded.width, canvas.height / padded.height);
  const width = padded.width * k;
  const height = padded.height * k;
  const cx = (padded.minX + padded.maxX) / 2;
  const cy = (padded.minY + padded.maxY) / 2;
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(max, 0));
  return { x: clamp(cx - width / 2, canvas.width - width), y: clamp(cy - height / 2, canvas.height - height), width, height };
}

/**
 * The region of the frame a card is cut from: the padded, aspect-expanded
 * bounds, clamped against the frame. One definition, so describeView counts the
 * marks in exactly the picture compose draws.
 */
export function cropWithinFrame(
  bounds: ScreenBounds,
  frame: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const x = Math.max(0, Math.min(Math.round(bounds.minX), frame.width - 1));
  const y = Math.max(0, Math.min(Math.round(bounds.minY), frame.height - 1));
  const width = Math.max(1, Math.min(Math.round(bounds.width), frame.width - x));
  const height = Math.max(1, Math.min(Math.round(bounds.height), frame.height - y));
  return { x, y, width, height };
}

/** What a card's text comes to, laid out in a column from `x0`, `textWidth` wide. */
interface LaidText {
  lines: TextLine[];
  chips: LegendChip[];
  badge?: BadgeBox;
  headlineShortened: boolean;
  /** Where a stacked composed card's picture goes, under its title band, and the first line below it. */
  pictureY: number;
  belowPicture: number;
  /** Where the text ends, before the padding under it. */
  bottom: number;
  qr?: { x: number; y: number; size: number };
}

function layText(input: LayoutInput, style: ShareCardStyle, x0: number, textWidth: number, y0: number, pictureAfterHeadline: boolean): LaidText {
  const { provenance, measure } = input;
  /*
   * ─── THE CARD, TOP TO BOTTOM (IM10–IM12) ─────────────────────────────────
   *
   * The headline: the featured item's title, or what the card shows, large, for
   * the 400 px preview a feed shrinks the card to. Then its facts; then the key,
   * naming only the layers drawing in the picture, as their swatches; then every
   * caveat that applies, each in its short form, small and muted (the full
   * wording is in the provenance); and last a footer with the product, the
   * moment, the camera and the build.
   */
  const lines: TextLine[] = [];
  const chips: LegendChip[] = [];
  let y = y0;

  const push = (text: string, fontPx: number, kind: TextLine['kind'], width = textWidth, hash: string | null = null) => {
    const weight = kind === 'featured' ? FEATURED_WEIGHT : undefined;
    const wrappedLines = hash ? wrapStampText(text, hash, width, fontPx, measure) : wrapText(text, width, fontPx, measure, weight);
    for (const wrapped of wrappedLines) {
      y += fontPx;
      lines.push({ text: wrapped, x: x0, y, fontPx, kind });
      y += style.lineGap;
    }
  };
  const section = () => { y += style.lineGap * 2; };

  // The badge first, Mecha Jono's word for what the card is about, in its tone (IM5).
  let badge: BadgeBox | undefined;
  if (input.badge) {
    const fontPx = style.badgePx;
    const padX = Math.round(fontPx * 0.7);
    const padY = Math.round(fontPx * 0.45);
    // A glyph the height of the word, before it, where the badge's colour cannot tell it apart.
    const glyphRoom = input.badge.glyph ? fontPx + Math.round(fontPx * 0.45) : 0;
    badge = {
      x: x0, y,
      width: Math.ceil(measure(input.badge.text, fontPx, BADGE_WEIGHT) + padX * 2 + glyphRoom), height: fontPx + padY * 2,
      text: input.badge.text, textX: x0 + padX + glyphRoom, textY: y + padY, fontPx, tone: input.badge.tone, ink: input.badge.ink,
      glyph: input.badge.glyph,
      glyphBox: input.badge.glyph ? { x: x0 + padX, y: y + padY, size: fontPx } : null,
    };
    y += badge.height + style.lineGap * 2;
  }

  // A chart's card with no item of its own is headed by the chart's title (PW87), not the layers' names.
  const headline = provenance.featured?.title
    ?? provenance.frontPage?.title
    ?? provenance.chart?.title
    ?? (provenance.layersShown.length ? provenance.layersShown.join(' · ') : 'The globe');
  const headlineLines = wrapText(headline, textWidth, style.headlinePx, measure, FEATURED_WEIGHT);
  const kept = headlineLines.slice(0, Math.max(1, style.headlineMaxLines));
  if (headlineLines.length > kept.length) {
    // Shortened at a word, as the label on the picture is; the full title is in the provenance.
    const words = kept[kept.length - 1].split(' ');
    while (words.length > 1 && measure(`${words.join(' ')}…`, style.headlinePx, FEATURED_WEIGHT) > textWidth) words.pop();
    kept[kept.length - 1] = `${words.join(' ')}…`;
  }
  for (const text of kept) {
    y += style.headlinePx;
    lines.push({ text, x: x0, y, fontPx: style.headlinePx, kind: 'featured' });
    y += style.lineGap;
  }
  /*
   * A stacked composed card's picture goes here, under its title band. Its height
   * is what the text leaves, known only once the rest is laid out: so the rest is
   * laid out below a picture of no height, and moved down by the picture's height
   * after.
   */
  const pictureY = pictureAfterHeadline ? Math.round(y + style.padding - style.lineGap) : 0;
  const belowPicture = lines.length;
  if (pictureAfterHeadline) y = pictureY + style.padding;

  for (const line of provenance.featured?.lines ?? provenance.frontPage?.lines ?? []) push(line, style.bodyPx, 'detail');
  // An event chart's lines (D-PW, PW87): its moments, place, closest aspects across, frame, houses and orbs.
  for (const line of provenance.chart?.lines ?? []) push(line, style.bodyPx, 'detail');

  /*
   * ─── THE KEY: WHAT IS IN THE PICTURE, AND NOTHING ELSE ───────────────────
   *
   * Each layer drawing in the picture, by its name, then its swatches, left to
   * right, wrapping. The swatches come from the layer itself and name only the
   * categories it drew (globeLegendStore). The sentences explaining each layer's
   * encodings stay in the app's key: a card is read at a glance (IM12).
   */
  const legendPx = style.bodyPx - 2;
  const chipRadius = Math.max(3, Math.round(legendPx * 0.3));
  const chipGapPx = Math.round(legendPx * 0.45);
  const chipTrailPx = legendPx;
  const keyed = provenance.legend.filter((entry) => !input.keyLayers || input.keyLayers.includes(entry.layer));
  if (keyed.length) section();
  for (const entry of keyed) {
    // The layer's name opens its row, with the moment its values hold for when they hold for one, and its swatches follow.
    y += legendPx;
    const head = entry.when ? `${entry.layer}, ${entry.when}:` : `${entry.layer}:`;
    lines.push({ text: head, x: x0, y, fontPx: legendPx, kind: 'legend' });
    let x = x0 + measure(head, legendPx) + chipTrailPx;
    // An unlabelled swatch runs into the next: close together, named once by the label after them.
    const runStep = chipRadius * 2 + Math.max(2, Math.round(chipGapPx / 2));
    const widthOf = (i: number) => (entry.swatches[i].label
      ? chipRadius * 2 + chipGapPx + measure(entry.swatches[i].label, legendPx) + chipTrailPx
      : runStep);
    entry.swatches.forEach((swatch, i) => {
      // A run wraps whole: its swatches and the label that names them, on one row.
      if (i === 0 || entry.swatches[i - 1].label) {
        let end = i;
        while (end < entry.swatches.length - 1 && !entry.swatches[end].label) end++;
        let groupWidth = 0;
        for (let k = i; k <= end; k++) groupWidth += widthOf(k);
        // Same accounting as `push`, so the card makes room for its swatches as for its caveats.
        if (x + groupWidth > x0 + textWidth && x > x0) {
          y += style.lineGap + legendPx;
          x = x0;
        }
      }
      chips.push({ x: x + chipRadius, y: y - legendPx / 2, radius: chipRadius, color: swatch.color, shape: swatch.shape ?? entry.shapeMeans, ...(swatch.style ? { style: swatch.style } : {}) });
      /*
       * A label too long for the row wraps under itself, beside its chip: on one line,
       * the first card keying War & Conflict's arcs ran it off the card's edge.
       */
      const labelX = x + chipRadius * 2 + chipGapPx;
      const room = x0 + textWidth - labelX;
      const parts = !swatch.label ? [] : measure(swatch.label, legendPx) > room ? wrapText(swatch.label, room, legendPx, measure) : [swatch.label];
      parts.forEach((part, k) => {
        if (k > 0) y += style.lineGap + legendPx;
        lines.push({ text: part, x: labelX, y, fontPx: legendPx, kind: 'legend' });
      });
      x = parts.length > 1 ? labelX + measure(parts[parts.length - 1], legendPx) + chipTrailPx : x + widthOf(i);
    });
    y += style.lineGap;
  }

  // Every caveat, in order, in its short form (IM11). Nothing here is conditional on fitting.
  const caveats = provenance.caveatsShort?.length === provenance.caveats.length ? provenance.caveatsShort : provenance.caveats;
  if (caveats.length) section();
  /*
   * A QR code, when asked (IM32), in the bottom-right corner: the last lines, the
   * caveats and the footer, wrap beside it, so it costs the picture little height.
   * Under the footer alone it cost the square critical card 125 px, and the card
   * was refused.
   */
  let qr = input.qr && caveats.length ? { x: x0 + textWidth - style.qrPx, y, size: style.qrPx } : undefined;
  const besideQr = () => (qr ? textWidth - style.qrPx - style.lineGap * 2 : textWidth);
  for (const c of caveats) push(`· ${c}`, style.caveatPx, 'caveat', besideQr());

  /*
   * The footer: the product and the moment, which is not a claim about the world;
   * the camera and how the planet was drawn; the analysis marks, when there are
   * any; and the build, a "+" after its sha when the tree had uncommitted
   * changes, which a caveat above says in words.
   */
  const camera = provenance.appearance
    ? `${formatCameraLine(provenance.camera)} · ${provenance.appearance.skin}, ${provenance.appearance.lightMode} light`
    : formatCameraLine(provenance.camera);
  const footer = [
    `STARCOM · ${provenance.capturedAt.replace('T', ' ').replace(/\.\d+Z$/, 'Z')}`,
    camera,
    provenance.marks && provenance.marks.shown > 0 ? `Marks: ${provenance.marks.shown}` : null,
    provenance.build?.sha
      ? `build ${provenance.build.sha.slice(0, 8)}${provenance.build.treeDirty ? '+' : ''}${provenance.build.builtAt ? ` · built ${provenance.build.builtAt.slice(0, 10)}` : ''}`
      : null,
  ].filter(Boolean).join(' · ');
  section();
  // No caveats to stand beside: the code stands beside the footer.
  if (input.qr && !qr) qr = { x: x0 + textWidth - style.qrPx, y, size: style.qrPx };
  /*
   * Who to credit for the data drawn (record D-L, decision L5), and then who made
   * the images (TX10), above the footer and in its type: part of the image, so the
   * credit goes where the picture goes, as several sources' terms ask.
   */
  // A card that draws country names credits them (decision K5, TS14).
  const credited = creditsParagraph(
    provenance.credits ?? [],
    provenance.imagery ?? [],
    provenance.appearance?.countryNames ? [creditLine(CREDITS.naturalEarth)] : [],
  );
  if (credited) push(credited, style.footerPx, 'footer', besideQr());
  // Wrapped the same whatever the build's hash (wrapStampText), so the card's layout does not move with it.
  push(footer, style.footerPx, 'footer', besideQr(), provenance.build?.sha ? provenance.build.sha.slice(0, 8) : null);
  if (qr) y = Math.max(y, qr.y + qr.size + style.lineGap);

  return {
    lines, chips, badge, headlineShortened: headlineLines.length > kept.length, pictureY, belowPicture, bottom: y,
    ...(qr ? { qr } : {}),
  };
}

/** Why a card cannot be made at its size, and what to do instead. */
const refusal = (style: ShareCardStyle, what: string) =>
  `${what} Refusing rather than cutting a caveat or shrinking the planet to a sliver: ${style.refusalAdvice ?? REFUSAL_ADVICE}`;

/**
 * The picture's draw: the crop clamped against its own origin, and drawn
 * inside its area at the crop's aspect, centred.
 */
function placePicture(
  input: LayoutInput,
  style: ShareCardStyle,
  area: { x: number; y: number; width: number; height: number },
): Pick<ShareCardLayout, 'globeRect' | 'sourceRect' | 'callout'> {
  const { provenance, bounds, frame, measure } = input;
  /*
   * ─── THE CROP, CLAMPED AGAINST ITS OWN ORIGIN ────────────────────────────
   *
   * `bounds` may extend past the frame, deliberately — computeGlobeScreenBounds
   * says so, and it is real information about the view. But a draw cannot read
   * outside the source, and the previous clamp took `min(frame.width, width)`
   * without regard to x, so a box starting at x=900 and 1000 wide asked to read
   * to 1900 in a 1400-wide frame.
   */
  const { x: sourceX, y: sourceY, width: sourceWidth, height: sourceHeight } = cropWithinFrame(bounds, frame);

  /*
   * ─── AND THE DRAWN RECT, MATCHED TO IT ───────────────────────────────────
   *
   * drawShareCard maps the source onto this with a single drawImage, so if the
   * two aspects differ the Earth is drawn stretched. So the drawn rect takes the
   * CROPPED aspect and is fitted inside the image area, centred. Letterboxed
   * rather than stretched or further cropped: a distorted Earth is the first
   * thing anyone would notice, and cropping to fit would clip the subject the
   * crop exists to frame. Bars land on the card's own background, which
   * drawShareCard has already painted.
   */
  const sourceRect = { x: sourceX, y: sourceY, width: sourceWidth, height: sourceHeight };
  const globeRect = fitPicture(area, sourceRect);
  const callout = provenance.featured && input.featuredAt
    ? calloutAt(input.featuredAt, sourceRect, globeRect, provenance.featured.title, style.bodyPx, measure)
    : undefined;
  return {
    globeRect,
    sourceRect,
    ...(callout ? { callout } : {}),
  };
}

/** The source drawn inside its area at the source's own aspect, centred: letterboxed, never stretched. */
export function fitPicture(area: Rect, source: { width: number; height: number }): Rect {
  const sourceAspect = source.width / source.height;
  let drawWidth = area.width;
  let drawHeight = drawWidth / sourceAspect;
  if (drawHeight > area.height) {
    drawHeight = area.height;
    drawWidth = drawHeight * sourceAspect;
  }
  return {
    x: area.x + (area.width - drawWidth) / 2,
    y: area.y + (area.height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  };
}

/*
 * The glyph's place in the card: the same map drawImage applies, source rect
 * onto globe rect. Only when it lands in the picture — a label pointing past
 * the edge would point at nothing.
 */
function calloutAt(
  featuredAt: { x: number; y: number },
  source: Rect,
  globeRect: Rect,
  title: string,
  fontPx: number,
  measure: MeasureText,
): FeaturedCallout | undefined {
  const anchor = {
    x: globeRect.x + (featuredAt.x - source.x) * (globeRect.width / source.width),
    y: globeRect.y + (featuredAt.y - source.y) * (globeRect.height / source.height),
  };
  const inPicture = anchor.x >= globeRect.x && anchor.x <= globeRect.x + globeRect.width
    && anchor.y >= globeRect.y && anchor.y <= globeRect.y + globeRect.height;
  return inPicture ? placeCallout(anchor, title, globeRect, fontPx, measure) : undefined;
}

/**
 * The featured item's label and leader as the layout will place them, before the
 * layout is made: for a card whose whole frame is its picture (composeShareCard),
 * in the picture's own pixels, its top-left at 0,0. Compose hands them to the
 * country names, which are placed in the capture's render, before the card is
 * drawn, and keep clear of them (decision K5, TS11).
 */
export function calloutInPicture(input: {
  featuredAt: { x: number; y: number };
  frame: { width: number; height: number };
  picture: { width: number; height: number };
  title: string;
  fontPx: number;
  measure: MeasureText;
}): FeaturedCallout | undefined {
  const source = { x: 0, y: 0, ...input.frame };
  const globeRect = fitPicture({ x: 0, y: 0, ...input.picture }, source);
  return calloutAt(input.featuredAt, source, globeRect, input.title, input.fontPx, input.measure);
}

/**
 * The wide sizes (IM27): the picture on the left, square while the text fits
 * in the column beside it; a column that needs more room takes it from the
 * picture, a step at a time, down to the picture's floor, and past the floor the
 * card is refused.
 */
function besideTheText(input: LayoutInput, style: ShareCardStyle & { height: number }): ShareCardLayout {
  const { height } = style;
  const least = Math.round(height * (style.minPictureShare ?? MIN_COMPOSED_PICTURE_SHARE));
  const textBeside = (pictureWidth: number): LaidText | null => {
    const textWidth = style.width - pictureWidth - style.padding * 2;
    if (textWidth <= 0) return null;
    const laid = layText(input, style, pictureWidth + style.padding, textWidth, style.padding, false);
    return Math.ceil(laid.bottom + style.padding) <= height ? laid : null;
  };
  let pictureWidth = Math.min(height, style.width - style.padding * 2 - 1);
  let laid = textBeside(pictureWidth);
  while (!laid && pictureWidth > least) {
    pictureWidth = Math.max(least, pictureWidth - SIDE_STEP_PX);
    laid = textBeside(pictureWidth);
  }
  if (!laid) {
    throw new ShareCardLayoutError(refusal(style,
      `The ${style.width}×${height} card's text does not fit beside a picture ${least}px wide, the least it can be.`));
  }
  const { area: globeArea, timestream } = withTimestream({ x: 0, y: 0, width: pictureWidth, height }, style, input.timestream);
  return {
    width: style.width,
    height,
    globeArea,
    ...placePicture(input, style, globeArea),
    ...(timestream ? { timestream } : {}),
    strip: { x: pictureWidth, y: 0, width: style.width - pictureWidth, height },
    lines: laid.lines,
    chips: laid.chips,
    ...(laid.badge ? { badge: laid.badge } : {}),
    headlineShortened: laid.headlineShortened,
    ...(laid.qr ? { qr: laid.qr } : {}),
  };
}

export function computeShareCardLayout(input: LayoutInput): ShareCardLayout {
  const style = { ...DEFAULT_CARD_STYLE, ...input.style };

  if (!(style.width > 0)) {
    throw new ShareCardLayoutError(`Card width must be positive, got ${style.width}`);
  }
  const textWidth = style.width - style.padding * 2;
  if (textWidth <= 0) {
    throw new ShareCardLayoutError(
      `Padding of ${style.padding} leaves no room for text in a ${style.width}px card.`,
    );
  }
  if (style.side && style.height !== undefined) return besideTheText(input, { ...style, height: style.height });

  const globeHeight = Math.round(style.width / style.globeAspect);
  // A composed card (IM6, IM27) opens with its title band; a card that grows, with its picture.
  const composed = style.height !== undefined;
  const laid = layText(input, style, style.padding, textWidth, composed ? style.padding : globeHeight + style.padding, composed);
  const { lines, chips } = laid;

  let height = Math.ceil(laid.bottom + style.padding);
  let pictureHeight = globeHeight;
  let qr = laid.qr;
  if (style.height !== undefined) {
    pictureHeight = style.height - height;
    const least = Math.round(style.width * (style.minPictureShare ?? MIN_COMPOSED_PICTURE_SHARE));
    if (pictureHeight < least) {
      throw new ShareCardLayoutError(refusal(style,
        `The ${style.width}×${style.height} card's text needs ${height}px of it, leaving ${pictureHeight}px for the `
        + `picture, under the ${least}px it needs.`));
    }
    for (let i = laid.belowPicture; i < lines.length; i++) lines[i] = { ...lines[i], y: lines[i].y + pictureHeight };
    for (let i = 0; i < chips.length; i++) chips[i] = { ...chips[i], y: chips[i].y + pictureHeight };
    if (qr) qr = { ...qr, y: qr.y + pictureHeight };
    height = style.height;
  }

  if (height > style.maxHeight) {
    /*
     * The refusal. Reached only when the caveats genuinely cannot fit, which
     * means the capture has a lot to disclose — precisely when silently
     * dropping some would do the most harm.
     */
    throw new ShareCardLayoutError(
      `The card needs ${height}px to state all ${input.provenance.caveats.length} caveats, `
      + `over the ${style.maxHeight}px limit. Refusing rather than truncating: the `
      + 'caveat that would be cut is the one a viewer most needs. Widen the card, or '
      + 'resolve the conditions being disclosed.',
    );
  }

  const pictureY = laid.pictureY;
  const { area: globeArea, timestream } = withTimestream({ x: 0, y: pictureY, width: style.width, height: pictureHeight }, style, input.timestream);
  return {
    width: style.width,
    height,
    globeArea,
    ...placePicture(input, style, globeArea),
    ...(timestream ? { timestream } : {}),
    strip: {
      x: 0, y: pictureY + pictureHeight,
      width: style.width,
      height: height - (pictureY + pictureHeight),
    },
    lines,
    chips,
    ...(laid.badge ? { badge: laid.badge } : {}),
    headlineShortened: laid.headlineShortened,
    ...(qr ? { qr } : {}),
  };
}
