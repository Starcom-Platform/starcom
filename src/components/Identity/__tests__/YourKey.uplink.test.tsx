/**
 * Moving the key into Starcom Uplink from "Your key" (decision D-EX, E3, EX39–EX40, K6): offered when
 * Uplink can take it, only once the key is backed up (Uplink cannot recover a forgotten passphrase), said
 * plainly when done or refused; and, with the key in Uplink and Uplink away, said where the key is.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import nostrService, { KEY_HELD_BY_UPLINK } from '../../../services/nostrService';
import { recordKeyBackedUp } from '../../../services/identity/identityNotice';
import * as uplink from '../../../extension/useStarcomUplink';

const move = vi.hoisted(() => ({ result: null as null | Error }));
vi.mock('../../../extension/moveKey', () => ({
  moveKeyToUplink: vi.fn(async () => {
    if (move.result) throw move.result;
    const pubkey = nostrService.getPublicKey()!;
    nostrService.handOverToUplink(pubkey);
    return pubkey;
  }),
}));

import YourKey from '../YourKey';

const connected = (ids: string[]) => ({
  status: 'connected' as const,
  hello: { kind: 'hello' as const, id: 'h', extensionVersion: '0.2.0', protocol: 1, capabilities: ids.map((id) => ({ id: id as never, ready: true })) },
});

beforeEach(() => {
  move.result = null;
  vi.spyOn(uplink, 'askUplink').mockResolvedValue({ kind: 'answer', id: 'x', ok: true, result: { held: false, locked: false } } as never);
});
afterEach(() => { nostrService.forgetIdentity(); localStorage.clear(); vi.restoreAllMocks(); });

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Your key' }));

describe('Your key, with Starcom Uplink', () => {
  it('offers to move a backed-up key into Uplink, and says when it is done', async () => {
    vi.spyOn(uplink, 'useStarcomUplink').mockReturnValue(connected(['signer.status', 'signer.import', 'signer.sign']));
    nostrService.ensureIdentity('a test');
    recordKeyBackedUp();
    render(<YourKey />);
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Move my key into Uplink' }));
    expect(await screen.findByTestId('your-key-moved')).toHaveTextContent('Moved: Uplink holds your key, and this page no longer does.');
    expect(nostrService.holdsOwnKey()).toBe(false);
  });

  it('holds the move back until the key is backed up', async () => {
    vi.spyOn(uplink, 'useStarcomUplink').mockReturnValue(connected(['signer.status', 'signer.import', 'signer.sign']));
    nostrService.ensureIdentity('a test');
    render(<YourKey />);
    open();
    expect(await screen.findByRole('button', { name: 'Move my key into Uplink' })).toBeDisabled();
    expect(screen.getByText('Back up the key first: Uplink cannot recover a forgotten passphrase.')).toBeInTheDocument();
  });

  it('says why no key was moved', async () => {
    vi.spyOn(uplink, 'useStarcomUplink').mockReturnValue(connected(['signer.status', 'signer.import', 'signer.sign']));
    nostrService.ensureIdentity('a test');
    recordKeyBackedUp();
    move.result = new Error('You declined: you did not set a passphrase');
    render(<YourKey />);
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Move my key into Uplink' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No key was moved: You declined: you did not set a passphrase'));
    expect(nostrService.holdsOwnKey()).toBe(true);
  });

  it('does not offer the move to an Uplink that cannot hold a key', async () => {
    vi.spyOn(uplink, 'useStarcomUplink').mockReturnValue(connected(['captures.read']));
    nostrService.ensureIdentity('a test');
    render(<YourKey />);
    open();
    await screen.findByTestId('your-key-holder');
    expect(screen.queryByRole('button', { name: 'Move my key into Uplink' })).not.toBeInTheDocument();
  });

  it('says where the key is when it is in Uplink and Uplink is away', async () => {
    vi.spyOn(uplink, 'useStarcomUplink').mockReturnValue({ status: 'absent' });
    const mine = nostrService.ensureIdentity('a test');
    nostrService.handOverToUplink(mine);
    expect(localStorage.getItem(KEY_HELD_BY_UPLINK)).toBe(mine);
    render(<YourKey />);
    open();
    await waitFor(() => expect(screen.getByTestId('your-key-holder')).toHaveTextContent('Held by Starcom Uplink, which is not here or not unlocked.'));
  });
});
