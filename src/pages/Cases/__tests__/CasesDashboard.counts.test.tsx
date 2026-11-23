/**
 * The Cases header counts what its tabs list (plan item 1.8). It said "open"
 * for every case never closed, resolved ones included, beside an Open tab that
 * listed fewer.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import CasesDashboard from '../CasesDashboard';
import { caseManagerAdapter } from '../../../core/intel/adapters/caseManagerAdapter';
import { intelCaseService } from '../../../services/intel/IntelCaseService';
import { intelWorkspaceManager } from '../../../services/intel/IntelWorkspaceManager';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));

const seed = async (title: string, path: string[]) => {
  const id = (await caseManagerAdapter.addCase({ title, description: 'Body' }))!;
  for (const s of path) {
    if (s === 'RESOLVED') {
      const c = (await intelCaseService.getCase(id))!;
      await intelWorkspaceManager.updateCase({ ...c, position: { statement: 'It is.', verdict: 'supported', adjudicatedBy: 'k', adjudicatedAt: '2026-09-27T00:00:00Z' } } as never);
    }
    await intelCaseService.updateStatus(id, s as never);
  }
};

describe('CasesDashboard — counts that agree with its tabs', () => {
  it('counts open, on hold and closed as the tabs list them', async () => {
    const tag = Math.random().toString(36).slice(2, 7);
    await seed(`Fresh ${tag}`, []);
    await seed(`Held ${tag}`, ['OPEN', 'PENDING']);
    await seed(`Resolved ${tag}`, ['OPEN', 'IN_PROGRESS', 'RESOLVED']);
    render(<CasesDashboard />);
    const counts = await screen.findByTestId('case-counts');
    await waitFor(() => expect(counts.textContent).toMatch(/total/));
    const n = (label: string) => Number(counts.textContent!.match(new RegExp(`(\\d+) ${label}`))![1]);
    const rows = async (tab: string) => {
      fireEvent.click(screen.getByRole('tab', { name: tab }));
      await new Promise((r) => setTimeout(r, 50));
      return screen.queryAllByRole('row').length - 1;
    };
    expect(n('open')).toBe(await rows('Open'));
    expect(n('on hold')).toBe(await rows('On hold'));
    expect(n('closed')).toBe(await rows('Closed'));
    expect(n('total')).toBe(await rows('All Cases'));
    // The resolved case is closed, not open.
    fireEvent.click(screen.getByRole('tab', { name: 'Open' }));
    await waitFor(() => expect(screen.queryByText(`Resolved ${tag}`)).toBeNull());
    expect(within(counts).getByText(/closed/)).toBeTruthy();
  });
});
