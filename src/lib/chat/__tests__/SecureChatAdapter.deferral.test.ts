/**
 * A call made before the service finishes loading must WAIT, not fail.
 *
 * The adapter loads its real service asynchronously from its constructor and,
 * in the meantime, installed a stand-in whose every method rejected with
 * "Service not initialized". The app connects to chat during startup, so that
 * stand-in is exactly what the startup call met: every visit logged "Failed to
 * connect to SecureChat service: Service not initialized" four times. Nothing
 * was broken but the timing.
 *
 * Every existing test in this directory injects a service override, which
 * skips the stand-in entirely — which is why this went unnoticed. This one
 * deliberately does not.
 */
import { describe, it, expect, vi } from 'vitest';

/**
 * A class, not an object literal, and its method reads its own field — because
 * the first version of the fix called the real service's method DETACHED, so
 * `this` was undefined and it threw on a field read instead. The shape of the
 * double has to be able to catch that.
 */
vi.mock('../../../services/SecureChatIntegrationService', () => {
  class FakeSecureChatIntegrationService {
    private isInitialized = true;
    private static instance = new FakeSecureChatIntegrationService();
    static getInstance() { return FakeSecureChatIntegrationService.instance; }

    /** Every method reads a field, so a lost receiver is always caught. */
    private assertReceiver() {
      if (!this.isInitialized) throw new Error('called with no receiver');
    }
    private connected = false;
    async connect() { this.assertReceiver(); this.connected = true; }
    isConnected() { this.assertReceiver(); return this.connected; }
    isEncryptionEnabled() { return true; }
    isPQCEnabled() { return true; }
    enableEncryption() { /* no-op */ }
    setPQCEnabled() { /* no-op */ }
    async getChannels() {
      this.assertReceiver();
      return [{ channelId: 'global', name: 'Global', type: 'group' }];
    }
    async createChannel(name: string, type: string) {
      this.assertReceiver();
      return { channelId: `${type}-1`, name, type };
    }
  }
  return { SecureChatIntegrationService: FakeSecureChatIntegrationService };
});

import { SecureChatAdapter } from '../adapters/SecureChatAdapter';

describe('SecureChatAdapter before its service has loaded', () => {
  it('waits for the real service instead of rejecting', async () => {
    // No serviceOverride: this is the path the running app takes, and connect()
    // is what it calls during startup — immediately, before the dynamic import
    // of the service can possibly have resolved.
    const adapter = new SecureChatAdapter();
    await expect(adapter.connect()).resolves.toBeUndefined();
  });

  it('calls the real service with its receiver intact', async () => {
    // The double throws 'called with no receiver' if `this` is lost. That is
    // not hypothetical: the first version of this fix invoked the real
    // service's methods detached, and the running app threw
    // "Cannot read properties of undefined (reading 'isInitialized')".
    const adapter = new SecureChatAdapter();
    await adapter.connect();
    await expect(adapter.getChannels()).resolves.toBeDefined();
  });
});
