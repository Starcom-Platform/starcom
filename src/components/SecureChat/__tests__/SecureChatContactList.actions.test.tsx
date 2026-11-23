/**
 * Chat/teams/coordination audit: this component's per-contact "💬 Start
 * Secure Chat" button had no onClick at all — it only appeared to work
 * because clicking it also bubbled up to the whole row's own onClick. The
 * "📞 Voice Call" button was fully inert with no backing capability (this
 * app has no voice-call feature anywhere) — removed rather than left as a
 * fabricated affordance. Verifies the chat button now explicitly selects
 * the contact, and the call button is gone.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SecureChatContactList from '../SecureChatContactList';
import type { EarthAllianceContact } from '../../../types/SecureChat';

const mockVerifiedContacts = new Map<string, EarthAllianceContact>();

vi.mock('../../../communication/context/useSecureChat', () => ({
  useSecureChat: () => ({
    state: {
      verifiedContacts: mockVerifiedContacts,
      globalThreatLevel: 'normal',
      networkStatus: { relayNodes: 0, ipfsNodes: 0, isConnected: false },
      emergencyMode: false,
    },
    addVerifiedContact: vi.fn(),
  })
}));

function makeContact(pubkey: string): EarthAllianceContact {
  const now = new Date();
  return {
    pubkey,
    displayName: 'Test Contact',
    pqcPublicKey: { algorithm: 'CRYSTALS-Kyber-768', keyData: new Uint8Array(0), securityLevel: 'NIST-3', createdAt: now, expiresAt: now },
    verifiedIdentity: { earthAllianceId: pubkey, displayName: 'Test Contact', verificationMethod: 'web-of-trust', verifiedBy: 'x', verificationDate: now, verificationSignature: '' },
    lastVerified: now,
    isEarthAllianceVerified: true,
    behaviorSignature: 'sig',
    lastActivity: now,
    isOnline: true,
    lastSeen: now,
    preferredRelays: []
  };
}

describe('SecureChatContactList — per-contact actions', () => {
  it('the chat button explicitly selects the contact (not just via row bubbling)', () => {
    mockVerifiedContacts.clear();
    mockVerifiedContacts.set('pk-1', makeContact('pk-1'));
    const onContactSelect = vi.fn();

    render(<SecureChatContactList isVisible={true} onClose={() => {}} onContactSelect={onContactSelect} />);
    fireEvent.click(screen.getByTitle(/^Message /));

    expect(onContactSelect).toHaveBeenCalledTimes(1);
    expect(onContactSelect.mock.calls[0][0].pubkey).toBe('pk-1');
  });

  it('has no voice-call button — no such capability exists anywhere in this app', () => {
    mockVerifiedContacts.clear();
    mockVerifiedContacts.set('pk-1', makeContact('pk-1'));

    render(<SecureChatContactList isVisible={true} onClose={() => {}} onContactSelect={() => {}} />);

    expect(screen.queryByTitle('Voice Call')).toBeNull();
    expect(screen.queryByText('📞')).toBeNull();
  });

  it('scores nobody: no trust percentage, and no sorting by one (refusal R-6)', () => {
    mockVerifiedContacts.clear();
    mockVerifiedContacts.set('pk-1', makeContact('pk-1'));

    render(<SecureChatContactList isVisible={true} onClose={() => {}} onContactSelect={() => {}} />);

    expect(screen.queryByText(/Trust/)).toBeNull();
    expect(screen.queryByText(/\d+%/)).toBeNull();
    expect(screen.queryByRole('option', { name: /trust/i })).toBeNull();
  });
});
