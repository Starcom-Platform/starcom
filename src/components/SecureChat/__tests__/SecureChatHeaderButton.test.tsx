/**
 * The secure chat's button, in the header beside the comms icons (decision D-F,
 * step 3.2). It was a bubble docked in the screen's bottom-right corner, over
 * SUPPORT OPS on every application screen, with its connection warning docked over
 * the strip under the header.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../../../utils/hudNotifications', () => ({ hudInfo: vi.fn() }));

const chat = vi.hoisted(() => ({
  state: {
    networkStatus: { relayNodes: 5, ipfsNodes: 0, isConnected: false, lastHeartbeat: null },
    activeWindows: new Map(),
    emergencyMode: false,
    stealthMode: false,
  } as Record<string, unknown>,
}));
vi.mock('../../../communication/context/useSecureChat', () => ({
  useSecureChat: () => ({ state: chat.state }),
}));

import SecureChatHeaderButton from '../SecureChatHeaderButton';
import { SECURE_CHAT_OPEN_EVENT } from '../secureChatEvents';
import { startChatNotices } from '../../../services/chat/chatUnread';
import { emitSealedChat } from '../../../services/chat/sealedChat';

const setState = (patch: Record<string, unknown>) => {
  chat.state = {
    networkStatus: { relayNodes: 5, ipfsNodes: 0, isConnected: false, lastHeartbeat: null },
    activeWindows: new Map(),
    emergencyMode: false,
    stealthMode: false,
    ...patch,
  };
};

beforeEach(() => { setState({}); localStorage.clear(); });

describe('SecureChatHeaderButton', () => {
  it('names the chat and its connection, and marks how it is', () => {
    render(<SecureChatHeaderButton />);

    const button = screen.getByRole('button', { name: 'Chat: IPFS unavailable, 5 relays connected' });
    expect(button.getAttribute('title')).toContain('Chat: IPFS unavailable, 5 relays connected');
    expect(button.querySelector('[data-connection]')?.getAttribute('data-connection')).toBe('partial');
  });

  it('marks a working connection', () => {
    setState({ networkStatus: { relayNodes: 5, ipfsNodes: 1, isConnected: true, lastHeartbeat: null } });
    render(<SecureChatHeaderButton />);

    const button = screen.getByRole('button', { name: 'Chat: connected' });
    expect(button.querySelector('[data-connection]')?.getAttribute('data-connection')).toBe('connected');
  });

  it('opens the contact list when pressed', () => {
    const opened = vi.fn();
    window.addEventListener(SECURE_CHAT_OPEN_EVENT, opened);
    render(<SecureChatHeaderButton />);

    fireEvent.click(screen.getByRole('button'));

    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener(SECURE_CHAT_OPEN_EVENT, opened);
  });

  // It counted open windows, not unread messages (plan item 9.12, decision G5).
  it('counts what is unread, not what is open, and says so', () => {
    setState({ activeWindows: new Map([['a', {}], ['b', {}], ['c', {}]]) });
    const stop = startChatNotices();
    render(<SecureChatHeaderButton />);
    expect(screen.getByRole('button').textContent).not.toContain('3');

    act(() => {
      for (const id of ['u1', 'u2']) {
        emitSealedChat({ id, senderId: 'b'.repeat(64), recipients: [], content: 'x', timestamp: Date.now(), postQuantum: true, decryptionFailed: false });
      }
    });

    const button = screen.getByRole('button', { name: 'Chat: IPFS unavailable, 5 relays connected. 2 unread' });
    expect(button.querySelector('[data-testid="chat-unread"]')?.textContent).toBe('2');
    stop();
  });

  it('cannot be pressed in emergency mode', () => {
    setState({ emergencyMode: true });
    render(<SecureChatHeaderButton />);

    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });

  // K3: its mark was an emoji, one per mode; each mode is a glyph from the registry.
  it('draws the glyph of the mode the chat is in', () => {
    const glyph = () => screen.getByRole('button').querySelector('svg[data-symbol]')!.getAttribute('data-symbol');
    setState({ emergencyMode: false, stealthMode: false });
    const { unmount } = render(<SecureChatHeaderButton />);
    expect(glyph()).toBe('chat:open');
    unmount();
    setState({ emergencyMode: false, stealthMode: true });
    const second = render(<SecureChatHeaderButton />);
    expect(glyph()).toBe('chat:stealth');
    second.unmount();
    setState({ emergencyMode: true, stealthMode: false });
    render(<SecureChatHeaderButton />);
    expect(glyph()).toBe('chat:emergency');
  });
});

