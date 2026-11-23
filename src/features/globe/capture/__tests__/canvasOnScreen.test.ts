/**
 * A card is only a card of the globe if it was read from the globe.
 *
 * Reported by Mecha Jono on 2026-09-25: the share handle is installed about
 * 10 s after load, when the only canvas on the page is a 200×200 buffer laid
 * out at 0×0 on screen. The real 1280×608 globe canvas mounts about 5 s later.
 * A compose in that gap returned the placeholder scaled into a 1200-wide card
 * — a black square, one grey glyph, no Earth, and a complete disclosure strip
 * underneath vouching for it. `frame` came back as {width: 200, height: 200}.
 *
 * It did not refuse, because captureGlobeFrame's guard tests for a BLANK frame
 * and the placeholder is not blank. The question it could not ask was the one
 * that mattered: is this canvas the globe a person would see? A canvas with no
 * layout box is not on anyone's screen, whatever pixels its buffer holds.
 */
import { describe, it, expect } from 'vitest';
import { canvasIsOnScreen } from '../canvasOnScreen';

const canvas = (layout: { w: number; h: number }, connected = true) => ({
  isConnected: connected,
  clientWidth: layout.w,
  clientHeight: layout.h,
}) as unknown as HTMLCanvasElement;

describe('canvasIsOnScreen', () => {
  it('refuses the placeholder: a buffer with no layout box', () => {
    expect(canvasIsOnScreen(canvas({ w: 0, h: 0 }))).toBe(false);
  });

  it('refuses a canvas that is not in the document', () => {
    expect(canvasIsOnScreen(canvas({ w: 1280, h: 608 }, false))).toBe(false);
  });

  it('refuses a sliver, which is a layout still settling rather than a globe', () => {
    expect(canvasIsOnScreen(canvas({ w: 1280, h: 1 }))).toBe(false);
  });

  it('accepts the laid-out globe', () => {
    expect(canvasIsOnScreen(canvas({ w: 1280, h: 608 }))).toBe(true);
  });

  it('accepts a small but real phone-sized globe', () => {
    // The threshold must not exclude a legitimate narrow viewport.
    expect(canvasIsOnScreen(canvas({ w: 320, h: 240 }))).toBe(true);
  });
});
