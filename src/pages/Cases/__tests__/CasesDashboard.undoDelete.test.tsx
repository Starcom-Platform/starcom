/**
 * Deleting a case can be taken back (plan item 0.6, story S14). The Delete
 * button removed a case at once, with no confirmation and no way back.
 *
 * Real persistence, like the other Cases suites.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CasesDashboard from '../CasesDashboard';
import UndoDeletionRoot from '../../../components/Undo/UndoDeletionRoot';
import { caseManagerAdapter } from '../../../core/intel/adapters/caseManagerAdapter';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));

describe('CasesDashboard — deleting a case', () => {
  it('removes it from the list, and Undo brings the same case back', async () => {
    const title = `Deleted ${Math.random().toString(36).slice(2, 8)}`;
    const id = await caseManagerAdapter.addCase({ title, description: 'Body', visibility: 'public' });
    render(<><CasesDashboard /><UndoDeletionRoot /></>);

    fireEvent.click(await screen.findByRole('button', { name: `Delete ${title}` }));
    await waitFor(() => expect(screen.queryByRole('button', { name: `View ${title}` })).toBeNull());

    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('button', { name: `View ${title}` })).toBeTruthy();
    expect((await caseManagerAdapter.getCases()).some((c) => c.id === id)).toBe(true);
  });
});
