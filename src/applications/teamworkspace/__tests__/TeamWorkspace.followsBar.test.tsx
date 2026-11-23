/**
 * The tab and the bar agree (plan item 4.6). The app read its tab only on
 * mounting, so choosing it from the bar while on another tab left that tab on
 * screen. Since K1 the app is named Missions and opens on its missions tab.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TeamWorkspaceApplication from '../TeamWorkspaceApplication';
import { EnhancedApplicationRouterContext } from '../../../context/EnhancedApplicationRouterContext';
import type { EnhancedApplicationRouterContextType } from '../../../components/Router/EnhancedApplicationRouter';

vi.mock('../../../communication/context/useSecureChat', () => ({
  useSecureChat: () => ({ chatProvider: { getMessages: async () => [], subscribeToMessages: () => () => {} }, sendMessage: vi.fn(), createChannel: vi.fn() }),
}));

const current = () => screen.getAllByRole('button').find((b) => b.getAttribute('aria-current') === 'page')?.textContent?.trim().toLowerCase();

describe('Missions follows the bar, and the bar follows Missions', () => {
  it('shows the tab it is handed, even when already open', async () => {
    const { rerender } = render(<MemoryRouter><TeamWorkspaceApplication initialTab="missions" /></MemoryRouter>);
    await screen.findByRole('button', { name: /^missions$/i, current: 'page' });
    // Let the Missions tab finish reading before leaving it, so nothing it
    // started is still running when the test ends.
    await screen.findByText(/No missions yet/i);
    rerender(<MemoryRouter><TeamWorkspaceApplication initialTab="overview" /></MemoryRouter>);
    await screen.findByRole('button', { name: /^overview$/i, current: 'page' });
    expect(current()).toBe('overview');
  });

  it('opens on the missions tab when the bar hands it nothing (K1)', async () => {
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await screen.findByRole('button', { name: /^missions$/i, current: 'page' });
    await screen.findByText(/No missions yet/i);
    // The tab it now opens on heads itself at level 2, like the other tabs:
    // its h6 skipped four levels under the screen's h1.
    expect(screen.getByRole('heading', { name: 'Missions' }).tagName).toBe('H2');
  });

  it('tells the router which tab is showing', async () => {
    const setContext = vi.fn();
    const router = { setContext } as unknown as EnhancedApplicationRouterContextType;
    render(
      <EnhancedApplicationRouterContext.Provider value={router}>
        <MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>
      </EnhancedApplicationRouterContext.Provider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /^missions$/i }));
    expect(setContext).toHaveBeenLastCalledWith('initialTab', 'missions');
    await screen.findByText(/No missions yet/i);
    fireEvent.click(screen.getByRole('button', { name: /^chat$/i }));
    expect(setContext).toHaveBeenLastCalledWith('initialTab', 'chat');
  });
});
