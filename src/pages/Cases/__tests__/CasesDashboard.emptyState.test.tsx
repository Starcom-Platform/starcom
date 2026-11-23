/**
 * Empty states that are true (plan item 1.5, story S13).
 *
 * With no cases at all, the screen said "No cases match your search criteria"
 * and offered to clear filters nobody had set. And the Archived tab filtered for
 * a status no case can have (CaseStatus has no ARCHIVED), so it was always empty.
 *
 * A fresh file: the case store starts empty here.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import CasesDashboard from '../CasesDashboard';
import { caseManagerAdapter } from '../../../core/intel/adapters/caseManagerAdapter';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));

describe('CasesDashboard — empty states that are true', () => {
  it('says there are no cases yet, not that a search matched nothing, and offers the first one', async () => {
    render(<CasesDashboard />);

    expect(await screen.findByText('No cases yet')).toBeTruthy();
    expect(screen.queryByText(/match your search/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Create the first case' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('New Case')).toBeTruthy();
  });

  /*
   * Plan item 0.5, decision D2: a new case starts with nothing chosen, and is
   * created only once someone says who may receive it.
   */
  it('asks who may receive a new case, with nothing chosen, before it can be created', async () => {
    render(<CasesDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create the first case' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Title/), { target: { value: 'Paterson shelters' } });
    fireEvent.change(within(dialog).getByLabelText(/^Description/), { target: { value: 'Which have beds tonight.' } });

    const radios = within(dialog).getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => r.checked)).toEqual([false, false, false]);
    expect((within(dialog).getByRole('button', { name: /^Create$/ }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(dialog).getByRole('radio', { name: /^Limited/ }));
    expect(within(dialog).getByTestId('case-distribution-consequence').textContent).toMatch(/no internal relay/);
    fireEvent.click(within(dialog).getByRole('button', { name: /^Create$/ }));

    await waitFor(async () => {
      const created = (await caseManagerAdapter.getCases()).find((c) => c.title === 'Paterson shelters');
      expect(created?.visibility).toBe('limited');
    });
  });

  it('has no Archived tab, because no case can be archived', async () => {
    render(<CasesDashboard />);
    await screen.findByRole('tab', { name: /all cases/i });

    expect(screen.queryByRole('tab', { name: /archived/i })).toBeNull();
  });

  it('still says so when cases exist but the search matches none of them', async () => {
    await caseManagerAdapter.addCase({ title: 'Newark food banks', description: 'Body' });
    render(<CasesDashboard />);
    await screen.findByText('Newark food banks');

    fireEvent.change(screen.getByPlaceholderText('Search cases...'), { target: { value: 'nothing like this' } });

    await waitFor(() => expect(screen.getByText(/No cases match your search/i)).toBeTruthy());
    expect(screen.queryByText('No cases yet')).toBeNull();
  });
});
