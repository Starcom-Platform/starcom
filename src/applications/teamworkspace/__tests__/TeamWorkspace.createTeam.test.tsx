/**
 * "Create a team" on the empty Overview (plan item 2.3, story S4: creating a
 * team was possible only from Admin, and Overview said "No registered teams
 * yet." with nothing to press). Its own file, so no other test's team exists.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TeamWorkspaceApplication from '../TeamWorkspaceApplication';
import { realTimeTeamService } from '../../../services/RealTimeTeamService';

const readRelayInfo = vi.hoisted(() => vi.fn());
vi.mock('../../../services/nostr/relayInfo', () => ({ readRelayInfo }));
// A relay that passes the check Starcom runs before using it for a team (plan
// item 2.3a); relayConformance.test.ts runs the check against real relays.
vi.mock('../../../services/nostr/relayConformance', async (actual) => ({
  ...(await actual<typeof import('../../../services/nostr/relayConformance')>()),
  checkRelayConformance: async (url: string) => ({ url, info: await readRelayInfo(url), results: [], keepsItToMembers: true }),
}));
vi.mock('../../../communication/context/useSecureChat', () => ({
  useSecureChat: () => ({ chatProvider: null, sendMessage: vi.fn(), createChannel: vi.fn() }),
}));

describe('TeamWorkspaceApplication — the empty Overview', () => {
  it('offers to create a team from the empty Overview, with its relay (story S4)', async () => {
    readRelayInfo.mockResolvedValue({ url: 'wss://relay.first.example', relayPubkey: '9'.repeat(64), signIn: true, accessRequests: true, management: false });
    render(<MemoryRouter><TeamWorkspaceApplication initialTab="overview" /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Create a team' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Team name/), { target: { value: 'First desk' } });
    fireEvent.change(within(dialog).getByLabelText(/^Relay address/), { target: { value: 'wss://relay.first.example' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check the relay' }));
    await within(dialog).findByTestId('relay-checks');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create team' }));

    await waitFor(() => expect(realTimeTeamService.getTeams().some((t) => t.name === 'First desk' && t.relayUrl === 'wss://relay.first.example')).toBe(true));
    // The Overview then names the team and its relay: it showed the lead as a
    // member and never which team had been made (found by a live rehearsal).
    const made = await screen.findByTestId('overview-teams');
    expect(made.textContent).toContain('First desk');
    expect(made.textContent).toContain('relay.first.example');
  });

});
