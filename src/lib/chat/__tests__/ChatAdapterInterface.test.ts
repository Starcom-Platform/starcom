import { vi } from 'vitest';
/**
 * ChatAdapterInterface.test.ts
 * 
 * Tests for the chat adapter interface to ensure all adapters
 * conform to the expected interface and behavior.
 */

import { ChatProviderInterface } from '../interfaces/ChatProviderInterface';
import { BaseChatAdapter } from '../adapters/BaseChatAdapter';
import { ProtocolRegistry } from '../ProtocolRegistry';
import { initializeChatSystem, createChatProvider } from '../ChatProviderFactory';

// Mock the actual adapter implementations to avoid external dependencies
vi.mock('../adapters/NostrChatAdapter', () => ({
  NostrChatAdapter: class MockNostrAdapter extends BaseChatAdapter {
    protected initializeCapabilities() {
      return {
        messaging: true,
        channels: true,
        presence: false,
        attachments: true,
        encryption: true,
        search: false,
        offline: false,
        p2p: false,
        server_based: false,
        relay_based: true,
        threading: false,
        reactions: true,
        editing: false,
        deletion: true,
        typing: false,
        read_receipts: false,
        mentions: true,
        e2e_encryption: true,
        forward_secrecy: false,
        pq_encryption: false,
        persistent_history: true,
        message_expiry: false,
        sync: false
      };
    }
    
    protected initializeProtocolInfo() {
      return {
        id: 'nostr',
        name: 'Nostr',
        description: 'Notes and Other Stuff Transmitted by Relays',
        version: '1.0.0',
        isP2P: false,
        isServerless: false,
        isEncrypted: true
      };
    }
    
    // Implement abstract methods
    async connect() { /* mock implementation */ }
    async disconnect() { /* mock implementation */ }
    async sendMessage() { return {} as any; }
    async getMessages() { return []; }
    subscribeToMessages() { return () => {}; }
    async createChannel() { return {} as any; }
    async joinChannel() { /* mock implementation */ }
    async leaveChannel() { /* mock implementation */ }
    async getChannels() { return []; }
    async getUsers() { return []; }
    async getUserById() { return null; }
    subscribeToUserPresence() { return () => {}; }
    async markMessagesAsRead() { /* mock implementation */ }
    async uploadAttachment() { return { id: '', url: '' }; }
  }
}));

describe('ChatProviderInterface', () => {
  beforeAll(() => {
    // registerDefaultProtocols() also runs as a module-load side effect, but calling
    // it explicitly here makes registration deterministic under vitest's mocked/
    // isolated module context rather than relying on import-order timing.
    initializeChatSystem();
  });

  describe('Protocol Registry', () => {
    it('should register all protocols', () => {
      const registry = ProtocolRegistry.getInstance();
      const protocols = registry.getAllProtocols();
      
      expect(protocols.length).toBeGreaterThanOrEqual(2);
      expect(protocols.map(p => p.id)).toContain('nostr');
      expect(protocols.map(p => p.id)).toContain('secure');
    });

    it('should select protocols by capability', () => {
      const registry = ProtocolRegistry.getInstance();

      const encryptionProtocols = registry.getProtocolsByCapability('encryption');
      expect(encryptionProtocols.length).toBeGreaterThan(0);

      // 'secure' is now the only registered protocol with p2p:true, since
      // GunChatAdapter (the other p2p-capable protocol) was removed.
      const p2pProtocols = registry.getProtocolsByCapability('p2p');
      expect(p2pProtocols.length).toBeGreaterThan(0);
      expect(p2pProtocols.map(p => p.id)).toContain('secure');
    });

    it('should select the best protocol based on criteria', () => {
      const registry = ProtocolRegistry.getInstance();

      const result1 = registry.selectProtocol({
        requiredCapabilities: ['messaging', 'channels'],
        preferredCapabilities: ['p2p', 'offline'],
        preferP2P: true
      });

      expect(result1.selectedProtocol).toBeDefined();
      expect(result1.selectedProtocol?.id).toBe('secure');

      const result2 = registry.selectProtocol({
        requiredCapabilities: ['messaging', 'channels'],
        preferredCapabilities: ['relay_based'],
        excludedProtocols: ['secure']
      });

      expect(result2.selectedProtocol).toBeDefined();
      expect(result2.selectedProtocol?.id).toBe('nostr');
    });
  });

  describe('ChatProviderFactory', () => {
    it('should create provider instances', async () => {
      const nostrProvider = await createChatProvider({ type: 'nostr' });
      expect(nostrProvider).toBeInstanceOf(BaseChatAdapter);
      expect(nostrProvider.getProtocolInfo().id).toBe('nostr');
    });
  });

  describe('ChatProviderInterface', () => {
    let provider: ChatProviderInterface;

    beforeEach(async () => {
      provider = await createChatProvider({ type: 'nostr' });
    });
    
    it('should expose capability methods', () => {
      expect(provider.getCapabilities).toBeDefined();
      expect(provider.hasCapability).toBeDefined();
      
      const capabilities = provider.getCapabilities();
      expect(capabilities).toHaveProperty('messaging');
      expect(capabilities).toHaveProperty('channels');
      
      expect(provider.hasCapability('messaging')).toBe(true);
    });
    
    it('should expose connection methods', () => {
      expect(provider.connect).toBeDefined();
      expect(provider.disconnect).toBeDefined();
      expect(provider.isConnected).toBeDefined();
      expect(provider.getConnectionStatus).toBeDefined();
      expect(provider.getConnectionDetails).toBeDefined();
      
      expect(provider.isConnected()).toBe(false);
      expect(provider.getConnectionStatus()).toBe('disconnected');
    });
    
    it('should expose message methods', () => {
      expect(provider.sendMessage).toBeDefined();
      expect(provider.getMessages).toBeDefined();
      expect(provider.subscribeToMessages).toBeDefined();
    });
    
    it('should expose channel methods', () => {
      expect(provider.createChannel).toBeDefined();
      expect(provider.joinChannel).toBeDefined();
      expect(provider.leaveChannel).toBeDefined();
      expect(provider.getChannels).toBeDefined();
    });
    
    it('should expose user methods', () => {
      expect(provider.getUsers).toBeDefined();
      expect(provider.getUserById).toBeDefined();
      expect(provider.subscribeToUserPresence).toBeDefined();
    });
    
    it('should handle unsupported features gracefully', async () => {
      // This test checks that unsupported features throw appropriate errors
      await expect(provider.editMessage('msg1', 'channel1', 'New content'))
        .rejects.toThrow('Unsupported feature');
      
      await expect(provider.createThread('msg1', 'channel1', 'New thread'))
        .rejects.toThrow('Unsupported feature');
    });
  });
});
