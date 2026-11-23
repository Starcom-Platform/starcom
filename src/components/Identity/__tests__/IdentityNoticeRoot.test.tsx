/**
 * The notice a person sees when this browser makes them a signing key.
 *
 * The service's own behaviour is verified in services/identity/__tests__ — what is
 * checked here is that a person is actually TOLD, that the key can be got out, and
 * that nothing claims deleting it unpublishes anything.
 *
 * The service is mocked: nostr-tools cannot sign under jsdom (@noble rejects a
 * Uint8Array from jsdom's realm), and this is a test about what is on the screen.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { nip19 } from 'nostr-tools';
import { DockHost } from '../../Dock/DockHost';
import IdentityNoticeRoot from '../IdentityNoticeRoot';
import { recordIdentityCreated, pendingIdentityNotice, clearIdentityNotice } from '../../../services/identity/identityNotice';

const forgetIdentity = vi.fn();
const exportNsec = vi.fn(() => 'nsec1exampleexampleexampleexampleexampleexampleexampleexam');
let hasExtension = false;
const writeText = vi.fn(async (_text: string) => {});

const lockKey = vi.fn(async (_passphrase: string) => {});
let lockState: 'none' | 'locked' | 'unlocked' = 'none';

vi.mock('../../../services/identity/NostrIdentityService', () => ({
  nostrIdentityService: {
    getPubkey: () => 'a'.repeat(64),
    exportNsec: () => exportNsec(),
    exportNsecUnlocking: async () => exportNsec(),
    forgetIdentity: () => forgetIdentity(),
    hasExtension: () => hasExtension,
    heldByUplink: () => null,
    keyLockState: () => lockState,
    lockKey: (passphrase: string) => lockKey(passphrase),
  },
}));

beforeEach(() => {
  localStorage.clear();
  clearIdentityNotice();
  forgetIdentity.mockClear();
  exportNsec.mockClear();
  lockKey.mockClear();
  lockState = 'none';
  hasExtension = false;
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  document.querySelectorAll('[data-test-modal]').forEach((el) => el.remove());
});

describe('when nothing has been created', () => {
  it('shows nothing at all', () => {
    render(<IdentityNoticeRoot />);
    expect(screen.queryByTestId('identity-notice')).toBeNull();
  });
});

describe('when this browser has just made a key', () => {
  beforeEach(() => recordIdentityCreated('sending a chat message'));

  it('says a key exists, what caused it, and where it lives', () => {
    render(<IdentityNoticeRoot />);

    const panel = screen.getByTestId('identity-notice');
    expect(panel.textContent).toContain('sending a chat message');
    // The two facts a person needs: it signs as them, and it is only here.
    expect(panel.textContent).toMatch(/signed with it/i);
    expect(panel.textContent).toMatch(/unencrypted in this browser only/i);
    expect(screen.getByTestId('identity-notice-pubkey').textContent).toMatch(/^npub1/);
  });

  // K16: it sat at the screen's bottom-right corner over the globe's layer count and key.
  it('docks in the bottom-right corner, stacked with what is already there rather than over it', () => {
    render(<DockHost><IdentityNoticeRoot /></DockHost>);
    const slot = screen.getByTestId('identity-notice').closest('[data-dock-slot]');
    expect(slot?.getAttribute('data-dock-slot')).toBe('identityNotice');
    expect(slot?.parentElement?.getAttribute('data-dock')).toBe('bottom-right');
  });

  it('appears for a key created while it was already on screen', () => {
    clearIdentityNotice();
    render(<IdentityNoticeRoot />);
    expect(screen.queryByTestId('identity-notice')).toBeNull();

    // The ordinary case: the person sends their first message with the app open.
    act(() => recordIdentityCreated('sending a chat message'));

    expect(screen.getByTestId('identity-notice')).toBeTruthy();
  });

  it('hands over the key, with what having it means', async () => {
    render(<IdentityNoticeRoot />);
    fireEvent.click(screen.getByTestId('identity-notice-reveal'));

    expect((await screen.findByTestId('identity-notice-nsec')).textContent).toMatch(/^nsec1/);
    expect(screen.getByTestId('identity-notice').textContent).toMatch(/can sign as you/i);
  });

  it('does not delete on the first click, and says what deleting cannot undo', () => {
    render(<IdentityNoticeRoot />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete this key…' }));

    expect(forgetIdentity).not.toHaveBeenCalled();
    const confirm = screen.getByTestId('identity-notice-confirm');
    expect(confirm.textContent).toMatch(/stays published/i);
    expect(confirm.textContent).toMatch(/cannot be recovered/i);

    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }));
    expect(forgetIdentity).toHaveBeenCalledTimes(1);
  });

  it('stops showing once acknowledged, and stays gone', () => {
    const { unmount } = render(<IdentityNoticeRoot />);
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

    expect(screen.queryByTestId('identity-notice')).toBeNull();
    expect(pendingIdentityNotice()).toBeNull();

    // Not merely hidden in this component's state: a reload must not bring it back.
    unmount();
    render(<IdentityNoticeRoot />);
    expect(screen.queryByTestId('identity-notice')).toBeNull();
  });

  it('mentions an installed extension as the better arrangement', () => {
    hasExtension = true;
    render(<IdentityNoticeRoot />);

    expect(screen.getByTestId('identity-notice').textContent).toMatch(/One is installed/i);
  });
});

/*
 * Plan item 0.8. The only Copy button this panel had copied the SECRET key, and
 * registering with a team's relay asks for the public one.
 */
describe('the public key', () => {
  beforeEach(() => recordIdentityCreated('creating a case or mission'));

  it('copies in full, as an npub, without reading the secret', async () => {
    render(<IdentityNoticeRoot />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy public key (npub)' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(nip19.npubEncode('a'.repeat(64))));
    expect(exportNsec).not.toHaveBeenCalled();
  });
});

describe('the secret key', () => {
  beforeEach(() => recordIdentityCreated('creating a case or mission'));

  it('cannot be copied until it has been shown', () => {
    render(<IdentityNoticeRoot />);
    expect(screen.queryByRole('button', { name: /secret/i })).toBeNull();
  });

  it('is copied by a button that says what it is', async () => {
    render(<IdentityNoticeRoot />);
    fireEvent.click(screen.getByTestId('identity-notice-reveal'));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy SECRET key — never share' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^nsec1/)));
  });
});

describe('arriving in the middle of a task', () => {
  const openModal = () => {
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('data-test-modal', '');
    document.body.appendChild(modal);
    return modal;
  };

  it('waits for an open dialog to close before appearing', async () => {
    const modal = openModal();
    render(<IdentityNoticeRoot />);
    // The ordinary case: saving a first case mints the key while its dialog is open.
    act(() => recordIdentityCreated('creating a case or mission'));
    expect(screen.queryByTestId('identity-notice')).toBeNull();

    act(() => modal.remove());

    expect(await screen.findByTestId('identity-notice')).toBeTruthy();
  });

  it('does not put deleting the key beside Got it', () => {
    recordIdentityCreated('creating a case or mission');
    render(<IdentityNoticeRoot />);

    const firstRow = screen.getByRole('button', { name: 'Got it' }).parentElement!;
    expect(within(firstRow).queryByRole('button', { name: /delete/i })).toBeNull();
  });
});

/* D-KL, KL2: the passphrase lock, offered selected when a key is made, and skippable. */
describe('the passphrase lock', () => {
  beforeEach(() => recordIdentityCreated('creating a case or mission'));

  it('is offered selected, says a forgotten passphrase cannot be recovered, and asks to back up first', () => {
    render(<IdentityNoticeRoot />);
    const offer = screen.getByTestId('identity-notice-lock');
    expect((within(offer).getByRole('checkbox', { name: 'Lock this key with a passphrase' }) as HTMLInputElement).checked).toBe(true);
    expect(offer.textContent).toMatch(/nobody can recover the key/i);
    expect(offer.textContent).toMatch(/back the key up first/i);
  });

  it('is skipped by "Got it", which locks nothing', () => {
    render(<IdentityNoticeRoot />);
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(lockKey).not.toHaveBeenCalled();
    expect(pendingIdentityNotice()).toBeNull();
  });

  it('is skipped by unticking it', () => {
    render(<IdentityNoticeRoot />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lock this key with a passphrase' }));
    expect(screen.queryByLabelText(/^Passphrase/)).toBeNull();
    expect(lockKey).not.toHaveBeenCalled();
  });

  it('refuses a short passphrase, and two that differ, before locking anything', async () => {
    render(<IdentityNoticeRoot />);
    fireEvent.change(screen.getByLabelText(/^Passphrase/), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Type it again'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lock it' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/at least 10 characters/);

    fireEvent.change(screen.getByLabelText(/^Passphrase/), { target: { value: 'correct horse battery' } });
    fireEvent.change(screen.getByLabelText('Type it again'), { target: { value: 'correct horse battery!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lock it' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/differ/);
    expect(lockKey).not.toHaveBeenCalled();
  });

  it('locks with the passphrase typed twice, then closes', async () => {
    render(<IdentityNoticeRoot />);
    fireEvent.change(screen.getByLabelText(/^Passphrase/), { target: { value: 'correct horse battery' } });
    fireEvent.change(screen.getByLabelText('Type it again'), { target: { value: 'correct horse battery' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lock it' }));
    await waitFor(() => expect(lockKey).toHaveBeenCalledWith('correct horse battery'));
    await waitFor(() => expect(screen.queryByTestId('identity-notice')).toBeNull());
  });

  it('is not offered for a key already locked, and says where the key is kept', () => {
    lockState = 'locked';
    render(<IdentityNoticeRoot />);
    expect(screen.queryByTestId('identity-notice-lock')).toBeNull();
    expect(screen.getByTestId('identity-notice').textContent).toMatch(/locked with your passphrase/);
  });
});
