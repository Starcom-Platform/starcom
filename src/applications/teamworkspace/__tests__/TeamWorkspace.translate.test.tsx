/**
 * "Translate" beneath a teammate's words in the team's chat (D-ML, chat and captures), and not beneath a
 * message that could not be opened: its text is Starcom's note of why. Team chat is sealed, never Public, so
 * only this device translates it (ML6).
 */
import React from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const teamMembersFor = vi.hoisted(() => vi.fn());
vi.mock('../../../services/chat/teamChat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/chat/teamChat')>()),
  sendTeamMessage: vi.fn(),
  teamMembersFor,
}));
const readRelayInfo = vi.hoisted(() => vi.fn());
vi.mock('../../../services/nostr/relayInfo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/nostr/relayInfo')>()),
  readRelayInfo,
}));

import TeamWorkspaceApplication from '../TeamWorkspaceApplication';
import { realTimeTeamService } from '../../../services/RealTimeTeamService';
import { emitSealedChat } from '../../../services/chat/sealedChat';

const AISHA = 'b'.repeat(64);
const GERMAN = 'Der Fluss ist über Nacht um drei Meter gestiegen, und die Brücke ist gesperrt.';

beforeEach(() => {
  teamMembersFor.mockReset().mockResolvedValue({ members: ['a'.repeat(64), AISHA], source: 'relay' });
  readRelayInfo.mockReset().mockResolvedValue({ url: '', signIn: true, accessRequests: true, management: false });
  (globalThis as { Translator?: unknown }).Translator = { availability: async () => 'available', create: async () => ({ translate: async (t: string) => t }) };
});
afterEach(() => { delete (globalThis as { Translator?: unknown }).Translator; });

describe("TeamWorkspaceApplication — a teammate's words, translated here", () => {
  it('offers Translate beneath a message from a teammate, and not beneath one that could not be opened', async () => {
    const name = `Hamburg desk ${Math.random().toString(36).slice(2, 8)}`;
    const key = `wss://relay.${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.example`;
    await realTimeTeamService.createTeam({ name, relayUrl: key, relayPubkey: '9'.repeat(64) }, 'a'.repeat(64), 'a'.repeat(64));
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /^chat$/i }));
    fireEvent.mouseDown(await screen.findByLabelText(/^team$/i));
    fireEvent.click(await screen.findByRole('option', { name }));
    await waitFor(() => expect(teamMembersFor).toHaveBeenCalled());

    emitSealedChat({ id: 'de-1', senderId: AISHA, recipients: ['a'.repeat(64)], content: GERMAN, timestamp: Date.now(), postQuantum: true, decryptionFailed: false, team: key });
    emitSealedChat({ id: 'no-1', senderId: AISHA, recipients: ['a'.repeat(64)], content: GERMAN, timestamp: Date.now(), postQuantum: true, decryptionFailed: true, team: key });

    expect(await screen.findByTestId('team-chat-translate-de-1')).toBeTruthy();
    expect(screen.queryByTestId('team-chat-translate-no-1')).toBeNull();
  });
});
