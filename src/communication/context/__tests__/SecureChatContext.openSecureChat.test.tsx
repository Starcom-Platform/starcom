/**
 * openSecureChat's device/network trust gate used to be structurally dead:
 * AdvancedSecurityService.validateDevice/validateNetwork always returned
 * hardcoded trust scores (0.85/0.8) safely above the 0.7 threshold, so the
 * "device or network security below threshold" branch could never actually
 * execute. Fixed to use real signals (window.isSecureContext, real relay
 * connectivity) — this verifies the gate can now genuinely fire.
 *
 * jsdom (this project's test env) does not implement window.isSecureContext
 * at all, so the "insecure" case is jsdom's natural default; the "secure"
 * case is stubbed explicitly.
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SecureChatProvider } from '../SecureChatContext';
import { useSecureChat } from '../useSecureChat';
import { AdvancedSecurityService } from '../../../security/core/AdvancedSecurityService';
import nostrService from '../../../services/nostrService';
import type { ChatContact } from '../../types/SecureChat';

const securityServiceInstance = AdvancedSecurityService.getInstance();

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SecureChatProvider>{children}</SecureChatProvider>
);

function makeContact(pubkey: string): ChatContact {
  const now = new Date();
  return {
    pubkey,
    displayName: 'Test Contact',
    pqcPublicKey: { algorithm: 'CRYSTALS-Kyber-768', keyData: new Uint8Array(0), securityLevel: 'NIST-3', createdAt: now, expiresAt: now },
    verifiedIdentity: { pubkey, displayName: 'Test Contact', verificationMethod: 'web-of-trust', verifiedBy: 'x', verificationDate: now, verificationSignature: '' },
    securityClearance: 'alpha',
    lastVerified: now,
    isVerified: true,
    behaviorSignature: 'sig',
    lastActivity: now,
    isOnline: true,
    lastSeen: now,
    preferredRelays: []
  };
}

describe('SecureChatContext.openSecureChat — real device/network trust gate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when device is insecure (jsdom default), network is disconnected, and threat level is critical', async () => {
    vi.spyOn(securityServiceInstance, 'validateContact').mockResolvedValue({
      isValid: true, confidence: 0.95, warnings: [], requiredActions: []
    });
    vi.spyOn(nostrService, 'getServiceStatus').mockReturnValue({ initialized: true, referenceRelays: 3, connectedRelays: 0 });

    const { result } = renderHook(() => useSecureChat(), { wrapper });

    await act(async () => {
      result.current.updateThreatLevel('critical');
    });

    await expect(
      act(async () => {
        await result.current.openSecureChat(makeContact('a'.repeat(64)));
      })
    ).rejects.toThrow('Cannot open chat during critical threat level with low device/network trust');
  });

  it('succeeds when device is secure and relays are connected, even at critical threat level', async () => {
    vi.spyOn(securityServiceInstance, 'validateContact').mockResolvedValue({
      isValid: true, confidence: 0.95, warnings: [], requiredActions: []
    });
    vi.spyOn(nostrService, 'getServiceStatus').mockReturnValue({ initialized: true, referenceRelays: 3, connectedRelays: 2 });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });

    const { result } = renderHook(() => useSecureChat(), { wrapper });

    await act(async () => {
      result.current.updateThreatLevel('critical');
    });

    await act(async () => {
      await result.current.openSecureChat(makeContact('b'.repeat(64)));
    });

    expect(result.current.state.activeWindows.has(`dm-${'b'.repeat(64)}`)).toBe(true);

    Object.defineProperty(window, 'isSecureContext', { value: undefined, configurable: true });
  });
});

describe('SecureChatContext.openSecureChat — opening is using chat (MF15)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('counts a conversation the person opened as using chat, and one a message opened as not', async () => {
    const { secureChatIntegration } = await import('../../../services/SecureChatIntegrationService');
    const used = vi.spyOn(secureChatIntegration, 'markChatUsed').mockImplementation(() => undefined);
    vi.spyOn(securityServiceInstance, 'validateContact').mockResolvedValue({ isValid: false, confidence: 0, warnings: [], requiredActions: [] });
    const { result } = renderHook(() => useSecureChat(), { wrapper });

    await act(async () => { await result.current.openSecureChat(makeContact('c'.repeat(64)), { byPerson: false }).catch(() => undefined); });
    expect(used).not.toHaveBeenCalled();
    await act(async () => { await result.current.openSecureChat(makeContact('d'.repeat(64))).catch(() => undefined); });
    expect(used).toHaveBeenCalledTimes(1);
  });
});
