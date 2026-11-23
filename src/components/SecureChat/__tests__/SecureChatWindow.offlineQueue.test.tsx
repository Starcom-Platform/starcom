/**
 * Chat's offline queue (plan item 9.4). Every failed send was wrapped as a
 * network error, so every one was queued AND marked failed with a retry
 * button: a retry sent it, and the queue sent it again when the browser next
 * came online. Only a message sent while offline is queued now, and it reads
 * queued, with no retry; one that failed while online is failed, with its
 * retry, and not queued.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SecureChatWindow from '../SecureChatWindow';
import { OfflineQueue } from '../../../lib/chat/OfflineQueue';
import type { EarthAllianceContact, SecureChatWindow as ChatWindow, SecureMessage } from '../../../types/SecureChat';

window.HTMLElement.prototype.scrollIntoView = vi.fn();

const addMessage = vi.fn();
const updateMessageStatus = vi.fn();
const sendMessage = vi.fn();
const enqueue = vi.fn();

vi.mock('../../../utils/hudNotifications', () => ({ hudError: vi.fn(), hudInfo: vi.fn() }));
vi.mock('../../../lib/chat/OfflineQueue', () => ({ OfflineQueue: vi.fn().mockImplementation(function () { return ({ enqueue }); }) }));
vi.mock('../../../communication/context/useSecureChat', () => ({
  useSecureChat: () => ({
    state: { emergencyMode: false, stealthMode: false, globalThreatLevel: 'normal', networkStatus: { relayNodes: 0, ipfsNodes: 0, isConnected: true } },
    sendMessage, connectionStatus: 'connected', channels: [], activeChannelId: null,
    switchChannel: vi.fn(), createChannel: vi.fn(), refreshChannels: vi.fn(), addMessage, updateMessageStatus,
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

function makeWindow(): ChatWindow {
  const now = new Date();
  return {
    id: 'chat-1',
    contact: makeContact('pk-1'),
    position: { x: 0, y: 0, width: 320, height: 400, zIndex: 1 },
    size: { width: 320, height: 400 },
    zIndex: 1,
    isMinimized: false,
    isMaximized: false,
    isActive: true,
    messages: [],
    threatLevel: 'normal',
    encryptionStatus: { algorithm: 'CRYSTALS-Kyber-768', keyStrength: 'NIST-3', isActive: true, lastRotation: now },
    createdAt: now,
    lastActivity: now
  };
}


const online = (value: boolean) => Object.defineProperty(navigator, 'onLine', { value, configurable: true });

async function sendHello(chatWindow = makeWindow()) {
  render(<SecureChatWindow chatWindow={chatWindow} onClose={() => {}} onMinimize={() => {}} onMaximize={() => {}} />);
  fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'hello' } });
  fireEvent.click(screen.getByText('Send'));
  await waitFor(() => expect(updateMessageStatus).toHaveBeenCalled());
  const [[, added]] = addMessage.mock.calls as [[string, SecureMessage]];
  return added.id;
}

describe('SecureChatWindow — the offline queue', () => {
  // Set again for each test: the shared setup restores every mock after each one.
  beforeEach(() => { vi.mocked(OfflineQueue).mockImplementation(function () { return ({ enqueue }) as never; }); addMessage.mockClear(); updateMessageStatus.mockClear(); enqueue.mockReset().mockResolvedValue(undefined); sendMessage.mockReset(); });
  afterEach(() => online(true));

  it('queues a message sent while offline, marks it queued, and says so', async () => {
    online(false);
    sendMessage.mockRejectedValue(new Error('network down'));
    const id = await sendHello();
    await waitFor(() => expect(enqueue).toHaveBeenCalledWith('chat-1', 'hello', undefined, id));
    expect(updateMessageStatus).toHaveBeenLastCalledWith('chat-1', id, 'queued');
    expect(updateMessageStatus).not.toHaveBeenCalledWith('chat-1', id, 'failed');
  });

  it('does not queue a message that failed while online: it is failed, with its retry', async () => {
    online(true);
    sendMessage.mockRejectedValue(new Error('Not sent: chat is not connected.'));
    const id = await sendHello();
    await waitFor(() => expect(updateMessageStatus).toHaveBeenCalledWith('chat-1', id, 'failed'));
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('shows a queued message as queued, with no retry to send it twice', () => {
    const queued = {
      id: 'm1', senderId: 'me', recipientId: 'pk-1', content: 'hello', timestamp: new Date(), isOutgoing: true,
      deliveryStatus: 'queued', isEncrypted: false, encryptionAlgorithm: 'none', messageType: 'text',
    } as unknown as SecureMessage;
    render(<SecureChatWindow chatWindow={{ ...makeWindow(), messages: [queued] }} onClose={() => {}} onMinimize={() => {}} onMaximize={() => {}} />);
    expect(screen.getByTitle('Queued: sends when you are back online')).toBeTruthy();
    expect(screen.queryByTitle('Retry send')).toBeNull();
  });
});
