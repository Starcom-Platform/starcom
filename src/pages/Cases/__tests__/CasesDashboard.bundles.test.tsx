/**
 * Where bundles meet the Cases screen (plan item 2.4, slice c): a case says
 * who it came from and can be exported as a file, and "Import bundle" sits
 * beside "New Case". The dialog itself is covered in
 * components/Intel/Bundles/__tests__/bundles.test.tsx.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CasesDashboard from '../CasesDashboard';
import { caseManagerAdapter } from '../../../core/intel/adapters/caseManagerAdapter';
import { intelWorkspaceManager } from '../../../services/intel/IntelWorkspaceManager';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));

const PRIYA = 'c'.repeat(64);

describe('CasesDashboard — bundles', () => {
  it('shows who a received case came from, and offers to export it as a file', async () => {
    const id = await caseManagerAdapter.addCase({ title: `Received ${Date.now()}`, description: 'Body' });
    const stored = intelWorkspaceManager.getCase(id!)!;
    await intelWorkspaceManager.putFromBundle('case', { ...stored, receivedFrom: { pubkey: PRIYA, sentAt: '2026-09-27T14:00:00.000Z' } } as unknown as Record<string, unknown>);
    render(<CasesDashboard selectCaseId={id!} />);

    const page = await screen.findByTestId('case-detail');
    expect(within(page).getByTestId('received-from').textContent).toMatch(/^From .+, 27 Sep 2026/);
    expect(within(page).getByRole('button', { name: 'Export as file' })).toBeTruthy();
  });

  it('says nothing about where a case made here came from', async () => {
    const id = await caseManagerAdapter.addCase({ title: `Made here ${Date.now()}`, description: 'Body' });
    render(<CasesDashboard selectCaseId={id!} />);
    const page = await screen.findByTestId('case-detail');
    expect(within(page).queryByTestId('received-from')).toBeNull();
  });

  it('opens the import beside New Case', async () => {
    render(<CasesDashboard />);
    fireEvent.click(await screen.findByTestId('import-bundle'));
    expect(await screen.findByTestId('import-bundle-dialog')).toBeTruthy();
  });
});
