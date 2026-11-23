/**
 * Chat asks for a provider that seals (audit finding 13, legal question E1). Among the registered protocols only the
 * secure one has post-quantum sealing, so with it excluded, as the fallback excludes a provider that failed, nothing
 * is chosen: the plain Nostr adapter, which sends channel messages in plain text, is never the fallback.
 */
import { describe, it, expect } from 'vitest';
import { initializeChatSystem } from '../ChatProviderFactory';
import { ProtocolRegistry } from '../ProtocolRegistry';

describe('choosing a chat provider that seals', () => {
  initializeChatSystem();
  const registry = ProtocolRegistry.getInstance();
  const NEEDS = ['messaging', 'pq_encryption'];

  it('chooses the secure provider', () => {
    expect(registry.selectProtocol({ requiredCapabilities: NEEDS }).selectedProtocol?.id).toBe('secure');
  });

  it('chooses nothing once the secure provider is excluded, never the plain Nostr one', () => {
    expect(registry.selectProtocol({ requiredCapabilities: NEEDS, excludedProtocols: ['secure'] }).selectedProtocol?.id).toBeUndefined();
  });
});
