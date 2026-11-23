/**
 * Phase T6 (Teams & Chat consolidation, follow-up audit): the Admin tab's
 * "Team Analytics" panel already showed real Total/Online Members but
 * hardcoded "Messages Today: 0" (no chat activity backend existed yet).
 * CollaborationAnalytics.tsx — a separate, orphaned component — was deleted
 * this same phase because its data source (useCollaboration()) was 100%
 * fabricated. Verifies this panel now shows real Total Teams/Active
 * Investigations (RealTimeTeamService.getTeamStats()) and a real message
 * count (ChatActivityLogStore.getRecentStats()), not fabricated numbers.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TeamWorkspaceApplication from '../TeamWorkspaceApplication';
import { realTimeTeamService } from '../../../services/RealTimeTeamService';
import { intelCaseService } from '../../../services/intel/IntelCaseService';
import { caseGroup } from '../../../types/intel/IntelCaseUI';

vi.mock('../../../communication/context/useSecureChat', () => ({
  useSecureChat: () => ({
    chatProvider: null,
    sendMessage: vi.fn(),
    createChannel: vi.fn(),
  })
}));

const { getRecentStats } = vi.hoisted(() => ({ getRecentStats: vi.fn() }));
vi.mock('../../../services/ChatActivityLogStore', () => ({
  chatActivityLogStore: { getRecentStats }
}));

async function openAdminTab() {
  await screen.findByRole('button', { name: /^admin$/i });
  fireEvent.click(screen.getByRole('button', { name: /^admin$/i }));
}

describe('TeamWorkspaceApplication — Admin tab shows real analytics, not fabricated (Phase T6)', () => {
  it('shows the real team count from RealTimeTeamService.getTeamStats()', async () => {
    getRecentStats.mockResolvedValue({ total: 0, sent: 0, received: 0, decryptFailed: 0 });
    await realTimeTeamService.createTeam({ name: `T6 Admin Team ${Date.now()}` }, 'wallet-admin-1');

    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await openAdminTab();

    const stats = realTimeTeamService.getTeamStats();
    await waitFor(() => {
      expect(screen.getByText('Total Teams:').nextSibling).toHaveTextContent(String(stats.totalTeams));
    });
  });

  it('counts the open cases, not a store of investigations no case is written to (plan item 1.8)', async () => {
    getRecentStats.mockResolvedValue({ total: 0, sent: 0, received: 0, decryptFailed: 0 });
    const before = (await intelCaseService.listCases()).filter((c) => caseGroup(c.status) === 'open').length;
    await intelCaseService.createCase({ title: 'Night loading at berth 4', description: 'Is berth 4 loading at night?' });
    await intelCaseService.createCase({ title: 'Pantry closed at noon', description: 'Why is the pantry closed?' });
    const team = await realTimeTeamService.createTeam({ name: `T6 Admin Team ${Date.now()}` }, 'wallet-admin-1');
    await realTimeTeamService.createInvestigation({ title: 'Legacy investigation', status: 'INVESTIGATING' }, team.id, 'wallet-admin-1');

    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await openAdminTab();

    await waitFor(() => expect(screen.getByText('Open cases:').nextSibling).toHaveTextContent(String(before + 2)));
  });

  it('shows a real message count from ChatActivityLogStore, not a hardcoded 0', async () => {
    getRecentStats.mockResolvedValue({ total: 5, sent: 3, received: 2, decryptFailed: 0 });

    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await openAdminTab();

    await waitFor(() => {
      expect(screen.getByText('Messages Today:').nextSibling).toHaveTextContent('5');
    });
  });
});
