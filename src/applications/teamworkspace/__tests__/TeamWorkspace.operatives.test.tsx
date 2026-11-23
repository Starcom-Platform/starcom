import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TeamWorkspaceApplication from '../TeamWorkspaceApplication';
import { realTimeTeamService } from '../../../services/RealTimeTeamService';

// This tab doesn't exercise chat at all — a lightweight inert mock (Phase
// T2 added a real useSecureChat() call for the Chat tab) avoids needing a
// real SecureChatProvider ancestor, matching TeamWorkspace.chat.test.tsx's
// own mocking approach.
vi.mock('../../../communication/context/useSecureChat', () => ({
  useSecureChat: () => ({
    chatProvider: null,
    sendMessage: vi.fn(),
    createChannel: vi.fn(),
  })
}));

describe('TeamWorkspace Operatives tab — real realTimeTeamService data (Phase 3 de-fake pass)', () => {
  it('shows an honest empty state when no teams have been created', async () => {
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await screen.findByRole('button', { name: /^operatives$/i });
    fireEvent.click(screen.getByRole('button', { name: /^operatives$/i }));

    await waitFor(() => {
      expect(screen.getByText(/No registered teams yet/i)).toBeTruthy();
    });
  });

  it('renders real team members once a team exists, with no fabricated fields', async () => {
    await realTimeTeamService.createTeam(
      { name: 'Night Watch', specializations: ['threat-hunting'] },
      'wallet-abc123'
    );

    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await screen.findByRole('button', { name: /^operatives$/i });
    fireEvent.click(screen.getByRole('button', { name: /^operatives$/i }));

    await waitFor(() => {
      expect(screen.getByText('Team Lead')).toBeTruthy();
      expect(screen.getByText('LEAD_ANALYST')).toBeTruthy();
    });
    // Email/currentTasks/Message/Call were fabricated fields with no real backing — removed entirely.
    expect(screen.queryByText(/@starcom\.ops/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /^message$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^call$/i })).toBeNull();
  });
});
