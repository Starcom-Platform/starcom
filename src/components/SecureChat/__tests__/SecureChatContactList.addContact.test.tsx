/**
 * SecureChatContactList — Cycle B2 hardening pass.
 *
 * No test file existed for this component at all. Covers a real bug:
 * ADD_CONTACT's reducer keys a Map by pubkey, so re-adding an existing
 * pubkey through this form would silently overwrite that contact's real
 * accumulated state (trust score, online status, verification history)
 * with the form's fresh defaults — not merely create a harmless duplicate.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SecureChatContactList from '../SecureChatContactList';
import type { ChatContact } from '../../../types/SecureChat';
import { nip19 } from 'nostr-tools';

const addVerifiedContact = vi.fn();
let mockVerifiedContacts = new Map<string, ChatContact>();

vi.mock('../../../communication/context/useSecureChat', () => ({
  useSecureChat: () => ({
    state: {
      verifiedContacts: mockVerifiedContacts,
      globalThreatLevel: 'normal',
      networkStatus: { relayNodes: 0, ipfsNodes: 0, isConnected: false },
      emergencyMode: false,
    },
    addVerifiedContact,
  })
}));

function makeExistingContact(pubkey: string): ChatContact {
  const now = new Date();
  return {
    pubkey,
    displayName: 'Existing Contact',
    pqcPublicKey: { algorithm: 'CRYSTALS-Kyber-768', keyData: new Uint8Array(0), securityLevel: 'NIST-3', createdAt: now, expiresAt: now },
    verifiedIdentity: { pubkey, displayName: 'Existing Contact', verificationMethod: 'web-of-trust', verifiedBy: 'x', verificationDate: now, verificationSignature: '' },
    lastVerified: now,
    isVerified: true,
    behaviorSignature: 'real-signature',
    lastActivity: now,
    isOnline: true,
    lastSeen: now,
    preferredRelays: []
  };
}

describe('SecureChatContactList — add contact duplicate/error handling', () => {
  beforeEach(() => {
    addVerifiedContact.mockReset();
    mockVerifiedContacts = new Map();
  });

  const openAddContactForm = () => {
    render(<SecureChatContactList isVisible={true} onClose={() => {}} onContactSelect={() => {}} />);
    fireEvent.click(screen.getByText('+ Add Contact'));
  };

  it('rejects re-adding an existing pubkey without calling addVerifiedContact, protecting the real record from being overwritten', async () => {
    mockVerifiedContacts.set('pk-existing', makeExistingContact('pk-existing'));
    openAddContactForm();

    fireEvent.change(screen.getByPlaceholderText('Public key (npub or hex)'), { target: { value: 'pk-existing' } });
    fireEvent.change(screen.getByPlaceholderText('Display name'), { target: { value: 'New Name Attempt' } });
    fireEvent.click(screen.getByText('Verify & Add'));

    expect(await screen.findByText(/already a verified contact/i)).toBeTruthy();
    expect(addVerifiedContact).not.toHaveBeenCalled();
  });

  it('surfaces a thrown error (not just a false resolution) as a visible message rather than failing silently', async () => {
    addVerifiedContact.mockRejectedValue(new Error('network unreachable'));
    openAddContactForm();

    fireEvent.change(screen.getByPlaceholderText('Public key (npub or hex)'), { target: { value: 'pk-new' } });
    fireEvent.change(screen.getByPlaceholderText('Display name'), { target: { value: 'New Contact' } });
    fireEvent.click(screen.getByText('Verify & Add'));

    expect(await screen.findByText(/network unreachable/i)).toBeTruthy();
    // Busy state must clear even after a thrown error, so the form is usable again.
    await waitFor(() => expect(screen.getByText('Verify & Add')).not.toBeDisabled());
  });

  it('a genuinely new contact is added successfully and the form resets', async () => {
    addVerifiedContact.mockResolvedValue(true);
    openAddContactForm();

    fireEvent.change(screen.getByPlaceholderText('Public key (npub or hex)'), { target: { value: 'pk-new' } });
    fireEvent.change(screen.getByPlaceholderText('Display name'), { target: { value: 'New Contact' } });
    fireEvent.click(screen.getByText('Verify & Add'));

    await waitFor(() => expect(addVerifiedContact).toHaveBeenCalledOnce());
    const [addedContact] = addVerifiedContact.mock.calls[0];
    expect(addedContact.pubkey).toBe('pk-new');
    expect(addedContact.displayName).toBe('New Contact');
  });

  /*
   * The identity panel now copies the public key as an npub (plan item 0.8), the
   * form other Nostr apps use. Stored as typed, an npub became a contact under a
   * key no message is ever addressed to.
   */
  it('accepts a key pasted as an npub, and keeps it as the hex key messages are addressed to', async () => {
    addVerifiedContact.mockResolvedValue(true);
    openAddContactForm();
    const hex = 'b'.repeat(64);

    fireEvent.change(screen.getByPlaceholderText('Public key (npub or hex)'), { target: { value: `  ${nip19.npubEncode(hex)} ` } });
    fireEvent.change(screen.getByPlaceholderText('Display name'), { target: { value: 'Marcus' } });
    fireEvent.click(screen.getByText('Verify & Add'));

    await waitFor(() => expect(addVerifiedContact).toHaveBeenCalledOnce());
    expect(addVerifiedContact.mock.calls[0][0].pubkey).toBe(hex);
  });

  it('recognises an existing contact pasted as its npub', async () => {
    const hex = 'c'.repeat(64);
    mockVerifiedContacts.set(hex, makeExistingContact(hex));
    openAddContactForm();

    fireEvent.change(screen.getByPlaceholderText('Public key (npub or hex)'), { target: { value: nip19.npubEncode(hex) } });
    fireEvent.change(screen.getByPlaceholderText('Display name'), { target: { value: 'Again' } });
    fireEvent.click(screen.getByText('Verify & Add'));

    expect(await screen.findByText(/already a verified contact/i)).toBeTruthy();
    expect(addVerifiedContact).not.toHaveBeenCalled();
  });

  it('says so when an npub does not decode, rather than adding it', async () => {
    openAddContactForm();

    fireEvent.change(screen.getByPlaceholderText('Public key (npub or hex)'), { target: { value: 'npub1notarealkey' } });
    fireEvent.change(screen.getByPlaceholderText('Display name'), { target: { value: 'Typo' } });
    fireEvent.click(screen.getByText('Verify & Add'));

    expect(await screen.findByText(/not a valid npub/i)).toBeTruthy();
    expect(addVerifiedContact).not.toHaveBeenCalled();
  });
});
