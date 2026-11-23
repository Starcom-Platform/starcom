/**
 * Each screen names itself once (decision D-F, step 3.5).
 *
 * ApplicationRenderer drew a second header — icon, name and description — above every
 * standalone application, skipped for a hand-written list of application ids. The
 * list went stale: it still named `nodeweb`, which is not an id any more, and never
 * gained `cases`, so Cases named itself three times (the strip, this header, and its
 * own page title) and IntelWeb twice. The strip under the header names every screen,
 * so this one goes for all of them rather than for a list someone has to maintain.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const routerState = vi.hoisted(() => ({
  currentApp: 'cases' as string,
  presentationMode: 'standalone' as string,
}));

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({
    currentApp: routerState.currentApp,
    presentationMode: routerState.presentationMode,
    context: {},
    navigateToApp: vi.fn(),
    getApplication: (id: string) => ({
      id,
      name: id === 'cases' ? 'Cases' : 'IntelWeb',
      icon: '🗂️',
      description: 'Investigations: assemble reports into a position worth acting on',
      component: () => <div data-testid="the-application" />,
      defaultMode: 'standalone',
      supportedModes: ['standalone'],
    }),
  }),
}));

import { ApplicationRenderer } from '../ApplicationRenderer';

describe('ApplicationRenderer', () => {
  it('draws no header of its own above a standalone application', () => {
    routerState.currentApp = 'cases';
    const { container } = render(<ApplicationRenderer />);

    expect(container.querySelector('.application-header')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Cases' })).toBeNull();
  });

  it('draws none for an application no hand-written list happened to name', () => {
    // IntelWeb was missing from that list because it read `nodeweb`, its old id.
    routerState.currentApp = 'intelweb';
    const { container } = render(<ApplicationRenderer />);

    expect(container.querySelector('.application-header')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'IntelWeb' })).toBeNull();
  });
});
