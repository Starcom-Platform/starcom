/**
 * The Team Chat tab, sealed to each member (plan item 2.7, slice b). It was a
 * NIP-28 channel named "Team: <id>" with the roster as participants: anyone
 * who knew the team's id could work out the channel, and every message
 * crossed the relays as plain text. Now a message is sealed to each member on
 * the team relay's list; teamChat.ts does that, and sealedTeamMessage.test.ts
 * proves it against a relay. This is the tab.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const sendTeamMessage = vi.hoisted(() => vi.fn());
// Read when a team's chat opens (plan item 9.8); by default the relay counts you in.
const teamMembersFor = vi.hoisted(() => vi.fn());
vi.mock('../../../services/chat/teamChat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/chat/teamChat')>()),
  sendTeamMessage,
  teamMembersFor,
}));

// The relay's own description names its operator, who may write without being listed (plan item 9.9).
const readRelayInfo = vi.hoisted(() => vi.fn());
vi.mock('../../../services/nostr/relayInfo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/nostr/relayInfo')>()),
  readRelayInfo,
}));

import TeamWorkspaceApplication from '../TeamWorkspaceApplication';
import { realTimeTeamService } from '../../../services/RealTimeTeamService';
import { emitSealedChat } from '../../../services/chat/sealedChat';
import { learnName } from '../../../services/identity/names';
import { nostrIdentityService } from '../../../services/identity/NostrIdentityService';
import { joinRelay } from '../../../services/nostr/joinedRelays';
import { startChatNotices, unreadCount } from '../../../services/chat/chatUnread';

const AISHA = 'b'.repeat(64);

async function openChatOn(teamName: string) {
  fireEvent.click(await screen.findByRole('button', { name: /^chat$/i }));
  const select = await screen.findByLabelText(/^team$/i);
  fireEvent.mouseDown(select);
  fireEvent.click(await screen.findByRole('option', { name: teamName }));
}

async function teamWithRelay(label: string) {
  const name = `${label} ${Math.random().toString(36).slice(2, 8)}`;
  const relayUrl = `wss://relay.${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.example`;
  const team = await realTimeTeamService.createTeam({ name, relayUrl, relayPubkey: '9'.repeat(64) }, 'a'.repeat(64), 'a'.repeat(64));
  return { team, name, key: relayUrl };
}

beforeEach(() => {
  sendTeamMessage.mockReset();
  teamMembersFor.mockReset().mockResolvedValue({ members: ['a'.repeat(64), AISHA], source: 'relay' });
  readRelayInfo.mockReset().mockResolvedValue({ url: '', signIn: true, accessRequests: true, management: false });
});

/*
 * A team message is placed in its team by the tag it carries, and anyone can
 * seal one, so a message from outside looked like a member's (plan item 9.9,
 * walk C9). It is shown, flagged (decision G4).
 */
/*
 * A member who joined later saw "No messages yet." and nothing else, though the
 * team had talked before (plan item 9.7, walk C2). Each message is sealed to
 * the members at the time it is sent. The chat says so, with the date they
 * joined; nothing is re-sent (decision G7).
 */
// The team's chat, open on the team, is where its messages are read (plan item 9.12).
describe('TeamWorkspaceApplication — where a team message is read', () => {
  it('counts nothing unread for the team whose chat is open, and counts another team', async () => {
    localStorage.removeItem('starcom.chatUnread.v1');
    const stop = startChatNotices();
    const { name, key } = await teamWithRelay('Bayonne desk');
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await openChatOn(name);
    emitSealedChat({ id: 'r-1', senderId: AISHA, recipients: ['a'.repeat(64)], content: 'Seen here.', timestamp: Date.now(), postQuantum: true, decryptionFailed: false, team: key });
    emitSealedChat({ id: 'r-2', senderId: AISHA, recipients: ['a'.repeat(64)], content: 'Said elsewhere.', timestamp: Date.now(), postQuantum: true, decryptionFailed: false, team: 'wss://relay.elsewhere.example' });
    expect(unreadCount()).toBe(1);
    stop();
  });
});

describe('TeamWorkspaceApplication — joining a team that already talked', () => {
  it('says when you joined, and that messages from before were not sealed to you', async () => {
    const name = `Camden desk ${Math.random().toString(36).slice(2, 8)}`;
    const relayUrl = `wss://relay.${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.example`;
    await realTimeTeamService.recordJoinedTeam({ name, relayUrl, relayPubkey: '9'.repeat(64), memberPubkey: 'a'.repeat(64) });
    joinRelay({ url: relayUrl, relayPubkey: '9'.repeat(64), team: name, joinedAt: '2026-11-03T18:00:00.000Z' });
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await openChatOn(name);
    expect((await screen.findByTestId('team-chat-joined')).textContent).toBe(
      `You joined ${name} on 3 Nov 2026 18:00Z. Messages from before then were sealed to the members of that time, not to you, so they cannot show here.`,
    );
    expect(screen.getByText('No messages since you joined.')).toBeTruthy();
  });

  it('says nothing of joining for a team made here', async () => {
    const { name, key } = await teamWithRelay('Trenton desk');
    joinRelay({ url: key, relayPubkey: '9'.repeat(64), team: name, joinedAt: '2026-11-03T18:00:00.000Z' });
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await openChatOn(name);
    await waitFor(() => expect(teamMembersFor).toHaveBeenCalled());
    expect(screen.queryByTestId('team-chat-joined')).toBeNull();
    expect(screen.getByText('No messages yet.')).toBeTruthy();
  });
});

describe('TeamWorkspaceApplication — who wrote a team message', () => {
  const STRANGER = 'e'.repeat(64);
  const OPERATOR = 'f'.repeat(64);
  const say = (id: string, senderId: string, content: string, key: string) =>
    emitSealedChat({ id, senderId, recipients: ['a'.repeat(64)], content, timestamp: Date.now(), postQuantum: true, decryptionFailed: false, team: key });
  const itemFor = async (text: RegExp) => (await within(await screen.findByTestId('team-chat-messages')).findByText(text)).closest('li')!;
  const FLAG = "Not on this team's member list";

  it("flags a message from someone not on the relay's member list, and not a member's", async () => {
    const { name, key } = await teamWithRelay('Camden desk');
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await openChatOn(name);
    await waitFor(() => expect(teamMembersFor).toHaveBeenCalled());
    say('w-1', AISHA, 'Cranes from 02:00.', key);
    say('w-2', STRANGER, 'Meet me at the gate.', key);
    expect(within(await itemFor(/Meet me at the gate\./)).getByText(FLAG)).toBeTruthy();
    expect(within(await itemFor(/Cranes from 02:00\./)).queryByText(FLAG)).toBeNull();
  });

  it("names whoever runs the team's relay, rather than flagging them", async () => {
    readRelayInfo.mockResolvedValue({ url: '', operatorPubkey: OPERATOR, signIn: true, accessRequests: true, management: true });
    const { name, key } = await teamWithRelay('Trenton desk');
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await openChatOn(name);
    await waitFor(() => expect(readRelayInfo).toHaveBeenCalled());
    say('w-3', OPERATOR, 'The relay restarts at 03:00.', key);
    const item = await itemFor(/The relay restarts at 03:00\./);
    expect(within(item).getByText("Runs this team's relay")).toBeTruthy();
    expect(within(item).queryByText(FLAG)).toBeNull();
  });

  it('says senders are not checked when the relay publishes no member list, and flags nobody', async () => {
    teamMembersFor.mockResolvedValue({ members: ['a'.repeat(64)], source: 'roster' });
    const { name, key } = await teamWithRelay('Paterson desk');
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await openChatOn(name);
    say('w-4', STRANGER, 'Hello from nowhere.', key);
    expect((await screen.findByTestId('team-chat-senders-unchecked')).textContent).toBe(`Senders are not checked: ${name}'s relay publishes no member list.`);
    expect(within(await itemFor(/Hello from nowhere\./)).queryByText(FLAG)).toBeNull();
  });

  it('never flags your own messages, though your key is not on the list', async () => {
    const ME = 'c'.repeat(64);
    vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue(ME);
    sendTeamMessage.mockResolvedValue({ id: 'mine-1', reached: [AISHA], notReached: [], postQuantum: true });
    const { name } = await teamWithRelay('Jersey City desk');
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await openChatOn(name);
    await waitFor(() => expect(teamMembersFor).toHaveBeenCalled());
    fireEvent.change(await screen.findByPlaceholderText(/message the team/i), { target: { value: 'Mine, and not flagged.' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    expect(within(await itemFor(/Mine, and not flagged\./)).queryByText(FLAG)).toBeNull();
  });

  it('says senders are not checked when the member list cannot be read', async () => {
    teamMembersFor.mockResolvedValue({ unreadable: 'unanswered', reason: 'its relay did not answer' });
    const { name, key } = await teamWithRelay('Newark desk');
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await openChatOn(name);
    say('w-5', STRANGER, 'Anyone there?', key);
    expect((await screen.findByTestId('team-chat-senders-unchecked')).textContent).toBe('Senders are not checked: the member list could not be read (its relay did not answer).');
  });
});

describe('TeamWorkspaceApplication — Team Chat, sealed to each member', () => {
  /*
   * A removed member was told nothing (plan item 9.8, walk C3): the chat looked
   * as it did, and what they wrote went nowhere they could see. The relay's
   * refusal is said as soon as the team's chat opens.
   */
  it('says when the relay no longer lets you in, as soon as the chat opens', async () => {
    const { name } = await teamWithRelay('Camden desk');
    teamMembersFor.mockResolvedValue({ unreadable: 'refused', reason: 'restricted: you are not a member of this relay' });
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await openChatOn(name);
    const standing = await screen.findByTestId('team-chat-standing');
    expect(standing.textContent).toBe(
      `${name}'s relay would not show its member list (restricted: you are not a member of this relay). You may have been removed from ${name}: nothing can be sent to it.`,
    );
  });

  /*
   * A locked key (D-KL) signs in to no relay, so nothing of the team's can be read. That was said as a relay that did
   * not answer, with no way to open the key (found walking the lock in a browser, 2026-11-20).
   */
  it('says when the key is locked, offers to unlock it, and reads the team again once it is open', async () => {
    const { name } = await teamWithRelay('Paterson desk');
    teamMembersFor.mockResolvedValue({ unreadable: 'locked', reason: 'your key is locked, so Starcom has not signed in to the team relay' });
    const { notifyKeyLock } = await import('../../../services/identity/keyLock');
    const unlockFor = vi.spyOn(nostrIdentityService, 'unlockFor').mockImplementation(async () => { notifyKeyLock(); });
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await openChatOn(name);
    const locked = await screen.findByTestId('team-chat-locked');
    expect(locked.textContent).toContain(`Your key is locked, so new messages to ${name} cannot be read or checked yet.`);
    expect(screen.queryByTestId('team-chat-senders-unchecked')).toBeNull();
    const reads = teamMembersFor.mock.calls.length;
    teamMembersFor.mockResolvedValue({ members: ['a'.repeat(64), AISHA], source: 'relay' });
    fireEvent.click(within(locked).getByRole('button', { name: 'Unlock' }));
    expect(unlockFor).toHaveBeenCalledWith(`reading ${name}'s messages`);
    await waitFor(() => expect(teamMembersFor.mock.calls.length).toBeGreaterThan(reads));
    await waitFor(() => expect(screen.queryByTestId('team-chat-locked')).toBeNull());
    unlockFor.mockRestore();
  });

  // Read when the chat opens, not whenever OpsCenter does: a read signs in to the team's relay.
  it("reads nothing from the team's relay until its chat is opened", async () => {
    await teamWithRelay('Hoboken desk');
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await screen.findByRole('button', { name: /^chat$/i });
    await new Promise((r) => setTimeout(r, 50));
    expect(teamMembersFor).not.toHaveBeenCalled();
    expect(readRelayInfo).not.toHaveBeenCalled();
  });

  it('says nothing of standing when the relay counts you in', async () => {
    const { name } = await teamWithRelay('Trenton desk');
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await openChatOn(name);
    await waitFor(() => expect(teamMembersFor).toHaveBeenCalled());
    expect(screen.queryByTestId('team-chat-standing')).toBeNull();
  });

  it("sends through the sealed team path, shows your message once, and says what happens to it", async () => {
    const { team, name } = await teamWithRelay('Newark desk');
    sendTeamMessage.mockResolvedValue({ id: 'msg-1', reached: [AISHA], notReached: [], postQuantum: true });
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await openChatOn(name);

    fireEvent.change(await screen.findByPlaceholderText(/message the team/i), { target: { value: 'Night loading confirmed.' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => expect(sendTeamMessage).toHaveBeenCalledWith(expect.objectContaining({ id: team.id }), 'Night loading confirmed.'));
    const messages = await screen.findByTestId('team-chat-messages');
    await waitFor(() => expect(within(messages).getAllByText('Night loading confirmed.')).toHaveLength(1));
    expect(screen.getByText(/Sealed to each member on the team relay's list/)).toBeTruthy();
    expect(screen.queryByText(/Not encrypted/)).toBeNull();
  });

  it("shows what members sealed to this team, by name, and nothing said to another team", async () => {
    const { name, key } = await teamWithRelay('Paterson desk');
    learnName(AISHA, 'Aisha', 'team');
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await openChatOn(name);
    emitSealedChat({ id: 'in-1', senderId: AISHA, recipients: ['a'.repeat(64)], content: 'Cranes from 02:00.', timestamp: Date.now(), postQuantum: true, decryptionFailed: false, team: key });
    emitSealedChat({ id: 'in-2', senderId: AISHA, recipients: ['a'.repeat(64)], content: 'For another team.', timestamp: Date.now(), postQuantum: true, decryptionFailed: false, team: 'wss://relay.elsewhere.example' });
    emitSealedChat({ id: 'in-3', senderId: AISHA, recipients: ['a'.repeat(64)], content: 'No bundle here.', timestamp: Date.now(), postQuantum: false, decryptionFailed: false, team: key });

    const messages = await screen.findByTestId('team-chat-messages');
    expect(await within(messages).findByText('Cranes from 02:00.')).toBeTruthy();
    expect(within(messages).getAllByText('Aisha').length).toBeGreaterThan(0);
    expect(within(messages).queryByText('For another team.')).toBeNull();
    expect(within(messages).getByText(/No bundle here\. · sealed, not post-quantum/)).toBeTruthy();
  });

  it('says why a message could not be opened on this device, in the words it arrived with', async () => {
    const { name, key } = await teamWithRelay('Trenton desk');
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await openChatOn(name);
    const why = 'This message was sealed to your other devices, not this one. Read it on one of them.';
    emitSealedChat({ id: 'elsewhere-1', senderId: AISHA, recipients: ['a'.repeat(64)], content: why, timestamp: Date.now(), postQuantum: false, decryptionFailed: true, team: key });

    const messages = await screen.findByTestId('team-chat-messages');
    expect(await within(messages).findByText(why)).toBeTruthy();
  });

  it('says a team with no relay cannot have its chat sealed, and offers nothing to send', async () => {
    const name = `Old team ${Math.random().toString(36).slice(2, 8)}`;
    await realTimeTeamService.createTeam({ name }, 'a'.repeat(64), 'a'.repeat(64));
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await openChatOn(name);
    expect((await screen.findByTestId('team-chat-no-relay')).textContent).toMatch(/has no relay, so its chat cannot be sealed/);
    expect(screen.queryByPlaceholderText(/message the team/i)).toBeNull();
  });

  it('keeps what was typed, and says why, when it cannot be sent', async () => {
    const { name } = await teamWithRelay('Alone desk');
    sendTeamMessage.mockRejectedValue(new Error('No one else is on Alone desk yet, so there is nobody to seal it to.'));
    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    await openChatOn(name);
    const input = await screen.findByPlaceholderText(/message the team/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Anyone?' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    expect(await screen.findByText(/No one else is on Alone desk yet/)).toBeTruthy();
    expect(input.value).toBe('Anyone?');
  });
});
