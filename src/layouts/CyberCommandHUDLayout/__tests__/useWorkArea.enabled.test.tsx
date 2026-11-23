/**
 * One screen at a time owns the work area (decision D-F, step 3.2).
 *
 * Only the globe's layout published it, so on an application screen everything
 * docked read the fallback numbers, a 48 px bar above and nothing below: the chat's
 * warning sat over the strip under the header and its button over SUPPORT OPS. An
 * application screen now publishes its own area too, and while the globe is showing
 * its layout is the one that does.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { useWorkArea } from '../useWorkArea';

const Screen = ({ enabled }: { enabled: boolean }) => {
  const ref = useWorkArea({ enabled });
  return <div ref={ref} />;
};

const strut = (n: string) => document.documentElement.style.getPropertyValue(n);

describe('useWorkArea, for the screen that owns the work area', () => {
  const realRect = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    window.innerWidth = 1280;
    window.innerHeight = 720;
    document.documentElement.removeAttribute('style');
    // An application screen at 1280×720: 100 px of header and strip above, 43 px of
    // bottom bar below.
    Element.prototype.getBoundingClientRect = function () {
      return { top: 100, left: 0, right: 1280, bottom: 677, width: 1280, height: 577, x: 0, y: 100, toJSON: () => ({}) } as DOMRect;
    };
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = realRect;
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('style');
  });

  it('publishes nothing while another screen owns it', () => {
    render(<Screen enabled={false} />);

    expect(strut('--work-top')).toBe('');
    expect(strut('--work-bottom')).toBe('');
  });

  it('publishes its area once it owns it', () => {
    const { rerender } = render(<Screen enabled={false} />);

    rerender(<Screen enabled />);

    expect(strut('--work-top')).toBe('100px');
    expect(strut('--work-bottom')).toBe('43px');
    expect(strut('--work-height')).toBe('577px');
  });
});
