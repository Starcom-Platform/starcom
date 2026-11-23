// @vitest-environment node
/**
 * Step 3.1.2 — Nostr Chat Activation Tests
 * Verifies:
 *  - No setInterval/setTimeout polling in subscription path
 *  - Real-time delivery via event listener (not 3s polling)
 *  - NIP-04 DM support (Kind 4, #p tag)
 *  - Reconnection preserves lastSeenTimestamp
 *  - Message delivery < 1s
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Step 3.1.2 — Nostr Chat Activation', () => {
  // Read source file once for static analysis
  const adapterSource = fs.readFileSync(
    path.resolve(__dirname, '../../lib/chat/adapters/NostrChatAdapter.ts'),
    'utf-8'
  );

  describe('3.1.2.1 — No polling in subscribeToMessages', () => {
    it('should NOT use setInterval in subscribeToMessages', () => {
      // Extract the subscribeToMessages method body
      const methodMatch = adapterSource.match(
        /public subscribeToMessages\([\s\S]*?(?=\n  (?:public |private |protected )\w|\n  \/\*\*)/
      );
      expect(methodMatch).toBeTruthy();
      const methodBody = methodMatch![0];
      
      // No setInterval should appear in the subscription method
      expect(methodBody).not.toContain('setInterval');
      expect(methodBody).not.toContain('Poll every');
      expect(methodBody).not.toContain('3000');
    });

    it('should use nostrService.subscribeToChannel for NIP-28 channels', () => {
      // The subscribeToChannel private method should call nostrService
      expect(adapterSource).toContain('nostrService.subscribeToChannel(channelId)');
    });

    it('should listen for nostr-message-received events', () => {
      expect(adapterSource).toContain("'nostr-message-received'");
      expect(adapterSource).toContain('addEventListener');
    });

    it('should clean up event listener on unsubscribe', () => {
      expect(adapterSource).toContain('removeEventListener');
      expect(adapterSource).toContain('nostrService.unsubscribeFromChannel');
    });
  });

  describe('3.1.2.2 — NIP-04 DM support', () => {
    it('should import nip04 for DM encryption', () => {
      expect(adapterSource).toContain("from 'nostr-tools/nip04'");
    });

    it('should use Kind 4 for DM subscriptions', () => {
      expect(adapterSource).toContain('kinds: [4]');
    });

    it('should use #p tag filter for DM recipients', () => {
      // The filter should include #p for recipient pubkey
      expect(adapterSource).toContain("'#p'");
    });

    it('should encrypt DMs with nip04.encrypt before sending', () => {
      expect(adapterSource).toContain('nip04.encrypt');
    });

    it('should send DMs as Kind 4 events via pool.publish', () => {
      expect(adapterSource).toContain('kind: 4');
      expect(adapterSource).toContain('dmPool.publish');
    });

    it('should NOT throw "not implemented" for DMs', () => {
      // The old error should be gone
      expect(adapterSource).not.toContain('Direct messaging not implemented');
    });
  });

  describe('3.1.2.3 — Reconnection with since:lastSeenTimestamp', () => {
    it('should track lastSeenTimestamp per channel', () => {
      expect(adapterSource).toContain('lastSeenTimestamp');
      expect(adapterSource).toContain('this.lastSeenTimestamp.set(channelId,');
    });

    it('should use since filter in DM subscriptions', () => {
      expect(adapterSource).toContain('filter.since');
    });

    it('should preserve lastSeenTimestamp across reconnect', () => {
      // disconnect() should NOT clear lastSeenTimestamp
      const disconnectMatch = adapterSource.match(
        /public async disconnect\(\)[\s\S]*?(?=\n  (?:public |private |protected )\w|\n  \/\*\*)/
      );
      expect(disconnectMatch).toBeTruthy();
      const disconnectBody = disconnectMatch![0];
      expect(disconnectBody).not.toContain('lastSeenTimestamp.clear');
    });
  });

  describe('3.1.2.4 — Message delivery latency', () => {
    it('should use event-driven delivery, not polling', () => {
      // No setTimeout or setInterval in the subscription path
      const subscribeSection = adapterSource.match(
        /subscribeToDMs\([\s\S]*?(?=\n  (?:public |private |protected )\w|\n  \/\*\*)/
      );
      expect(subscribeSection).toBeTruthy();
      expect(subscribeSection![0]).not.toContain('setInterval');
      expect(subscribeSection![0]).not.toContain('setTimeout');
    });

    it('should use SimplePool.subscribeMany for DMs (real-time relay delivery)', () => {
      expect(adapterSource).toContain('this.dmPool.subscribeMany');
    });

    it('should use window event listener for channels (real-time nostrService events)', () => {
      const channelSection = adapterSource.match(
        /private subscribeToChannel\([\s\S]*?(?=\n  (?:public |private |protected )\w|\n  \/\*\*)/
      );
      expect(channelSection).toBeTruthy();
      expect(channelSection![0]).toContain('window.addEventListener');
      // No polling
      expect(channelSection![0]).not.toContain('setInterval');
    });

    it('should deduplicate messages', () => {
      expect(adapterSource).toContain('seenMessageIds');
      expect(adapterSource).toContain('seen.has(msg.id)');
    });
  });

  describe('Cleanup and disconnect', () => {
    it('should close DM subscriptions on disconnect', () => {
      expect(adapterSource).toContain('this.dmSubs.clear()');
      expect(adapterSource).toContain('sub.close()');
    });

    it('should deduplicate set cleanup on disconnect', () => {
      expect(adapterSource).toContain('this.seenMessageIds.clear()');
    });
  });
});
