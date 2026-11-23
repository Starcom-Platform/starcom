/**
 * SimplePointTooltip — plain-string hover tooltip for InstancedMesh point layers
 * (see useGlobePointTooltips.ts). Deliberately not a reuse of IntelReportTooltip,
 * which is tightly coupled to the IntelReportOverlayMarker shape (title, tags,
 * 3D preview thumbnail, priority classification) — there's no report card here,
 * just a real formatted string each producing hook already built
 * (buildWeatherTooltip, buildIcebergTooltip, buildVolcanoTooltip, buildTideTooltip,
 * buildStreamflowTooltip). Placement reuses tooltipPlacement.ts's edge-aware
 * approach (keep the tooltip inside the viewport near the cursor).
 *
 * Styled to match Globe.tsx's own plain-inline-styled overlay convention (zoom
 * controls, EcoHistoryScrubber) rather than the MUI sidebar cards. Its whole text
 * is shown: it wraps, and keeps the text's line breaks. It was cut at one line,
 * which lost relief's sums after 45 characters, and would have cut a field
 * mission's safety limits, which are never left out (D-HW).
 *
 * Drawn in the page's body, through a portal: inside the globe's frame, which
 * has a transform, a fixed box is placed from the frame and not the window, and
 * every tooltip stood 100 px lower than placed, over the mark it describes.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import type { HoveredPointTooltip } from './Hooks/useGlobePointTooltips';
import { computeTooltipPlacement, estimateTooltipSize, TOOLTIP_LINE_PX, TOOLTIP_MAX_WIDTH } from './tooltipPlacement';

const style: React.CSSProperties = {
  position: 'fixed',
  padding: '4px 10px',
  backgroundColor: 'rgba(0, 0, 0, 0.85)',
  border: '1px solid rgba(0, 255, 255, 0.4)',
  borderRadius: '4px',
  color: '#00ffff',
  fontSize: '12px',
  fontFamily: 'var(--sc-font-data)',
  pointerEvents: 'none',
  // The tooltip tier: over the HUD's bars and rails (3100-3200), which hid a tall hover's first lines.
  zIndex: 'var(--z-tooltip)',
  whiteSpace: 'pre-line',
  overflowWrap: 'anywhere',
  lineHeight: `${TOOLTIP_LINE_PX}px`,
  maxWidth: `${TOOLTIP_MAX_WIDTH}px`,
};

/** Said under a mark whose notes a click opens (D-CT, CT3), as the report glyph's hover says it. */
const OPENS_HINT = 'Click to open, with its sources';
const hint: React.CSSProperties = { display: 'block', color: 'var(--sc-text-secondary)' };

export const SimplePointTooltip: React.FC<{ tooltip: HoveredPointTooltip | null }> = ({ tooltip }) => {
  if (!tooltip || typeof window === 'undefined') return null;

  const said = tooltip.opens ? `${tooltip.text}\n${OPENS_HINT}` : tooltip.text;
  const { left, top, transform } = computeTooltipPlacement(tooltip.screenX, tooltip.screenY, window.innerWidth, window.innerHeight, estimateTooltipSize(said));

  return createPortal(
    <div style={{ ...style, left, top, transform }} role="tooltip" data-testid="point-tooltip">
      {tooltip.text}
      {tooltip.opens && <span style={hint} data-testid="point-tooltip-opens">{OPENS_HINT}</span>}
    </div>,
    document.body,
  );
};

export default SimplePointTooltip;
