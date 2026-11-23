/**
 * Edge-aware tooltip placement — keeps a small tooltip inside the viewport near
 * the cursor. A simplified version of IntelReportTooltip's own tooltipStyle logic
 * (component/src/components/ui/IntelReportTooltip/IntelReportTooltip.tsx). Sized
 * for a one-line string unless given the tooltip's size, which estimateTooltipSize
 * reads from its text: a hover that wraps to several lines (Hero Watch's relief, a
 * field mission's limits) is placed below the cursor when it would run off the
 * top, and kept on screen there. Split into its own plain .ts file (rather than
 * living in SimplePointTooltip.tsx) so that component file stays component-only
 * for React Fast Refresh.
 */
export interface TooltipPlacement {
  left: number;
  top: number;
  transform: string;
}

export interface TooltipSize {
  width: number;
  height: number;
}

const ESTIMATED_WIDTH = 260;
const ESTIMATED_HEIGHT = 32;
const PADDING = 12;
const CURSOR_GAP = 14;

/** The widest a tooltip grows, in CSS px, before its words wrap. */
export const TOOLTIP_MAX_WIDTH = 360;
/** The tooltip's face: 12 px of the monospaced data font, so a character is a fixed width. */
const CHAR_PX = 7.2;
export const TOOLTIP_LINE_PX = 16;
const PAD_X = 20;
const PAD_Y = 10;

/** A tooltip's size, from its text: its longest line, wrapped at TOOLTIP_MAX_WIDTH, and its breaks. */
export function estimateTooltipSize(text: string): TooltipSize {
  const perLine = Math.floor((TOOLTIP_MAX_WIDTH - PAD_X) / CHAR_PX);
  const lines = text.split('\n');
  const rows = lines.reduce((n, line) => n + Math.max(1, Math.ceil(line.length / perLine)), 0);
  const longest = Math.max(...lines.map((line) => line.length));
  return { width: Math.min(TOOLTIP_MAX_WIDTH, Math.ceil(longest * CHAR_PX) + PAD_X), height: rows * TOOLTIP_LINE_PX + PAD_Y };
}

export function computeTooltipPlacement(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  size: TooltipSize = { width: ESTIMATED_WIDTH, height: ESTIMATED_HEIGHT },
): TooltipPlacement {
  let left = x;
  let horizontalAnchor = '-50%';
  if (x - size.width / 2 < PADDING) {
    left = PADDING;
    horizontalAnchor = '0%';
  } else if (x + size.width / 2 > viewportWidth - PADDING) {
    left = viewportWidth - PADDING;
    horizontalAnchor = '-100%';
  }

  let top = y;
  let verticalAnchor = `calc(-100% - ${CURSOR_GAP}px)`; // above the cursor by default
  if (y - size.height - CURSOR_GAP < PADDING) {
    verticalAnchor = `${CURSOR_GAP}px`; // not enough room above — show below instead
    // Below, and kept on screen: a tall one rises to fit rather than running off the bottom.
    if (y + CURSOR_GAP + size.height > viewportHeight - PADDING) {
      top = Math.max(PADDING - CURSOR_GAP, viewportHeight - PADDING - size.height - CURSOR_GAP);
    }
  } else if (top > viewportHeight - PADDING) {
    // Above the cursor, it rises from the cursor: only a cursor past the bottom edge moves it.
    top = viewportHeight - PADDING;
  }

  return { left, top, transform: `translate(${horizontalAnchor}, ${verticalAnchor})` };
}
