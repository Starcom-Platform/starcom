/**
 * SecureChatIntegrationService — connect/createChannel/getChannels
 * (the real-PQC-chat implementation cycle).
 *
 * The property that actually matters here isn't "createChannel doesn't
 * throw" — it's that channelId is a DETERMINISTIC hash of `name`, not a
 * random id. CollaborationSidebar.tsx always calls createChannel with the
 * same name (`Investigation: ${investigationId}`) for a given
 * investigation; if two different team members' clients derived different
 * ids for that same call, they'd each end up alone in their own channel —
 * "PQC chat that works" but isn't actually shared with anyone. That's the
 * real bug a naive NIP-28-Kind-40-based implementation would have shipped
 * (Kind-40 event ids are a hash of creator pubkey+timestamp+content, which
 * differs per creator).
 *
 * Stays on this project's default jsdom environment rather than a plain
 * Node runtime — same reason as
 * SecureChatIntegrationService.decryptFailure.test.ts: this service
 * transitively imports IPFSService/featureFlags.ts, which hit a
 * module-evaluation-order error specifically under Node. jsdom has no
 * crypto.subtle (needed for the SHA-256 channelId derivation), polyfilled
 * from Node's real webcrypto exactly as that file does.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SecureChatIntegrationService } from '../SecureChatIntegrationService';

describe('SecureChatIntegrationService — channels', () => {
  const service = SecureChatIntegrationService.getInstance();
  // Reach the same NostrService instance the service already holds
  // internally, rather than a fresh top-level `import { NostrService }
  // from '../nostrService'` — an extra static import of that module from
  // this file (even though SecureChatIntegrationService.ts already
  // imports it) trips the same featureFlags.ts module-evaluation-order
  // TDZ bug documented in SecureChatIntegrationService.decryptFailure.
  // test.ts's header, which this file otherwise avoids identically to
  // that one.
  const nostrService = (service as unknown as { nostrService: { subscribeToChannel: (id: string) => string[]; unsubscribeFromChannel: (id: string) => void } }).nostrService;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connect() makes isConnected() true; disconnect() does not throw', async () => {
    // service is a singleton shared across test files in this vitest
    // process (pool: 'forks', singleFork: true) — don't assert its
    // pre-connect state, only that connect() reliably leaves it connected.
    await service.connect();
    expect(service.isConnected()).toBe(true);
    await expect(service.disconnect()).resolves.toBeUndefined();
  });

  it('createChannel derives the SAME channelId for the same name — the property that makes chat actually shared, not solo-per-user', async () => {
    const a = await service.createChannel('Investigation: shared-case-1', 'group', []);
    const b = await service.createChannel('Investigation: shared-case-1', 'group', []);

    expect(a.channelId).toBe(b.channelId);
    expect(a.channelId.length).toBeGreaterThan(0);
  });

  it('createChannel derives DIFFERENT channelIds for different names', async () => {
    const a = await service.createChannel('Investigation: case-A', 'group', []);
    const b = await service.createChannel('Investigation: case-B', 'group', []);

    expect(a.channelId).not.toBe(b.channelId);
  });

  it('channelId is a pure SHA-256 hash of the name — independently reproducible, not reliant on any singleton/in-memory state', async () => {
    const name = 'Investigation: independently-verifiable';
    const created = await service.createChannel(name, 'group', []);

    // Derive the expected id the same way a totally separate client would
    // (its own crypto.subtle call, no shared registry, no prior knowledge
    // of this singleton's state) — proves convergence comes from the hash
    // itself, not from ChatChannelStore having "already seen" this name.
    const bytes = new TextEncoder().encode(name);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const expectedId = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');

    expect(created.channelId).toBe(expectedId);
  });

  it('createChannel called again with new participants merges them into the existing record rather than clobbering it', async () => {
    const name = 'Investigation: merge-participants';
    await service.createChannel(name, 'group', ['pk-alice']);
    const merged = await service.createChannel(name, 'group', ['pk-bob']);

    expect(merged.participants).toEqual(expect.arrayContaining(['pk-alice', 'pk-bob']));
  });

  it('getChannels returns previously created channels', async () => {
    const created = await service.createChannel('Investigation: list-me', 'group', []);
    const all = await service.getChannels();

    expect(all.some(c => c.channelId === created.channelId)).toBe(true);
  });

  it('joinChannel/leaveChannel delegate to the real NostrService subscription methods', async () => {
    const subscribeSpy = vi.spyOn(nostrService, 'subscribeToChannel').mockReturnValue([]);
    const unsubscribeSpy = vi.spyOn(nostrService, 'unsubscribeFromChannel').mockImplementation(() => {});

    await service.joinChannel('some-channel-id');
    expect(subscribeSpy).toHaveBeenCalledWith('some-channel-id');

    await service.leaveChannel('some-channel-id');
    expect(unsubscribeSpy).toHaveBeenCalledWith('some-channel-id');
  });

  it('isPQCEnabled/setPQCEnabled and isEncryptionEnabled/enableEncryption toggle the same underlying flag', () => {
    service.setPQCEnabled(false);
    expect(service.isPQCEnabled()).toBe(false);
    expect(service.isEncryptionEnabled()).toBe(false);

    service.enableEncryption(true);
    expect(service.isPQCEnabled()).toBe(true);
    expect(service.isEncryptionEnabled()).toBe(true);
  });

  it('getActiveUsers/subscribeToPresence are honest empty stubs, matching NostrChatAdapter\'s own presence behavior', async () => {
    await expect(service.getActiveUsers()).resolves.toEqual([]);

    const callback = vi.fn();
    const unsubscribe = service.subscribeToPresence('some-channel', callback);
    expect(callback).toHaveBeenCalledWith([]);
    expect(() => unsubscribe()).not.toThrow();
  });

  it.each([
    ['editMessage', () => service.editMessage()],
    ['deleteMessage', () => service.deleteMessage()],
    ['createThread', () => service.createThread()],
    ['getThreadMessages', () => service.getThreadMessages()],
    ['addReaction', () => service.addReaction()],
    ['removeReaction', () => service.removeReaction()],
    ['searchMessages', () => service.searchMessages()],
  ])('%s throws a clear "not supported" error rather than silently no-oping', async (_name, call) => {
    await expect(call()).rejects.toThrow(/not supported/);
  });

  it('subscribeToThreadMessages throws synchronously (not a rejected promise — it returns an unsubscribe function, not a promise)', () => {
    expect(() => service.subscribeToThreadMessages()).toThrow(/not supported/);
  });
});
