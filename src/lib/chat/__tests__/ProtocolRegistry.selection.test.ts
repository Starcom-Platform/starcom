/**
 * Cycle B1 — the confirmed protocol-selection tie-break bug.
 *
 * gun/nostr/secure all register `encryption: true`, so SecureChatContext's
 * old `preferredCapabilities: ['encryption']` scored all three identically
 * (normalizedScore 1.0 for each). ProtocolRegistry.selectProtocol's
 * tie-break then fell to ascending `priority` — gun=2, nostr=1, secure=3 —
 * so nostr won every time, regardless of nostr having pq_encryption: false
 * and secure being the only protocol with real PQC. SecureChatAdapter was
 * effectively dead code on the live selection path.
 *
 * The fix changed WHAT SecureChatContext asks for (pq_encryption,
 * e2e_encryption — real, already-registered capability keys that actually
 * differ between the three protocols) rather than touching the scoring
 * math or priority values themselves.
 */
import { describe, it, expect } from 'vitest';
import { ProtocolRegistry } from '../ProtocolRegistry';
import { initializeChatSystem } from '../ChatProviderFactory';

describe('ProtocolRegistry.selectProtocol — pq_encryption tie-break (Cycle B1)', () => {
  initializeChatSystem();
  const registry = ProtocolRegistry.getInstance();

  it('the old criteria (generic "encryption") ties all three protocols and falls to priority, picking nostr — reproduces the bug', () => {
    const result = registry.selectProtocol({
      requiredCapabilities: ['messaging'],
      preferredCapabilities: ['encryption'],
    });
    expect(result.selectedProtocol?.id).toBe('nostr');
  });

  it('the fixed criteria (pq_encryption + e2e_encryption) selects secure — the only protocol with real PQC', () => {
    const result = registry.selectProtocol({
      requiredCapabilities: ['messaging'],
      preferredCapabilities: ['pq_encryption', 'e2e_encryption'],
    });
    expect(result.selectedProtocol?.id).toBe('secure');
  });

  it('excluding secure (the fallback-on-disconnect path) still prefers nostr over gun — e2e_encryption alone still discriminates', () => {
    const result = registry.selectProtocol({
      requiredCapabilities: ['messaging'],
      preferredCapabilities: ['pq_encryption', 'e2e_encryption'],
      excludedProtocols: ['secure'],
    });
    expect(result.selectedProtocol?.id).toBe('nostr');
  });
});
