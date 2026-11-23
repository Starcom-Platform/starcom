/**
 * A chat message gives its time in UTC, with the date and the local time on hover
 * (decision D-E, settled 2026-09-14 for step 9). It gave the browser's local time
 * of day, so a message from another day read as today's.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import SecureChatWindow from '../SecureChatWindow';
import type { EarthAllianceContact, SecureChatWindow as ChatWindow } from '../../../types/SecureChat';
import { localTimeTitle } from '../../../utils/utcTime';

window.HTMLElement.prototype.scrollIntoView = vi.fn();

const chat = vi.hoisted(() => ({
  state: {
    emergencyMode: false,
    stealthMode: false,
    globalThreatLevel: 'normal',
    networkStatus: { relayNodes: 0, ipfsNodes: 0, isConnected: true },
  },
  sendMessage: vi.fn(),
  connectionStatus: 'connected',
  channels: [],
  activeChannelId: null,
  switchChannel: vi.fn(),
  createChannel: vi.fn(),
  refreshChannels: vi.fn(),
  addMessage: vi.fn(),
  updateMessageStatus: vi.fn(),
}));
vi.mock('../../../utils/hudNotifications', () => ({ hudError: () => {} }));
vi.mock('../../../communication/context/useSecureChat', () => ({ useSecureChat: () => chat }));

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

function windowWith(messages: ChatWindow['messages']): ChatWindow {
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
    messages,
    threatLevel: 'normal',
    encryptionStatus: { algorithm: 'CRYSTALS-Kyber-768', keyStrength: 'NIST-3', isActive: true, lastRotation: now },
    createdAt: now,
    lastActivity: now
  };
}

describe('SecureChatWindow: when a message was sent', () => {
  it('gives it in UTC, with the date and the local time on hover', () => {
    const sent = Date.UTC(2026, 8, 13, 19, 33);
    const message = { id: 'msg-1', content: 'Relay is back.', timestamp: new Date(sent), isOutgoing: false, deliveryStatus: 'delivered' };

    render(
      <SecureChatWindow
        chatWindow={windowWith([message as unknown as ChatWindow['messages'][number]])}
        onClose={() => {}}
        onMinimize={() => {}}
        onMaximize={() => {}}
      />
    );

    expect(screen.getByText('13 Sep 19:33Z')).toHaveAttribute('title', localTimeTitle(sent));
  });
});
