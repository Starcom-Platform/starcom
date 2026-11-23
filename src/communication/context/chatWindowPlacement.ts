/**
 * Where a chat window opens (K16): in the work area, the part of the screen the
 * shell leaves for an app, never on the header, the ticker or the rails.
 *
 * It opened 5 to 10px from the top, on the header and the ticker, beside a
 * comment saying "5% from bottom". The few pixels of random offset it carried
 * were called anti-fingerprinting; a window's place on this screen is never sent
 * anywhere, so they protected nothing and are gone.
 */

export interface WorkArea { top: number; left: number; width: number; height: number }

const GUTTER = 8;
const GAP = 10;
const STEP = 24;
const WIDTH = 320;
const HEIGHT = 400;

/** The work area the shell publishes as `--work-*`, or the whole window before it has. */
export function readWorkArea(): WorkArea {
  const css = getComputedStyle(document.documentElement);
  const px = (name: string) => parseFloat(css.getPropertyValue(name));
  const [top, left, width, height] = ['--work-top', '--work-left', '--work-width', '--work-height'].map(px);
  if ([top, left, width, height].some((n) => !Number.isFinite(n)) || width <= 0 || height <= 0) {
    return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
  }
  return { top, left, width, height };
}

/**
 * Windows open side by side from the area's top-left. One that would run past
 * the right edge sits at that edge instead, a step lower than the one before.
 * Later windows stack above earlier ones.
 */
export function chatWindowPlacement(windowIndex: number, area: WorkArea) {
  const width = Math.min(WIDTH, area.width - 2 * GUTTER);
  const height = Math.min(HEIGHT, area.height - 2 * GUTTER);
  const fit = Math.max(1, Math.floor((area.width - 2 * GUTTER + GAP) / (width + GAP)));
  const right = area.left + area.width - GUTTER - width;
  const bottom = area.top + area.height - GUTTER - height;
  const beyond = windowIndex - fit + 1;
  const x = beyond > 0 ? right : area.left + GUTTER + windowIndex * (width + GAP);
  const y = Math.min(bottom, area.top + GUTTER + Math.max(0, beyond) * STEP);
  return { x, y, width, height, zIndex: 1 + windowIndex };
}
