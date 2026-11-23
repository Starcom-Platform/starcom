/**
 * Asking for your name (plan item 2.1, story S2: "There is no screen to set a
 * display name").
 *
 * Asked once there is a key for the name to stand for, after the key notice
 * and never over a dialog, so a first look at the globe is not interrupted.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import OwnNameRoot, { openOwnNamePrompt } from '../OwnNameRoot';
import { forgetNames, ownName } from '../../../services/identity/names';
import { nostrIdentityService } from '../../../services/identity/NostrIdentityService';
import { recordIdentityCreated, acknowledgeIdentityNotice, clearIdentityNotice } from '../../../services/identity/identityNotice';

const ME = 'a'.repeat(64);

beforeEach(() => {
  forgetNames();
  localStorage.removeItem('starcom.names.asked');
  clearIdentityNotice();
  vi.restoreAllMocks();
});

describe('OwnNameRoot', () => {
  it('asks nothing while there is no key for a name to stand for', () => {
    vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue(null);
    render(<OwnNameRoot />);
    expect(screen.queryByTestId('own-name-prompt')).toBeNull();
  });

  it('asks once there is a key, keeps the name, and does not ask again', () => {
    vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue(ME);
    const { unmount } = render(<OwnNameRoot />);

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: '  Priya Raman ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(ownName()).toBe('Priya Raman');
    expect(screen.queryByTestId('own-name-prompt')).toBeNull();
    unmount();
    render(<OwnNameRoot />);
    expect(screen.queryByTestId('own-name-prompt')).toBeNull();
  });

  it('takes "Not now" as an answer, and does not ask again', () => {
    vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue(ME);
    const { unmount } = render(<OwnNameRoot />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByTestId('own-name-prompt')).toBeNull();
    unmount();
    render(<OwnNameRoot />);
    expect(screen.queryByTestId('own-name-prompt')).toBeNull();
    expect(ownName()).toBeNull();
  });

  it('waits while the key notice is showing, then asks', () => {
    vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue(ME);
    recordIdentityCreated('creating a case');
    render(<OwnNameRoot />);
    expect(screen.queryByTestId('own-name-prompt')).toBeNull();

    act(() => { acknowledgeIdentityNotice(); });
    expect(screen.getByTestId('own-name-prompt')).toBeTruthy();
  });

  it('opens again on request, with the name you have, to change it', () => {
    vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue(ME);
    render(<OwnNameRoot />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Priya Raman' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    act(() => { openOwnNamePrompt(); });
    expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('Priya Raman');
  });

  it('says the name is never published', () => {
    vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue(ME);
    render(<OwnNameRoot />);
    expect(screen.getByTestId('own-name-prompt').textContent).toMatch(/never published/i);
  });
});
