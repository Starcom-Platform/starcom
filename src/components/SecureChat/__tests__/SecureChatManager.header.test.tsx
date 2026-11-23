/**
 * The chat draws nothing over a screen of its own (decision D-F, step 3.2): its
 * button is in the header, and the header asks for the contact list.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';

vi.mock('../../../communication/context/useSecureChat', () => ({
  useSecureChat: () => ({
    state: {
      networkStatus: { relayNodes: 0, ipfsNodes: 0, isConnected: false, lastHeartbeat: null },
      activeWindows: new Map(),
      emergencyMode: false,
      stealthMode: false,
      globalThreatLevel: 'normal',
    },
    openSecureChat: vi.fn(),
    closeSecureChat: vi.fn(),
    minimizeChat: vi.fn(),
    maximizeChat: vi.fn(),
    updateWindowPosition: vi.fn(),
  }),
}));
vi.mock('../SecureChatContactList', () => ({
  default: ({ isVisible }: { isVisible: boolean }) => (isVisible ? <div data-testid="contact-list" /> : null),
}));
vi.mock('../SecureChatWindow', () => ({ default: () => null }));

import SecureChatManager from '../SecureChatManager';
import { openSecureChatContacts } from '../secureChatEvents';

describe('SecureChatManager', () => {
  it('opens the contact list when the header asks', () => {
    render(<SecureChatManager />);
    expect(screen.queryByTestId('contact-list')).toBeNull();

    act(() => openSecureChatContacts());

    expect(screen.getByTestId('contact-list')).toBeTruthy();
  });

  it('draws no button or connection warning of its own over the screen', () => {
    render(<SecureChatManager />);

    expect(screen.queryByTitle(/secure chat/i)).toBeNull();
    expect(screen.queryByText(/relay or IPFS connection/i)).toBeNull();
  });
});
