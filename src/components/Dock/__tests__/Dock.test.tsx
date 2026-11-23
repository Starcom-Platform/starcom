/**
 * The dock's job is that arrangement stops depending on mount order. These
 * tests are mostly about that one claim.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { DockHost, CORNERS } from '../DockHost';
import { Docked } from '../Docked';
import { DOCK_SLOTS } from '../dockOrder';

const inDock = (corner: string) =>
  Array.from(
    document.querySelector(`[data-dock="${corner}"]`)?.children ?? [],
  ) as HTMLElement[];

describe('DockHost', () => {
  it('provides every corner, and the top centre', () => {
    render(<DockHost />);
    for (const c of CORNERS) {
      expect(document.querySelector(`[data-dock="${c}"]`)).toBeTruthy();
    }
  });

  it('renders its children', () => {
    render(<DockHost><span>app</span></DockHost>);
    expect(screen.getByText('app')).toBeTruthy();
  });
});

describe('DockHost — the docks on one side', () => {
  const root = () => document.documentElement.style;

  afterEach(() => {
    vi.unstubAllGlobals();
    root().removeProperty('--dock-bottom-left-space');
    root().removeProperty('--dock-bottom-right-space');
    root().removeProperty('--dock-top-left-fixed');
    root().removeProperty('--dock-top-right-fixed');
    root().removeProperty('--dock-bottom-right-width');
  });

  it('tells the dock above how much room the dock below it takes', () => {
    // With the pipeline guide open, the top-right dock reached down over the
    // bottom-right one and covered the Layers button (decision D-F, step 3). A top
    // dock stops short of what the bottom dock on its side holds.
    const notifyAll: Array<() => void> = [];
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { notifyAll.push(callback); }
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    render(<DockHost />);
    const bottomRight = document.querySelector('[data-dock="bottom-right"]') as HTMLElement;
    const sized = (height: number) => {
      bottomRight.getBoundingClientRect = () =>
        ({ height, width: 60, top: 0, left: 0, right: 60, bottom: height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
      act(() => notifyAll.forEach((notify) => notify()));
    };

    sized(84);
    // Its height, and the gap between the two.
    expect(root().getPropertyValue('--dock-bottom-right-space')).toBe('92px');
    expect(root().getPropertyValue('--dock-bottom-left-space')).toBe('0px');
    // And its width, which the bottom-left dock leaves it (K2): capped at half
    // the work area, the left column wrapped a line to a word on a phone.
    expect(root().getPropertyValue('--dock-bottom-right-width')).toBe('68px');

    sized(0);
    // An empty dock takes no room, and leaves no gap.
    expect(root().getPropertyValue('--dock-bottom-right-space')).toBe('0px');
    expect(root().getPropertyValue('--dock-bottom-right-width')).toBe('0px');
  });

  it('tells the dock below how much room the dock above keeps for what cannot shrink', () => {
    // At 1280×720 the bottom-left column ran up over the clock and the minimap
    // (BD4). A bottom dock stops short of the top dock's fixed slots on its side;
    // a slot that fits the dock is left out, since it gives way itself.
    const notifyAll: Array<() => void> = [];
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { notifyAll.push(callback); }
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    render(
      <DockHost>
        <Docked slot="globeOrientation"><span>clock</span></Docked>
        <Docked slot="notifications"><span>note</span></Docked>
        <Docked slot="newUserHint"><span>guide</span></Docked>
      </DockHost>,
    );
    const sized = (el: Element, height: number) => {
      (el as HTMLElement).getBoundingClientRect = () =>
        ({ height, width: 60, top: 0, left: 0, right: 60, bottom: height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    };
    for (const slot of inDock('top-left')) sized(slot, 180);
    for (const slot of inDock('top-right')) sized(slot, slot.dataset.dockSlot === 'newUserHint' ? 400 : 50);
    act(() => notifyAll.forEach((notify) => notify()));

    // Each fixed slot, and the gap after it.
    expect(root().getPropertyValue('--dock-top-left-fixed')).toBe('188px');
    expect(root().getPropertyValue('--dock-top-right-fixed')).toBe('58px');
  });

  it('stops saying so once it goes', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    const { unmount } = render(<DockHost />);

    unmount();

    expect(root().getPropertyValue('--dock-bottom-right-space')).toBe('');
    expect(root().getPropertyValue('--dock-top-left-fixed')).toBe('');
    expect(root().getPropertyValue('--dock-bottom-right-width')).toBe('');
  });
});

describe('Docked', () => {
  it('puts a component in the corner the registry names', () => {
    render(
      <DockHost>
        <Docked slot="globeLayerCount"><span>chip</span></Docked>
      </DockHost>,
    );
    // dockOrder.ts says bottom-right; the call site never named a corner.
    expect(inDock('bottom-right')).toHaveLength(1);
    expect(inDock('top-right')).toHaveLength(0);
  });

  it('arranges by declared order, not mount order', () => {
    // The whole point. These mount last-first and must still come out 10, 20, 30.
    render(
      <DockHost>
        <Docked slot="newUserHint"><span>last</span></Docked>
        <Docked slot="notifications"><span>first</span></Docked>
        <Docked slot="adaptiveUI"><span>middle</span></Docked>
      </DockHost>,
    );

    const slots = inDock('top-right');
    expect(slots).toHaveLength(3);
    // CSS `order` does the visual arrangement; the attribute is what a test —
    // and a person reading the DOM — can actually see, since jsdom computes no
    // layout.
    const declared = slots.map((s) => Number(s.dataset.dockOrder));
    expect([...declared].sort((a, b) => a - b)).toEqual([
      DOCK_SLOTS.notifications.order,
      DOCK_SLOTS.adaptiveUI.order,
      DOCK_SLOTS.newUserHint.order,
    ]);
    for (const s of slots) expect(s.style.order).toBe(String(s.dataset.dockOrder));
  });

  it('keeps the docked component in its own React tree', () => {
    // A component moved into a dock must not lose the context it reads — that
    // is why this portals rather than requiring components to become children
    // of a layout element.
    const Ctx = React.createContext('unset');
    const Reader = () => <span>{React.useContext(Ctx)}</span>;

    render(
      <DockHost>
        <Ctx.Provider value="still here">
          <Docked slot="notifications"><Reader /></Docked>
        </Ctx.Provider>
      </DockHost>,
    );

    expect(screen.getByText('still here')).toBeTruthy();
  });

  it('lets a slot the registry marks take only the height left in its dock', () => {
    // A docked panel taller than what its corner had left ran past the globe's
    // area: at 1280×720 the pipeline guide covered the bottom bar (decision D-F,
    // step 3). jsdom computes no layout, so this checks the attribute the CSS
    // keys on; the layout audit measures the rest.
    render(
      <DockHost>
        <Docked slot="newUserHint"><span>guide</span></Docked>
        <Docked slot="notifications"><span>note</span></Docked>
      </DockHost>,
    );

    const slot = (name: string) => inDock('top-right').find((s) => s.dataset.dockSlot === name)!;
    expect(slot('newUserHint').dataset.dockFit).toBe('true');
    expect(slot('notifications').dataset.dockFit).toBeUndefined();
  });

  it('renders in place, and says so, with no host above it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Docked slot="notifications"><span>orphan</span></Docked>);

    // Unpositioned, but present. Returning null here made an existing
    // NewUserHint test fail on a missing button — a failure that points nowhere
    // near a dock. Adopting <Docked> must never remove content from a page.
    expect(screen.getByText('orphan')).toBeTruthy();
    if (import.meta.env.DEV) expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  afterEach(() => vi.restoreAllMocks());
});

describe('DOCK_SLOTS', () => {
  const byCorner = (c: string) =>
    Object.values(DOCK_SLOTS).filter((s) => s.corner === c).map((s) => s.order);

  it('gives every slot in a corner a distinct place', () => {
    // Across corners the numbers may repeat — order only means anything within
    // the flex container it belongs to.
    for (const c of ['top-right', 'bottom-right', 'top-left', 'bottom-left', 'top-center']) {
      const o = byCorner(c);
      expect(new Set(o).size, c).toBe(o.length);
    }
  });

  it('puts notifications nearest the corner', () => {
    // Deliberate exception to "persistent things nearest": on a short viewport a
    // notification stacked under four status chips is one nobody reads.
    expect(Math.min(...byCorner('top-right'))).toBe(DOCK_SLOTS.notifications.order);
  });

  it('puts first-run onboarding last', () => {
    expect(Math.max(...byCorner('top-right'))).toBe(DOCK_SLOTS.newUserHint.order);
  });

  it('leaves room to insert without renumbering', () => {
    for (const c of ['top-right', 'bottom-right']) {
      const o = byCorner(c).sort((a, b) => a - b);
      for (let i = 1; i < o.length; i++) expect(o[i] - o[i - 1]).toBeGreaterThanOrEqual(10);
    }
  });

  it('keeps no slot for the intelligence engine status, which reported on an engine that found nothing (plan item 4.3)', () => {
    expect(Object.keys(DOCK_SLOTS)).not.toContain('intelEngineStatus');
  });
});
