import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import TeamWorkspaceApplication from '../TeamWorkspaceApplication';
import { realTimeTeamService } from '../../../services/RealTimeTeamService';

// The invite flow doesn't exercise chat at all — a lightweight inert mock
// (Phase T2 added a real useSecureChat() call for the Chat tab) avoids
// needing a real SecureChatProvider ancestor, matching
// TeamWorkspace.chat.test.tsx's own mocking approach.
// The relay's NIP-11 and the invite's signature are stand-ins: joiningATeam.test.ts
// covers them for real, against a relay on this machine (plan item 2.3).
const readRelayInfo = vi.hoisted(() => vi.fn());
vi.mock('../../../services/nostr/relayInfo', () => ({ readRelayInfo }));
// A relay that passes the check Starcom runs before using it for a team (plan
// item 2.3a); relayConformance.test.ts runs the check against real relays.
vi.mock('../../../services/nostr/relayConformance', async (actual) => ({
  ...(await actual<typeof import('../../../services/nostr/relayConformance')>()),
  checkRelayConformance: async (url: string) => ({ url, info: await readRelayInfo(url), results: [], keepsItToMembers: true }),
}));
const makeInviteLink = vi.hoisted(() => vi.fn());
vi.mock('../../../services/team/inviteLink', () => ({ makeInviteLink }));

vi.mock('../../../communication/context/useSecureChat', () => ({
  useSecureChat: () => ({
    chatProvider: null,
    sendMessage: vi.fn(),
    createChannel: vi.fn(),
  })
}));

// Cycle 1 wired "Invite New Member" to a real flow; plan item 2.3 made the invite
// a signed link to the team's relay, which the person invited can actually use.
describe('TeamWorkspaceApplication — inviting to a team', () => {
  // The Admin tab reads each team relay's description; this one takes no management calls.
  beforeEach(() => { readRelayInfo.mockResolvedValue({ url: 'wss://relay.night-watch.example', relayPubkey: '9'.repeat(64), signIn: true, accessRequests: true, management: false }); });

  const openInviteDialog = async () => {
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await screen.findByRole('button', { name: /^admin$/i });
    fireEvent.click(screen.getByRole('button', { name: /^admin$/i }));
    const inviteButton = await screen.findByRole('button', { name: /invite new member/i });
    fireEvent.click(inviteButton);
    return screen.findByRole('dialog');
  };

  it('creates a team with its relay, then makes an invite link to it', async () => {
    readRelayInfo.mockResolvedValue({ url: 'wss://relay.night-watch.example', name: 'Night Watch relay', relayPubkey: '9'.repeat(64), signIn: true, accessRequests: true, management: false });
    makeInviteLink.mockResolvedValue('https://starcom.app/join?r=wss%3A%2F%2Frelay.night-watch.example&c=c-1');
    const dialog = await openInviteDialog();

    // No team exists yet: the dialog asks for one, with its relay.
    expect(within(dialog).getByText(/no teams exist yet/i)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/^Team name/), { target: { value: 'Night Watch Alpha' } });
    fireEvent.change(within(dialog).getByLabelText(/^Relay address/), { target: { value: 'wss://relay.night-watch.example' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check the relay' }));
    await within(dialog).findByTestId('relay-checks');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create team' }));

    // Then the invite: the claim the relay will accept, and a link to copy.
    fireEvent.change(await within(dialog).findByLabelText(/^Claim/), { target: { value: 'c-1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make invite link' }));
    expect(((await within(dialog).findByLabelText(/^Invite link/)) as HTMLInputElement).value).toMatch(/\/join\?r=/);
    expect(makeInviteLink).toHaveBeenCalledWith(expect.objectContaining({ relay: 'wss://relay.night-watch.example', claim: 'c-1', team: 'Night Watch Alpha' }));
  }, 15000);

  it('offers no permission settings, and keeps the not-yet-real automation action disabled', async () => {
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await screen.findByRole('button', { name: /^admin$/i });
    fireEvent.click(screen.getByRole('button', { name: /^admin$/i }));

    expect(await screen.findByRole('button', { name: /automation rules/i })).toBeDisabled();
    // Permission settings are not coming: a list in local-first storage enforces
    // nothing. The tab says so, rather than offering a button that implies otherwise.
    expect(screen.queryByRole('button', { name: /configure permissions/i })).toBeNull();
    expect(screen.getByText(/There are no permission settings/)).toBeTruthy();
  });

  // Hardening pass (Cycle 1): dedupeMembers used to key only on walletAddress.
  // joinTeam() defaults an unset walletAddress to the literal string 'unknown',
  // so two distinct pubkey-only members (no wallet) would silently collapse
  // into a single roster entry under the old logic.
  it('two distinct pubkey-only members (no wallet) both appear as separate operatives, not collapsed', async () => {
    const team = await realTimeTeamService.createTeam({ name: 'Pubkey-Only Roster Team' }, 'wallet-owner');
    await realTimeTeamService.joinTeam(team.id, { pubkey: 'pk-agent-one', name: 'Agent One', actorType: 'ai' });
    await realTimeTeamService.joinTeam(team.id, { pubkey: 'pk-agent-two', name: 'Agent Two', actorType: 'ai' });

    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /^operatives$/i }));

    expect(await screen.findByText('Agent One')).toBeTruthy();
    expect(await screen.findByText('Agent Two')).toBeTruthy();
  });
});
