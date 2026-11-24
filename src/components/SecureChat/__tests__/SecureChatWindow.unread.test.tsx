/**
 * A direct message's window, open and not minimized, is where its messages are
 * read (plan item 9.12). One arriving there raises no notice and counts as
 * nothing unread; one arriving while it is minimized does.
 */
import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SecureChatWindow from '../SecureChatWindow';
import type { ChatContact, SecureChatWindow as ChatWindow } from '../../../types/SecureChat';

window.HTMLElement.prototype.scrollIntoView = vi.fn();
const hudInfo = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/hudNotifications', () => ({ hudError: vi.fn(), hudInfo: (...a: unknown[]) => hudInfo(...a) }));
vi.mock('../../../communication/context/useSecureChat', () => ({
  useSecureChat: () => ({
    state: { emergencyMode: false, stealthMode: false, globalThreatLevel: 'normal', networkStatus: { relayNodes: 0, ipfsNodes: 0, isConnected: true } },
    sendMessage: vi.fn(), connectionStatus: 'connected', channels: [], activeChannelId: null,
    switchChannel: vi.fn(), createChannel: vi.fn(), refreshChannels: vi.fn(), addMessage: vi.fn(), updateMessageStatus: vi.fn(),
  })
}));

import { startChatNotices, unreadCount } from '../../../services/chat/chatUnread';
import { emitSealedChat } from '../../../services/chat/sealedChat';

function makeContact(pubkey: string): ChatContact {
  const now = new Date();
  return {
    pubkey,
    displayName: 'Test Contact',
    pqcPublicKey: { algorithm: 'CRYSTALS-Kyber-768', keyData: new Uint8Array(0), securityLevel: 'NIST-3', createdAt: now, expiresAt: now },
    verifiedIdentity: { pubkey, displayName: 'Test Contact', verificationMethod: 'web-of-trust', verifiedBy: 'x', verificationDate: now, verificationSignature: '' },
    lastVerified: now,
    isVerified: true,
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


const PK = 'e'.repeat(64);
const from = (id: string) => emitSealedChat({ id, senderId: PK, recipients: [], content: 'Berth 4?', timestamp: Date.now(), postQuantum: true, decryptionFailed: false });

beforeEach(() => { localStorage.clear(); hudInfo.mockReset(); });

describe('SecureChatWindow — where a direct message is read', () => {
  it('reads what arrives while it is open, and counts what arrives while it is minimized', () => {
    const stop = startChatNotices();
    const chatWindow = { ...makeWindow(), id: `dm-${PK}`, contact: makeContact(PK) };
    const { rerender } = render(<SecureChatWindow chatWindow={chatWindow} onClose={() => {}} onMinimize={() => {}} onMaximize={() => {}} />);

    act(() => from('open-1'));
    expect(unreadCount()).toBe(0);
    expect(hudInfo).not.toHaveBeenCalled();

    rerender(<SecureChatWindow chatWindow={{ ...chatWindow, isMinimized: true }} onClose={() => {}} onMinimize={() => {}} onMaximize={() => {}} />);
    act(() => from('min-1'));
    expect(unreadCount()).toBe(1);
    expect(hudInfo).toHaveBeenCalledTimes(1);

    rerender(<SecureChatWindow chatWindow={chatWindow} onClose={() => {}} onMinimize={() => {}} onMaximize={() => {}} />);
    expect(unreadCount()).toBe(0);
    stop();
  });
});
