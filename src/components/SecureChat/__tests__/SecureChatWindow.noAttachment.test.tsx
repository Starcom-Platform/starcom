/**
 * The direct-message window offers no attachment (plan 9.1, decision G1).
 *
 * Its paperclip uploaded the plain file to IPFS and sent a public gateway link,
 * marked `encrypted: false`, outside the publish review: evidence attached to a
 * private message was published. Attachments come back encrypted on the team
 * relay (9.10). The publish-review guard now counts an IPFS upload as publishing.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SecureChatWindow from '../SecureChatWindow';
import type { ChatContact, SecureChatWindow as ChatWindow } from '../../../types/SecureChat';

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

describe('SecureChatWindow — no attachment until it can be encrypted', () => {
  it('offers no file to attach', () => {
    const { container } = render(
      <SecureChatWindow chatWindow={makeWindow()} onClose={() => {}} onMinimize={() => {}} onMaximize={() => {}} />,
    );
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(container.querySelector('button[title*="Attach" i]')).toBeNull();
    expect(container.textContent).not.toContain('Upload & Send');
  });
});
