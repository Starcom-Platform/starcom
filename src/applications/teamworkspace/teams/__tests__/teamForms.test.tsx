/**
 * Creating a team with its relay, and inviting to it (plan item 2.3, steps 2
 * and 3). The relay is checked before a team is made with it (plan item
 * 2.3a): its own description (NIP-11), whose key later confirms who joined,
 * and whether it keeps what a team sends it to the team.
 *
 * Signing and NIP-11 are stand-ins here; joiningATeam.test.ts covers them for
 * real against a relay on this machine.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const readRelayInfo = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/nostr/relayInfo', () => ({ readRelayInfo }));
const checkRelayConformance = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/nostr/relayConformance', async (actual) => ({
  ...(await actual<typeof import('../../../../services/nostr/relayConformance')>()),
  checkRelayConformance,
}));
const makeInviteLink = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/team/inviteLink', () => ({ makeInviteLink }));

import CreateTeamForm from '../CreateTeamForm';
import InviteLinkForm from '../InviteLinkForm';
import { realTimeTeamService } from '../../../../services/RealTimeTeamService';
import { joinedRelays } from '../../../../services/nostr/joinedRelays';
import type { CyberTeam } from '../../../../types/cyberInvestigation';

const RELAY_KEY = '9'.repeat(64);

beforeEach(() => {
  readRelayInfo.mockReset();
  checkRelayConformance.mockReset();
  makeInviteLink.mockReset();
});

const CHECKS = ['describes-itself', 'asks-who-signs-in', 'reads-need-sign-in', 'writes-need-sign-in', 'outsiders-cannot-read', 'outsiders-cannot-write'] as const;
/** What the check reports for a relay, every check holding unless told otherwise. */
const report = (url: string, info: Record<string, unknown> | undefined, differ: Partial<Record<typeof CHECKS[number], [string, string]>> = {}) => {
  const results = CHECKS.map((check) => {
    const [outcome, says] = differ[check] ?? ['holds', `${check} holds.`];
    return { check, outcome, says, ...(check === 'outsiders-cannot-read' ? { relaySaid: 'restricted: you are not a member of this relay' } : {}) };
  });
  return { url, info: info && { url, ...info }, results, keepsItToMembers: results.every((r) => r.outcome === 'holds') };
};
const DESCRIBED = { name: 'Newark desk relay', relayPubkey: RELAY_KEY, signIn: true, accessRequests: true, management: true };

describe('Create a team', () => {
  const fill = (name: string, url: string) => {
    fireEvent.change(screen.getByLabelText(/^Team name/), { target: { value: name } });
    fireEvent.change(screen.getByLabelText(/^Relay address/), { target: { value: url } });
  };

  it("checks the relay, says what it is, and lists each check with what the relay said (plan item 2.3a)", async () => {
    checkRelayConformance.mockResolvedValue(report('wss://relay.newark.example', DESCRIBED));
    render(<CreateTeamForm onCreated={() => {}} />);
    fill('Newark desk', 'wss://relay.newark.example');
    expect(screen.getByRole('button', { name: 'Create team' })).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByRole('button', { name: 'Check the relay' }));
    expect((await screen.findByTestId('relay-described')).textContent).toMatch(/Newark desk relay.*takes access requests/s);
    const checks = screen.getByTestId('relay-checks');
    expect(checks.textContent).toMatch(/keeps what a team sends it to the team/);
    for (const check of CHECKS) expect(screen.getByTestId(`relay-check-${check}`).getAttribute('data-outcome')).toBe('holds');
    expect(screen.getByTestId('relay-check-outsiders-cannot-read').textContent).toContain('restricted: you are not a member of this relay');
    expect(screen.getByRole('button', { name: 'Create team' })).toHaveProperty('disabled', false);
  });

  it('makes the team with its relay and the relay\'s own key', async () => {
    checkRelayConformance.mockResolvedValue(report('wss://relay.newark.example', { ...DESCRIBED, name: undefined, management: false }));
    const onCreated = vi.fn();
    render(<CreateTeamForm onCreated={onCreated} />);
    fill('Paterson desk', 'wss://relay.newark.example');
    fireEvent.click(screen.getByRole('button', { name: 'Check the relay' }));
    await screen.findByTestId('relay-checks');
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const team = onCreated.mock.calls[0][0] as CyberTeam;
    expect(team).toMatchObject({ name: 'Paterson desk', relayUrl: 'wss://relay.newark.example', relayPubkey: RELAY_KEY });
    expect(realTimeTeamService.getTeam(team.id)?.relayUrl).toBe('wss://relay.newark.example');
    // Whoever makes a team on a relay has joined it: they sign in there, and
    // teammates' bundles reach them there (plan items 2.3 and 2.4).
    expect(joinedRelays()).toEqual([expect.objectContaining({ url: 'wss://relay.newark.example', relayPubkey: RELAY_KEY, team: 'Paterson desk' })]);
  });

  it('makes no team on a relay that lets anyone read, and says why', async () => {
    checkRelayConformance.mockResolvedValue(report('wss://relay.open.example', DESCRIBED, {
      'reads-need-sign-in': ['fails', 'It serves what it holds to anyone, signed in or not.'],
    }));
    render(<CreateTeamForm onCreated={() => {}} />);
    fill('Open', 'wss://relay.open.example');
    fireEvent.click(screen.getByRole('button', { name: 'Check the relay' }));
    expect((await screen.findByRole('alert')).textContent)
      .toBe('Starcom will not use wss://relay.open.example for a team. It serves what it holds to anyone, signed in or not.');
    expect(screen.getByTestId('relay-check-reads-need-sign-in').getAttribute('data-outcome')).toBe('fails');
    expect(screen.getByRole('button', { name: 'Create team' })).toHaveProperty('disabled', true);
  });

  it('makes no team on a relay it could not check: could not tell is not a pass', async () => {
    checkRelayConformance.mockResolvedValue(report('wss://relay.slow.example', DESCRIBED, {
      'writes-need-sign-in': ['unknown', 'Could not tell: it did not answer in time.'],
    }));
    render(<CreateTeamForm onCreated={() => {}} />);
    fill('Slow', 'wss://relay.slow.example');
    fireEvent.click(screen.getByRole('button', { name: 'Check the relay' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not tell: it did not answer in time/);
    expect(screen.getByRole('button', { name: 'Create team' })).toHaveProperty('disabled', true);
  });

  it('says why when the relay does not describe itself, and makes nothing', async () => {
    checkRelayConformance.mockResolvedValue(report('wss://relay.gone.example', undefined, {
      'describes-itself': ['fails', 'wss://relay.gone.example did not answer with a description of itself (NIP-11).'],
    }));
    render(<CreateTeamForm onCreated={() => {}} />);
    fill('Gone', 'wss://relay.gone.example');
    fireEvent.click(screen.getByRole('button', { name: 'Check the relay' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/did not answer/);
    expect(screen.queryByTestId('relay-described')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create team' })).toHaveProperty('disabled', true);
  });

  it('says what a relay address looks like when it lacks wss://, and checks nothing', async () => {
    render(<CreateTeamForm onCreated={() => {}} />);
    fill('Bare', 'crew.cosmiccodex.app');
    fireEvent.click(screen.getByRole('button', { name: 'Check the relay' }));
    // It said the relay "did not answer with a description of itself", which sent people looking at the relay.
    expect((await screen.findByRole('alert')).textContent).toBe('A relay address starts with wss://, as in wss://crew.cosmiccodex.app.');
    expect(checkRelayConformance).not.toHaveBeenCalled();
  });

  it('checks again for another address: a check is of one relay', async () => {
    checkRelayConformance.mockResolvedValue(report('wss://relay.newark.example', DESCRIBED));
    render(<CreateTeamForm onCreated={() => {}} />);
    fill('Newark desk', 'wss://relay.newark.example');
    fireEvent.click(screen.getByRole('button', { name: 'Check the relay' }));
    await screen.findByTestId('relay-checks');
    fireEvent.change(screen.getByLabelText(/^Relay address/), { target: { value: 'wss://relay.other.example' } });
    expect(screen.queryByTestId('relay-checks')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create team' })).toHaveProperty('disabled', true);
  });
});

describe('Invite to a team', () => {
  const team = { id: 't1', name: 'Newark desk', relayUrl: 'wss://relay.newark.example', relayPubkey: RELAY_KEY } as CyberTeam;
  // A relay taking no management calls: the claim is pasted in (relayAdmin.test.tsx has the other kind).
  beforeEach(() => { readRelayInfo.mockResolvedValue({ url: team.relayUrl, relayPubkey: RELAY_KEY, signIn: true, accessRequests: true, management: false }); });

  it('makes a link from the claim the relay will accept, to copy', async () => {
    makeInviteLink.mockResolvedValue('https://starcom.app/join?r=wss%3A%2F%2Frelay.newark.example&c=c-123');
    render(<InviteLinkForm team={team} />);
    expect(screen.getByRole('button', { name: 'Make invite link' })).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText(/^Claim/), { target: { value: 'c-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Make invite link' }));

    expect(((await screen.findByLabelText(/^Invite link/)) as HTMLInputElement).value).toMatch(/\/join\?r=/);
    expect(makeInviteLink).toHaveBeenCalledWith({ relay: team.relayUrl, claim: 'c-123', relayPubkey: RELAY_KEY, team: 'Newark desk' });
  });

  it('says a team without a relay cannot be invited to yet', () => {
    render(<InviteLinkForm team={{ id: 't0', name: 'Old team' } as CyberTeam} />);
    expect(screen.getByText(/has no relay/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Make invite link' })).toBeNull();
  });
});
