/**
 * Chat/teams/coordination audit: window dragging was doubly broken.
 *
 * 1. handleMouseMove computed a new x/y on every drag but never did
 *    anything with it beyond a console.log — there was no action/reducer
 *    case to actually move a window, so even a working mousedown would
 *    never visibly move anything (fixed via SecureChatContext's new
 *    UPDATE_WINDOW_POSITION action).
 * 2. Independently, handleMouseDown's drag-start check looked for
 *    `.${styles.chatHeader}` — a class from SecureChatManager's OWN CSS
 *    module — but the header element lives in the separate
 *    SecureChatWindow component and is styled by ITS OWN CSS module.
 *    CSS Modules hash class names per file, so that class was never
 *    applied to any real DOM node and the check always failed silently.
 *    Dragging could never even start. Fixed by using a plain
 *    `data-drag-handle` attribute shared between both files instead of
 *    a cross-file CSS Modules class reference.
 *
 * This test exercises the real, unmocked SecureChatManager +
 * SecureChatWindow pair (only the context hook and network-y bits are
 * mocked) to verify the whole mousedown → mousemove → updateWindowPosition
 * path actually fires end-to-end.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SecureChatManager from '../SecureChatManager';
import type { ChatContact, SecureChatWindow as ChatWindow } from '../../../types/SecureChat';

// jsdom doesn't implement scrollIntoView; SecureChatWindow calls it on mount.
window.HTMLElement.prototype.scrollIntoView = vi.fn();

const updateWindowPosition = vi.fn();

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

function makeWindow(id: string): ChatWindow {
  const now = new Date();
  return {
    id,
    contact: makeContact('pk-1'),
    position: { x: 50, y: 60, width: 320, height: 400, zIndex: 1 },
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

const activeWindows = new Map<string, ChatWindow>();

vi.mock('../../../communication/context/useSecureChat', () => ({
  useSecureChat: () => ({
    state: {
      activeWindows,
      verifiedContacts: new Map(),
      globalThreatLevel: 'normal',
      networkStatus: { relayNodes: 0, ipfsNodes: 0, isConnected: true },
      emergencyMode: false,
      stealthMode: false,
    },
    openSecureChat: vi.fn(),
    closeSecureChat: vi.fn(),
    minimizeChat: vi.fn(),
    maximizeChat: vi.fn(),
    updateWindowPosition,
    addVerifiedContact: vi.fn(),
    sendMessage: vi.fn(),
    connectionStatus: 'connected',
    channels: [],
    activeChannelId: null,
    switchChannel: vi.fn(),
    createChannel: vi.fn(),
    refreshChannels: vi.fn(),
  })
}));

describe('SecureChatManager — window dragging', () => {
  it('starts a drag from the real header element and reports the new position', () => {
    activeWindows.clear();
    activeWindows.set('chat-1', makeWindow('chat-1'));
    updateWindowPosition.mockClear();

    const { container } = render(<SecureChatManager />);

    const handle = container.querySelector('[data-drag-handle]');
    expect(handle).not.toBeNull();

    // Grab the header 10px into the window from its top-left (50,60).
    fireEvent.mouseDown(handle as Element, { clientX: 60, clientY: 70 });
    fireEvent.mouseMove(document, { clientX: 160, clientY: 170 });

    expect(updateWindowPosition).toHaveBeenCalledWith('chat-1', 150, 160);
  });

  it('does not start a drag from outside the header', () => {
    activeWindows.clear();
    activeWindows.set('chat-1', makeWindow('chat-1'));
    updateWindowPosition.mockClear();

    const { container } = render(<SecureChatManager />);
    const windowContainer = container.querySelector('.chatWindowContainer, [class*="chatWindowContainer"]');
    expect(windowContainer).not.toBeNull();

    fireEvent.mouseDown(windowContainer as Element, { clientX: 200, clientY: 300 });
    fireEvent.mouseMove(document, { clientX: 260, clientY: 360 });

    expect(updateWindowPosition).not.toHaveBeenCalled();
  });
});
