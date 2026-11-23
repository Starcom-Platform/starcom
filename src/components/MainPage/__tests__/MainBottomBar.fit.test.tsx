/**
 * The bottom bar at widths its labels do not fit (decision D-F, step 3.2). Its
 * buttons show icons, the open application keeps its label, and every button still
 * says which application it opens.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ currentApp: 'cases', navigateToApp: vi.fn() }),
}));

import MainBottomBar from '../MainBottomBar';

let available = 1100;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return available; } });
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) { return this.dataset.labels === 'icons' ? 700 : 1213; },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
});

const renderBar = () => render(<MemoryRouter><MainBottomBar /></MemoryRouter>);

describe('MainBottomBar, when its labels do not fit', () => {
  it('shows icons', () => {
    available = 1100;
    const { container } = renderBar();
    expect(container.querySelector('[data-labels]')?.getAttribute('data-labels')).toBe('icons');
  });

  it('shows labels where they fit', () => {
    available = 1300;
    const { container } = renderBar();
    expect(container.querySelector('[data-labels]')?.getAttribute('data-labels')).toBe('shown');
  });

  it('names the application each button opens, on hover as well as to screen readers', () => {
    available = 1100;
    renderBar();
    for (const name of ['Globe', 'NetRunner', 'Cases', 'IntelDashboard', 'IntelAnalyzer', 'IntelWeb', 'Missions', 'MarketExchange']) {
      const button = screen.getByRole('button', { name });
      expect(button.getAttribute('title')?.startsWith(name)).toBe(true);
    }
  });
});
