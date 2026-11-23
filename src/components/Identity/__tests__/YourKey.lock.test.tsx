/**
 * The passphrase lock in "Your key" (decision D-KL): offered for a key this browser holds, with what a forgotten
 * passphrase costs said first; removable; and a locked key's secret shown only after its passphrase, asked for by
 * the app-wide prompt (KeyUnlockRoot). scrypt runs at cost 4 here; the app's is 16.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import YourKey from '../YourKey';
import KeyUnlockRoot from '../KeyUnlockRoot';
import nostrService from '../../../services/nostrService';
import { forgetNames } from '../../../services/identity/names';

const PASS = 'correct horse battery staple';

beforeEach(() => {
  nostrService.forgetIdentity();
  forgetNames();
  const lock = nostrService.lock.bind(nostrService);
  vi.spyOn(nostrService, 'lock').mockImplementation((passphrase: string) => lock(passphrase, 4));
});
afterEach(() => {
  nostrService.forgetIdentity();
  vi.restoreAllMocks();
});

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Your key' }));

async function lockHere(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: 'Lock this key with a passphrase' }));
  const section = screen.getByTestId('your-key-lock');
  fireEvent.change(within(section).getByLabelText(/^Passphrase/), { target: { value: PASS } });
  fireEvent.change(within(section).getByLabelText('Type it again'), { target: { value: PASS } });
  fireEvent.click(within(section).getByRole('button', { name: 'Lock it' }));
  await waitFor(() => expect(nostrService.lockState()).toBe('unlocked'));
  return section;
}

/** The next visit: the key stays locked in storage, and is no longer open in memory. */
function nextVisit(): void {
  (nostrService as unknown as { secretKey: Uint8Array | null }).secretKey = null;
}

describe('the passphrase lock in Your key', () => {
  it('says a forgotten passphrase cannot be recovered before locking, then locks the key it holds', async () => {
    nostrService.ensureIdentity('writing a report');
    render(<YourKey />);
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Lock this key with a passphrase' }));
    expect(screen.getByTestId('your-key-lock').textContent).toMatch(/nobody can recover the key/i);
    expect(screen.getByTestId('your-key-lock').textContent).toMatch(/back the key up first/i);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await lockHere();
    expect(localStorage.getItem('nostr_secret_key')).toBeNull();
    expect(localStorage.getItem('nostr_locked_key')).not.toBeNull();
    await waitFor(() => expect(screen.getByTestId('your-key-holder').textContent).toMatch(/locked with your passphrase/i));
    expect(screen.getByRole('button', { name: 'Remove the lock' })).toBeTruthy();
  });

  it('refuses two passphrases that differ', async () => {
    nostrService.ensureIdentity('writing a report');
    render(<YourKey />);
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Lock this key with a passphrase' }));
    fireEvent.change(screen.getByLabelText(/^Passphrase/), { target: { value: PASS } });
    fireEvent.change(screen.getByLabelText('Type it again'), { target: { value: `${PASS}!` } });
    fireEvent.click(screen.getByRole('button', { name: 'Lock it' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/differ/);
    expect(nostrService.lockState()).toBe('none');
  });

  it('removes the lock, storing the key unencrypted again', async () => {
    nostrService.ensureIdentity('writing a report');
    render(<YourKey />);
    open();
    await lockHere();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove the lock' }));
    await waitFor(() => expect(nostrService.lockState()).toBe('none'));
    expect(localStorage.getItem('nostr_locked_key')).toBeNull();
    expect(localStorage.getItem('nostr_secret_key')).not.toBeNull();
  });

  it("shows a locked key's secret only after its passphrase, saying so when it is wrong", async () => {
    nostrService.ensureIdentity('writing a report');
    render(<><YourKey /><KeyUnlockRoot /></>);
    open();
    await lockHere();
    nextVisit();

    fireEvent.click(screen.getByRole('button', { name: 'Show the key to back up' }));
    const prompt = await screen.findByTestId('key-unlock');
    expect(prompt.textContent).toMatch(/showing your key to back up/);
    fireEvent.change(within(prompt).getByLabelText('Passphrase'), { target: { value: 'not the passphrase' } });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Unlock' }));
    expect((await within(prompt).findByRole('alert')).textContent).toBe('That passphrase is wrong.');
    expect(screen.queryByTestId('your-key-nsec')).toBeNull();

    fireEvent.change(within(prompt).getByLabelText('Passphrase'), { target: { value: PASS } });
    fireEvent.click(within(prompt).getByRole('button', { name: 'Unlock' }));
    expect((await screen.findByTestId('your-key-nsec')).textContent).toMatch(/^nsec1/);
    expect(screen.queryByTestId('key-unlock')).toBeNull();
  });

  it('leaves the key locked when the prompt is cancelled, and says nothing was done', async () => {
    nostrService.ensureIdentity('writing a report');
    render(<><YourKey /><KeyUnlockRoot /></>);
    open();
    await lockHere();
    nextVisit();

    fireEvent.click(screen.getByRole('button', { name: 'Show the key to back up' }));
    fireEvent.click(within(await screen.findByTestId('key-unlock')).getByRole('button', { name: 'Cancel' }));
    expect((await screen.findByText('Nothing was done: your key is still locked.'))).toBeTruthy();
    expect(nostrService.isLocked()).toBe(true);
    expect(screen.queryByTestId('your-key-nsec')).toBeNull();
  });
});
