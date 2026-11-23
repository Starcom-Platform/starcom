/**
 * The bottom bar opens an application and hands it nothing. An application
 * handed something mounts afresh to open it (ApplicationRenderer.handoff), and
 * the bar handed every application a context nobody read, so choosing the
 * Globe from the Globe would have built the globe again.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const navigateToApp = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ currentApp: 'cybercommand', context: {} as Record<string, unknown> }));
vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ currentApp: router.currentApp, context: router.context, navigateToApp }),
}));

import MainBottomBar from '../MainBottomBar';

describe('MainBottomBar', () => {
  it('opens the application chosen and hands it nothing', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    render(<MemoryRouter><MainBottomBar /></MemoryRouter>);
    fireEvent.click(screen.getAllByRole('button', { name: /Globe/ })[0]);
    expect(navigateToApp).toHaveBeenCalledTimes(1);
    const [app, , context] = navigateToApp.mock.calls[0];
    expect(app).toBe('cybercommand');
    expect(Object.keys(context ?? {})).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('shows every destination the registry lists, by its name and description (plan item 4.6)', async () => {
    const { DESTINATIONS } = await import('../../Router/EnhancedApplicationRouter');
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    render(<MemoryRouter><MainBottomBar /></MemoryRouter>);
    for (const d of DESTINATIONS) {
      const button = screen.getByRole('button', { name: d.label });
      expect(button.getAttribute('title'), d.key).toBe(`${d.label}\n${d.description}`);
    }
    vi.unstubAllGlobals();
  });

  it('opens Missions plain: the app opens on its missions tab itself (K1)', () => {
    navigateToApp.mockClear();
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    render(<MemoryRouter><MainBottomBar /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Missions' }));
    expect(navigateToApp).toHaveBeenCalledWith('teamworkspace');
    expect(screen.queryByRole('button', { name: 'OpsCenter' })).toBeNull();
    vi.unstubAllGlobals();
  });

  it('marks Missions as open whichever of its tabs is showing', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    try {
      router.currentApp = 'teamworkspace';
      for (const context of [{ initialTab: 'missions' }, { initialTab: 'chat' }, {}]) {
        router.context = context;
        const { unmount } = render(<MemoryRouter><MainBottomBar /></MemoryRouter>);
        expect(screen.getByRole('button', { name: 'Missions' }).getAttribute('aria-current')).toBe('page');
        unmount();
      }
    } finally {
      router.currentApp = 'cybercommand';
      router.context = {};
      vi.unstubAllGlobals();
    }
  });

  // BD10: each app's marker in the bar wears its section's tint.
  it("marks each app with its section's tint", () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    render(<MemoryRouter><MainBottomBar /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Missions' }).style.getPropertyValue('--section-tint')).toBe('var(--sc-tint-assemble)');
    expect(screen.getByRole('button', { name: 'Cases' }).style.getPropertyValue('--section-tint')).toBe('var(--sc-tint-investigate)');
    vi.unstubAllGlobals();
  });
});

