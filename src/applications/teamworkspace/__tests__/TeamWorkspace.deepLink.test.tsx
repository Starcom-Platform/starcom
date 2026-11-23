/**
 * Phase T5 (Teams & Chat consolidation roadmap) — TeamWorkspaceApplication
 * previously took no props and always opened on the Overview tab for
 * whichever team loaded first, so the legacy page's "Message" button had
 * nowhere real to send a user. Verifies initialTeamId/initialTab (passed via
 * navigateToApp's context, see pages/Teams/TeamWorkspace.tsx) now seed the
 * Chat tab open for the requested team on mount.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TeamWorkspaceApplication from '../TeamWorkspaceApplication';
import { realTimeTeamService } from '../../../services/RealTimeTeamService';
import type { EnhancedChatChannel } from '../../../lib/chat/types/ChatAdapterTypes';

const sendMessage = vi.fn();
const createChannel = vi.fn();
const getMessages = vi.fn();
const subscribeToMessages = vi.fn();
const mockChatProvider = { getMessages, subscribeToMessages };

vi.mock('../../../communication/context/useSecureChat', () => ({
  useSecureChat: () => ({
    chatProvider: mockChatProvider,
    sendMessage,
    createChannel,
  })
}));

describe('TeamWorkspaceApplication — initialTeamId/initialTab deep-link (Phase T5)', () => {
  beforeEach(() => {
    sendMessage.mockReset();
    createChannel.mockReset();
    getMessages.mockReset().mockResolvedValue([]);
    subscribeToMessages.mockReset().mockReturnValue(() => {});
  });

  it('opens directly on the Chat tab, resolved to the requested team, when initialTeamId/initialTab are passed', async () => {
    const creatorPubkey = 'a'.repeat(64);
    const targetName = `T5 Deep-link Target ${Date.now()}`;
    const targetTeam = await realTimeTeamService.createTeam({ name: targetName, relayUrl: 'wss://relay.deep-link-target.example', relayPubkey: '9'.repeat(64) }, creatorPubkey, creatorPubkey);
    await realTimeTeamService.createTeam({ name: `T5 Deep-link Other ${Date.now()}` }, creatorPubkey, creatorPubkey);

    render(<MemoryRouter><TeamWorkspaceApplication initialTeamId={targetTeam.id} initialTab="chat" /></MemoryRouter>);

    // The Chat tab's input is already there, with no tab clicked, and on the
    // requested team, not whichever loaded first (the other has no relay, so
    // it would offer no input at all).
    await screen.findByPlaceholderText(/message the team/i);
    expect(screen.getByLabelText(/^team$/i).textContent).toBe(targetName);
  });

  it('falls back to the Overview tab and first-loaded team when no initial props are passed', async () => {
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    expect(screen.queryByPlaceholderText(/message the team/i)).toBeNull();
  });

  // The guard used to admit only 'chat' and 'missions', so every other
  // tab fell through to Overview. Nothing caught it: the caller's assertion is
  // that navigateToApp fired with the right context, which stayed true while
  // the destination quietly ignored it. 'missions' is the tab most worth
  // linking to and was the one that did not work.
  it.each(['overview', 'missions', 'missions', 'operations', 'chat', 'operatives', 'admin'] as const)(
    'opens on the %s tab when handed it as initialTab',
    async (tab) => {
      render(<MemoryRouter><TeamWorkspaceApplication initialTab={tab} /></MemoryRouter>);

      const active = await screen.findByRole('button', { name: new RegExp(`^${tab}$`, 'i'), current: 'page' });
      expect(active).toBeTruthy();
    }
  );

  // Operations took the empty Projects tab's place (D-RS, RS20): an old link to it opens Operations.
  it('opens Operations for a link to the old Projects tab', async () => {
    render(<MemoryRouter><TeamWorkspaceApplication initialTab="projects" /></MemoryRouter>);

    const active = await screen.findByRole('button', { name: /^operations$/i, current: 'page' });
    expect(active).toBeTruthy();
  });

  // Missions, the tab the app is named for, since K1.
  it('falls back to Missions for a tab name that does not exist', async () => {
    render(<MemoryRouter><TeamWorkspaceApplication initialTab="not-a-tab" /></MemoryRouter>);

    const active = await screen.findByRole('button', { name: /^missions$/i, current: 'page' });
    expect(active).toBeTruthy();
  });
});
