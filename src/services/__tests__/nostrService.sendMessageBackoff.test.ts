/**
 * Phase T3.2 (Teams & Chat operational-reliability roadmap) —
 * NostrService.sendMessage used to make exactly one relay-publish attempt;
 * a single transient failure (a dropped connection, a slow relay) meant a
 * genuinely sendable message silently failed with no retry at all. This
 * verifies sendMessage now retries the whole build+publish (via
 * ServiceBackoffController) and still returns true once a later attempt
 * succeeds, and that the retry count is real (not just "doesn't throw").
 *
 * Runs under a plain Node runtime, not this project's default jsdom —
 * same reason as RealTimeTeamService.inviteCodeSigning.test.ts: jsdom's
 * TextEncoder returns a Uint8Array from a different realm than the
 * ambient one in this project's jsdom+vitest+esbuild combination, which
 * breaks nostr-tools' internal event-hash `instanceof Uint8Array` check
 * inside nip28.channelMessageEvent — a genuine pre-existing
 * test-environment gap, not a production bug (the exact same call already
 * works in the real running app and in this repo's other Node-runtime
 * test files). NostrService also needs `localStorage` (for keypair
 * persistence), which plain Node doesn't provide — polyfilled locally as
 * a minimal in-memory Map-backed shim, only here, same as that file.
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

import { describe, it, expect, vi, afterEach } from 'vitest';
import nostrService from '../nostrService';

describe('NostrService.sendMessage — retry/backoff on relay publish (Phase T3.2)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retries after transient publish failures and still succeeds', async () => {
    let call = 0;
    vi.spyOn(nostrService.pool, 'publish').mockImplementation(() => {
      call += 1;
      if (call < 3) {
        // Every relay rejects -> Promise.any rejects -> this attempt fails.
        return [Promise.reject(new Error(`relay down, attempt ${call}`))];
      }
      return [Promise.resolve('ok')];
    });

    const result = await nostrService.sendMessage('chan-backoff-test', 'hello team');

    expect(result).toBe(true);
    expect(call).toBe(3);
  }, 10000);

  it('gives up and returns false (not a throw) once retries are exhausted', async () => {
    vi.spyOn(nostrService.pool, 'publish').mockImplementation(() => [
      Promise.reject(new Error('relay permanently down'))
    ]);

    await expect(nostrService.sendMessage('chan-backoff-exhausted', 'hello team')).resolves.toBe(false);
  }, 10000);
});
