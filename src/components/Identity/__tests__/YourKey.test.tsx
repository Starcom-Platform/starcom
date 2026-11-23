/**
 * "Your key", one click away from anywhere (plan item 2.3, step 6). A request
 * for access asks for the person's npub, and after the one-time key notice it
 * was shown nowhere in the app.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import YourKey from '../YourKey';
import nostrService from '../../../services/nostrService';
import { forgetNames, setOwnName } from '../../../services/identity/names';
import { setPublishedCallsign, setPublishesAsAgent } from '../../../services/identity/callsign';

const writeText = vi.fn(async () => {});

beforeEach(() => {
  nostrService.forgetIdentity();
  forgetNames();
  Object.assign(navigator, { clipboard: { writeText } });
  writeText.mockClear();
});
afterEach(() => {
  delete (globalThis as { nostr?: unknown }).nostr;
  nostrService.forgetIdentity();
});

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Your key' }));

describe('Your key', () => {
  it('offers to set a name when there is none, rather than calling you "you"', async () => {
    nostrService.ensureIdentity('writing a report');
    render(<YourKey />);
    open();
    const panel = await screen.findByTestId('your-key');
    expect(panel.textContent).toContain('No name set.');
    expect(screen.getByRole('button', { name: 'Set your name' })).toBeTruthy();
  });

  it("says what you publish as, and that it is as an agent when this key is an agent's (D-MX, MX14)", async () => {
    nostrService.ensureIdentity('writing a report');
    setPublishesAsAgent(true);
    try {
      const { unmount } = render(<YourKey />);
      open();
      expect((await screen.findByTestId('your-key')).textContent).toContain('You publish under your key, as an agent.');
      unmount();
      setPublishedCallsign('mecha_jono');
      render(<YourKey />);
      open();
      expect((await screen.findByTestId('your-key')).textContent).toContain('You publish as mecha_jono, as an agent.');
    } finally {
      setPublishesAsAgent(false);
      setPublishedCallsign('');
    }
  });

  it('says there is no key yet, and opening it makes none', async () => {
    render(<YourKey />);
    open();
    expect((await screen.findByTestId('your-key')).textContent).toMatch(/no key yet/i);
    expect(nostrService.hasIdentity()).toBe(false);
  });

  it("shows this browser's key as an npub, copies the whole npub, and says where it is kept", async () => {
    const pubkey = nostrService.ensureIdentity('writing a report');
    setOwnName('Priya Raman');
    render(<YourKey />);
    open();
    const panel = await screen.findByTestId('your-key');
    const npub = nip19.npubEncode(pubkey);
    expect(panel.textContent).toContain('You are Priya Raman.');
    expect(panel.textContent).toMatch(/stored in this browser/i);

    fireEvent.click(screen.getByRole('button', { name: 'Copy public key (npub)' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(npub));
  });

  it('shows the secret key to back up only when asked, with what it can do', async () => {
    nostrService.ensureIdentity('writing a report');
    render(<YourKey />);
    open();
    expect(screen.queryByTestId('your-key-nsec')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Show the key to back up' }));
    expect((await screen.findByTestId('your-key-nsec')).textContent).toMatch(/^nsec1/);
    expect(screen.getByTestId('your-key').textContent).toMatch(/anyone who has this can sign as you/i);
  });

  it("names the extension's key, and offers no backup of a key this app never holds", async () => {
    const extensionPubkey = 'e'.repeat(64);
    (globalThis as { nostr?: unknown }).nostr = {
      getPublicKey: async () => extensionPubkey,
      signEvent: async (event: Record<string, unknown>) => event,
    };
    render(<YourKey />);
    open();
    await waitFor(() => expect(screen.getByTestId('your-key').textContent).toMatch(/held by your signer extension/i));
    expect(screen.getByTestId('your-key').textContent).toContain(nip19.npubEncode(extensionPubkey).slice(0, 14));
    expect(screen.queryByRole('button', { name: 'Show the key to back up' })).toBeNull();
    expect(nostrService.hasIdentity()).toBe(false);
    // The extension holds the key: there is nothing here to bring one to.
    expect(screen.queryByRole('button', { name: /key from another device/i })).toBeNull();
  });
});

/*
 * A second device (plan item 9.11, decision G2): no screen took a key, so a
 * person could not be the same person on a second device. The key is brought
 * here by its nsec; a key this browser already holds is never replaced
 * without asking; and what stays on the other device is said before.
 */
describe('Your key, brought from another device', () => {
  const paste = (text: string) => fireEvent.change(screen.getByLabelText(/your secret key/i), { target: { value: text } });
  const useIt = () => fireEvent.click(screen.getByRole('button', { name: 'Use this key here' }));
  const bring = async () => fireEvent.click(await screen.findByRole('button', { name: /key from another device/i }));

  it('brings a key to a browser with none, having said what stays on the other device', async () => {
    const secret = generateSecretKey();
    render(<YourKey />);
    open();
    await bring();
    expect(screen.getByTestId('your-key').textContent).toMatch(/teams, joined relays, names and earlier messages stay on the device that has them/i);

    paste(nip19.nsecEncode(secret));
    useIt();

    expect(nostrService.getPublicKey()).toBe(getPublicKey(secret));
    const panel = await screen.findByTestId('your-key');
    await waitFor(() => expect(panel.textContent).toContain(nip19.npubEncode(getPublicKey(secret)).slice(0, 14)));
    expect(panel.textContent).toMatch(/this browser now signs as you/i);
    expect(screen.queryByLabelText(/your secret key/i)).toBeNull();
  });

  it('says what is wrong with something that is not a secret key, and changes nothing', async () => {
    render(<YourKey />);
    open();
    await bring();
    paste(nip19.npubEncode(getPublicKey(generateSecretKey())));
    useIt();
    expect((await screen.findByRole('alert')).textContent).toMatch(/that is your public key/i);
    expect(nostrService.hasIdentity()).toBe(false);
  });

  it('asks before replacing another key this browser holds, keeps it when told to, and replaces it when told to', async () => {
    const held = nostrService.ensureIdentity('writing a report');
    const secret = generateSecretKey();
    render(<YourKey />);
    open();
    await bring();
    paste(nip19.nsecEncode(secret));
    useIt();

    const panel = screen.getByTestId('your-key');
    expect(panel.textContent).toMatch(/already holds another key/i);
    expect(panel.textContent).toContain(nip19.npubEncode(held).slice(0, 14));
    expect(panel.textContent).toMatch(/not been backed up/i);
    expect(nostrService.getPublicKey()).toBe(held);

    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(nostrService.getPublicKey()).toBe(held);
    expect(screen.queryByRole('button', { name: 'Replace it' })).toBeNull();

    useIt();
    fireEvent.click(screen.getByRole('button', { name: 'Replace it' }));
    expect(nostrService.getPublicKey()).toBe(getPublicKey(secret));
  });

  it('says so when the key pasted is already this browser’s, and asks nothing', async () => {
    nostrService.ensureIdentity('writing a report');
    const own = nostrService.exportNsec();
    render(<YourKey />);
    open();
    await bring();
    paste(own);
    useIt();
    expect(screen.getByTestId('your-key').textContent).toMatch(/that is already this browser’s key/i);
    expect(screen.queryByRole('button', { name: 'Replace it' })).toBeNull();
  });
});
