/**
 * "Translate" where people's words arrive (D-ML, chat and captures): beneath a chat message someone sent, and
 * a capture's own words. Never beneath your own words, nor a message that could not be opened (its text is
 * Starcom's note of why), nor a link or an image, whose titles are Starcom's words. Chat and captures are
 * never Public, so only this device translates them (ML6).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import SecureChatWindow from '../../SecureChat/SecureChatWindow';
import CapturesInbox from '../../Extension/CapturesInbox';
import { captureToItem } from '../../../extension/captureItems';
import { intelWorkspaceManager } from '../../../services/intel/IntelWorkspaceManager';
import type { Capture } from '../../../extension/protocol';
import type { EarthAllianceContact, SecureChatWindow as ChatWindow, SecureMessage } from '../../../types/SecureChat';

window.HTMLElement.prototype.scrollIntoView = vi.fn();
vi.mock('../../../utils/hudNotifications', () => ({ hudError: vi.fn() }));
vi.mock('../../../communication/context/useSecureChat', () => ({
  useSecureChat: () => ({
    state: { emergencyMode: false, stealthMode: false, globalThreatLevel: 'normal', networkStatus: { relayNodes: 0, ipfsNodes: 0, isConnected: true } },
    sendMessage: vi.fn(), connectionStatus: 'connected', channels: [], activeChannelId: null,
    switchChannel: vi.fn(), createChannel: vi.fn(), refreshChannels: vi.fn(), addMessage: vi.fn(), updateMessageStatus: vi.fn(),
  }),
}));

const GERMAN = 'Der Fluss ist über Nacht um drei Meter gestiegen, und die Brücke ist gesperrt.';

/** The browser's own translator, stood in, so the offer can be made. */
beforeEach(() => {
  (globalThis as { Translator?: unknown }).Translator = { availability: async () => 'available', create: async () => ({ translate: async (t: string) => t }) };
});
afterEach(() => { delete (globalThis as { Translator?: unknown }).Translator; });

const now = new Date();
const contact = { pubkey: 'pk-1', displayName: 'Marcus' } as unknown as EarthAllianceContact;
const message = (id: string, over: Partial<SecureMessage>): SecureMessage => ({
  id, chatId: 'chat-1', encryptedContent: '', content: GERMAN, messageType: 'text', isOutgoing: false, isEncrypted: true, postQuantum: true,
  deliveryStatus: 'delivered', senderPubkey: 'pk-1', senderSignature: '', encryptionAlgorithm: 'CRYSTALS-Kyber-768', timestampHash: '',
  isVerified: true, authenticityScore: 0, timestamp: now, sentAt: now, relayNodes: [], ...over,
} as SecureMessage);
const chatWindow = (messages: SecureMessage[]): ChatWindow => ({
  id: 'chat-1', contact, position: { x: 0, y: 0, width: 320, height: 400, zIndex: 1 }, size: { width: 320, height: 400 }, zIndex: 1,
  isMinimized: false, isMaximized: false, isActive: true, messages, threatLevel: 'normal',
  encryptionStatus: { algorithm: 'CRYSTALS-Kyber-768', keyStrength: 'NIST-3', isActive: true, lastRotation: now }, createdAt: now, lastActivity: now,
} as ChatWindow);

describe('Translate, where words arrive', () => {
  it('is offered beneath a chat message someone sent, and not beneath yours or one that could not be opened', async () => {
    render(<SecureChatWindow chatWindow={chatWindow([
      message('theirs', {}),
      message('mine', { isOutgoing: true, deliveryStatus: 'sent' }),
      // In another language than the one shown, so only the rule can hide it.
      message('unopened', { isEncrypted: false }),
    ])} onClose={() => {}} onMinimize={() => {}} onMaximize={() => {}} />);

    expect(await screen.findByTestId('chat-translate-theirs')).toBeTruthy();
    expect(screen.queryByTestId('chat-translate-mine')).toBeNull();
    expect(screen.queryByTestId('chat-translate-unopened')).toBeNull();
  });

  it("is offered beneath a capture's own words, and not beneath a link's", async () => {
    intelWorkspaceManager.resetForTests();
    localStorage.clear();
    await intelWorkspaceManager.ensureInitialized();
    const page = { url: 'https://zeitung.example.de/hochwasser', title: 'Hochwasser' };
    const words = intelWorkspaceManager.addIntelItem(captureToItem({ id: 'w', kind: 'selection', text: GERMAN, page, at: now.toISOString() } as Capture));
    const link = intelWorkspaceManager.addIntelItem(captureToItem({ id: 'l', kind: 'link', link: 'https://zeitung.example.de/karte', page, at: now.toISOString() } as Capture));
    render(<CapturesInbox />);

    expect(await screen.findByTestId(`capture-translate-${words.id}`)).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId('capture-row')).toHaveLength(2));
    expect(screen.queryByTestId(`capture-translate-${link.id}`)).toBeNull();
  });
});
