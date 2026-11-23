/** Where the menu at the click opens (K8): beside the click, kept inside the viewport. */

/** Clear space between the click and the menu, and between the menu and the viewport's edges. */
export const GAP_PX = 8;

/** Beside the click, turned back inside the viewport where an edge would cut it. */
export function groupMenuPosition(
  at: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  let left = at.x + GAP_PX;
  let top = at.y + GAP_PX;
  if (left + size.width > viewport.width - GAP_PX) left = at.x - GAP_PX - size.width;
  if (top + size.height > viewport.height - GAP_PX) top = viewport.height - GAP_PX - size.height;
  return { left: Math.max(GAP_PX, left), top: Math.max(GAP_PX, top) };
}
