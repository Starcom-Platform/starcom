/**
 * Support Ops lives in the bottom navigation bar, and asks the funnel to open.
 *
 * It was a button fixed to the bottom-right corner of every screen, so it sat
 * over whatever each screen put there. Measured in the running app at 1400px:
 * a Cases row's View, Edit, Connections, Show on the globe and Delete buttons
 * and its next-page button, and the globe's LIVE button. The bar never overlaps
 * a screen's content.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SupportFunnelRoot from '../SupportFunnelRoot';
import MainBottomBar from '../../MainPage/MainBottomBar';
import { openSupportFunnel } from '../supportFunnelEvents';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ currentApp: 'cybercommand', navigateToApp: vi.fn() }),
}));

describe('Support Ops — an entry in the bar, not a button over the page', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubEnv('VITE_SUPPORT_FUNNEL_ENABLED', 'true');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('draws no entry of its own over the page, and opens when asked', () => {
    render(<SupportFunnelRoot />);
    expect(screen.queryByRole('button', { name: /support the mission/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /close support modal/i })).toBeNull();

    act(() => openSupportFunnel());
    expect(screen.getByRole('button', { name: /close support modal/i })).toBeTruthy();
  });

  it('puts the entry in the bottom navigation bar, and the entry opens the funnel', () => {
    render(
      <MemoryRouter>
        <MainBottomBar />
        <SupportFunnelRoot />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Main Navigation' });
    fireEvent.click(within(nav).getByRole('button', { name: /support the mission/i }));
    expect(screen.getByRole('button', { name: /close support modal/i })).toBeTruthy();
  });
});
