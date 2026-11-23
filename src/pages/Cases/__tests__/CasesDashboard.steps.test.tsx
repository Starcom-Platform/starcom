/**
 * A case moves on from its page, in words (plan item 1.7). Its status was a
 * code on a chip, changed from the edit form's list of all six codes, allowed
 * or not; a move the table refused failed on saving, with the codes in the
 * message. Resolving needs a position, so the page says so before anyone tries.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import CasesDashboard from '../CasesDashboard';
import { caseManagerAdapter } from '../../../core/intel/adapters/caseManagerAdapter';
import { intelCaseService } from '../../../services/intel/IntelCaseService';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));

async function seedCase(prefix: string) {
  const title = `${prefix} ${Math.random().toString(36).slice(2, 8)}`;
  const id = await caseManagerAdapter.addCase({ title, description: 'Body' });
  if (!id) throw new Error('fixture: the case was not stored');
  return { id, title };
}

describe('CasesDashboard — a case moves on in words', () => {
  it('offers the moves open from where it stands, makes them, and says what resolving needs', async () => {
    const { id } = await seedCase('Steps');
    render(<CasesDashboard selectCaseId={id} />);
    const steps = await screen.findByTestId('case-steps');
    expect(steps.textContent).not.toMatch(/[A-Z]{2,}/);
    expect(within(steps).getAllByRole('button').map((b) => b.textContent)).toEqual(['Take it on', 'Close']);

    fireEvent.click(within(steps).getByRole('button', { name: 'Take it on' }));
    await waitFor(async () => expect((await intelCaseService.getCase(id))?.status).toBe('OPEN'));
    fireEvent.click(await within(screen.getByTestId('case-steps')).findByRole('button', { name: 'Start work' }));
    await waitFor(async () => expect((await intelCaseService.getCase(id))?.status).toBe('IN_PROGRESS'));

    const now = screen.getByTestId('case-steps');
    expect(within(now).getByText('Being worked').closest('[aria-current="step"]')).not.toBeNull();
    expect((await within(now).findByRole('button', { name: 'Resolve' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(now).getByTestId('blocked-RESOLVED').textContent).toMatch(/position/i);
  });

  it('is not moved from the edit form, which offered every code', async () => {
    const { id } = await seedCase('Form');
    render(<CasesDashboard selectCaseId={id} />);
    const page = await screen.findByTestId('case-detail');
    fireEvent.click(within(page).getByRole('button', { name: /^Edit$/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText(/^Status/)).toBeNull();
  });

  it('names each case\'s status in words in the list', async () => {
    const { title } = await seedCase('Listed');
    render(<CasesDashboard />);
    const row = (await screen.findByText(title)).closest('tr')!;
    expect(within(row).getByText('New')).toBeTruthy();
    expect(within(row).queryByText('NEW')).toBeNull();
  });

  it('does not show a case closed without a conclusion as resolved', async () => {
    // The review of plan item 1.7: every step before Closed was ticked, Resolved among them.
    const { id } = await seedCase('Closed early');
    render(<CasesDashboard selectCaseId={id} />);
    const steps = await screen.findByTestId('case-steps');
    fireEvent.click(within(steps).getByRole('button', { name: 'Close' }));
    await waitFor(async () => expect((await intelCaseService.getCase(id))?.status).toBe('CLOSED'));
    const now = screen.getByTestId('case-steps');
    await waitFor(() => expect(within(now).getByText('Closed').closest('[aria-current="step"]')).not.toBeNull());
    expect(within(now).getByText('Resolved').classList.contains('Mui-completed')).toBe(false);
    expect(within(now).getByText('Being worked').classList.contains('Mui-completed')).toBe(false);
  });

  it('says so on the page when a move fails, rather than letting the button come back as if nothing happened', async () => {
    // The review of plan item 1.7: the error went to a banner shown only on the list.
    const { id } = await seedCase('Moved elsewhere');
    render(<CasesDashboard selectCaseId={id} />);
    const steps = await screen.findByTestId('case-steps');
    // Another tab moves it on; this page still shows it as New.
    await intelCaseService.updateStatus(id, 'OPEN' as never);
    await intelCaseService.updateStatus(id, 'IN_PROGRESS' as never);
    fireEvent.click(within(steps).getByRole('button', { name: 'Take it on' }));
    expect(await screen.findByTestId('case-move-failed')).toBeTruthy();
    expect(screen.getByTestId('case-move-failed').textContent).toMatch(/could not be moved/i);
  });
});
