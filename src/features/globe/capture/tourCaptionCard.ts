/**
 * A briefing tour's caption, burned into a clip's frame (record
 * docs/missions/01-architecture-decisions/briefing-playlists.md, BP15, BP19).
 *
 * The screen's caption panel, at the foot of the frame and sized to its height
 * as the end card is: the playlist and how far through it, the item's title in
 * two lines at most, why it is shown, then the item's own lines. A clip posted
 * alone so says why each place is shown. The panel keeps to the foot of the
 * frame, leaving the stop in view: item lines past that are cut, and the last
 * shown says where the rest are, since the clip's record keeps every caption
 * whole.
 *
 * A field mission's safety limits are never cut (HW7, HW12). A caption holding
 * them widens toward the frame's edges until it fits whole, then, where it
 * cannot widen enough, grows past the foot of the frame, cutting only the other
 * lines, from the end; a frame too small to hold them whole is refused (HW13).
 */
import { wrapText, type MeasureText } from './shareCardLayout';
import { DEFAULT_CARD_THEME, withAlpha } from './drawShareCard';
import { CYAN, GUNMETAL } from '../../../styles/tokens';
import type { TourCaption } from '../tour/tourPlayer';

type Rect = { x: number; y: number; width: number; height: number };
type Tone = 'meta' | 'title' | 'why' | 'line';

export interface TourCaptionLine {
  text: string;
  x: number;
  /** The top of the line. */
  y: number;
  fontPx: number;
  tone: Tone;
}

export interface TourCaptionLayout {
  box: Rect;
  lines: TourCaptionLine[];
}

/** The panel's tallest, as a share of the frame: the stop above it stays in view. */
const MOST_OF_FRAME = 0.38;
/** A title gets two lines, as the screen clamps it. */
const TITLE_LINES = 2;
const TITLE_WEIGHT = 600;

/** Proportional to the frame's height, as the end card's style is. */
export function tourCaptionStyleFor(height: number) {
  return {
    margin: Math.round(height * 0.05),
    padding: Math.round(height * 0.022),
    metaPx: Math.round(height * 0.02),
    titlePx: Math.round(height * 0.032),
    whyPx: Math.round(height * 0.025),
    linePx: Math.round(height * 0.022),
    gap: Math.round(height * 0.008),
    width: Math.round(height * 0.8),
  };
}

/** Text cut to fit a width, ending in an ellipsis. */
function cutToFit(text: string, maxWidth: number, fontPx: number, measure: MeasureText, weight?: number): string {
  let cut = text;
  while (cut.length > 1 && measure(`${cut}…`, fontPx, weight) > maxWidth) cut = cut.slice(0, -1).trimEnd();
  return `${cut}…`;
}

export function layoutTourCaption({ width, height, caption, measure }: {
  width: number;
  height: number;
  caption: TourCaption;
  measure: MeasureText;
}): TourCaptionLayout {
  const s = tourCaptionStyleFor(height);
  const widest = width - s.margin * 2;
  const screens = Math.min(widest, s.width);
  const meta = (caption.progress ? `${caption.playlist} · ${caption.progress}` : caption.playlist).toUpperCase();
  const kept = new Set(caption.neverCut ?? []);
  const step = (fontPx: number) => fontPx + s.gap;
  const heightOf = (rows: Array<{ fontPx: number }>) => s.padding * 2 + rows.reduce((h, r) => h + step(r.fontPx), 0) - s.gap;
  const most = height * MOST_OF_FRAME;

  /** The panel's rows at a width: its head, then as many item lines as keep it to the foot of the frame. */
  const at = (boxWidth: number) => {
    const textWidth = boxWidth - s.padding * 2;
    let title = wrapText(caption.title, textWidth, s.titlePx, measure, TITLE_WEIGHT);
    if (title.length > TITLE_LINES) {
      title = [...title.slice(0, TITLE_LINES - 1), cutToFit(title.slice(TITLE_LINES - 1).join(' '), textWidth, s.titlePx, measure, TITLE_WEIGHT)];
    }
    const head: Array<{ text: string; fontPx: number; tone: Tone }> = [
      ...wrapText(meta, textWidth, s.metaPx, measure).map((text) => ({ text, fontPx: s.metaPx, tone: 'meta' as const })),
      ...title.map((text) => ({ text, fontPx: s.titlePx, tone: 'title' as const })),
      ...wrapText(caption.why, textWidth, s.whyPx, measure).map((text) => ({ text, fontPx: s.whyPx, tone: 'why' as const })),
    ];
    const itemLines = caption.lines.map((line) => wrapText(line, textWidth, s.linePx, measure));
    const rowsFor = (shown: number[]) => {
      const rows = shown.flatMap((i) => itemLines[i]).map((text) => ({ text, fontPx: s.linePx, tone: 'line' as const }));
      const cut = itemLines.length - shown.length;
      return cut ? [...rows, { text: `+${cut} more in the clip's record`, fontPx: s.linePx, tone: 'line' as const }] : rows;
    };
    // Item lines cut from the end, never one held whole; the rest said in one line.
    const shown = itemLines.map((_, i) => i);
    const whole = heightOf([...head, ...rowsFor(shown)]);
    for (let i = shown.length - 1; i >= 0 && heightOf([...head, ...rowsFor(shown)]) > most; i -= 1) {
      if (!kept.has(shown[i])) shown.splice(i, 1);
    }
    return { rows: [...head, ...rowsFor(shown)], whole };
  };

  // A caption holding lines a clip never cuts widens toward the frame's edges until it fits whole, at the
  // narrowest width that does (HW13); others keep the screen's width.
  let boxWidth = screens;
  if (kept.size && at(screens).whole > most) {
    let fits = widest;
    if (at(widest).whole <= most) {
      let short = screens;
      while (fits - short > 8) {
        // Even widths, so the panel centres on the pixel.
        const mid = Math.round((fits + short) / 4) * 2;
        if (at(mid).whole <= most) fits = mid;
        else short = mid;
      }
    }
    boxWidth = fits;
  }
  // Past the foot of the frame only where those lines need it: the panel grows rather than cut them.
  const { rows } = at(boxWidth);
  const boxHeight = heightOf(rows);
  if (boxHeight > height - s.margin * 2) {
    throw new Error(`The caption at "${caption.title}" holds a field mission's safety limits, which a clip never cuts, and they do not fit whole in a ${width}×${height} frame.`);
  }
  const box = { x: Math.round((width - boxWidth) / 2), y: height - s.margin - boxHeight, width: boxWidth, height: boxHeight };
  let y = box.y + s.padding;
  const lines = rows.map((row) => {
    const line = { ...row, x: box.x + s.padding, y };
    y += step(row.fontPx);
    return line;
  });
  return { box, lines };
}

/** The screen caption's colours, from the tokens: a gunmetal panel, a cyan edge, the reason in the accent. */
const TONE: Record<Tone, string> = { meta: GUNMETAL[300], title: GUNMETAL[100], why: CYAN[400], line: GUNMETAL[300] };

export function drawTourCaption(
  ctx: {
    fillStyle: string | CanvasGradient | CanvasPattern;
    strokeStyle: string | CanvasGradient | CanvasPattern;
    font: string;
    lineWidth: number;
    textBaseline: CanvasTextBaseline;
    fillRect(x: number, y: number, w: number, h: number): void;
    strokeRect(x: number, y: number, w: number, h: number): void;
    fillText(text: string, x: number, y: number): void;
  },
  layout: TourCaptionLayout,
  fontFamily: string = DEFAULT_CARD_THEME.fontFamily,
): void {
  const { box } = layout;
  ctx.fillStyle = withAlpha(GUNMETAL[900], 0.88);
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.strokeStyle = withAlpha(CYAN[400], 0.6);
  ctx.lineWidth = Math.max(1, Math.round(box.height / 160));
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.textBaseline = 'top';
  for (const line of layout.lines) {
    ctx.fillStyle = TONE[line.tone];
    ctx.font = `${line.tone === 'title' ? `${TITLE_WEIGHT} ` : ''}${line.fontPx}px ${fontFamily}`;
    ctx.fillText(line.text, line.x, line.y);
  }
}
