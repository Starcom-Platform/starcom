/**
 * Phase T3.3 (Teams & Chat operational-reliability roadmap) — chat sends
 * had no rate limiting at all; a script (or a bug) could blast unlimited
 * messages through one identity with no defense. Verifies sendMessage now
 * enforces a real, chat-sized limit (30/minute, not the app's existing
 * 'websocket' preset — see nostrService.ts's own comment for why that
 * preset, sized for connection attempts, would be wrong here) keyed by
 * the sender's own pubkey, and that it's honestly rejected (false, not
 * silently dropped) once exceeded — while staying out of the way of
 * genuinely normal usage under the limit.
 *
 * Runs under a plain Node runtime for the same nostr-tools/@noble/hashes
 * cross-realm reason as nostrService.sendMessageBackoff.test.ts; needs the
 * same localStorage polyfill NostrService's keypair persistence requires.
 *
 * @vitest-environment node
 */
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string): void { this.store.set(key, value); }
  removeItem(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
}
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import nostrService from '../nostrService';
import { rateLimiter } from '../../utils/rateLimiting';

describe('NostrService.sendMessage — rate limiting (Phase T3.3)', () => {
  beforeEach(() => {
    vi.spyOn(nostrService.pool, 'publish').mockReturnValue([Promise.resolve('ok')]);
    const pubkey = nostrService.getPublicKey();
    if (pubkey) rateLimiter.clearIdentifier(pubkey);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows sends up to the limit, then honestly rejects the next one (not a silent drop)', async () => {
    for (let i = 0; i < 30; i++) {
      const result = await nostrService.sendMessage('chan-rate-limit-test', `message ${i}`);
      expect(result).toBe(true);
    }

    const blocked = await nostrService.sendMessage('chan-rate-limit-test', 'message 31');
    expect(blocked).toBe(false);
  }, 15000);

  it('does not block a normal, moderately active conversation well under the limit', async () => {
    for (let i = 0; i < 10; i++) {
      const result = await nostrService.sendMessage('chan-normal-usage', `message ${i}`);
      expect(result).toBe(true);
    }
  }, 15000);
});
