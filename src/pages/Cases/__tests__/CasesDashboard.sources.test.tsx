/**
 * A case's sources on its page (decision D-DP, DP7): the articles it rests on, each its outlet, linked,
 * and when it was reported where known; added by link, taken off, and kept. Real persistence, as the
 * linked-evidence suite.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CasesDashboard from '../CasesDashboard';
import { intelCaseService } from '../../../services/intel/IntelCaseService';
import { caseManagerAdapter } from '../../../core/intel/adapters/caseManagerAdapter';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));

async function openCase(title: string) {
  await screen.findByText(title);
  fireEvent.click(screen.getByRole('button', { name: `View ${title}` }));
  return screen.findByTestId('case-detail');
}

describe('CasesDashboard — a case\'s sources', () => {
  afterEach(() => vi.restoreAllMocks());

  it('adds an article by its link, shows its outlet, and takes it off', async () => {
    const title = `Sources ${Date.now()}`;
    await caseManagerAdapter.addCase({ title, description: 'Body' });
    render(<CasesDashboard />);
    const page = await openCase(title);
    expect(within(page).getByTestId('no-articles')).toBeInTheDocument();

    fireEvent.change(within(page).getByLabelText('Link to an article'), { target: { value: 'https://www.reuters.com/world/egypt-talks' } });
    fireEvent.click(within(page).getByRole('button', { name: 'Add article' }));
    const link = await within(page).findByRole('link', { name: /reuters\.com/ });
    expect(link).toHaveAttribute('href', 'https://www.reuters.com/world/egypt-talks');
    await waitFor(async () => {
      const saved = (await intelCaseService.listCases()).find((c) => c.title === title)!;
      expect(saved.sources?.map((s) => s.url)).toEqual(['https://www.reuters.com/world/egypt-talks']);
    });

    fireEvent.click(within(page).getByRole('button', { name: 'Remove reuters.com' }));
    await waitFor(() => expect(within(page).getByTestId('no-articles')).toBeInTheDocument());
  });

  it('shows the articles a case was started on, with when each was reported', async () => {
    const title = `Seeded ${Date.now()}`;
    await caseManagerAdapter.addCase({
      title, description: 'Body',
      sources: [{ url: 'https://tass.ru/politics/1', reportedAt: '2026-10-13T09:15:00Z' }],
    });
    render(<CasesDashboard />);
    const page = await openCase(title);
    const row = await within(page).findByTestId('case-article');
    expect(row).toHaveTextContent('tass.ru');
    expect(row).toHaveTextContent('reported 13 Oct 2026 09:15Z');
  });
});
