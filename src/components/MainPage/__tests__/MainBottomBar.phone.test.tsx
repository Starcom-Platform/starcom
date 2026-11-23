/**
 * On a phone the bar is the five-button one (K2); elsewhere, the full bar.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const navigateToApp = vi.hoisted(() => vi.fn());
vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ currentApp: 'cybercommand', context: {}, navigateToApp }),
}));

import MainBottomBar from '../MainBottomBar';

const phone = (matches: boolean) => vi.stubGlobal('matchMedia', vi.fn(() => ({
  matches, media: '', addEventListener: () => {}, removeEventListener: () => {},
})));

afterEach(() => vi.unstubAllGlobals());

describe('MainBottomBar on a phone', () => {
  it('is the five-button bar, which opens apps plain', () => {
    phone(true);
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    render(<MemoryRouter><MainBottomBar /></MemoryRouter>);
    expect(screen.getByTestId('phone-bar')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'IntelWeb' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Missions' }));
    expect(navigateToApp).toHaveBeenCalledWith('teamworkspace');
  });

  it('is the full bar on a wider window', () => {
    phone(false);
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    render(<MemoryRouter><MainBottomBar /></MemoryRouter>);
    expect(screen.queryByTestId('phone-bar')).toBeNull();
    expect(screen.getByRole('button', { name: 'IntelWeb' })).toBeTruthy();
  });
});
