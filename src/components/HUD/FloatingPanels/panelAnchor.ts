import type { FloatingPanelPosition } from './FloatingPanelContext';

/**
 * The work area in viewport pixels: the box the rails, the top bar and the time
 * scrubber leave clear, as useWorkArea publishes it in `--work-*`.
 */
export const readWorkArea = () => {
  const cs = getComputedStyle(document.documentElement);
  const px = (name: string, fallback: number) => {
    const v = parseFloat(cs.getPropertyValue(name));
    return Number.isFinite(v) ? v : fallback;
  };
  const top = px('--work-top', 0);
  const left = px('--work-left', 0);
  const right = px('--work-right', 0);
  const bottom = px('--work-bottom', 0);
  return {
    top,
    left,
    right: window.innerWidth - right,
    bottom: window.innerHeight - bottom,
  };
};

/**
 * The point a panel is about, in viewport pixels.
 *
 * One definition, because two places need the same answer: the manager renders
 * a panel at it, and the frame clamps the panel around it. A `work-area` anchor
 * is re-read on every call, so a panel follows a resize or the sub-rail toggle
 * instead of keeping the viewport it happened to open on. `geoToScreen` is only
 * needed for a geographic anchor.
 */
export const resolveAnchor = (
  position: FloatingPanelPosition,
  geoToScreen?: (lat: number, lng: number) => { x: number; y: number },
): { x: number; y: number } => {
  let point = { x: 0, y: 0 };
  if (position.anchorTo === 'geographic' && position.lat !== undefined && position.lng !== undefined && geoToScreen) {
    point = geoToScreen(position.lat, position.lng);
  } else if (position.anchorTo === 'screen' && position.x !== undefined && position.y !== undefined) {
    point = { x: position.x, y: position.y };
  } else if (position.anchorTo === 'work-area' && position.x !== undefined && position.y !== undefined) {
    const work = readWorkArea();
    point = {
      x: work.left + position.x * (work.right - work.left),
      y: work.top + position.y * (work.bottom - work.top),
    };
  }
  return { x: point.x + position.offset.x, y: point.y + position.offset.y };
};
