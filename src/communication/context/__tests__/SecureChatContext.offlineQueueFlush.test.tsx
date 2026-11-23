/**
 * Phase T3.1 (Teams & Chat operational-reliability roadmap) —
 * OfflineQueue (src/lib/chat/OfflineQueue.ts) was already complete and
 * already used: SecureChatWindow.tsx calls enqueue() on a network-error
 * send failure. But nothing ever called its own startAutoFlush/flush, so
 * a queued message never actually got resent — it just sat in IndexedDB
 * forever. Verifies SecureChatContext now starts auto-flush once a
 * provider connects, wired to the real chatProvider.sendMessage, and
 * tears it down on provider change/unmount.
 */
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { SecureChatProvider } from '../SecureChatContext';
import { useSecureChat } from '../useSecureChat';
import { OfflineQueue } from '../../../lib/chat/OfflineQueue';
import type { ChatProviderInterface } from '../../../lib/chat/interfaces/ChatProviderInterface';
import type { ProtocolInfo } from '../../../lib/chat/types/ProtocolTypes';
import { AdvancedSecurityService } from '../../../security/core/AdvancedSecurityService';
import nostrService from '../../../services/nostrService';
import type { EarthAllianceContact } from '../../types/SecureChat';

function contactFor(pubkey: string): EarthAllianceContact {
  const now = new Date();
  return {
    pubkey, displayName: 'Test Contact',
    pqcPublicKey: { algorithm: 'CRYSTALS-Kyber-768', keyData: new Uint8Array(0), securityLevel: 'NIST-3', createdAt: now, expiresAt: now },
    verifiedIdentity: { earthAllianceId: pubkey, displayName: 'Test Contact', verificationMethod: 'web-of-trust', verifiedBy: 'x', verificationDate: now, verificationSignature: '' },
    securityClearance: 'alpha', lastVerified: now, isEarthAllianceVerified: true, behaviorSignature: 'sig',
    lastActivity: now, isOnline: true, lastSeen: now, preferredRelays: [],
  } as EarthAllianceContact;
}

const { createChatProviderByCapabilities } = vi.hoisted(() => ({
  createChatProviderByCapabilities: vi.fn()
}));
vi.mock('../../../lib/chat/ChatProviderFactory', () => ({
  createChatProviderByCapabilities
}));

const { startAutoFlush, stopAutoFlush, flush } = vi.hoisted(() => ({
  flush: vi.fn(async () => 0),
  startAutoFlush: vi.fn(),
  stopAutoFlush: vi.fn()
}));
vi.mock('../../../lib/chat/OfflineQueue', () => ({
  OfflineQueue: vi.fn().mockImplementation(function () { return ({ startAutoFlush, stopAutoFlush, flush }); })
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SecureChatProvider>{children}</SecureChatProvider>
);

function makeProvider(sendMessage = vi.fn().mockResolvedValue(undefined)): ChatProviderInterface {
  return {
    connect: vi.fn(() => Promise.resolve()),
    getProtocolInfo: vi.fn(() => ({ id: 'nostr', name: 'nostr' } as ProtocolInfo)),
    onConnectionStatusChange: vi.fn(() => () => {}),
    sendMessage
  } as unknown as ChatProviderInterface;
}

describe('SecureChatContext — OfflineQueue auto-flush wiring (Phase T3.1)', () => {
  // Set again for each test: a test after the first found it reset.
  beforeEach(() => {
    vi.mocked(OfflineQueue).mockImplementation(function () { return ({ startAutoFlush, stopAutoFlush, flush }) as never; });
  });
  afterEach(() => {
    // Not vi.restoreAllMocks() — that would also wipe the OfflineQueue
    // constructor mock's mockImplementation set up above, breaking every
    // test after the first with "queue.startAutoFlush is not a function".
    createChatProviderByCapabilities.mockReset();
    startAutoFlush.mockReset();
    stopAutoFlush.mockReset();
  });

  it('starts auto-flush once a provider connects (wired to the real sendMessage), and stops it on unmount', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const provider = makeProvider(sendMessage);
    createChatProviderByCapabilities.mockResolvedValueOnce({ provider });

    const { unmount } = renderHook(() => useSecureChat(), { wrapper });

    await waitFor(() => expect(startAutoFlush).toHaveBeenCalledTimes(1));

    // The sendFn passed to startAutoFlush must actually call through to the
    // real connected provider's sendMessage — not a no-op stand-in.
    const sendFn = startAutoFlush.mock.calls[0][0];
    await sendFn('chan-1', 'queued message', undefined);
    expect(sendMessage).toHaveBeenCalledWith('chan-1', 'queued message', undefined);

    unmount();
    expect(stopAutoFlush).toHaveBeenCalledTimes(1);
  });

  /*
   * Queued messages went out only when the browser next came online, and kept
   * their failed mark when they did (plan item 9.4). They go when chat
   * connects too, and each is marked sent once it has gone.
   */
  it('sends what is queued as soon as chat connects, and marks each message sent once it has gone', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ metadata: { encrypted: true, postQuantum: false } });
    createChatProviderByCapabilities.mockResolvedValueOnce({ provider: makeProvider(sendMessage) });
    flush.mockClear();

    const { result } = renderHook(() => useSecureChat(), { wrapper });
    await waitFor(() => expect(startAutoFlush).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(flush).toHaveBeenCalledTimes(1));

    // A window opened the way the app opens one.
    const spies = [
      vi.spyOn(AdvancedSecurityService.getInstance(), 'validateContact').mockResolvedValue({ isValid: true, confidence: 0.95, warnings: [], requiredActions: [] }),
      vi.spyOn(nostrService, 'getServiceStatus').mockReturnValue({ initialized: true, referenceRelays: 3, connectedRelays: 2 }),
    ];
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    const pubkey = 'c'.repeat(64);
    const chatId = `dm-${pubkey}`;
    await act(async () => { await result.current.openSecureChat(contactFor(pubkey)); });
    Object.defineProperty(window, 'isSecureContext', { value: undefined, configurable: true });
    for (const spy of spies) spy.mockRestore();
    expect(result.current.state.activeWindows.has(chatId)).toBe(true);

    await act(async () => {
      result.current.addMessage(chatId, { id: 'm1', senderId: 'me', recipientId: pubkey, content: 'hi', timestamp: new Date(), deliveryStatus: 'queued', isOutgoing: true } as never);
    });
    const sendFn = startAutoFlush.mock.calls[0][0];
    await act(async () => { await sendFn(chatId, 'hi', undefined, 'm1'); });
    const sent = result.current.state.activeWindows.get(chatId)?.messages.find((m) => m.id === 'm1');
    expect(sent?.deliveryStatus).toBe('sent');
    expect(sent?.isEncrypted).toBe(true);
  });

  it('does not start auto-flush while no provider is connected', async () => {
    // Never let connect() resolve, so chatProvider stays null the whole test.
    const stuckProvider = {
      connect: vi.fn(() => new Promise(() => {})),
      getProtocolInfo: vi.fn(() => ({ id: 'nostr', name: 'nostr' } as ProtocolInfo)),
      onConnectionStatusChange: vi.fn(() => () => {})
    } as unknown as ChatProviderInterface;
    createChatProviderByCapabilities.mockResolvedValueOnce({ provider: stuckProvider });

    renderHook(() => useSecureChat(), { wrapper });

    await new Promise(resolve => setTimeout(resolve, 20));
    expect(startAutoFlush).not.toHaveBeenCalled();
  });
});
