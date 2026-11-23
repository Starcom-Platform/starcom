/**
 * A report opened from its place's menu (K8; decisions BA8, BA9; plan block J,
 * item 4).
 *
 * The popup's Previous/Next ran on past the clicked place into every report on
 * the globe, and said nowhere how many were there. Opened from a place's menu,
 * it pages through that place's reports alone, says which of them this is, and
 * goes back to the menu. A report about a territory as a whole says so where a
 * placed one gives its coordinate: it names no point, so it is shown at none.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { IntelReportPopup } from '../IntelReportPopup';
import { IntelReportPopupPortal } from '../IntelReportPopupPortal';
import type { IntelReportOverlayMarker } from '../../../../interfaces/IntelReportOverlay';

vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
const report = (over: Partial<IntelReportOverlayMarker>): IntelReportOverlayMarker => ({
  pubkey: 'r1', title: 'A Report', content: 'Body', tags: [],
  latitude: 40.4, longitude: -82.7, timestamp: Date.UTC(2026, 9, 3, 12, 44), author: 'analyst',
  ...over,
});

describe('opened from a place\'s menu', () => {
  it('says which of the place\'s reports this is, and goes back to the menu', () => {
    const onBack = vi.fn();
    render(<MemoryRouter><IntelReportPopup report={report({})} visible onClose={vi.fn()} place={{ at: 2, of: 4, onBack }} /></MemoryRouter>);
    expect(screen.getByText('2 of 4 here')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the 4 reports here' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows the report's own glyph, as the globe draws it (SVG glyphs everywhere, 2026-10-08)", () => {
    render(<MemoryRouter><IntelReportPopup report={report({ tags: ['critical'] })} visible onClose={vi.fn()} /></MemoryRouter>);
    expect(screen.getByTestId('intel-report-glyph').dataset.glyph).toBe('critical');
  });

  it('says neither for a report opened on its own', () => {
    render(<MemoryRouter><IntelReportPopup report={report({})} visible onClose={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByText(/ of \d+ here/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Back to the/ })).not.toBeInTheDocument();
  });
});

describe('the portal, paging a place', () => {
  const place = [report({ pubkey: 'a', title: 'First' }), report({ pubkey: 'b', title: 'Second' }), report({ pubkey: 'c', title: 'Third' })];

  it('pages through what it is given, from the report picked, saying where it is', () => {
    render(<MemoryRouter><IntelReportPopupPortal reports={place} initialPubkey="b" onClose={vi.fn()} onBackToPlace={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('2 of 3 here')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next report' }));
    expect(screen.getByText('3 of 3 here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next report' })).toBeDisabled();
  });

  it('back to the menu closes the report first', () => {
    const order: string[] = [];
    render(<MemoryRouter><IntelReportPopupPortal reports={place} initialPubkey="a" onClose={() => order.push('close')} onBackToPlace={() => order.push('back')} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the 3 reports here' }));
    expect(order).toEqual(['close', 'back']);
  });

  it('no place line for a lone report, nor without a menu to go back to', () => {
    render(<MemoryRouter><IntelReportPopupPortal reports={[place[0]]} initialPubkey="a" onClose={vi.fn()} onBackToPlace={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByText(/ of \d+ here/)).not.toBeInTheDocument();
  });
});

describe('a report about a territory as a whole', () => {
  it('is said to be about it, and given no coordinate', () => {
    const { container } = render(<MemoryRouter><IntelReportPopup report={report({ aboutTerritories: ['Ohio'], geoPrecisionM: 280_000 })} visible onClose={vi.fn()} /></MemoryRouter>);
    const location = within(screen.getByText('Location').parentElement as HTMLElement);
    expect(location.getByText('About Ohio as a whole')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/40\.4|82\.7/);
  });

  it('names every territory it is about', () => {
    render(<MemoryRouter><IntelReportPopup report={report({ aboutTerritories: ['Palestine', 'Israel'] })} visible onClose={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText('About Palestine and Israel as a whole')).toBeInTheDocument();
  });
});
