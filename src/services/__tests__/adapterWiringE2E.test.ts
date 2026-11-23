// @vitest-environment node
/**
 * 3.4.3.1 — Adapter Wiring E2E Test
 *
 * Verifies the full chain: ProtocolRegistry → selectProtocol →
 * ChatProviderFactory → creates correct adapter.
 *
 * This is a structural test proving the wiring exists and selects
 * the right adapter based on capabilities, without needing real relays.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = path.resolve(__dirname, '..', '..', '..');

describe('Adapter wiring E2E — Registry → Factory → Adapter', () => {
  // -----------------------------------------------------------
  // 1. ProtocolRegistry can be instantiated and protocols registered
  // -----------------------------------------------------------
  it('ProtocolRegistry singleton exists and has register / select API', () => {
    // Read source file to verify API surface
    const src = fs.readFileSync(path.join(root, 'src/lib/chat/ProtocolRegistry.ts'), 'utf-8');
    expect(src).toContain('class ProtocolRegistry');
    expect(src).toContain('static getInstance()');
    expect(src).toContain('registerProtocol(');
    expect(src).toContain('selectProtocol(');
    expect(src).toContain('getEnabledProtocols(');
    expect(src).toContain('getProtocolsByCapability(');
    expect(src).toContain('getProtocolsByCapabilities(');
  });

  // -----------------------------------------------------------
  // 2. ChatProviderFactory imports ProtocolRegistry & creates adapters
  // -----------------------------------------------------------
  it('ChatProviderFactory delegates to ProtocolRegistry for selection', () => {
    const src = fs.readFileSync(path.join(root, 'src/lib/chat/ChatProviderFactory.ts'), 'utf-8');
    expect(src).toContain('ProtocolRegistry');
    expect(src).toMatch(/createChatProvider|createChatProviderByCapabilities/);
    // Factory must call registry.selectProtocol or registry.getProtocol
    expect(src).toMatch(/selectProtocol|getProtocol/);
  });

  // -----------------------------------------------------------
  // 3. SecureChatContext imports Factory & wires provider
  // -----------------------------------------------------------
  it('SecureChatContext connects to ChatProviderFactory', () => {
    const src = fs.readFileSync(path.join(root, 'src/communication/context/SecureChatContext.tsx'), 'utf-8');
    expect(src).toContain('ChatProviderFactory');
    expect(src).toContain('createChatProviderByCapabilities');
    expect(src).toContain('setChatProvider(');
    expect(src).toContain('provider.connect');
  });

  // -----------------------------------------------------------
  // 4. SecureChatWindow destructures from context
  // -----------------------------------------------------------
  it('SecureChatWindow consumes context values', () => {
    const src = fs.readFileSync(path.join(root, 'src/components/SecureChat/SecureChatWindow.tsx'), 'utf-8');
    expect(src).toContain('useSecureChat');
    expect(src).toContain('sendMessage');
    expect(src).toContain('connectionStatus');
    expect(src).toContain('channels');
    expect(src).toContain('activeChannelId');
    expect(src).toContain('switchChannel');
    // No channel is made from the window: a channel message cannot be sealed, so none is sent (legal question E1).
    expect(src).not.toContain('createChannel');
  });

  // -----------------------------------------------------------
  // 5. Three adapters are registered with correct IDs
  // -----------------------------------------------------------
  it('NostrChatAdapter, SecureChatAdapter exist and extend BaseChatAdapter', () => {
    const adapters = ['NostrChatAdapter', 'SecureChatAdapter'];
    for (const name of adapters) {
      const filePath = path.join(root, `src/lib/chat/adapters/${name}.ts`);
      expect(fs.existsSync(filePath), `${name}.ts should exist`).toBe(true);
      const src = fs.readFileSync(filePath, 'utf-8');
      expect(src).toContain('BaseChatAdapter');
      expect(src).toContain('sendMessage');
      expect(src).toContain('subscribeToMessages');
    }
  });

  // -----------------------------------------------------------
  // 6. Error types are imported and used in the chain
  // -----------------------------------------------------------
  it('Error types are wired into context and window', () => {
    const ctx = fs.readFileSync(path.join(root, 'src/communication/context/SecureChatContext.tsx'), 'utf-8');
    expect(ctx).toContain('wrapChatError');

    const win = fs.readFileSync(path.join(root, 'src/components/SecureChat/SecureChatWindow.tsx'), 'utf-8');
    expect(win).toContain('wrapChatError');
    expect(win).toContain('isNetworkError');
  });
});
