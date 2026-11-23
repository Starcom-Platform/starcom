/**
 * The returns sealed to an adventure's caller (RS41): seen or not, the counts, the day and the sender's callsign;
 * and, while the caller names no inbox, that none can reach them, with the inbox to post.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const ME = 'a'.repeat(64);
const ADDRESS = `30084:${ME}:adventure-aurora-mn`;
vi.mock('../../../../services/identity/NostrIdentityService', () => ({ nostrIdentityService: { signerPubkey: () => 'a'.repeat(64), getPubkey: () => null } }));
const inbox = vi.hoisted(() => ({ named: ['wss://inbox.example'] as string[], posted: 0 }));
vi.mock('../../../../services/nostr/inboxRelays', () => ({ inboxRelays: vi.fn(async () => inbox.named) }));
vi.mock('../../../../services/publishing/reportLabels', () => ({ reviewInboxList: vi.fn(async () => { inbox.posted += 1; return { status: 'sent', result: { relays: 1 } }; }) }));
const store = vi.hoisted(() => ({ returns: [] as unknown[] }));
vi.mock('../../../../services/intel/received/receivedReports', () => ({ reportsOn: () => store.returns, subscribeReceivedReports: () => () => {} }));

import { AdventureReturns } from '../AdventureReturns';
import { eventOutbox } from '../../../../services/intel/outbox/EventOutbox';

beforeEach(() => {
  inbox.named = ['wss://inbox.example']; inbox.posted = 0;
  store.returns = [
    { id: '1', coordinate: ADDRESS, from: 'b'.repeat(64), callsign: 'Kestrel', day: '2026-10-17', counts: [{ line: 'Stars counted', n: 40 }], at: 1, seen: true },
    { id: '2', coordinate: ADDRESS, from: 'c'.repeat(64), day: '2026-10-17', counts: [], at: 1, seen: false },
  ];
});

describe('AdventureReturns', () => {
  it('lists each return, seen or not, with its counts, day and callsign, and how many saw it', () => {
    render(<AdventureReturns address={ADDRESS} />);
    expect(screen.getByTestId('adventure-returns')).toHaveTextContent('Returns (2: 1 seen it)');
    expect(screen.getAllByTestId('adventure-return').map((r) => r.textContent)).toEqual([
      'Seen it · Stars counted 40 · 2026-10-17, from Kestrel',
      expect.stringMatching(/^Not seen · 2026-10-17, from npub1/),
    ]);
  });

  it('says no return can reach the caller while they name no inbox, and posts it through the review', async () => {
    inbox.named = [];
    store.returns = [];
    render(<AdventureReturns address={ADDRESS} />);
    expect(screen.getByTestId('adventure-returns')).toHaveTextContent('No return has reached you yet.');
    await waitFor(() => expect(screen.getByTestId('adventure-returns-no-inbox')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Post your inbox' }));
    await waitFor(() => expect(inbox.posted).toBe(1));
  });
});

describe('an inbox list no relay took (W1b)', () => {
  it('says it waits, in place of Post your inbox, until it goes or is cancelled', async () => {
    inbox.named = [];
    // As kept: only its kind and its author are read here.
    await eventOutbox.keep({ id: 'f'.repeat(64), pubkey: ME, kind: 10050, tags: [['relay', 'wss://inbox.example']], content: '', created_at: 1, sig: 'x' }, ['wss://one.example']);
    render(<AdventureReturns address={ADDRESS} />);
    const line = await screen.findByTestId('adventure-returns-inbox-kept');
    expect(line).toHaveTextContent('Your inbox waits to send: no relay answered.');
    expect(screen.queryByTestId('adventure-returns-no-inbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel sending' }));
    await waitFor(() => expect(screen.getByTestId('adventure-returns-no-inbox')).toBeTruthy());
  });
});
