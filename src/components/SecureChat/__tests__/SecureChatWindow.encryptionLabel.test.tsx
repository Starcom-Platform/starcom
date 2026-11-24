/**
 * The direct-message window says what was sent (plan item 0.2).
 *
 * Every message was built with `isEncrypted: true` and "CRYSTALS-Kyber-1024"
 * before anything was sent, and the status bar read "PQC-NIST-3" from the
 * contact record, whose key is empty. The two-profile check
 * (scripts/check-chat.mjs, 2026-09-26) found those labels beside text that had
 * crossed the relays in plain text. A message is now marked from what the
 * send reports, and the window makes no claim of its own.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SecureChatWindow from '../SecureChatWindow';
import type { ChatContact, SecureChatWindow as ChatWindow, SecureMessage } from '../../../types/SecureChat';

window.HTMLElement.prototype.scrollIntoView = vi.fn();

const addMessage = vi.fn();
const updateMessageStatus = vi.fn();
const sendMessage = vi.fn();

vi.mock('../../../utils/hudNotifications', () => ({ hudError: vi.fn() }));

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
    displayName: 'Marcus',
    pqcPublicKey: { algorithm: 'CRYSTALS-Kyber-768', keyData: new Uint8Array(0), securityLevel: 'NIST-3', createdAt: now, expiresAt: now },
    verifiedIdentity: { pubkey, displayName: 'Marcus', verificationMethod: 'web-of-trust', verifiedBy: 'x', verificationDate: now, verificationSignature: '' },
    lastVerified: now,
    isVerified: false,
    behaviorSignature: '',
    lastActivity: now,
    isOnline: true,
    lastSeen: now,
    preferredRelays: []
  };
}

function makeWindow(messages: SecureMessage[] = []): ChatWindow {
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

function sent(content: string, isEncrypted: boolean, postQuantum = false): SecureMessage {
  const now = new Date();
  return {
    id: `m-${content}`, chatId: 'chat-1', encryptedContent: content, content, messageType: 'text',
    isOutgoing: true, isEncrypted, postQuantum, deliveryStatus: 'sent', senderPubkey: 'pk-me', senderSignature: '',
    encryptionAlgorithm: 'CRYSTALS-Kyber-768', timestampHash: '', isVerified: false, authenticityScore: 0,
    timestamp: now, sentAt: now, relayNodes: [],
  };
}

const renderWindow = (chatWindow = makeWindow()) => render(
  <SecureChatWindow chatWindow={chatWindow} onClose={() => {}} onMinimize={() => {}} onMaximize={() => {}} />
);

async function type(text: string) {
  fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: text } });
  fireEvent.click(screen.getByText('Send'));
}

describe('SecureChatWindow — encryption is reported, never assumed', () => {
  beforeEach(() => {
    addMessage.mockClear();
    updateMessageStatus.mockClear();
    sendMessage.mockReset();
  });

  it('adds a message without claiming encryption, and records plain text as plain', async () => {
    sendMessage.mockResolvedValue({ encrypted: false });
    renderWindow();

    await type('Two of the five sites look closed.');

    expect(addMessage).toHaveBeenCalledWith('chat-1', expect.objectContaining({ isEncrypted: false }));
    await waitFor(() => expect(updateMessageStatus).toHaveBeenCalledWith('chat-1', expect.any(String), 'sent', false, false));
  });

  it('records a message as sealed, and whether post-quantum, as the send reports it', async () => {
    sendMessage.mockResolvedValueOnce({ encrypted: true, postQuantum: true });
    renderWindow();
    await type('Checking by phone at 10.');
    await waitFor(() => expect(updateMessageStatus).toHaveBeenCalledWith('chat-1', expect.any(String), 'sent', true, true));

    sendMessage.mockResolvedValueOnce({ encrypted: true, postQuantum: false });
    await type('And again at 11.');
    await waitFor(() => expect(updateMessageStatus).toHaveBeenCalledWith('chat-1', expect.any(String), 'sent', true, false));
  });

  it('claims no signature it did not check (plan item 8.3b)', () => {
    // A message carrying a `signature` field drew a ✅ "Signed: Ed25519", and the
    // window verified nothing. Nothing sets that field, so it drew nothing; a
    // field that arrived on a message would have been believed.
    renderWindow(makeWindow([{ ...sent('signed words', false), metadata: { signature: 'ab'.repeat(32), signatureAlgorithm: 'Ed25519' } }]));
    expect(screen.queryByTitle(/^Signed/)).toBeNull();
    expect(document.body.textContent).not.toContain('✅');
  });

  it('makes no post-quantum claim of its own', () => {
    renderWindow();
    expect(document.body.textContent).not.toMatch(/PQC-NIST|CRYSTALS|PQC Encrypted/);
  });

  it('marks each message for what it was: post-quantum, sealed without it, or plain', () => {
    renderWindow(makeWindow([sent('plain words', false), sent('sealed words', true, false), sent('post-quantum words', true, true)]));

    expect(screen.getAllByTitle(/post-quantum \(ML-KEM-768\)/)).toHaveLength(1);
    expect(screen.getAllByText('not post-quantum')).toHaveLength(1);
    expect(screen.getAllByText('Not encrypted')).toHaveLength(1);
  });

  // A received message was sealed to you: the lock said "to them" on both sides.
  it('says a message received was sealed to you, and one sent was sealed to them', () => {
    const received = (content: string, postQuantum: boolean): SecureMessage => ({ ...sent(content, true, postQuantum), id: `in-${content}`, isOutgoing: false, deliveryStatus: 'delivered' });
    renderWindow(makeWindow([sent('to them', true, true), received('to you', true), received('to you, classical', false)]));

    expect(screen.getByTitle('Sealed to them, post-quantum (ML-KEM-768)')).toBeTruthy();
    expect(screen.getByTitle('Sealed to you, post-quantum (ML-KEM-768)')).toBeTruthy();
    expect(screen.getByTitle(/^Sealed to you with NIP-44/)).toBeTruthy();
    expect(screen.queryByTitle(/they have published no post-quantum key/)).toBeNull();
  });

  it('scores nobody: no trust percentage beside the person (refusal R-6)', () => {
    renderWindow();
    expect(document.body.textContent).not.toMatch(/Trust/i);
    expect(document.body.textContent).not.toMatch(/\d+%/);
  });
});
