/**
 * The bar names Starcom's places in the language shown (decision D-ML): a name that is a word is
 * translated ("Fälle", "Missionen"), a product's name stays ("NetRunner"), and each description follows.
 */
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { setLanguage } from '../../../i18n/app/i18n';
import de from '../../../i18n/app/locales/de';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ currentApp: 'cybercommand', context: {}, navigateToApp: vi.fn() }),
}));

import MainBottomBar from '../MainBottomBar';

afterEach(async () => { vi.unstubAllGlobals(); await setLanguage('en', false); });

describe('MainBottomBar, in another language', () => {
  it('names each place in German, keeps product names, and describes each', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    await setLanguage('de', false);
    render(<MemoryRouter><MainBottomBar /></MemoryRouter>);
    expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fälle' }).getAttribute('title')).toBe(`Fälle\n${de.nav.apps.cases.description}`);
    expect(screen.getByRole('button', { name: 'Missionen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Globus' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'NetRunner' })).toBeTruthy();
  });
});
