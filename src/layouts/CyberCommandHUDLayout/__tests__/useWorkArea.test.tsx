/**
 * The struts are only useful if they are true.
 *
 * A consumer writes `top: var(--work-top)` and gets whatever this hook last
 * published. If it publishes a stale rect, or nothing, the component lands under
 * the chrome — the exact failure it was written to end, but now centralised.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import { useWorkArea } from '../useWorkArea';

/** jsdom gives every element a zero rect, so the rect is supplied per test. */
const withRect = (rect: Partial<DOMRect>) => {
  Element.prototype.getBoundingClientRect = function () {
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0,
             toJSON: () => ({}), ...rect } as DOMRect;
  };
};

const Probe = () => {
  const ref = useWorkArea();
  return <div ref={ref} />;
};

const strut = (n: string) => document.documentElement.style.getPropertyValue(n);

describe('useWorkArea', () => {
  const realRect = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    // jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class {
      observe() {} unobserve() {} disconnect() {}
    });
    window.innerWidth = 1280;
    window.innerHeight = 800;
    document.documentElement.removeAttribute('style');
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = realRect;
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('style');
  });

  it('publishes insets measured from the viewport edge', () => {
    withRect({ top: 48, left: 68, right: 1248, bottom: 800, width: 1180, height: 752 });
    render(<Probe />);

    expect(strut('--work-top')).toBe('48px');
    expect(strut('--work-left')).toBe('68px');
    // Insets, not coordinates: a consumer writes `right: var(--work-right)`.
    expect(strut('--work-right')).toBe('32px');
    expect(strut('--work-bottom')).toBe('0px');
    expect(strut('--work-width')).toBe('1180px');
    expect(strut('--work-height')).toBe('752px');
  });

  it('republishes when the viewport changes', () => {
    withRect({ top: 48, left: 68, right: 1248, bottom: 800, width: 1180, height: 752 });
    render(<Probe />);
    expect(strut('--work-left')).toBe('68px');

    // A sub-rail toggle moves the element without resizing the viewport; a
    // resize is the coarser case and the one ResizeObserver cannot be relied on
    // for, since the element only moves.
    withRect({ top: 48, left: 32, right: 1248, bottom: 800, width: 1216, height: 752 });
    act(() => { window.dispatchEvent(new Event('resize')); });

    expect(strut('--work-left')).toBe('32px');
    expect(strut('--work-width')).toBe('1216px');
  });

  it('rounds, so a subpixel rect does not thrash the DOM', () => {
    withRect({ top: 47.6, left: 68.2, right: 1248, bottom: 800, width: 1179.8, height: 752.4 });
    render(<Probe />);
    expect(strut('--work-top')).toBe('48px');
    expect(strut('--work-left')).toBe('68px');
    expect(strut('--work-width')).toBe('1180px');
  });

  it('publishes nothing from a rect that has not been laid out, then publishes the real one', () => {
    // While the preloader is up the shell has no size. Publishing then put the
    // whole viewport width into --work-right, and anything placed from it
    // collapsed to nothing.
    withRect({});
    render(<Probe />);
    expect(strut('--work-right')).toBe('');
    expect(strut('--work-width')).toBe('');

    withRect({ top: 48, left: 68, right: 1248, bottom: 800, width: 1180, height: 752 });
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(strut('--work-right')).toBe('32px');
  });

  it('leaves the struts standing after unmount', () => {
    // Clearing them on unmount would collapse every consumer to zero during a
    // route change — every fixed widget jumping under the chrome for a frame.
    withRect({ top: 48, left: 68, right: 1248, bottom: 800, width: 1180, height: 752 });
    const { unmount } = render(<Probe />);
    unmount();
    expect(strut('--work-top')).toBe('48px');
  });
});
