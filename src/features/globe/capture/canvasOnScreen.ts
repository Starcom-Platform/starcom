/**
 * Whether a canvas is one a person could actually be looking at.
 *
 * The share handle read `globeRef.current` and trusted that it was the globe.
 * For about five seconds after the handle was installed it was not: the only
 * canvas was a 200×200 buffer with no layout box, and composing then produced
 * a card with no Earth in it and a full disclosure strip under it — reported
 * by Mecha Jono on 2026-09-25. captureGlobeFrame refuses a BLANK frame, and the
 * placeholder was not blank, so nothing refused.
 *
 * Layout is the test because it is what distinguishes the two: the placeholder
 * has pixels and no box. 64 CSS pixels rejects a layout still settling to a
 * sliver without excluding any real viewport.
 */
const MIN_ON_SCREEN_PX = 64;

export function canvasIsOnScreen(canvas: Pick<HTMLCanvasElement, 'isConnected' | 'clientWidth' | 'clientHeight'>): boolean {
  return canvas.isConnected
    && canvas.clientWidth >= MIN_ON_SCREEN_PX
    && canvas.clientHeight >= MIN_ON_SCREEN_PX;
}
