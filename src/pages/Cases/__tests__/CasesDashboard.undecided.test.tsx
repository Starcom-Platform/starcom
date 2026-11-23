/**
 * Undecided cases are found without opening each one (plan item 9.13): an
 * Undecided tab lists the cases nobody has chosen a distribution for, and says
 * how many there are; and a case sent to someone is asked about first when
 * nobody has decided (decision G8), with the choice kept on the case.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import CasesDashboard from '../CasesDashboard';
import { caseManagerAdapter } from '../../../core/intel/adapters/caseManagerAdapter';
import { intelWorkspaceManager } from '../../../services/intel/IntelWorkspaceManager';
import { CasePriority } from '../../../core/intel/types/intelDataModels';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));

const undecidedHere = () => intelWorkspaceManager.getCases().filter((c) => c.visibility === undefined).length;

describe('CasesDashboard — undecided cases', () => {
  it('lists the cases nobody has chosen a distribution for under Undecided, and says how many', async () => {
    const open = `Nobody chose ${Date.now()}`;
    const decided = `Chosen ${Date.now()}`;
    await caseManagerAdapter.addCase({ title: open, description: 'Body' });
    await caseManagerAdapter.addCase({ title: decided, description: 'Body', visibility: 'limited' });
    render(<CasesDashboard />);
    expect(await screen.findByText(decided)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: `Undecided (${undecidedHere()})` }));
    expect(await screen.findByText(open)).toBeTruthy();
    expect(screen.queryByText(decided)).toBeNull();
  });

  // The one chip and the one badge every screen draws (BD18), where the list
  // printed the raw word and coloured priority from a map of its own.
  it("draws each case's distribution and priority as the chip and the badge", async () => {
    const decided = `Drawn ${Date.now()}`;
    const open = `Not drawn ${Date.now()}`;
    await caseManagerAdapter.addCase({ title: decided, description: 'Body', visibility: 'private', priority: CasePriority.HIGH });
    await caseManagerAdapter.addCase({ title: open, description: 'Body' });
    render(<CasesDashboard />);
    const row = (await screen.findByText(decided)).closest('tr')!;
    expect(within(row).getByTestId('distribution-chip').getAttribute('data-distribution')).toBe('private');
    expect(within(row).getByTestId('severity-badge').getAttribute('data-level')).toBe('high');
    // Where it stands, as the one status chip (BD24), in place of the list's own colours.
    expect(within(row).getByTestId('status-chip').getAttribute('data-tone')).toBe('working');
    const openRow = screen.getByText(open).closest('tr')!;
    expect(within(openRow).getByTestId('distribution-chip').getAttribute('data-distribution')).toBe('undecided');
  });

  it("draws the chip on a case's page", async () => {
    const id = await caseManagerAdapter.addCase({ title: `Page chip ${Date.now()}`, description: 'Body', visibility: 'limited' });
    render(<CasesDashboard selectCaseId={id!} />);
    const page = await screen.findByTestId('case-detail');
    expect(within(page).getByTestId('distribution-chip').getAttribute('data-distribution')).toBe('limited');
    expect(within(page).getByTestId('status-chip').getAttribute('data-status')).toBe('NEW');
  });

  it('asks who may receive an undecided case before sending it, and keeps the choice on the case', async () => {
    const id = await caseManagerAdapter.addCase({ title: `Ask first ${Date.now()}`, description: 'Body' });
    render(<CasesDashboard selectCaseId={id!} />);
    const page = await screen.findByTestId('case-detail');
    fireEvent.click(within(page).getByRole('button', { name: 'Send to…' }));
    const dialog = await screen.findByTestId('send-bundle-dialog');
    fireEvent.click(within(within(dialog).getByTestId('send-bundle-ask')).getByLabelText(/^Private/));
    await waitFor(() => expect(intelWorkspaceManager.getCase(id!)?.visibility).toBe('private'));
    expect((await within(dialog).findByTestId('send-bundle-stays')).textContent).toMatch(/^This case is Private: it stays in this workspace/);
  });
});
