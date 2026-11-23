/**
 * A closed case offers a story of what was done, written in Operations (decision D-RS, RS51): its title filled in,
 * nothing linked, since a case has no address on the relays. Before it is closed, nothing is offered.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import CasesDashboard from '../CasesDashboard';
import { caseManagerAdapter } from '../../../core/intel/adapters/caseManagerAdapter';
import { intelCaseService } from '../../../services/intel/IntelCaseService';

const nav = vi.hoisted(() => ({ navigateToApp: vi.fn() }));
vi.mock('../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => nav }));
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));

describe('CaseDetail — a story of a closed case', () => {
  it('offers one once the case is closed, its title filled in', async () => {
    const title = `Story ${Math.random().toString(36).slice(2, 8)}`;
    const id = await caseManagerAdapter.addCase({ title, description: 'Body' });
    if (!id) throw new Error('fixture: the case was not stored');
    render(<CasesDashboard selectCaseId={id} />);
    const steps = await screen.findByTestId('case-steps');
    expect(screen.queryByTestId('case-write-story')).toBeNull();
    fireEvent.click(within(steps).getByRole('button', { name: 'Close' }));
    await waitFor(async () => expect((await intelCaseService.getCase(id))?.status).toBe('CLOSED'));
    fireEvent.click(await screen.findByRole('button', { name: 'Write a story about this case' }));
    expect(nav.navigateToApp).toHaveBeenCalledWith('teamworkspace', undefined, { initialTab: 'operations', storyTitle: `Case: ${title}` });
  });
});
