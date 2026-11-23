/**
 * The page an invite link opens (plan item 2.3, steps 3 and 4). The invite's
 * route, /join-team, did not exist; /join now reads Flotilla's ?r=&c= link,
 * says who invited the person to what, and joins only when they ask.
 *
 * The link's signature and the joining itself are stand-ins here;
 * joiningATeam.test.ts covers both for real.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const invite = { relay: 'wss://relay.newark.example', claim: 'c-123', relayPubkey: '9'.repeat(64), team: 'Newark desk', inviter: 'b'.repeat(64), issuedAt: 1790400000 };
const readInviteLink = vi.hoisted(() => vi.fn());
vi.mock('../../../services/team/inviteLink', () => ({ readInviteLink }));
const joinTeam = vi.hoisted(() => vi.fn());
vi.mock('../../../services/team/joinTeam', () => ({ joinTeam }));

import JoinTeamPage from '../JoinTeamPage';
import { realTimeTeamService } from '../../../services/RealTimeTeamService';

const open = (search = '?r=wss%3A%2F%2Frelay.newark.example&c=c-123') => render(
  <MemoryRouter initialEntries={[`/join${search}`]}>
    <Routes><Route path="/join" element={<JoinTeamPage />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  readInviteLink.mockReset().mockReturnValue({ invite });
  joinTeam.mockReset();
});

describe('the join page', () => {
  it('says who invited the person, to which team and relay, and joins nothing until asked', () => {
    open();
    const page = screen.getByTestId('join-team');
    expect(page.textContent).toMatch(/invited you to Newark desk/);
    expect(page.textContent).toContain('wss://relay.newark.example');
    expect(joinTeam).not.toHaveBeenCalled();
  });

  it('joins on request, shows each step, and keeps the team once the relay has confirmed it', async () => {
    joinTeam.mockImplementation(async (_invite, onStep) => {
      for (const step of ['checking', 'signing-in', 'requesting', 'confirming']) onStep(step);
      return { joined: true, confirmed: true, relaySaid: 'info: welcome' };
    });
    const record = vi.spyOn(realTimeTeamService, 'recordJoinedTeam');
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Join Newark desk' }));

    expect((await screen.findByTestId('join-result')).textContent).toMatch(/You are a member of Newark desk/);
    await waitFor(() => expect(record).toHaveBeenCalledWith(expect.objectContaining({ name: 'Newark desk', relayUrl: invite.relay, relayPubkey: invite.relayPubkey })));
  });

  it('says what stopped it, in the relay\'s words, and keeps nothing', async () => {
    joinTeam.mockResolvedValue({ joined: false, step: 'requesting', reason: 'restricted: that is an invalid invite code.' });
    const record = vi.spyOn(realTimeTeamService, 'recordJoinedTeam');
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Join Newark desk' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/invalid invite code/);
    expect(record).not.toHaveBeenCalled();
  });

  it('says so when the link cannot be trusted, and offers no way to join', () => {
    readInviteLink.mockReturnValue({ refused: "This invite's signature does not match what it says: something in the link was changed. Ask for a new one." });
    open();
    expect(screen.getByRole('alert').textContent).toMatch(/something in the link was changed/);
    expect(screen.queryByRole('button', { name: /^Join/ })).toBeNull();
  });
});
