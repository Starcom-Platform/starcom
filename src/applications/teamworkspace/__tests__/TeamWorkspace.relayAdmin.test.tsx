/**
 * Where step 5 of plan item 2.3 lives in OpsCenter: each team's relay is
 * managed from Admin, and "Ask to join a team" sits on the Overview beside
 * "Create a team". The panels themselves are covered in
 * teams/__tests__/relayAdmin.test.tsx.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TeamWorkspaceApplication from '../TeamWorkspaceApplication';
import { realTimeTeamService } from '../../../services/RealTimeTeamService';

const readRelayInfo = vi.hoisted(() => vi.fn());
vi.mock('../../../services/nostr/relayInfo', () => ({ readRelayInfo }));
const mgmt = vi.hoisted(() => ({
  listMembers: vi.fn(async () => []), allowMember: vi.fn(), removeMember: vi.fn(), banMember: vi.fn(),
  listClaims: vi.fn(async () => []), createClaim: vi.fn(), revokeClaim: vi.fn(), revokeEveryone: vi.fn(),
}));
vi.mock('../../../services/team/relayManagement', () => mgmt);
vi.mock('../../../communication/context/useSecureChat', () => ({
  useSecureChat: () => ({ chatProvider: null, sendMessage: vi.fn(), createChannel: vi.fn() }),
}));

beforeEach(() => {
  readRelayInfo.mockResolvedValue({ url: 'wss://relay.admin.example', relayPubkey: '9'.repeat(64), signIn: true, accessRequests: true, management: true });
});

describe('TeamWorkspaceApplication — managing and asking to join', () => {
  it('offers "Ask to join a team" on the Overview, with the request form', async () => {
    render(<MemoryRouter><TeamWorkspaceApplication initialTab="overview" /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask to join a team' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('access-request-form')).toBeTruthy();
  });

  it("manages each team's relay from Admin", async () => {
    await realTimeTeamService.createTeam({ name: 'Admin desk', relayUrl: 'wss://relay.admin.example', relayPubkey: '9'.repeat(64) }, 'a'.repeat(64), 'a'.repeat(64));
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /^admin$/i }));
    const section = await screen.findByTestId('team-relays');
    expect(await within(section).findByText('Admin desk')).toBeTruthy();
    expect(await within(section).findByRole('button', { name: 'Create a claim' })).toBeTruthy();
    expect(readRelayInfo).toHaveBeenCalledWith('wss://relay.admin.example');
  });
});
