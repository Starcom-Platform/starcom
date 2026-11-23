/**
 * The credits (decisions TX8, TX11, TX12): who made what Starcom draws, opened over the app
 * from Settings and at /credits, listing every image and data source from the same lists
 * the cards' credits come from.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PopupProvider } from '../../Popup/PopupManager';
import CreditsRoot from '../CreditsRoot';
import { CreditsDialog } from '../CreditsDialog';
import { openCredits } from '../creditsEvents';
import { IMAGERY } from '../../../globe-engine/imagery';
import { CREDITS } from '../../../features/globe/capture/sourceCredits';
import { MainSettings } from '../../Settings/MainSettings';

const Where: React.FC = () => <span data-testid="where">{useLocation().pathname}</span>;

const app = (at: string) => render(
  <MemoryRouter initialEntries={[at]}>
    <PopupProvider>
      <Routes><Route path="*" element={null} /></Routes>
      <CreditsRoot />
      <Where />
    </PopupProvider>
  </MemoryRouter>,
);

describe('the credits dialog', () => {
  it('lists every image the globe draws: what it is, its maker linked, its licence linked, and what Starcom changed', () => {
    render(<CreditsDialog onClose={() => {}} />);
    for (const [id, image] of Object.entries(IMAGERY)) {
      const row = screen.getByTestId(`credits-image-${id}`);
      expect(row.textContent, id).toContain(image.what);
      expect(row.textContent, id).toContain(image.changes);
      const maker = within(row).getByRole('link', { name: image.source.keyText ?? image.source.text });
      expect(maker.getAttribute('href'), id).toBe(image.source.url);
      if ('licence' in image.source) {
        expect(within(row).getByRole('link', { name: image.source.licence.name }).getAttribute('href'), id).toBe(image.source.licence.url);
      }
    }
    expect(screen.getByText(/NASA does not endorse Starcom/)).toBeTruthy();
  });

  it('lists every data source a card credits, linked where it has a page', () => {
    render(<CreditsDialog onClose={() => {}} />);
    for (const [id, credit] of Object.entries(CREDITS)) {
      const row = screen.getByTestId(`credits-data-${id}`);
      const name = 'keyText' in credit ? credit.keyText : credit.text;
      expect(row.textContent, id).toContain(name);
      if ('url' in credit) expect(within(row).getByRole('link', { name }).getAttribute('href'), id).toBe(credit.url);
    }
  });
});

describe('opening the credits', () => {
  it('opens as a dialog named Credits when anything asks, over the app, and leaves the address as it was', () => {
    app('/');
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => openCredits());
    const dialog = screen.getByRole('dialog', { name: 'Credits' });
    expect(within(dialog).getByRole('heading', { name: 'Credits' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('where').textContent).toBe('/');
  });

  it('opens at the address /credits, once, and closing it returns the address to the app', () => {
    app('/credits');
    expect(screen.getAllByRole('dialog', { name: 'Credits' })).toHaveLength(1);
    act(() => openCredits());
    expect(screen.getAllByRole('dialog', { name: 'Credits' })).toHaveLength(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('where').textContent).toBe('/');
  });

  it('opens from Settings, which closes as the credits open', () => {
    let closed = false;
    app('/');
    render(<MainSettings onClose={() => { closed = true; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Credits' }));
    expect(closed).toBe(true);
    expect(screen.getByRole('dialog', { name: 'Credits' })).toBeTruthy();
  });
});
