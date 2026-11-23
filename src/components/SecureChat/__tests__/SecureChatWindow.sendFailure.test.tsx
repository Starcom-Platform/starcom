/**
 * Chat/teams/coordination audit: a failed message send only logged a
 * console.warn — the user saw no indication anything went wrong, and the
 * "sending"/"failed" delivery-status glyph next to the message was set by
 * directly mutating the SecureMessage object the SecureChatContext reducer
 * owns (`newMessage.deliveryStatus = 'failed'`, same for the retry button's
 * `msg.deliveryStatus = ...`), which React has no reason to notice — so the
 * glyph in the UI could go stale until some unrelated re-render happened to
 * catch up. Fixed by dispatching addMessage/updateMessageStatus through the
 * context (so the message list is real, re-rendered state) and calling
 * hudError so the failure is actually visible.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SecureChatWindow from '../SecureChatWindow';
import type { EarthAllianceContact, SecureChatWindow as ChatWindow } from '../../../types/SecureChat';

window.HTMLElement.prototype.scrollIntoView = vi.fn();

const addMessage = vi.fn();
const updateMessageStatus = vi.fn();
const sendMessage = vi.fn();
const hudError = vi.fn();

vi.mock('../../../utils/hudNotifications', () => ({
  hudError: (...args: unknown[]) => hudError(...args),
}));

vi.mock('../../../communication/context/useSecureChat', () => ({
  useSecureChat: () => ({
    state: {
      emergencyMode: false,
      stealthMode: false,
      globalThreatLevel: 'normal',
      networkStatus: { relayNodes: 0, ipfsNodes: 0, isConnected: true },
    },
    sendMessage,
    connectionStatus: 'connected',
    channels: [],
    activeChannelId: null,
    switchChannel: vi.fn(),
    createChannel: vi.fn(),
    refreshChannels: vi.fn(),
    addMessage,
    updateMessageStatus,
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

describe('SecureChatWindow — failed send notifies the user', () => {
  it('calls hudError and marks the message failed via the context, not by mutation', async () => {
    addMessage.mockClear();
    updateMessageStatus.mockClear();
    hudError.mockClear();
    sendMessage.mockRejectedValueOnce(new Error('relay unreachable'));

    render(
      <SecureChatWindow
        chatWindow={makeWindow()}
        onClose={() => {}}
        onMinimize={() => {}}
        onMaximize={() => {}}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => expect(updateMessageStatus).toHaveBeenCalledWith('chat-1', expect.any(String), 'failed'));

    // Message content is added through the context, never pushed onto chatWindow.messages directly.
    expect(addMessage).toHaveBeenCalledWith('chat-1', expect.objectContaining({ content: 'hello', deliveryStatus: 'sending' }));
    expect(hudError).toHaveBeenCalledTimes(1);
    expect(hudError.mock.calls[0][0]).toBe('Message Failed to Send');
  });
});
