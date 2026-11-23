/**
 * Bug fix: initAdapter() previously only logged "falling back to local
 * mode" when the primary protocol's connect() failed — it never actually
 * constructed or connected a fallback provider, so chatProvider stayed
 * null forever. In production this made investigation/team chat silently
 * completely non-functional, since the capability-scoring in
 * ProtocolRegistry always picks 'secure' first and SecureChatIntegration-
 * Service is missing most of the methods SecureChatAdapter needs to
 * connect. This verifies initAdapter now falls through to a working
 * alternative protocol, reusing the same excludedProtocols mechanism the
 * later onConnectionStatusChange-driven fallback already used.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SecureChatProvider } from '../SecureChatContext';
import { useSecureChat } from '../useSecureChat';
import type { ChatProviderInterface } from '../../../lib/chat/interfaces/ChatProviderInterface';
import type { ProtocolInfo } from '../../../lib/chat/types/ProtocolTypes';

const { createChatProviderByCapabilities } = vi.hoisted(() => ({
  createChatProviderByCapabilities: vi.fn()
}));

vi.mock('../../../lib/chat/ChatProviderFactory', () => ({
  createChatProviderByCapabilities
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SecureChatProvider>{children}</SecureChatProvider>
);

function makeProvider(id: string, connectImpl: () => Promise<void>): ChatProviderInterface {
  return {
    connect: vi.fn(connectImpl),
    getProtocolInfo: vi.fn(() => ({ id, name: id } as ProtocolInfo)),
    onConnectionStatusChange: vi.fn(() => () => {})
  } as unknown as ChatProviderInterface;
}

describe('SecureChatContext initAdapter fallback (bug fix)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    createChatProviderByCapabilities.mockReset();
  });

  it('falls back to a working protocol when the primary one fails to connect', async () => {
    const failing = makeProvider('secure', () => Promise.reject(new Error('service.connect is not a function')));
    const working = makeProvider('nostr', () => Promise.resolve());

    createChatProviderByCapabilities
      .mockResolvedValueOnce({ provider: failing })
      .mockResolvedValueOnce({ provider: working });

    const { result } = renderHook(() => useSecureChat(), { wrapper });

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
    });

    expect(result.current.chatProvider).toBe(working);
    expect(result.current.activeProtocol).toBe('nostr');
    expect(result.current.chatProviderLoading).toBe(false);

    // The second call excluded the protocol that just failed.
    expect(createChatProviderByCapabilities).toHaveBeenCalledTimes(2);
    expect(createChatProviderByCapabilities.mock.calls[1][0]).toMatchObject({
      excludedProtocols: ['secure']
    });
    // Both asked only for a provider that seals (audit finding 13): the plain Nostr adapter has no pq_encryption.
    for (const [criteria] of createChatProviderByCapabilities.mock.calls) {
      expect(criteria.requiredCapabilities).toEqual(['messaging', 'pq_encryption']);
    }
  });

  it('ends up cleanly disconnected (not stuck loading, no crash) when every protocol fails', async () => {
    const failingPrimary = makeProvider('secure', () => Promise.reject(new Error('primary down')));
    const failingFallback = makeProvider('nostr', () => Promise.reject(new Error('fallback down too')));

    createChatProviderByCapabilities
      .mockResolvedValueOnce({ provider: failingPrimary })
      .mockResolvedValueOnce({ provider: failingFallback });

    const { result } = renderHook(() => useSecureChat(), { wrapper });

    await waitFor(() => {
      expect(result.current.chatProviderLoading).toBe(false);
    });

    expect(result.current.connectionStatus).toBe('disconnected');
    expect(result.current.chatProvider).toBeNull();
  });

  /*
   * With nothing connected, a send returned as if it had gone, and the window
   * marked the message sent (plan item 9.3). It refuses now, so the message is
   * marked not sent, with its retry.
   */
  it('refuses to send when nothing is connected, rather than reporting it sent', async () => {
    createChatProviderByCapabilities
      .mockResolvedValueOnce({ provider: makeProvider('secure', () => Promise.reject(new Error('primary down'))) })
      .mockResolvedValueOnce({ provider: makeProvider('nostr', () => Promise.reject(new Error('fallback down too'))) });

    const { result } = renderHook(() => useSecureChat(), { wrapper });
    await waitFor(() => expect(result.current.chatProviderLoading).toBe(false));

    await expect(result.current.sendMessage('dm-abc', 'hello')).rejects.toThrow('Not sent: chat is not connected.');
  });
});
