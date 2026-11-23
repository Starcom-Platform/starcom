// @vitest-environment node
/**
 * 3.4.3.4 — ProtocolRegistry Selection Unit Test
 *
 * Exercises the real ProtocolRegistry singleton: register, unregister,
 * capability filtering, weighted scoring, exclusion, and priority tie-breaking.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ProtocolRegistry } from '../../lib/chat/ProtocolRegistry';
import type {
  ProtocolRegistration,
  ChatProviderCapabilities,
} from '../../lib/chat/types/ProtocolTypes';

/** Helper to build a minimal ProtocolRegistration */
function makeReg(
  id: string,
  priority: number,
  caps: Partial<ChatProviderCapabilities>,
  enabled = true,
): ProtocolRegistration {
  const defaults: ChatProviderCapabilities = {
    messaging: false, channels: false, presence: false, attachments: false,
    encryption: false, search: false, offline: false, threading: false,
    reactions: false, editing: false, deletion: false, typing: false,
    read_receipts: false, mentions: false, e2e_encryption: false,
    forward_secrecy: false, pq_encryption: false, p2p: false,
    server_based: false, relay_based: false, persistent_history: false,
    message_expiry: false, sync: false, serverless: false,
  };
  return {
    id,
    name: id,
    adapterClass: `${id}Adapter`,
    defaultEndpoints: [],
    defaultCapabilities: { ...defaults, ...caps },
    isEnabled: enabled,
    priority,
  };
}

describe('ProtocolRegistry — selection unit tests', () => {
  let registry: ProtocolRegistry;

  beforeEach(() => {
    // Get singleton and clear any leftover state
    registry = ProtocolRegistry.getInstance();
    for (const p of registry.getAllProtocols()) {
      registry.unregisterProtocol(p.id);
    }
  });

  // 1 — register & retrieve
  it('registers and retrieves a protocol', () => {
    const reg = makeReg('nostr', 1, { messaging: true, encryption: true });
    registry.registerProtocol(reg);
    expect(registry.getProtocol('nostr')).toBe(reg);
    expect(registry.getAllProtocols()).toHaveLength(1);
  });

  // 2 — unregister
  it('unregisters a protocol', () => {
    registry.registerProtocol(makeReg('gun', 2, { messaging: true }));
    expect(registry.unregisterProtocol('gun')).toBe(true);
    expect(registry.getProtocol('gun')).toBeUndefined();
  });

  // 3 — getEnabledProtocols filters disabled ones
  it('getEnabledProtocols excludes disabled', () => {
    registry.registerProtocol(makeReg('a', 1, { messaging: true }, true));
    registry.registerProtocol(makeReg('b', 2, { messaging: true }, false));
    expect(registry.getEnabledProtocols()).toHaveLength(1);
    expect(registry.getEnabledProtocols()[0].id).toBe('a');
  });

  // 4 — getProtocolsByCapability
  it('filters by single capability', () => {
    registry.registerProtocol(makeReg('enc', 1, { messaging: true, encryption: true }));
    registry.registerProtocol(makeReg('plain', 2, { messaging: true, encryption: false }));
    const encrypted = registry.getProtocolsByCapability('encryption');
    expect(encrypted).toHaveLength(1);
    expect(encrypted[0].id).toBe('enc');
  });

  // 5 — getProtocolsByCapabilities (multiple)
  it('filters by multiple capabilities', () => {
    registry.registerProtocol(makeReg('full', 1, { messaging: true, channels: true, encryption: true }));
    registry.registerProtocol(makeReg('partial', 2, { messaging: true, channels: true, encryption: false }));
    const results = registry.getProtocolsByCapabilities(['channels', 'encryption']);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('full');
  });

  // 6 — selectProtocol with required capabilities
  it('selectProtocol returns best match for required capabilities', () => {
    registry.registerProtocol(makeReg('nostr', 1, { messaging: true, relay_based: true }));
    registry.registerProtocol(makeReg('gun', 2, { messaging: true, p2p: true }));
    const result = registry.selectProtocol({ requiredCapabilities: ['messaging'] });
    expect(result.selectedProtocol).toBeDefined();
    expect(result.matchScore).toBeGreaterThan(0);
  });

  // 7 — selectProtocol respects excludedProtocols
  it('selectProtocol excludes specified protocols', () => {
    registry.registerProtocol(makeReg('nostr', 1, { messaging: true, encryption: true }));
    registry.registerProtocol(makeReg('gun', 2, { messaging: true }));
    const result = registry.selectProtocol({
      requiredCapabilities: ['messaging'],
      excludedProtocols: ['nostr'],
    });
    expect(result.selectedProtocol?.id).toBe('gun');
  });

  // 8 — selectProtocol prefers encryption when asked
  it('selectProtocol scores preferred capabilities', () => {
    registry.registerProtocol(makeReg('plain', 1, { messaging: true, encryption: false }));
    registry.registerProtocol(makeReg('secure', 2, { messaging: true, encryption: true }));
    const result = registry.selectProtocol({
      requiredCapabilities: ['messaging'],
      preferredCapabilities: ['encryption'],
    });
    expect(result.selectedProtocol?.id).toBe('secure');
  });

  // 9 — no match returns undefined selectedProtocol
  it('returns no match when no protocol meets requirements', () => {
    registry.registerProtocol(makeReg('nostr', 1, { messaging: true }));
    const result = registry.selectProtocol({
      requiredCapabilities: ['messaging', 'pq_encryption'],
    });
    expect(result.selectedProtocol).toBeUndefined();
    expect(result.matchScore).toBe(0);
  });

  // 10 — specificProtocol overrides scoring
  it('specificProtocol selects that protocol directly', () => {
    registry.registerProtocol(makeReg('nostr', 1, { messaging: true }));
    registry.registerProtocol(makeReg('gun', 2, { messaging: true }));
    const result = registry.selectProtocol({
      specificProtocol: 'gun',
      requiredCapabilities: ['messaging'],
    });
    expect(result.selectedProtocol?.id).toBe('gun');
  });

  // 11 — tie-breaking by priority
  it('ties broken by lower priority number', () => {
    registry.registerProtocol(makeReg('low', 10, { messaging: true }));
    registry.registerProtocol(makeReg('high', 1, { messaging: true }));
    const result = registry.selectProtocol({ requiredCapabilities: ['messaging'] });
    // Both have same score (no preferred caps), lower priority wins
    expect(result.selectedProtocol?.id).toBe('high');
  });
});
