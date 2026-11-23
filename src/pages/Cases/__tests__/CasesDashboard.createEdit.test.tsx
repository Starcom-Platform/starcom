/**
 * "New Case" and the per-row "Edit" icon used to render with no onClick
 * handler at all — CasesDashboard is otherwise the one Investigation/Case
 * surface in the app built on real, current, unified persistence
 * (IntelWorkspaceManager via IntelCaseService), but you couldn't create or
 * edit a case from it. This exercises the real save path end-to-end
 * (useCaseManager -> caseManagerAdapter -> intelCaseService), no mocks.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CasesDashboard from '../CasesDashboard';
import { joinRelay, leaveRelay } from '../../../services/nostr/joinedRelays';
import { intelWorkspaceManager } from '../../../services/intel/IntelWorkspaceManager';

// CasesDashboard navigates now (build-a-mission-from-this-case). Mocked rather
// than wrapping these real-persistence suites in the whole router provider.
vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
// Show on globe needs the globe's providers, which this suite does not render.
// CasesDashboard.showOnGlobe.test.tsx renders the dashboard inside them.
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));

describe('CasesDashboard — create and edit a real case', () => {
  it('creates a real case via the New Case dialog', async () => {
    render(<CasesDashboard />);

    fireEvent.click(await screen.findByRole('button', { name: /new case/i }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText(/^title/i), {
      target: { value: 'Operation Night Watch' },
    });
    fireEvent.change(within(dialog).getByLabelText(/^description/i), {
      target: { value: 'Tracking anomalous relay traffic.' },
    });

    // Asked every time (plan item 0.5): nothing is chosen until someone chooses.

    fireEvent.click(within(dialog).getByRole('radio', { name: /^Public/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }));

    // Closing waits on a save and MUI's exit transition; one second (the default) is not enough under full-suite load.

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });
    expect(await screen.findByText('Operation Night Watch')).toBeTruthy();
  });

  it('refuses to save without a title or description', async () => {
    render(<CasesDashboard />);

    fireEvent.click(await screen.findByRole('button', { name: /new case/i }));
    const dialog = await screen.findByRole('dialog');

    // Asked every time (plan item 0.5): nothing is chosen until someone chooses.

    fireEvent.click(within(dialog).getByRole('radio', { name: /^Public/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }));

    expect(await within(dialog).findByText(/title and description are required/i)).toBeTruthy();
  });

  it('edits an existing case via the row Edit action', async () => {
    render(<CasesDashboard />);

    fireEvent.click(await screen.findByRole('button', { name: /new case/i }));
    let dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^title/i), { target: { value: 'Original Title' } });
    fireEvent.change(within(dialog).getByLabelText(/^description/i), { target: { value: 'Original description.' } });
    // Asked every time (plan item 0.5): nothing is chosen until someone chooses.
    fireEvent.click(within(dialog).getByRole('radio', { name: /^Public/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }));
    // Closing waits on a save and MUI's exit transition; one second (the default) is not enough under full-suite load.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });
    await screen.findByText('Original Title');

    const row = screen.getByText('Original Title').closest('tr');
    if (!row) throw new Error('expected a table row for the created case');

    // The row's action cell has three icon buttons (View/Edit/Delete) with
    // no accessible names — select Edit by DOM order.
    const iconButtons = within(row).getAllByRole('button');
    fireEvent.click(iconButtons[1]); // Eye, Edit, Trash — Edit is the second

    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByDisplayValue('Original Title')).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText(/^title/i), { target: { value: 'Updated Title' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    // Closing waits on a save and MUI's exit transition; one second (the default) is not enough under full-suite load.

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });
    expect(await screen.findByText('Updated Title')).toBeTruthy();
  });

  it('keeps the team a Limited case was picked for, shows it ticked on edit, and drops it when made Public (LW1)', async () => {
    const TEAM = 'wss://relay.newark-desk.example';
    joinRelay({ url: TEAM, relayPubkey: '9'.repeat(64), team: 'Newark desk' });
    try {
      render(<CasesDashboard />);
      fireEvent.click(await screen.findByRole('button', { name: /new case/i }));
      let dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText(/^title/i), { target: { value: 'For Newark' } });
      fireEvent.change(within(dialog).getByLabelText(/^description/i), { target: { value: 'Shared with the desk.' } });
      fireEvent.click(within(dialog).getByRole('radio', { name: /^Limited/ }));
      fireEvent.click(within(dialog).getByLabelText('Newark desk (relay.newark-desk.example)'));
      fireEvent.click(within(dialog).getByRole('button', { name: /^create$/i }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });
      const stored = () => intelWorkspaceManager.getCases().find((c) => c.title === 'For Newark');
      await waitFor(() => expect(stored()?.limitedTo).toEqual([TEAM]));

      const row = (await screen.findByText('For Newark')).closest('tr');
      if (!row) throw new Error('expected a table row for the created case');
      fireEvent.click(within(row).getAllByRole('button')[1]);
      dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByLabelText('Newark desk (relay.newark-desk.example)')).toBeChecked();
      fireEvent.click(within(dialog).getByRole('radio', { name: /^Public/ }));
      fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));
      await waitFor(() => expect(stored()?.limitedTo).toEqual([]), { timeout: 5000 });
    } finally {
      leaveRelay(TEAM);
    }
  });
});

