/**
 * The Intel Reports settings (BA4): the report cap, to choose before anything
 * is cut, kept as the person's own setting.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

const settings = vi.hoisted(() => ({ maxReports: 50 as number | null, categoryEmblems: undefined as boolean | undefined, lenses: undefined as unknown, updateIntelReports: vi.fn() }));
vi.mock('../../../../hooks/useCyberCommandSettings', () => ({
  useCyberCommandSettings: () => ({
    config: { intelReports: {
      maxReports: settings.maxReports,
      ...(settings.categoryEmblems === undefined ? {} : { categoryEmblems: settings.categoryEmblems }),
      ...(settings.lenses === undefined ? {} : { lenses: settings.lenses }),
    } },
    updateIntelReports: settings.updateIntelReports,
  }),
}));

import IntelReportsSettingsPopup from '../IntelReportsSettingsPopup';
import { setReportCapOverride } from '../../../../services/intel/reportCap';
import { setReportLookOverride } from '../../../../services/intel/reportLook';

beforeEach(() => {
  settings.maxReports = 50;
  settings.categoryEmblems = undefined;
  settings.lenses = undefined;
  settings.updateIntelReports.mockReset();
  setReportCapOverride(undefined);
  setReportLookOverride(undefined);
});
afterEach(() => { setReportCapOverride(undefined); setReportLookOverride(undefined); });

describe('IntelReportsSettingsPopup', () => {
  it('shows the person\'s cap and keeps what they choose', () => {
    render(<IntelReportsSettingsPopup onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Intel Reports' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '50' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Unlimited' }));
    expect(settings.updateIntelReports).toHaveBeenCalledWith({ maxReports: null });
  });

  it('says when this page\'s share handle has set the cap, as it changes', () => {
    render(<IntelReportsSettingsPopup onClose={vi.fn()} />);
    expect(screen.queryByText(/set for this page by the share handle/i)).not.toBeInTheDocument();
    act(() => setReportCapOverride(1000));
    expect(screen.getByText(/set for this page by the share handle/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Max (1,000)' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the category emblems on unless turned off, and keeps what the person chooses (BA15)', () => {
    render(<IntelReportsSettingsPopup onClose={vi.fn()} />);
    const toggle = screen.getByRole('checkbox', { name: 'Category emblems' });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(settings.updateIntelReports).toHaveBeenCalledWith({ categoryEmblems: false });
  });

  it('says what an emblem is, and when this page\'s share handle has set them', () => {
    settings.categoryEmblems = false;
    render(<IntelReportsSettingsPopup onClose={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Category emblems' })).not.toBeChecked();
    expect(screen.getByText(/what its report is about.*colour still says how it was assessed/i)).toBeInTheDocument();
    act(() => setReportLookOverride({ emblems: true }));
    expect(screen.getByText(/share handle has turned them on for this page/i)).toBeInTheDocument();
    // The person's own choice is what the box shows; the page's is said beside it.
    expect(screen.getByRole('checkbox', { name: 'Category emblems' })).not.toBeChecked();
  });

  it('closes', () => {
    const onClose = vi.fn();
    render(<IntelReportsSettingsPopup onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close Intel Reports settings' }));
    expect(onClose).toHaveBeenCalled();
  });

  /* The big-three lenses (D-CT, CT5): All, then TCS, IDC and CBC, any together, kept with the settings. */
  it('offers All and the three lenses by their full names, All chosen when nothing is', () => {
    render(<IntelReportsSettingsPopup onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['Transnational Crime Syndicates', 'International Death Cults', 'Cabals of Banking Cartels']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name })).toHaveAttribute('title', name);
    }
    expect(screen.getByText('A lens sorts; it never asserts that a syndicate, cult or cabal exists.')).toBeInTheDocument();
  });

  it('keeps the lenses chosen, more than one, and All clears them', () => {
    settings.lenses = ['idc'];
    render(<IntelReportsSettingsPopup onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'International Death Cults' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/only reports sorted under International Death Cults/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Transnational Crime Syndicates' }));
    expect(settings.updateIntelReports).toHaveBeenLastCalledWith({ lenses: ['tcs', 'idc'] });
    fireEvent.click(screen.getByRole('button', { name: 'International Death Cults' }));
    expect(settings.updateIntelReports).toHaveBeenLastCalledWith({ lenses: [] });
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(settings.updateIntelReports).toHaveBeenLastCalledWith({ lenses: [] });
  });

  it('reads a stored choice it does not know as All', () => {
    settings.lenses = ['bogus', 7];
    render(<IntelReportsSettingsPopup onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  });
});
