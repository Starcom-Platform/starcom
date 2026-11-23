/**
 * Where a chat window opens (K16).
 *
 * It opened 5 to 10px from the top of the screen, on the header and the ticker,
 * under a comment saying "5% from bottom". It opens in the work area now, the
 * area the maximised window fills, so it never lands on the shell.
 */
import { describe, it, expect } from 'vitest';
import { chatWindowPlacement, readWorkArea } from '../chatWindowPlacement';

const area = { top: 148, left: 120, width: 1100, height: 600 };

describe('chatWindowPlacement', () => {
  it('opens the first window inside the top-left of the work area', () => {
    const p = chatWindowPlacement(0, area);
    expect(p.x).toBe(128);
    expect(p.y).toBe(156);
  });

  it('opens later windows beside the first', () => {
    const [a, b] = [chatWindowPlacement(0, area), chatWindowPlacement(1, area)];
    expect(b.x).toBe(a.x + a.width + 10);
    expect(b.y).toBe(a.y);
  });

  it('never runs a window past the right edge; one that would not fit steps down instead', () => {
    for (let i = 0; i < 8; i++) {
      const p = chatWindowPlacement(i, area);
      expect(p.x + p.width).toBeLessThanOrEqual(area.left + area.width - 8);
      expect(p.y + p.height).toBeLessThanOrEqual(area.top + area.height - 8);
    }
    expect(chatWindowPlacement(4, area).y).toBeGreaterThan(chatWindowPlacement(0, area).y);
  });

  it('is no wider than a phone\'s work area has room for', () => {
    const p = chatWindowPlacement(0, { top: 100, left: 0, width: 390, height: 689 });
    expect(p.width).toBe(320);
    expect(chatWindowPlacement(0, { top: 100, left: 0, width: 300, height: 689 }).width).toBe(284);
  });

  it('is no taller than the work area has room for', () => {
    expect(chatWindowPlacement(0, { ...area, height: 300 }).height).toBe(284);
    expect(chatWindowPlacement(0, area).height).toBe(400);
  });

  it('puts later windows above earlier ones', () => {
    expect(chatWindowPlacement(1, area).zIndex).toBeGreaterThan(chatWindowPlacement(0, area).zIndex);
  });

  it('reads the work area the shell publishes, and the window when there is none', () => {
    const root = document.documentElement;
    root.style.setProperty('--work-top', '148px');
    root.style.setProperty('--work-left', '120px');
    root.style.setProperty('--work-width', '1100px');
    root.style.setProperty('--work-height', '600px');
    expect(readWorkArea()).toEqual(area);
    for (const v of ['--work-top', '--work-left', '--work-width', '--work-height']) root.style.removeProperty(v);
    expect(readWorkArea()).toEqual({ top: 0, left: 0, width: window.innerWidth, height: window.innerHeight });
  });
});
