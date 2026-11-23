/**
 * Managing a team's relay from OpsCenter, and asking to join one (plan item
 * 2.3, step 5). The relay calls are stand-ins here; managingARelay.test.ts
 * makes them for real, signed, against a relay on this machine.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const readRelayInfo = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/nostr/relayInfo', () => ({ readRelayInfo }));
const mgmt = vi.hoisted(() => ({
  listMembers: vi.fn(), allowMember: vi.fn(), removeMember: vi.fn(), banMember: vi.fn(),
  listClaims: vi.fn(), createClaim: vi.fn(), revokeClaim: vi.fn(), revokeEveryone: vi.fn(), relayManagers: vi.fn(),
}));
vi.mock('../../../../services/team/relayManagement', () => mgmt);
const access = vi.hoisted(() => ({ makeAccessRequest: vi.fn(), readAccessRequest: vi.fn() }));
vi.mock('../../../../services/team/accessRequest', () => access);
const checkMembership = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/team/joinTeam', () => ({ checkMembership }));
const makeInviteLink = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/team/inviteLink', () => ({ makeInviteLink }));

import RelayAdminPanel from '../RelayAdminPanel';
import AccessRequestForm from '../AccessRequestForm';
import InviteLinkForm from '../InviteLinkForm';
import { nostrIdentityService } from '../../../../services/identity/NostrIdentityService';
import { realTimeTeamService } from '../../../../services/RealTimeTeamService';
import type { CyberTeam } from '../../../../types/cyberInvestigation';

const RELAY = 'wss://relay.newark.example';
const team = { id: 't1', name: 'Newark desk', relayUrl: RELAY, relayPubkey: '9'.repeat(64) } as CyberTeam;
const AISHA = 'b'.repeat(64);
const ME = 'a'.repeat(64);
const SECOND_ADMIN = 'c'.repeat(64);
const managed = { url: RELAY, relayPubkey: team.relayPubkey, signIn: true, accessRequests: true, management: true };

beforeEach(() => {
  vi.restoreAllMocks();
  [...Object.values(mgmt), ...Object.values(access), checkMembership, makeInviteLink].forEach((f) => f.mockReset());
  readRelayInfo.mockReset().mockResolvedValue(managed);
  mgmt.listMembers.mockResolvedValue([{ pubkey: AISHA }]);
  mgmt.listClaims.mockResolvedValue(['starcom-abc123abc123']);
  vi.spyOn(nostrIdentityService, 'ensureSigner').mockResolvedValue(ME);
});

describe("a team relay's admin panel", () => {
  it('lists members, and removes one', async () => {
    render(<RelayAdminPanel team={team} />);
    const row = await screen.findByTestId(`relay-member-${AISHA}`);
    fireEvent.click(within(row).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(mgmt.removeMember).toHaveBeenCalledWith(RELAY, AISHA));
    expect(mgmt.listMembers).toHaveBeenCalledTimes(2);
  });

  // The roster kept here lost nobody when the relay removed them (plan item 9.8).
  it('takes whoever is removed or banned off the roster too, and only once the relay has', async () => {
    const off = vi.spyOn(realTimeTeamService, 'removeMemberByKey').mockResolvedValue(true);
    render(<RelayAdminPanel team={team} />);
    const row = await screen.findByTestId(`relay-member-${AISHA}`);
    fireEvent.click(within(row).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(off).toHaveBeenCalledWith(team.id, AISHA));

    off.mockClear();
    fireEvent.click(within(await screen.findByTestId(`relay-member-${AISHA}`)).getByRole('button', { name: 'Ban' }));
    fireEvent.click(within(screen.getByTestId(`relay-member-${AISHA}`)).getByRole('button', { name: 'Yes, ban' }));
    await waitFor(() => expect(off).toHaveBeenCalledWith(team.id, AISHA));

    off.mockClear();
    mgmt.removeMember.mockRejectedValueOnce(new Error('relay said no'));
    fireEvent.click(within(await screen.findByTestId(`relay-member-${AISHA}`)).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(mgmt.removeMember).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 20));
    expect(off).not.toHaveBeenCalled();
  });

  it('bans only once the ban is confirmed', async () => {
    render(<RelayAdminPanel team={team} />);
    const row = await screen.findByTestId(`relay-member-${AISHA}`);
    fireEvent.click(within(row).getByRole('button', { name: 'Ban' }));
    expect(mgmt.banMember).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole('button', { name: 'Yes, ban' }));
    await waitFor(() => expect(mgmt.banMember).toHaveBeenCalledWith(RELAY, AISHA));
  });

  it('shows who a pasted request is from before allowing them, and allows them', async () => {
    access.readAccessRequest.mockReturnValue({ request: { relay: RELAY, note: 'Intake 2026-11 #14', requester: AISHA, npub: 'npub1aisha', issuedAt: 1790400000 } });
    render(<RelayAdminPanel team={team} />);
    fireEvent.change(await screen.findByLabelText(/^Access request/), { target: { value: 'starcom-access-request:xyz' } });
    expect(screen.getByTestId('access-request-read').textContent).toMatch(/asks to join.*Intake 2026-11 #14/s);
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await waitFor(() => expect(mgmt.allowMember).toHaveBeenCalledWith(RELAY, AISHA, 'Intake 2026-11 #14'));
  });

  it("will not allow a request made for another relay", async () => {
    access.readAccessRequest.mockReturnValue({ request: { relay: 'wss://relay.elsewhere.example', note: '', requester: AISHA, npub: 'npub1aisha', issuedAt: 1790400000 } });
    render(<RelayAdminPanel team={team} />);
    fireEvent.change(await screen.findByLabelText(/^Access request/), { target: { value: 'starcom-access-request:xyz' } });
    expect(screen.getByTestId('access-request-read').textContent).toMatch(/relay\.elsewhere\.example, not this team's relay/);
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
  });

  it('says why a pasted request cannot be used, and allows nobody', async () => {
    access.readAccessRequest.mockReturnValue({ refused: "This access request's signature does not match what it says." });
    render(<RelayAdminPanel team={team} />);
    fireEvent.change(await screen.findByLabelText(/^Access request/), { target: { value: 'starcom-access-request:tampered' } });
    expect(screen.getByRole('alert').textContent).toMatch(/does not match/);
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
  });

  it('creates and revokes claims', async () => {
    mgmt.createClaim.mockResolvedValue('starcom-new000new000');
    render(<RelayAdminPanel team={team} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create a claim' }));
    await waitFor(() => expect(mgmt.createClaim).toHaveBeenCalledWith(RELAY));
    const claim = await screen.findByTestId('relay-claim-starcom-abc123abc123');
    fireEvent.click(within(claim).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(mgmt.revokeClaim).toHaveBeenCalledWith(RELAY, 'starcom-abc123abc123'));
  });

  it("revokes everyone but the admin doing it and whoever manages the relay, named first, only on a second confirmation (decision R4)", async () => {
    mgmt.relayManagers.mockResolvedValue([ME, SECOND_ADMIN]);
    mgmt.revokeEveryone.mockResolvedValue({ removed: 1, claimsRevoked: 1, kept: [ME, SECOND_ADMIN] });
    render(<RelayAdminPanel team={team} />);
    fireEvent.click(await screen.findByRole('button', { name: /Revoke everyone/ }));
    expect(mgmt.revokeEveryone).not.toHaveBeenCalled();
    // Who stays is said before anyone is removed.
    const keeping = await screen.findByTestId('revoke-keeps');
    expect(keeping.textContent).toMatch(/manage the relay/);
    expect(within(keeping).getAllByTestId('key-name')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Yes, revoke every member and claim/ }));
    await waitFor(() => expect(mgmt.revokeEveryone).toHaveBeenCalledWith(RELAY, { keep: [ME, SECOND_ADMIN] }));
    expect((await screen.findByTestId('relay-admin-done')).textContent).toMatch(/Removed 1 member and revoked 1 claim/);
  });

  it("says when the relay does not say who manages it, and keeps only the admin doing it", async () => {
    mgmt.relayManagers.mockResolvedValue(null);
    mgmt.revokeEveryone.mockResolvedValue({ removed: 2, claimsRevoked: 0, kept: [ME] });
    render(<RelayAdminPanel team={team} />);
    fireEvent.click(await screen.findByRole('button', { name: /Revoke everyone/ }));
    expect((await screen.findByTestId('revoke-keeps')).textContent).toMatch(/does not say who else manages it, so only you are kept/);
    fireEvent.click(screen.getByRole('button', { name: /Yes, revoke every member and claim/ }));
    await waitFor(() => expect(mgmt.revokeEveryone).toHaveBeenCalledWith(RELAY, { keep: [ME] }));
  });

  it("says what the relay said when it refuses this key", async () => {
    mgmt.listMembers.mockRejectedValue(new Error(`${RELAY} refused: your key may not manage it.`));
    render(<RelayAdminPanel team={team} />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/may not manage it/);
  });

  it('says a relay that takes no management calls cannot be managed from here', async () => {
    readRelayInfo.mockResolvedValue({ ...managed, management: false });
    render(<RelayAdminPanel team={team} />);
    expect((await screen.findByTestId('relay-unmanaged')).textContent).toMatch(/cannot be managed from Starcom/);
    expect(mgmt.listMembers).not.toHaveBeenCalled();
  });
});

describe('asking to join a team', () => {
  const ask = async () => {
    access.makeAccessRequest.mockResolvedValue('starcom-access-request:signed');
    render(<AccessRequestForm />);
    fireEvent.change(screen.getByLabelText(/^Relay address/), { target: { value: RELAY } });
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'Intake 2026-11 #14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Make the request' }));
    return await screen.findByLabelText(/^Your request/) as HTMLTextAreaElement;
  };

  it('makes a signed request to send, and sends nothing itself', async () => {
    expect((await ask()).value).toBe('starcom-access-request:signed');
    expect(access.makeAccessRequest).toHaveBeenCalledWith({ relay: RELAY, note: 'Intake 2026-11 #14' });
    expect(screen.getByTestId('access-request-form').textContent).toMatch(/nothing is sent from here/i);
  });

  it("keeps the relay once its member list names them", async () => {
    const recorded = vi.spyOn(realTimeTeamService, 'recordJoinedTeam').mockResolvedValue({} as CyberTeam);
    vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue(AISHA);
    checkMembership.mockResolvedValue({ joined: true, relayPubkey: team.relayPubkey, team: 'Newark desk relay' });
    await ask();
    fireEvent.click(screen.getByRole('button', { name: 'Am I in yet?' }));
    expect((await screen.findByTestId('membership')).textContent).toMatch(/You are in Newark desk relay/);
    expect(checkMembership).toHaveBeenCalledWith(RELAY);
    expect(recorded).toHaveBeenCalledWith({ name: 'Newark desk relay', relayUrl: RELAY, relayPubkey: team.relayPubkey, memberPubkey: AISHA });
  });

  it("says so when they are not in yet, and keeps nothing", async () => {
    const recorded = vi.spyOn(realTimeTeamService, 'recordJoinedTeam');
    checkMembership.mockResolvedValue({ joined: false, reason: `${RELAY}'s member list does not name you yet.` });
    await ask();
    fireEvent.click(screen.getByRole('button', { name: 'Am I in yet?' }));
    expect((await screen.findByTestId('membership')).textContent).toMatch(/does not name you yet/);
    expect(recorded).not.toHaveBeenCalled();
  });
});

describe('an invite, with a claim made on the relay', () => {
  it('fills the claim from the relay when it can be managed', async () => {
    mgmt.createClaim.mockResolvedValue('starcom-made000made0');
    render(<InviteLinkForm team={team} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create one on the relay' }));
    await waitFor(() => expect((screen.getByLabelText(/^Claim/) as HTMLInputElement).value).toBe('starcom-made000made0'));
    expect(mgmt.createClaim).toHaveBeenCalledWith(RELAY);
  });

  it('offers no such button when the relay takes no management calls', async () => {
    readRelayInfo.mockResolvedValue({ ...managed, management: false });
    render(<InviteLinkForm team={team} />);
    await waitFor(() => expect(readRelayInfo).toHaveBeenCalledWith(RELAY));
    await Promise.resolve();
    expect(screen.queryByRole('button', { name: 'Create one on the relay' })).toBeNull();
  });
});
