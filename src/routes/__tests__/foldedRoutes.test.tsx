/**
 * The old standalone addresses fold into the applications (decision D-F, step 3.3).
 *
 * Six pages lived in a second layout behind a wallet sign-in, and sent anyone who
 * was not signed in to the globe without saying so. Three controls linked to one of
 * them, Ctrl+K's Cases entry among them, so a visitor who was not signed in ended up
 * back on the globe. Cases is a registered application now, and these addresses go
 * where they belong.
 *
 * No auth provider is mounted here on purpose: a gate on any of these would throw
 * "useAuth must be used within an AuthProvider" rather than redirect.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

// The globe's shell is what `/` renders, and it is not what this is about.
vi.mock('../../pages/MainPage/MainPage', () => ({ default: () => <div data-testid="shell" /> }));

import AppRoutes from '../routes';

/** Where the address ended up, read from the same router the routes ran in. */
const Where: React.FC = () => <span data-testid="where">{useLocation().pathname}</span>;

const landsOn = (from: string) => {
  const { unmount } = render(
    <MemoryRouter initialEntries={[from]}>
      <AppRoutes />
      <Where />
    </MemoryRouter>,
  );
  const where = screen.getByTestId('where').textContent;
  unmount();
  return where;
};

describe('the addresses that folded into the applications', () => {
  it('opens Cases for every address that meant a case or an investigation', () => {
    expect(landsOn('/cases-dashboard')).toBe('/app/cases');
    expect(landsOn('/case-manager')).toBe('/app/cases');
    expect(landsOn('/investigations')).toBe('/app/cases');
    expect(landsOn('/investigations/inv-1')).toBe('/app/cases');
    expect(landsOn('/cyber-investigation')).toBe('/app/cases');
  });

  it('opens IntelDashboard for the retired new-report form, which is where reports are written', () => {
    expect(landsOn('/team/team-1/new-report')).toBe('/app/inteldashboard');
  });

  it('sends the retired info pages to the globe, as /osint already was', () => {
    expect(landsOn('/info-gathering')).toBe('/');
    expect(landsOn('/info-analysis')).toBe('/');
    expect(landsOn('/osint')).toBe('/');
  });
});

// Plan item 1.2: a case page is a real address, not a catch-all redirect to the globe.
describe('record addresses inside an application', () => {
  it('keeps a case page address instead of sending it to the globe', () => {
    expect(landsOn('/app/cases/case-1')).toBe('/app/cases/case-1');
  });
});

// Plan item 4.1 (decision D5): the demo and test pages are retired. What they
// showed, Solana sign-in, token gates and on-chain roles, was removed before them.
describe('the retired demo and test pages', () => {
  it('sends each old address to the globe, as any unknown address goes', () => {
    for (const from of ['/auth-demo', '/enhanced-app-demo', '/test-ui', '/ux-test']) {
      expect(landsOn(from), from).toBe('/');
    }
  });
});

// Decision TX11: the credits open over the app at their own address, the globe kept beneath them.
describe('the credits address', () => {
  it("keeps /credits, with the app's shell drawn beneath, instead of sending it to the globe", () => {
    render(
      <MemoryRouter initialEntries={['/credits']}>
        <AppRoutes />
        <Where />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('where').textContent).toBe('/credits');
    expect(screen.getByTestId('shell')).toBeTruthy();
  });
});
