/**
 * An application screen publishes its own area for what is docked (decision D-F,
 * step 3.2), and leaves the globe's to the globe's layout, which publishes the area
 * inside its HUD.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

const app = vi.hoisted(() => ({ current: 'cases' as string }));
vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ currentApp: app.current }),
}));

import MainCenter from '../MainCenter';

const strut = (n: string) => document.documentElement.style.getPropertyValue(n);

describe('MainCenter', () => {
  const realRect = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    window.innerWidth = 1280;
    window.innerHeight = 720;
    document.documentElement.removeAttribute('style');
    Element.prototype.getBoundingClientRect = function () {
      return { top: 100, left: 0, right: 1280, bottom: 677, width: 1280, height: 577, x: 0, y: 100, toJSON: () => ({}) } as DOMRect;
    };
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = realRect;
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('style');
  });

  it("publishes an application screen's own area", () => {
    app.current = 'cases';
    render(<MainCenter />);

    expect(strut('--work-top')).toBe('100px');
    expect(strut('--work-bottom')).toBe('43px');
  });

  it("leaves the globe's work area to the globe's layout", () => {
    app.current = 'cybercommand';
    render(<MainCenter />);

    expect(strut('--work-top')).toBe('');
  });
});
