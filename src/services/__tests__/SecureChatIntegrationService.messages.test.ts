/**
 * SecureChatIntegrationService — getMessages/subscribeToMessages real PQC
 * decrypt path (the real-PQC-chat implementation cycle).
 *
 * Before this cycle, subscribeToMessages/getMessages didn't exist on this
 * class at all — processIncomingMessage() (the only place that actually
 * decrypts a PQC envelope) had zero callers anywhere in production. This
 * proves the real property: a message encrypted for this identity's own
 * published prekey bundle (exactly what a real sender would fetch and
 * encrypt against) comes back through getMessages()/subscribeToMessages()
 * as the original plaintext — not just "no error was thrown."
 *
 * Same jsdom + polyfilled crypto.subtle + fake-indexeddb setup as
 * SecureChatIntegrationService.channels.test.ts / .decryptFailure.test.ts,
 * for the same reasons documented there.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, afterEach } from 'vitest';

// Phase T4.1 — new-message notifications. Mocked so tests can assert on
// exactly when it fires without a real NotificationSystem/HUD mounted.
const { hudInfo } = vi.hoisted(() => ({ hudInfo: vi.fn() }));
vi.mock('../../utils/hudNotifications', () => ({ hudInfo }));

import { SecureChatIntegrationService } from '../SecureChatIntegrationService';
import { prekeyBundleStore } from '../crypto/PrekeyBundleStore';
import { ForwardSecrecyService } from '../crypto/ForwardSecrecyService';
import { PQCryptoService } from '../crypto/PQCryptoService';
import { nostrIdentityService } from '../identity/NostrIdentityService';

const toHex = (buf: Uint8Array) => Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');

interface FakeNostrMessage {
  id: string;
  teamId: string;
  channelId: string;
  senderId: string;
  senderDID: string;
  senderAgency: string;
  content: string;
  messageType: string;
  timestamp: number;
  encrypted: boolean;
  pqcEncrypted: boolean;
}

function makeNostrMessage(overrides: Partial<FakeNostrMessage> & { channelId: string; content: string }): FakeNostrMessage {
  return {
    id: `evt_${Math.random().toString(36).slice(2, 8)}`,
    teamId: '',
    senderId: 'pk-sender',
    senderDID: 'did:nostr:pk-sender',
    messageType: 'text',
    timestamp: Date.now(),
    encrypted: false,
    pqcEncrypted: false,
    ...overrides
  };
}

/**
 * Builds a real, genuinely decryptable PQC envelope encrypted FOR this test
 * process's own local identity — the exact envelope shape sendMessage()
 * produces and processIncomingMessage() expects.
 *
 * Deliberately uses NO one-time prekey (otkIndex: undefined) — a real,
 * supported 2-secret session derivation this codebase's own X3DH already
 * falls back to (see ForwardSecrecyService.initiateSession/acceptSession).
 * Using a fixed OTK index here would collide across this file's several
 * tests: prekeyBundleStore is a singleton shared across all of them, and
 * once one test's successful decrypt marks an OTK index consumed,
 * PrekeyBundleStore correctly REFUSES to let a later test's independently-
 * built envelope reuse it (real anti-key-reuse hygiene, not a bug) — which
 * would make every test after the first fail for a reason unrelated to
 * what each test is actually checking.
 */
async function buildRealEnvelopeForSelf(plaintext: string): Promise<string> {
  // Ensured, as the service now does: no identity exists until something needs one.
  const identity = nostrIdentityService.ensureLocalIdentity('a test envelope');

  const forwardSecrecy = new ForwardSecrecyService();
  const { bundle } = await prekeyBundleStore.getOrCreateLocalBundle(identity, forwardSecrecy);
  const pqc = PQCryptoService.getInstance();

  const session = await forwardSecrecy.initiateSession(bundle, undefined);
  const encrypted = await pqc.encryptData(new TextEncoder().encode(plaintext), session.sessionKey);

  return JSON.stringify({
    v: 1,
    ciphertext: toHex(encrypted),
    sessionId: session.sessionId,
    ltCiphertext: toHex(session.ltCiphertext),
    spkCiphertext: toHex(session.spkCiphertext),
    otkCiphertext: undefined,
    otkIndex: undefined
  });
}

describe('SecureChatIntegrationService — getMessages/subscribeToMessages (real PQC decrypt)', () => {
  const service = SecureChatIntegrationService.getInstance();
  const nostrService = (service as unknown as {
    nostrService: {
      getChannelMessages: (channelId: string) => FakeNostrMessage[];
      subscribeToChannel: (channelId: string) => string[];
      unsubscribeFromChannel: (channelId: string) => void;
    };
  }).nostrService;

  afterEach(() => {
    vi.restoreAllMocks();
    hudInfo.mockClear();
  });

  it('getMessages decrypts a real PQC envelope back to the original plaintext', async () => {
    const plaintext = 'Team, rendezvous confirmed at checkpoint Delta.';
    const envelope = await buildRealEnvelopeForSelf(plaintext);
    const channelId = 'test-channel-getmessages';

    vi.spyOn(nostrService, 'getChannelMessages').mockReturnValue([
      makeNostrMessage({ channelId, content: envelope })
    ]);

    const results = await service.getMessages(channelId);

    expect(results).toHaveLength(1);
    expect(results[0].content).toBe(plaintext);
    expect(results[0].channelId).toBe(channelId);
  });

  it('getMessages passes plain (non-PQC) content through unchanged — detected by shape, not a trusted flag', async () => {
    const channelId = 'test-channel-plain';
    vi.spyOn(nostrService, 'getChannelMessages').mockReturnValue([
      makeNostrMessage({ channelId, content: 'just a plain chat message' })
    ]);

    const results = await service.getMessages(channelId);
    expect(results[0].content).toBe('just a plain chat message');
  });

  it('subscribeToMessages delivers already-cached history through callback on subscribe', async () => {
    const plaintext = 'Cached history message.';
    const envelope = await buildRealEnvelopeForSelf(plaintext);
    const channelId = 'test-channel-subscribe-history';

    vi.spyOn(nostrService, 'subscribeToChannel').mockReturnValue([]);
    vi.spyOn(nostrService, 'unsubscribeFromChannel').mockImplementation(() => {});
    vi.spyOn(nostrService, 'getChannelMessages').mockReturnValue([
      makeNostrMessage({ channelId, content: envelope })
    ]);

    const received: string[] = [];
    const unsubscribe = service.subscribeToMessages(channelId, (message) => {
      received.push(message.content);
    });

    // The history delivery is async (it decrypts via processIncomingMessage
    // before invoking callback) — wait for it rather than asserting
    // synchronously.
    await vi.waitFor(() => expect(received).toContain(plaintext));

    unsubscribe();
  });

  it('subscribeToMessages decrypts a live nostr-message-received event and filters by channelId', async () => {
    const plaintext = 'Live incoming message.';
    const envelope = await buildRealEnvelopeForSelf(plaintext);
    const channelId = 'test-channel-subscribe-live';
    const otherChannelId = 'test-channel-subscribe-other';

    vi.spyOn(nostrService, 'subscribeToChannel').mockReturnValue([]);
    vi.spyOn(nostrService, 'unsubscribeFromChannel').mockImplementation(() => {});
    vi.spyOn(nostrService, 'getChannelMessages').mockReturnValue([]); // no cached history

    const received: string[] = [];
    const unsubscribe = service.subscribeToMessages(channelId, (message) => {
      received.push(message.content);
    });

    // A message on a DIFFERENT channel must be ignored.
    window.dispatchEvent(new CustomEvent('nostr-message-received', {
      detail: makeNostrMessage({ channelId: otherChannelId, content: envelope })
    }));

    // The real message on OUR channel must be delivered, decrypted.
    window.dispatchEvent(new CustomEvent('nostr-message-received', {
      detail: makeNostrMessage({ channelId, content: envelope })
    }));

    await vi.waitFor(() => expect(received).toEqual([plaintext]));

    unsubscribe();
  });

  it('unsubscribe stops further callback delivery', async () => {
    const plaintext = 'Should not be received after unsubscribe.';
    const envelope = await buildRealEnvelopeForSelf(plaintext);
    const channelId = 'test-channel-unsubscribe';

    vi.spyOn(nostrService, 'subscribeToChannel').mockReturnValue([]);
    vi.spyOn(nostrService, 'unsubscribeFromChannel').mockImplementation(() => {});
    vi.spyOn(nostrService, 'getChannelMessages').mockReturnValue([]);

    const received: string[] = [];
    const unsubscribe = service.subscribeToMessages(channelId, (message) => {
      received.push(message.content);
    });
    unsubscribe();

    window.dispatchEvent(new CustomEvent('nostr-message-received', {
      detail: makeNostrMessage({ channelId, content: envelope })
    }));

    // Give any errant async handler a chance to run before asserting absence.
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(received).toEqual([]);
  });

  describe('new-message notifications (Phase T4.1)', () => {
    it('fires for a genuine live incoming message from another sender', async () => {
      const plaintext = 'Live incoming message for notification test.';
      const envelope = await buildRealEnvelopeForSelf(plaintext);
      const channelId = 'test-channel-notify-live';

      vi.spyOn(nostrService, 'subscribeToChannel').mockReturnValue([]);
      vi.spyOn(nostrService, 'unsubscribeFromChannel').mockImplementation(() => {});
      vi.spyOn(nostrService, 'getChannelMessages').mockReturnValue([]); // no cached history

      const unsubscribe = service.subscribeToMessages(channelId, () => {});

      window.dispatchEvent(new CustomEvent('nostr-message-received', {
        detail: makeNostrMessage({ channelId, content: envelope, senderId: 'pk-someone-else' })
      }));

      await vi.waitFor(() => expect(hudInfo).toHaveBeenCalledTimes(1));
      expect(hudInfo.mock.calls[0][1]).toBe(plaintext);

      unsubscribe();
    });

    it('does NOT fire for the initial history-delivery path (only genuinely live arrivals)', async () => {
      const plaintext = 'Cached history — must not notify.';
      const envelope = await buildRealEnvelopeForSelf(plaintext);
      const channelId = 'test-channel-notify-history';

      vi.spyOn(nostrService, 'subscribeToChannel').mockReturnValue([]);
      vi.spyOn(nostrService, 'unsubscribeFromChannel').mockImplementation(() => {});
      vi.spyOn(nostrService, 'getChannelMessages').mockReturnValue([
        makeNostrMessage({ channelId, content: envelope, senderId: 'pk-someone-else' })
      ]);

      const received: string[] = [];
      const unsubscribe = service.subscribeToMessages(channelId, (m) => received.push(m.content));
      await vi.waitFor(() => expect(received).toContain(plaintext));

      expect(hudInfo).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('does NOT fire for a relay echo of the local user\'s own just-sent message', async () => {
      const plaintext = 'My own message coming back as an echo.';
      const envelope = await buildRealEnvelopeForSelf(plaintext);
      const channelId = 'test-channel-notify-self-echo';
      const myPubkey = nostrIdentityService.getPubkey();

      vi.spyOn(nostrService, 'subscribeToChannel').mockReturnValue([]);
      vi.spyOn(nostrService, 'unsubscribeFromChannel').mockImplementation(() => {});
      vi.spyOn(nostrService, 'getChannelMessages').mockReturnValue([]);

      const unsubscribe = service.subscribeToMessages(channelId, () => {});

      window.dispatchEvent(new CustomEvent('nostr-message-received', {
        detail: makeNostrMessage({ channelId, content: envelope, senderId: myPubkey! })
      }));

      // Give the async decrypt+callback pipeline a chance to run.
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(hudInfo).not.toHaveBeenCalled();

      unsubscribe();
    });
  });
});
