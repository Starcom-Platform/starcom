/**
 * Cycle B2 — addVerifiedContact() existed with zero call sites before this
 * cycle (SecureChatContactList.tsx had no add-contact affordance at all).
 * Wiring it up surfaced a real gap: the function returned Promise<void>,
 * giving the new caller no way to tell a successful add from a silently
 * failed verification. This verifies the fixed Promise<boolean> contract
 * and the real add-then-appear-in-state behavior the new form depends on.
 */
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SecureChatProvider } from '../SecureChatContext';
import { useSecureChat } from '../useSecureChat';
import { AdvancedSecurityService } from '../../../security/core/AdvancedSecurityService';
import type { EarthAllianceContact } from '../../types/SecureChat';

// AdvancedSecurityService.validateContact's confidence involves a genuinely
// randomized/behavioral trust simulation (see calculateTrustFactors) — real
// on its own terms, but that means a freshly-added contact's pass/fail
// outcome isn't reliably reproducible from this test's side. Spying on the
// shared singleton (getInstance() always returns the same instance
// SecureChatContext.tsx's own securityService reference points to) lets
// this test control the verification outcome directly and verify what this
// cycle actually changed: addVerifiedContact()'s Promise<boolean> contract.
const securityServiceInstance = AdvancedSecurityService.getInstance();

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SecureChatProvider>{children}</SecureChatProvider>
);

function makeContact(overrides: Partial<EarthAllianceContact> = {}): EarthAllianceContact {
  const now = new Date();
  return {
    pubkey: 'a'.repeat(64),
    displayName: 'Test Contact',
    pqcPublicKey: {
      algorithm: 'CRYSTALS-Kyber-768',
      keyData: new Uint8Array(0),
      securityLevel: 'NIST-3',
      createdAt: now,
      expiresAt: new Date(now.getTime() + 1000)
    },
    verifiedIdentity: {
      earthAllianceId: 'a'.repeat(64),
      displayName: 'Test Contact',
      verificationMethod: 'web-of-trust',
      verifiedBy: 'local-operator',
      verificationDate: now,
      verificationSignature: ''
    },
    securityClearance: 'alpha',
    lastVerified: now,
    isEarthAllianceVerified: false,
    behaviorSignature: '',
    lastActivity: now,
    isOnline: false,
    lastSeen: now,
    preferredRelays: [],
    ...overrides
  };
}

describe('SecureChatContext.addVerifiedContact (Cycle B2)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves true and the contact appears in verifiedContacts when verification passes', async () => {
    vi.spyOn(securityServiceInstance, 'validateContact').mockResolvedValue({
      isValid: true, confidence: 0.95, warnings: [], requiredActions: []
    });

    const { result } = renderHook(() => useSecureChat(), { wrapper });
    const contact = makeContact({ pubkey: 'b'.repeat(64) });

    let succeeded: boolean = false;
    await act(async () => {
      succeeded = await result.current.addVerifiedContact(contact);
    });

    expect(succeeded).toBe(true);
    await waitFor(() => {
      expect(result.current.state.verifiedContacts.get(contact.pubkey)?.displayName).toBe('Test Contact');
    });
  });

  it('resolves false and does NOT add the contact when verification fails — this is the gap the add-contact form needed the boolean return to detect', async () => {
    vi.spyOn(securityServiceInstance, 'validateContact').mockResolvedValue({
      isValid: false, confidence: 0.2, warnings: [{ type: 'low_trust', severity: 'critical', message: 'untrusted', recommendation: 'reject' }], requiredActions: []
    });

    const { result } = renderHook(() => useSecureChat(), { wrapper });
    const contact = makeContact({ pubkey: 'd'.repeat(64) });

    let succeeded: boolean = true;
    await act(async () => {
      succeeded = await result.current.addVerifiedContact(contact);
    });

    expect(succeeded).toBe(false);
    expect(result.current.state.verifiedContacts.has(contact.pubkey)).toBe(false);
  });

  it('a second successful add for the same pubkey updates rather than duplicates', async () => {
    vi.spyOn(securityServiceInstance, 'validateContact').mockResolvedValue({
      isValid: true, confidence: 0.95, warnings: [], requiredActions: []
    });

    const { result } = renderHook(() => useSecureChat(), { wrapper });
    const contact = makeContact({ pubkey: 'c'.repeat(64) });

    await act(async () => { await result.current.addVerifiedContact(contact); });
    await waitFor(() => expect(result.current.state.verifiedContacts.size).toBeGreaterThan(0));
    const sizeAfterFirst = result.current.state.verifiedContacts.size;

    await act(async () => {
      await result.current.addVerifiedContact({ ...contact, displayName: 'Renamed Contact' });
    });

    expect(result.current.state.verifiedContacts.size).toBe(sizeAfterFirst);
    expect(result.current.state.verifiedContacts.get(contact.pubkey)?.displayName).toBe('Renamed Contact');
  });
});
