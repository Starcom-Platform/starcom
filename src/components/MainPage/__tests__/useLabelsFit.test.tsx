/**
 * Whether the bottom bar's labels fit, or its buttons show icons (decision D-F,
 * step 3.2). At 1280 wide the bar needed 120 px more than it had, and cut
 * MarketExchange to "Mark".
 *
 * jsdom lays nothing out, so each test says how wide the bar is and how wide its
 * content is, with labels and with icons.
 */
import React, { useRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useLabelsFit } from '../useLabelsFit';

let withLabels = 1213;
const WITH_ICONS = 700;
let available = 1300;
let notify: () => void = () => {};

/** Every render's answer, so a flash of labels between two measurements shows up. */
let rendered: boolean[] = [];

const Bar = () => {
  const ref = useRef<HTMLDivElement>(null);
  const fits = useLabelsFit(ref);
  rendered.push(fits);
  return <div ref={ref} data-testid="bar" data-labels={fits ? 'shown' : 'icons'} />;
};

const labels = () => screen.getByTestId('bar').getAttribute('data-labels');

beforeEach(() => {
  withLabels = 1213;
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { notify = callback; }
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return available; } });
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) { return this.dataset.labels === 'icons' ? WITH_ICONS : withLabels; },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
});

describe('useLabelsFit', () => {
  it('shows labels when they fit', () => {
    available = 1300;
    render(<Bar />);
    expect(labels()).toBe('shown');
  });

  it('shows icons when the labels do not fit', () => {
    available = 1100;
    render(<Bar />);
    expect(labels()).toBe('icons');
  });

  it('stays on icons, though the icons alone would fit, without flashing the labels', () => {
    // Measured with the labels hidden, the row looks wide enough for them; brought
    // back, they would not fit and be hidden again, a flicker on every resize.
    available = 1100;
    render(<Bar />);
    rendered = [];

    act(() => notify());

    expect(labels()).toBe('icons');
    expect(rendered).not.toContain(true);
  });

  it('shows labels again once the bar is wide enough for them', () => {
    available = 1100;
    render(<Bar />);

    available = 1300;
    act(() => notify());

    expect(labels()).toBe('shown');
  });

  it('goes back to icons if the labels grew while they were hidden', () => {
    available = 1100;
    render(<Bar />);

    withLabels = 1400;
    available = 1300;
    act(() => notify());

    expect(labels()).toBe('icons');
  });
});
