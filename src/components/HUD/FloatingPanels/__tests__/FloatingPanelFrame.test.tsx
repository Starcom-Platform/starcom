/**
 * A panel that cannot be reached is worse than a panel that never opened.
 *
 * These test one property: whatever the anchor says and whatever size the panel
 * turns out to be, its header stays inside the work area — because the header
 * carries the close button and the drag handle, and a panel whose header is
 * off-screen can only be dismissed by reloading the page.
 *
 * That is not hypothetical. The Intelligence Dashboard shipped anchored at
 * y=140 and rendered 419px tall, centred on its anchor, which put its title bar
 * 70px above the top of the viewport.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { FloatingPanelFrame } from '../FloatingPanelFrame';
import { WORK_AREA_EVENT } from '../../../../layouts/CyberCommandHUDLayout/useWorkArea';
import type { FloatingPanel } from '../FloatingPanelContext';

const Body: React.FC = () => <div>panel body</div>;

const panel = (over: Partial<FloatingPanel> = {}): FloatingPanel => ({
  id: 'p1', type: 'control', title: 'Intelligence Dashboard',
  component: Body, position: { anchorTo: 'screen', x: 160, y: 140, offset: { x: 0, y: 0 } },
  priority: 'primary', triggers: [], isVisible: true, zIndex: 1000, ...over,
});

/**
 * jsdom lays nothing out, so the panel's size is supplied per test. The frame
 * reads layout size (offsetWidth/offsetHeight), which a transform cannot skew.
 */
const sized = (w: number, h: number) => {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => w });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => h });
};

const setWorkArea = (top: number, left: number, right: number, bottom: number) => {
  const s = document.documentElement.style;
  s.setProperty('--work-top', `${top}px`);
  s.setProperty('--work-left', `${left}px`);
  s.setProperty('--work-right', `${right}px`);
  s.setProperty('--work-bottom', `${bottom}px`);
};

const frame = (p = panel(), anchor = { x: 160, y: 140 }) =>
  render(
    <FloatingPanelFrame
      panel={p} anchor={anchor} isDragging={false}
      onDragStart={() => {}} onToggleMinimize={() => {}} onClose={() => {}}
    />,
  );

const placed = () => {
  const el = document.querySelector('[data-panel-id]') as HTMLElement;
  return { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
};

describe('FloatingPanelFrame placement', () => {
  const realRect = Element.prototype.getBoundingClientRect;
  const realOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  const realOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    window.innerWidth = 1440; window.innerHeight = 900;
    setWorkArea(148, 0, 0, 43);   // the real measured work area of the app
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = realRect;
    if (realOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', realOffsetWidth);
    if (realOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', realOffsetHeight);
    document.querySelectorAll('[data-dock]').forEach((el) => el.remove());
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('style');
  });

  it('keeps a tall panel below the top of the work area', () => {
    // The shipped case: anchored at y=140, 419px tall. Centring alone gives -70.
    sized(300, 419);
    frame();
    expect(placed().y).toBeGreaterThanOrEqual(148);
  });

  it('keeps a panel out of the left chrome', () => {
    sized(300, 200);
    setWorkArea(148, 68, 32, 43);   // rails present
    frame(panel(), { x: 0, y: 400 });
    expect(placed().x).toBeGreaterThanOrEqual(68);
  });

  it('keeps a panel out of the right chrome', () => {
    sized(300, 200);
    setWorkArea(148, 68, 32, 43);
    frame(panel(), { x: 5000, y: 400 });
    // right edge of the work area is innerWidth - 32 = 1408
    expect(placed().x + 300).toBeLessThanOrEqual(1408);
  });

  it('pins to the left edge rather than centring when it cannot fit', () => {
    // Wider than the work area: there is no position that fits, so the choice is
    // which edge to lose. Losing the right keeps the reading order intact.
    sized(2000, 200);
    setWorkArea(148, 68, 32, 43);
    frame(panel(), { x: 700, y: 400 });
    expect(placed().x).toBe(68 + 16);
  });

  it('re-places itself when the work area is measured later', () => {
    // The struts arrive after first paint. A panel that clamps once on mount
    // reads the CSS fallbacks and never learns it was given provisional numbers.
    sized(300, 419);
    document.documentElement.removeAttribute('style');
    frame();
    const provisional = placed().y;

    act(() => {
      setWorkArea(400, 0, 0, 43);
      window.dispatchEvent(new CustomEvent(WORK_AREA_EVENT));
    });

    expect(placed().y).toBeGreaterThanOrEqual(400);
    expect(placed().y).not.toBe(provisional);
  });

  it('follows the cursor mid-drag, even past the edge, and clamps once let go', () => {
    sized(300, 419);
    const { rerender } = frame();
    const opened = placed();
    const dragTo = (anchor: { x: number; y: number }, isDragging: boolean) => rerender(
      <FloatingPanelFrame
        panel={panel()} anchor={anchor} isDragging={isDragging}
        onDragStart={() => {}} onToggleMinimize={() => {}} onClose={() => {}}
      />,
    );

    // A dragged panel moves with the pointer. It used to stay put until released.
    dragTo({ x: 700, y: 400 }, true);
    expect(placed()).toEqual({ x: Math.round(700 - 150), y: Math.round(400 - 419 / 2) });
    expect(placed()).not.toEqual(opened);

    // Dragged somewhere illegal, it still follows: a panel that snaps away from
    // the cursor mid-drag reads as broken.
    dragTo({ x: 700, y: 5 }, true);
    expect(placed()).toEqual({ x: Math.round(700 - 150), y: Math.round(5 - 419 / 2) });

    // Nothing re-clamps it while it is held, not even the work area changing.
    act(() => {
      window.dispatchEvent(new CustomEvent(WORK_AREA_EVENT));
    });
    expect(placed()).toEqual({ x: Math.round(700 - 150), y: Math.round(5 - 419 / 2) });

    // Let go, and it is brought back inside the work area.
    dragTo({ x: 700, y: 5 }, false);
    expect(placed().y).toBeGreaterThanOrEqual(148);
  });

  it('opens a work-area anchored panel bottom-centre, clear of the bottom edge', () => {
    // The timeline: anchored at (0.5, 1) of the work area, 760×480 once laid out.
    sized(760, 480);
    setWorkArea(148, 32, 32, 95);   // work area x 32..1408, y 148..805
    frame(panel({ position: { anchorTo: 'work-area', x: 0.5, y: 1, offset: { x: 0, y: 0 } } }));
    expect(placed().x).toBe(32 + (1408 - 32) / 2 - 760 / 2);
    expect(placed().y).toBe(900 - 95 - 480 - 16);
  });

  it('re-centres a work-area anchored panel when the work area changes', () => {
    sized(760, 480);
    setWorkArea(148, 32, 32, 95);
    frame(panel({ position: { anchorTo: 'work-area', x: 0.5, y: 1, offset: { x: 0, y: 0 } } }));
    const opened = placed().x;

    act(() => {
      setWorkArea(148, 332, 32, 95);   // wider chrome on the left
      window.dispatchEvent(new CustomEvent(WORK_AREA_EVENT));
    });

    expect(placed().x).toBe(332 + (1408 - 332) / 2 - 760 / 2);
    expect(placed().x).not.toBe(opened);
  });

  it('places itself by its laid-out size, not a size an animation is scaling', () => {
    // Laid out at 760×480 while the entrance transform shrinks its rect to 80%.
    sized(760, 480);
    Element.prototype.getBoundingClientRect = function () {
      return { width: 608, height: 384, top: 0, left: 0, right: 608, bottom: 384, x: 0, y: 0,
               toJSON: () => ({}) } as DOMRect;
    };
    setWorkArea(148, 32, 32, 95);
    frame(panel({ position: { anchorTo: 'work-area', x: 0.5, y: 1, offset: { x: 0, y: 0 } } }));
    expect(placed().x).toBe(32 + (1408 - 32) / 2 - 760 / 2);
    expect(placed().y).toBe(900 - 95 - 480 - 16);
  });

  it('settles where it was dropped, not back at its registered anchor', () => {
    sized(760, 480);
    setWorkArea(148, 32, 32, 95);
    const { rerender } = frame(panel({ position: { anchorTo: 'work-area', x: 0.5, y: 1, offset: { x: 0, y: 0 } } }));
    const opened = placed();

    // A drag ends by handing the frame a screen anchor where the panel was let go.
    rerender(
      <FloatingPanelFrame
        panel={panel({ position: { anchorTo: 'screen', x: 700, y: 500, offset: { x: 0, y: 0 } } })}
        anchor={{ x: 700, y: 500 }} isDragging={false}
        onDragStart={() => {}} onToggleMinimize={() => {}} onClose={() => {}}
      />,
    );
    expect(placed()).toEqual({ x: 700 - 380, y: 500 - 240 });
    expect(placed()).not.toEqual(opened);
  });

  it('keeps its header out from under the top-right dock, which stays above panels', () => {
    sized(300, 200);
    setWorkArea(148, 32, 32, 95);
    const dock = document.createElement('div');
    dock.setAttribute('data-dock', 'top-right');
    dock.getBoundingClientRect = () =>
      ({ left: 1100, right: 1388, top: 168, bottom: 240, width: 288, height: 72, x: 1100, y: 168,
         toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(dock);

    // Anchored where its header would sit under the dock.
    frame(panel(), { x: 1300, y: 200 });
    const { x, y } = placed();
    expect(x < 1388 && 1100 < x + 300 && y < 240 && 168 < y + 44).toBe(false);
    expect(y).toBe(240 + 16);
  });
});

describe('FloatingPanelFrame controls', () => {
  const realRect = Element.prototype.getBoundingClientRect;
  const realOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  const realOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    sized(300, 200);
    setWorkArea(148, 0, 0, 43);
  });
  afterEach(() => {
    Element.prototype.getBoundingClientRect = realRect;
    if (realOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', realOffsetWidth);
    if (realOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', realOffsetHeight);
    document.querySelectorAll('[data-dock]').forEach((el) => el.remove());
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('style');
  });

  it('names its controls for anyone not using a mouse', () => {
    frame();
    expect(screen.getByLabelText('Close Intelligence Dashboard')).toBeTruthy();
    expect(screen.getByLabelText('Minimize Intelligence Dashboard')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Intelligence Dashboard' })).toBeTruthy();
  });

  it('hides the body when minimised but keeps the header', () => {
    frame(panel({ isMinimized: true }));
    expect(screen.queryByText('panel body')).toBeNull();
    expect(screen.getByLabelText('Close Intelligence Dashboard')).toBeTruthy();
  });
});
