// SecureChatIntegrationService.ts
// Integration layer connecting SecureChat UI with Nostr, IPFS, and PQC backend services
// Earth Alliance secure communication protocol implementation

import { NostrService } from './nostrService';
import { emergencyChatRelays } from './nostr/publishTargets';
import type { NostrMessage } from './nostrService';
import ipfsService from './IPFSService';
import { chatChannelStore } from './ChatChannelStore';
import type { StoredChatChannel } from './ChatChannelStore';
import { chatActivityLogStore, ChatActivityAction } from './ChatActivityLogStore';
// Type-only — erased at compile time, so this doesn't create a real runtime
// dependency on the adapter layer. Declaring `implements` here is what
// makes tsc actually catch drift between this class and what
// SecureChatAdapter needs, instead of the silent `any`-typed mismatch that
// let this class ship with 21 of 25 required methods missing.
import type { SecureChatIntegrationServiceInterface } from '../lib/chat/adapters/SecureChatAdapter';
import { pqCryptoService } from './crypto/PQCryptoService';
import { ForwardSecrecyService } from './crypto/ForwardSecrecyService';
import type { PrekeyBundle } from './crypto/ForwardSecrecyService';
import { prekeyBundleStore } from './crypto/PrekeyBundleStore';
import type { LocalPrekeyBundleSecrets } from './crypto/PrekeyBundleStore';
import { fetchPrekeyBundles, publishPrekeyBundle } from './crypto/PQCKeyPublisher';
import { nostrIdentityService } from './identity/NostrIdentityService';
import { sendSealedChat, emitSealedChat, rememberSentChat } from './chat/sealedChat';
import { subscribeIdentityNotice } from './identity/identityNotice';
import { subscribeKeyLock } from './identity/keyLock';
import { chatUsedBy, rememberChatUse } from './chat/chatUse';
import type { OpenedWrap } from './nostr/sealedInbox';
import { APP_KINDS } from './nostr/kindRegistry';
import type {
  ThreatLevel,
  MessageType
} from '../types/SecureChat';
import { createLogger } from '@utils/logger';
import { hudInfo } from '../utils/hudNotifications';
const log = createLogger({ prefix: 'SecureChatIntegrationService' });

/** Why a channel message is not sent (legal question E1): only direct and team messages can be sealed. */
export const CHANNEL_NOT_SEALED = 'Not sent: a channel message would go to public relays in plain text, readable by anyone. '
  + 'Message a person directly, or write in your team\'s chat: both are sealed.';

const toHex = (buf: Uint8Array) => Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};
const fromBase64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** What a session made against one device's bundle sends, so that device can make the same key (X3DH). */
interface PqcSessionParts {
  sessionId: string;
  ltCiphertext: string;
  spkCiphertext: string;
  otkCiphertext?: string;
  otkIndex?: number;
}

/**
 * Wire envelope for a PQC-encrypted message body. Distinguishing this from a
 * plaintext body (rather than a boolean flag alone) matters because
 * everything the recipient needs to derive the same session key —
 * X3DH ciphertexts, session id, which one-time prekey was used — has to
 * travel with the message; there is no separate side-channel for it.
 *
 * v1 is sealed to one bundle, in hex: what a sender makes for someone none of
 * whose devices has its own address yet, and what every version reads.
 */
interface PqcMessageEnvelopeV1 extends PqcSessionParts {
  v: 1;
  ciphertext: string; // hex, AES-256-GCM (iv-prefixed, see PQCryptoService.encryptData)
}

/**
 * v2 is sealed to each of the recipient's devices (plan item 9.11). The text
 * is encrypted once, under a key made for this message, and that key is
 * sealed to each device, so each more device costs its key exchange and not
 * another copy of the text. Base64, a third smaller than hex: the whole must
 * fit one gift wrap.
 */
interface PqcMessageEnvelopeV2 {
  v: 2;
  ciphertext: string; // base64, the text under the message's key
  devices: Array<PqcSessionParts & {
    device: string;
    key: string; // base64, the message's key under this device's session key
  }>;
}

type PqcMessageEnvelope = PqcMessageEnvelopeV1 | PqcMessageEnvelopeV2;

/*
 * The most an envelope to several devices may take. A sealed message is
 * wrapped twice more (NIP-59), each time a third larger in base64 and padded
 * (NIP-44), and relays commonly refuse an event over 64 KB (strfry's
 * default). An envelope this size wraps to under that, as
 * SecureChatIntegrationService.eachDevice.test.ts measures. A device that
 * would take the envelope past it is left out, the least recently seen first.
 */
const DEVICES_ENVELOPE_BUDGET = 27_000;

/** What a message says in place of its text when this device cannot open it. */
const UNDECRYPTABLE = 'This message could not be decrypted.';
const NOT_SEALED_HERE = 'This message was sealed to your other devices, not this one. Read it on one of them.';

/** A message sealed to the person's other devices, and not to this one. */
class NotSealedHere extends Error {}

// Define local interfaces for chat integration
export interface SecureChatMessage {
  id: string;
  contactId: string;
  senderId: string;
  senderName: string;
  content: string;
  type: MessageType;
  timestamp: number;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  threatLevel?: ThreatLevel;
  attachments?: FileAttachment[];
  metadata?: {
    source?: 'nostr' | 'ipfs' | 'direct';
    encrypted?: boolean;
    nostrEvent?: unknown;
    ipfsHashes?: string[];
    /** True when this message claimed to be PQC-encrypted but decryption failed (e.g. a reused/exhausted one-time prekey) — content is a placeholder, not the real message. */
    decryptionFailed?: boolean;
  };
}

export interface SecureChatContact {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'away';
  lastSeen: number;
  publicKey: string;
  agency?: string;
  metadata?: {
    nostrChannel?: unknown;
    synchronized?: boolean;
    lastSync?: number;
  };
}

export interface FileAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  ipfsHash?: string;
}

export interface ChatServiceConfig {
  enablePQC: boolean;
  enableIPFS: boolean;
  enableNostr: boolean;
  emergencyMode: boolean;
  threatLevel: ThreatLevel;
}

export interface ContactSyncResult {
  synchronized: number;
  failed: number;
  errors: string[];
  contacts: SecureChatContact[];
}

/**
 * SecureChatIntegrationService
 * 
 * Bridges the SecureChat UI layer with the underlying Nostr, IPFS, and PQC services.
 * Provides unified API for secure messaging with Earth Alliance protocols.
 */
export class SecureChatIntegrationService implements SecureChatIntegrationServiceInterface {
  private static instance: SecureChatIntegrationService;

  private nostrService: NostrService;
  private ipfsService = ipfsService;
  private forwardSecrecy = new ForwardSecrecyService();

  /** Per-channel dedup sets for subscribeToMessages' live event listener. */
  private seenMessageIds = new Map<string, Set<string>>();

  private isInitialized = false;
  /**
   * Memoized promise (not a boolean flag — same concurrent-init hazard this
   * session has fixed elsewhere, e.g. IntelReportService.ensure()): the
   * local user's own X3DH bundle+secrets, generated and persisted on first
   * use rather than regenerated (and silently discarded) on every call, as
   * the pre-fix code did.
   */
  private localBundlePromise: Promise<{ bundle: PrekeyBundle; secrets: LocalPrekeyBundleSecrets; deviceId: string }> | null = null;
  private config: ChatServiceConfig = {
    enablePQC: true,
    enableIPFS: true,
    enableNostr: true,
    emergencyMode: false,
    threatLevel: 'normal'
  };

  private constructor() {
    this.nostrService = NostrService.getInstance();
  }

  public static getInstance(): SecureChatIntegrationService {
    if (!SecureChatIntegrationService.instance) {
      SecureChatIntegrationService.instance = new SecureChatIntegrationService();
    }
    return SecureChatIntegrationService.instance;
  }

  /**
   * Initialize the chat integration service
   */
  /** Stops publishing a bundle for a key made later; set once, on the first initialize. */
  private stopBundleOnKey: (() => void) | null = null;

  public async initialize(_userDID?: string): Promise<void> {
    try {
      log.debug('🔧 Initializing SecureChatIntegrationService...');
      
      // Initialize PQC service
      await pqCryptoService.initialize();
      
      // Nostr service auto-initializes on getInstance()
      if (this.config.enableNostr) {
        log.debug('✅ Nostr service ready');
      }
      
      // IPFS service is singleton, ready to use
      if (this.config.enableIPFS) {
        log.debug('✅ IPFS service ready');
      }
      
      this.isInitialized = true;
      log.debug('🚀 SecureChatIntegrationService ready');

      // Fire-and-forget: generate/persist/publish this device's own X3DH
      // bundle so other contacts can find it before they ever try to
      // message this user. Not awaited — bundle generation is 50+ KEM
      // keypairs and shouldn't gate app startup; processIncomingMessage()
      // awaits the same memoized promise when it actually needs the
      // secrets, so correctness doesn't depend on this finishing first.
      /*
       * Only for someone who ALREADY has an identity. This runs on app mount —
       * SecureChatProvider wraps the whole app — so creating one here would mint a
       * signing key for every visitor who merely opened the page, which is the exact
       * defect the lazy identity exists to remove. (Measured: with an ensure here, a
       * fresh load stored a key and raised the notice "setting up encrypted chat".)
       * Someone with no identity gets their bundle prepared on their first send.
       */
      if (this.config.enablePQC && nostrIdentityService.getPubkey()) {
        this.ensureLocalBundle().catch(err => log.warn('⚠️ Failed to prepare local PQC prekey bundle:', err));
      }
      // And a key made or imported later this session (joining a team, a first
      // report) gets its bundle prepared then, for reading what arrives. It is
      // announced only once the person uses chat with it (MF15, which replaced
      // plan item 2.7's announcing it at once). It only follows a key being
      // made; it never makes one.
      if (this.config.enablePQC && !this.stopBundleOnKey) {
        const stopOnNotice = subscribeIdentityNotice(() => {
          if (!nostrIdentityService.getPubkey()) return;
          this.ensureLocalBundle().catch(err => log.warn('⚠️ Failed to prepare local PQC prekey bundle:', err));
        });
        // A locked key's bundle could not be announced on mount: it is, once the person unlocks it (D-KL). Only a
        // key that has been used for chat announces anything (MF15), and ensureLocalBundle keeps to that.
        const stopOnUnlock = subscribeKeyLock(() => {
          if (!nostrIdentityService.getPubkey() || nostrIdentityService.isLocked()) return;
          this.ensureLocalBundle().catch(err => log.warn('Failed to prepare the local PQC prekey bundle after an unlock:', err));
        });
        this.stopBundleOnKey = () => { stopOnNotice(); stopOnUnlock(); };
      }

    } catch (error) {
      log.error('❌ Failed to initialize SecureChatIntegrationService:', error);
      throw error;
    }
  }

  /**
   * The local user's own X3DH bundle+secrets — generated and persisted once
   * (PrekeyBundleStore), not regenerated per call. Only processIncomingMessage()
   * needs this (X3DH's initiator only ever needs the *recipient's* public
   * bundles, fetched separately via fetchPrekeyBundles in encryptFor()).
   */
  private async ensureLocalBundle(): Promise<{ bundle: PrekeyBundle; secrets: LocalPrekeyBundleSecrets; deviceId: string }> {
    /**
     * Memoised, but VERIFIED against the store before it is trusted.
     *
     * The memo alone was a real durability bug, not merely a test artifact.
     * These secrets live in IndexedDB, and a browser can evict IndexedDB —
     * quota pressure, "clear site data", private-mode teardown. When that
     * happens the store creates a fresh bundle on next access while this
     * service goes on holding the secrets of a bundle that no longer exists,
     * and EVERY incoming message then fails to decrypt, silently and
     * permanently, until the page is reloaded.
     *
     * Checking that the memoised bundle is still the one the store holds costs
     * one indexed read per call and converts an unrecoverable state into a
     * re-derivation.
     *
     * And it must be the bundle of the key this browser holds now. A key
     * brought here from another device replaces the one there was (plan item
     * 9.11), and the store still held the old key's bundle, so the check
     * above passed and the new key never had a bundle of its own.
     */
    if (this.localBundlePromise) {
      const cached = await this.localBundlePromise.catch(() => null);
      if (cached && cached.bundle.identity === nostrIdentityService.getPubkey() && await prekeyBundleStore.hasLocalBundle(cached.bundle)) {
        // Still waiting to be announced (its key was locked, D-KL): announced now. Once announced, nothing happens.
        if (chatUsedBy(cached.bundle.identity)) this.announce(cached.bundle, cached.deviceId);
        return cached;
      }
      // Gone from the store, or another key's. Drop the memo and re-establish
      // rather than decrypting against secrets nothing else recognises.
      log.warn('⚠️ Local prekey bundle is no longer in the store, or is not this key\'s — re-establishing.');
      this.localBundlePromise = null;
    }

    this.localBundlePromise = (async () => {
      /*
       * READ, never created. Both callers run without anyone asking: initialize() on
       * app mount, and processIncomingMessage() on traffic from a relay. An identity is
       * created by a person's action — sendMessage ensures it and then calls this —
       * and with none there is genuinely no bundle to prepare, so this says so.
       */
      const identity = nostrIdentityService.getPubkey();
      if (!identity) {
        throw new Error('No identity in this browser yet — there is no prekey bundle to prepare until something is sent');
      }
      const { bundle, secrets, deviceId } = await prekeyBundleStore.getOrCreateLocalBundle(identity, this.forwardSecrecy);
      // Prepared for reading whatever arrives, announced only once the person has used chat (MF15).
      if (chatUsedBy(identity)) this.announce(bundle, deviceId);
      return { bundle, secrets, deviceId };
    })();
    return this.localBundlePromise;
  }

  /** Bundles announced this session, so one is published once however it is reached. */
  private announced = new WeakSet<PrekeyBundle>();

  private announce(bundle: PrekeyBundle, deviceId: string): void {
    if (this.announced.has(bundle)) return;
    // A locked key signs nothing until the person unlocks it, and this is never their act, so nothing asks: the
    // unlock announces it (D-KL).
    if (nostrIdentityService.isLocked()) return;
    this.announced.add(bundle);
    publishPrekeyBundle(bundle, deviceId).catch(err => log.warn('⚠️ Failed to publish local prekey bundle:', err));
  }

  /**
   * A person's own act in chat (decision D-MF, MF15): a send, a conversation or a channel they opened or made.
   * Called by those acts, never by the service's own channel calls: the adapter makes its Global channel on
   * connecting, at every app mount.
   * From the first, this key's prekeys are announced, so others can write to it post-quantum; a bundle already
   * prepared for reading is announced now. A key made for anything else announces nothing until then.
   */
  public markChatUsed(): void {
    const identity = nostrIdentityService.getPubkey();
    if (!identity || chatUsedBy(identity)) return;
    rememberChatUse(identity);
    if (!this.config.enablePQC || !this.localBundlePromise) return;
    this.localBundlePromise
      .then(({ bundle, deviceId }) => { if (bundle.identity === identity) this.announce(bundle, deviceId); })
      .catch(() => { /* none prepared: the next one is announced as it is made */ });
  }

  /**
   * Update service configuration
   */
  public updateConfig(newConfig: Partial<ChatServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    log.debug('🔧 Chat service config updated:', this.config);
  }

  /**
   * Send a secure message through the integrated pipeline.
   *
   * Signature matches SecureChatIntegrationServiceInterface.sendMessage —
   * this is what SecureChatAdapter.sendMessage() actually calls
   * (`this.service.sendMessage(channelId, content, attachments)`, adapter
   * line ~461). The previous (message: Omit<SecureChatMessage,...>,
   * attachments?: FileAttachment[]) signature never matched that call site
   * at all — it was unreachable in practice because connect() always threw
   * first (see SecureChatContext.tsx's fallback), so the mismatch never
   * surfaced. Confirmed via grep that no test or production code called
   * the old object-based signature directly, so this is a safe rename.
   */
  public async sendMessage(
    channelId: string,
    content: string,
    attachments?: File[]
  ): Promise<{
    messageId: string;
    content: string;
    timestamp: number;
    senderId: string;
    senderName?: string;
    channelId: string;
    status?: string;
    threadId?: string;
    parentMessageId?: string;
    attachments?: { id: string; name: string; url: string; type: string; size: number }[];
    /** True only when the content went out encrypted: sealed, or as an envelope. */
    encrypted: boolean;
    /** True only when it went as an ML-KEM envelope. */
    postQuantum?: boolean;
  }> {
    if (!this.isInitialized) {
      throw new Error('SecureChatIntegrationService not initialized');
    }

    const messageId = this.generateMessageId();
    const timestamp = Date.now();
    // Ensured before anything is attributed: this message is what creates the identity
    // for someone sending their first one, and reading first recorded them as 'unknown'.
    const senderId = nostrIdentityService.ensureLocalIdentity('sending a chat message');
    // Now that an identity certainly exists, and the person has used chat with it, publish
    // its prekey bundle if that has not happened: without it the people they message
    // cannot write back encrypted (MF15). Memoised; not awaited.
    this.markChatUsed();
    if (this.config.enablePQC) {
      this.ensureLocalBundle().catch(err => log.warn('⚠️ Failed to prepare local PQC prekey bundle:', err));
    }

    log.debug(`📤 Sending secure message ${messageId} to ${channelId}...`);

    // A direct message goes to the recipient's key, sealed (plan item 2.7). It
    // was addressed to `dm-<key>`, which is nobody's key: the bundle lookup
    // failed and the text went out in plain text on a public channel.
    if (channelId.startsWith('dm-')) {
      const recipient = channelId.slice(3);
      const sent = await sendSealedChat({ recipients: [recipient], text: content, encryptFor: (to, text) => this.encryptFor(to, text) });
      if (sent.reached.length === 0) {
        throw new Error(`The message was not sent: ${sent.notReached.map((n) => n.reason).join('; ')}`);
      }
      this.logChatActivity(ChatActivityAction.MESSAGE_SENT, channelId, { messageId: sent.id });
      await rememberSentChat({ id: sent.id, senderId, recipients: sent.reached, content, timestamp, postQuantum: sent.postQuantum, decryptionFailed: false });
      return { messageId: sent.id, content, timestamp, senderId, channelId, status: 'sent', encrypted: true, postQuantum: sent.postQuantum };
    }

    // A reply in a team's conversation goes sealed to each member, as the team's own chat sends it (plan item 2.7).
    // It went on to the plain branch below: out to public relays, readable by anyone (audit finding 13).
    if (channelId.startsWith('team-')) {
      const key = channelId.slice('team-'.length);
      const [{ sendTeamMessage, teamChatKey }, { realTimeTeamService }] = await Promise.all([
        import('./chat/teamChat'), import('./RealTimeTeamService'),
      ]);
      const team = realTimeTeamService.getTeams().find((t) => teamChatKey(t) === key);
      if (!team) throw new Error('Not sent: that team is not on this device, so there is nobody to seal the message to. Write from the team\'s chat in Team Workspace.');
      const sent = await sendTeamMessage(team, content);
      if (sent.reached.length === 0) {
        throw new Error(`The message was not sent: ${sent.notReached.map((n) => n.reason).join('; ')}`);
      }
      this.logChatActivity(ChatActivityAction.MESSAGE_SENT, channelId, { messageId: sent.id });
      return { messageId: sent.id, content, timestamp, senderId, channelId, status: 'sent', encrypted: true, postQuantum: sent.postQuantum };
    }

    // Any other channel cannot be sealed: its message would go to public relays in plain text, readable by anyone,
    // and kept there (legal question E1). Nothing is sent, so that "a message that cannot be sealed is not sent"
    // stays true (docs/legal/README.md). Attachments go nowhere either: there is no sealed way to send them yet.
    void attachments;
    throw new Error(CHANNEL_NOT_SEALED);
  }

  /**
   * The ML-KEM envelope for one recipient, sealed to each device of theirs
   * that published a prekey bundle (X3DH), or the text unchanged when they
   * published none or it failed. Only `postQuantum` may be drawn on for a label.
   */
  public async encryptFor(recipient: string, content: string): Promise<{ content: string; postQuantum: boolean }> {
    if (!this.config.enablePQC) return { content, postQuantum: false };
    try {
      const bundles = await fetchPrekeyBundles(recipient);
      if (bundles.length === 0) {
        log.warn(`⚠️ No published PQC prekey bundle for ${recipient}`);
        return { content, postQuantum: false };
      }
      const text = new TextEncoder().encode(content);
      let envelope: PqcMessageEnvelope;
      if (bundles[0].device === null) {
        // None of their devices has its own address yet: the envelope every version reads.
        const { sealed, ...session } = await this.sealTo(bundles[0].bundle, text, toHex);
        envelope = { v: 1, ciphertext: sealed, ...session };
      } else {
        const messageKey = globalThis.crypto.getRandomValues(new Uint8Array(32));
        const ciphertext = toBase64(await pqCryptoService.encryptData(text, messageKey));
        const devices: PqcMessageEnvelopeV2['devices'] = [];
        // Most recently seen first: the first always, the rest while the whole still fits one wrap.
        for (const { device, bundle } of bundles) {
          const { sealed, ...session } = await this.sealTo(bundle, messageKey, toBase64);
          const entry = { device, key: sealed, ...session };
          if (devices.length > 0 && JSON.stringify({ v: 2, ciphertext, devices: [...devices, entry] }).length > DEVICES_ENVELOPE_BUDGET) break;
          devices.push(entry);
        }
        envelope = { v: 2, ciphertext, devices };
      }
      log.debug('🔒 Message encrypted with PQC (X3DH session established)');
      return { content: JSON.stringify(envelope), postQuantum: true };
    } catch (pqcError) {
      log.warn('⚠️ PQC encryption failed:', pqcError);
      return { content, postQuantum: false };
    }
  }

  /** A session made against one device's bundle (X3DH), and `secret` encrypted under its key. */
  private async sealTo(
    bundle: PrekeyBundle,
    secret: Uint8Array,
    encode: (bytes: Uint8Array) => string,
  ): Promise<PqcSessionParts & { sealed: string }> {
    const otkIndex = bundle.oneTimePrekeys.length > 0
      ? Math.floor(Math.random() * bundle.oneTimePrekeys.length)
      : undefined;
    const session = await this.forwardSecrecy.initiateSession(bundle, otkIndex);
    return {
      sealed: encode(await pqCryptoService.encryptData(secret, session.sessionKey)),
      sessionId: session.sessionId,
      ltCiphertext: encode(session.ltCiphertext),
      spkCiphertext: encode(session.spkCiphertext),
      otkCiphertext: session.otkCiphertext ? encode(session.otkCiphertext) : undefined,
      otkIndex,
    };
  }

  /**
   * A chat message the sealed inbox opened (plan item 2.7): its sender is the
   * one who sealed it, which the envelope alone never said. Decrypted like any
   * incoming message, then handed to whatever shows chat.
   */
  public async receiveSealed({ rumor, sender }: OpenedWrap): Promise<void> {
    if (rumor.kind !== APP_KINDS.CHAT_MESSAGE) return;
    const tag = (name: string) => rumor.tags.find((t) => t[0] === name)?.[1];
    const postQuantum = rumor.tags.some((t) => t[0] === 'enc' && t[1] === 'ml-kem-768');
    const team = tag('team');
    const processed = await this.processIncomingMessage({
      content: rumor.content,
      pqcEncrypted: postQuantum,
      senderId: sender,
      timestamp: rumor.created_at * 1000,
      channelId: team ? `team-${team}` : `dm-${sender}`,
      originalMessageId: tag('m') ?? rumor.id,
    }, 'direct');
    if (!processed) return;
    const decryptionFailed = processed.metadata?.decryptionFailed === true;
    emitSealedChat({
      id: processed.id,
      senderId: sender,
      recipients: rumor.tags.filter((t) => t[0] === 'p').map((t) => t[1]),
      content: processed.content,
      timestamp: processed.timestamp,
      postQuantum: postQuantum && !decryptionFailed,
      decryptionFailed,
      ...(team ? { team } : {}),
    });
  }

  /**
   * Receive and process incoming messages
   */
  public async processIncomingMessage(
    rawMessage: unknown,
    source: 'nostr' | 'ipfs' | 'direct'
  ): Promise<SecureChatMessage | null> {
    try {
      log.debug(`📥 Processing incoming message from ${source}...`);

      // Type guard for message object
      const incomingMsg = rawMessage as {
        content: string;
        pqcEncrypted?: boolean;
        attachmentHashes?: string[];
        senderId?: string;
        senderName?: string;
        timestamp?: number;
        messageType?: string;
        threatLevel?: string;
        originalMessageId?: string;
        channelId?: string;
        [key: string]: unknown;
      };

      // Step 1: Decrypt if PQC encrypted
      let content = incomingMsg.content;
      let decryptionFailed = false;
      if (incomingMsg.pqcEncrypted && this.config.enablePQC) {
        try {
          const envelope = JSON.parse(content) as PqcMessageEnvelope;
          const { secrets, deviceId } = await this.ensureLocalBundle();

          // The session made against this device's bundle, and how the text opens once its key is made.
          let session: PqcSessionParts;
          let decode: (text: string) => Uint8Array;
          let openText: (sessionKey: Uint8Array) => Promise<Uint8Array>;
          if (envelope.v === 2) {
            const mine = envelope.devices.find((d) => d.device === deviceId);
            if (!mine) throw new NotSealedHere();
            session = mine;
            decode = fromBase64;
            openText = async (sessionKey) => pqCryptoService.decryptData(
              fromBase64(envelope.ciphertext),
              await pqCryptoService.decryptData(fromBase64(mine.key), sessionKey),
            );
          } else {
            session = envelope;
            decode = fromHex;
            openText = (sessionKey) => pqCryptoService.decryptData(fromHex(envelope.ciphertext), sessionKey);
          }

          const otkPrivateKey = session.otkIndex !== undefined
            ? await prekeyBundleStore.getUnconsumedOtkPrivateKey(session.otkIndex)
            : undefined;
          // A real, reachable race: two messages referencing the same
          // one-time prekey index (e.g. two senders who both fetched this
          // bundle before either message was processed) can't both be
          // decrypted — an OTK can only be consumed once, by design (reusing
          // one defeats forward secrecy). The second arrival's
          // otkPrivateKey comes back undefined here; acceptSession below
          // then derives a session key without the OTK contribution, which
          // will not match what the sender actually used, and decryption
          // fails cleanly in the catch block below rather than silently
          // succeeding with a wrong key.

          const sessionKey = await this.forwardSecrecy.acceptSession(
            session.sessionId,
            decode(session.ltCiphertext),
            decode(session.spkCiphertext),
            secrets.identityPrivateKey,
            secrets.signedPrekeyPrivateKey,
            session.otkCiphertext ? decode(session.otkCiphertext) : undefined,
            otkPrivateKey
          );

          const decrypted = await openText(sessionKey);
          content = new TextDecoder().decode(decrypted);

          if (session.otkIndex !== undefined && otkPrivateKey) {
            await prekeyBundleStore.markOtkConsumed(session.otkIndex);
            // P3.3 Part A: shrinks (does not eliminate — see
            // PrekeyBundleStore's own doc comment) the OTK-collision race
            // window by refreshing consumed slots once enough have piled
            // up, instead of the same stale bundle staying published
            // forever.
            prekeyBundleStore.replenishConsumedOtksIfThresholdReached(this.forwardSecrecy)
              .then(refreshedBundle => {
                if (refreshedBundle) {
                  return publishPrekeyBundle(refreshedBundle, deviceId);
                }
              })
              .catch(err => log.warn('⚠️ Failed to replenish/republish consumed OTKs:', err));
          }

          log.debug('🔓 Message decrypted with PQC (X3DH session accepted)');
        } catch (decryptError) {
          const notHere = decryptError instanceof NotSealedHere;
          if (notHere) log.info('ℹ️ A message sealed to this key\'s other devices, not this one');
          else log.warn('⚠️ PQC decryption failed:', decryptError);
          // content must NOT stay as the raw envelope JSON here — that's
          // hex-encoded ciphertext/session/key material, not a message, and
          // showing it verbatim in a chat UI is exactly the kind of
          // "silently degrade to garbage" this session's conventions
          // elsewhere (dashboards, team rosters) have deliberately avoided.
          content = notHere ? NOT_SEALED_HERE : UNDECRYPTABLE;
          decryptionFailed = true;
          this.logChatActivity(ChatActivityAction.DECRYPT_FAILED, incomingMsg.channelId, {
            source,
            senderId: incomingMsg.senderId
          });
        }
      }

      // Step 2: Process attachments from IPFS if present
      const attachments: FileAttachment[] = [];
      if (incomingMsg.attachmentHashes && this.config.enableIPFS) {
        for (const hash of incomingMsg.attachmentHashes) {
          try {
            const ipfsContent = await this.ipfsService.retrieveContent(hash);
            if (ipfsContent.success && ipfsContent.data) {
              const attachmentData = ipfsContent.data as {
                id?: string;
                name?: string;
                type?: string;
                size?: number;
                [key: string]: unknown;
              };
              attachments.push({
                id: attachmentData.id || hash,
                name: attachmentData.name || `attachment-${hash.slice(0, 8)}`,
                type: attachmentData.type || 'application/octet-stream',
                size: attachmentData.size || 0,
                url: `ipfs://${hash}`,
                ipfsHash: hash
              });
            }
          } catch (ipfsError) {
            log.warn(`⚠️ Failed to retrieve attachment ${hash}:`, ipfsError);
          }
        }
      }

      // Step 3: Create SecureChatMessage
      const processedMessage: SecureChatMessage = {
        id: incomingMsg.originalMessageId || this.generateMessageId(),
        contactId: incomingMsg.senderId || 'unknown',
        senderId: incomingMsg.senderId || 'unknown',
        senderName: incomingMsg.senderName || 'Anonymous',
        content,
        type: this.mapNostrToMessageType(incomingMsg.messageType || 'text'),
        timestamp: incomingMsg.timestamp || Date.now(),
        status: 'delivered',
        threatLevel: (incomingMsg.threatLevel as ThreatLevel) || 'normal',
        attachments: attachments.length > 0 ? attachments : undefined,
        metadata: {
          source,
          encrypted: incomingMsg.pqcEncrypted || false,
          nostrEvent: source === 'nostr' ? rawMessage : undefined,
          ipfsHashes: incomingMsg.attachmentHashes || [],
          decryptionFailed
        }
      };

      log.debug(`✅ Processed incoming message ${processedMessage.id} from ${source}`);
      if (!decryptionFailed) {
        this.logChatActivity(ChatActivityAction.MESSAGE_RECEIVED, incomingMsg.channelId, {
          messageId: processedMessage.id,
          senderId: incomingMsg.senderId
        });
      }
      return processedMessage;

    } catch (error) {
      log.error('❌ Failed to process incoming message:', error);
      return null;
    }
  }

  // ── SecureChatIntegrationServiceInterface — connection/channel/message
  // methods. These are the 6 (of 25) interface methods that actually have
  // a live caller (SecureChatAdapter.ts, reached from CollaborationSidebar.
  // tsx and SecureChatContext.tsx) — see this cycle's plan for the full
  // reachability survey. Everything below this section, down to the
  // "not supported" throws, exists purely for interface completeness so
  // `implements SecureChatIntegrationServiceInterface` type-checks.

  public async connect(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  public isConnected(): boolean {
    return this.isInitialized;
  }

  public async disconnect(): Promise<void> {
    // Nothing real to tear down — the underlying NostrService/IPFS
    // singletons are app-lifetime, not per-"connection" like a socket.
    log.debug('SecureChatIntegrationService.disconnect() — no persistent connection to close');
  }

  /**
   * channelId is a deterministic SHA-256 hash of `name`, NOT a random NIP-28
   * Kind-40 event id. A real Kind-40 event's id is a hash of its creator's
   * pubkey+timestamp+content, so it differs per creator — two team members
   * both calling createChannel("Investigation: X", []) would otherwise each
   * create their OWN separate channel with no way to discover each other's
   * (NostrService.getTeamChannels() only reads a local cache, never queries
   * relays). Deriving the id from `name` instead means every participant's
   * client converges on the identical channelId with zero coordination —
   * CollaborationSidebar.tsx always calls this with the same name
   * (`Investigation: ${investigationId}`) for a given investigation, so
   * this is what actually makes team chat shared rather than solo-per-user.
   * Messaging itself doesn't require a prior Kind-40 event to exist —
   * NostrService.sendMessage/subscribeToChannel/getChannelMessages already
   * just take this id as an arbitrary NIP-28 `#e` reference.
   */
  private async deriveChannelId(name: string): Promise<string> {
    const bytes = new TextEncoder().encode(name);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return toHex(new Uint8Array(digest));
  }

  public async createChannel(
    name: string,
    type: string,
    participants: string[]
  ): Promise<{
    channelId: string;
    name: string;
    type: string;
    participants?: string[];
    description?: string;
    createdAt?: number;
    createdBy?: string;
  }> {
    const channelId = await this.deriveChannelId(name);
    const existing = await chatChannelStore.get(channelId);
    if (existing) {
      // Same deterministic id — merge in any new participants rather than
      // clobbering an already-known channel's record.
      const merged: StoredChatChannel = {
        ...existing,
        participants: Array.from(new Set([...existing.participants, ...participants]))
      };
      await chatChannelStore.put(merged);
      return merged;
    }

    const record: StoredChatChannel = {
      channelId,
      name,
      type,
      participants,
      createdAt: Date.now(),
      createdBy: nostrIdentityService.getPubkey() ?? undefined
    };
    await chatChannelStore.put(record);
    return record;
  }

  public async getChannels(): Promise<{
    channelId: string;
    name: string;
    type: string;
    participants?: string[];
    description?: string;
    createdAt?: number;
    createdBy?: string;
  }[]> {
    return chatChannelStore.getAll();
  }

  public async joinChannel(channelId: string): Promise<void> {
    // NIP-28 has no membership concept — "joining" is subscribing.
    this.nostrService.subscribeToChannel(channelId);
  }

  public async leaveChannel(channelId: string): Promise<void> {
    this.nostrService.unsubscribeFromChannel(channelId);
  }

  /**
   * Phase T3.4 — real persisted audit entry (ChatActivityLogStore, IndexedDB),
   * not just SecureLogger's in-memory buffer. Attributed to the real local
   * identity; skipped entirely (not logged with a placeholder) if none is
   * available — same "suggest, never fabricate an actor" discipline used
   * elsewhere this session (Mission/Case STATUS_CHANGED logging, P3.1).
   * Fire-and-forget: a failed audit write shouldn't block message send/receive.
   */
  private logChatActivity(action: ChatActivityAction, channelId: string | undefined, details: Record<string, unknown>): void {
    const actorId = nostrIdentityService.getPubkey();
    if (!actorId) return;
    chatActivityLogStore.append({
      id: `chat-activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action,
      timestamp: new Date().toISOString(),
      userId: actorId,
      entityId: channelId,
      details
    }).catch(err => log.warn('⚠️ Failed to persist chat activity log entry:', err));
  }

  /** True when `content` parses as this service's own PqcMessageEnvelope shape. NostrMessage.pqcEncrypted is always false — NostrService has no knowledge of the PQC layer built on top of it — so this is the only reliable signal. */
  private looksLikePqcEnvelope(content: string): boolean {
    try {
      const parsed = JSON.parse(content) as Partial<PqcMessageEnvelopeV1> | Partial<PqcMessageEnvelopeV2>;
      if (parsed?.v === 2) return typeof parsed.ciphertext === 'string' && Array.isArray((parsed as Partial<PqcMessageEnvelopeV2>).devices);
      return parsed?.v === 1
        && typeof parsed.ciphertext === 'string'
        && typeof parsed.sessionId === 'string'
        && typeof parsed.ltCiphertext === 'string'
        && typeof parsed.spkCiphertext === 'string';
    } catch {
      return false;
    }
  }

  private nostrMessageToRawInput(msg: NostrMessage): {
    content: string;
    pqcEncrypted?: boolean;
    senderId?: string;
    timestamp?: number;
    messageType?: string;
    originalMessageId?: string;
    channelId?: string;
  } {
    return {
      content: msg.content,
      pqcEncrypted: this.looksLikePqcEnvelope(msg.content),
      senderId: msg.senderId,
      timestamp: msg.timestamp,
      messageType: msg.messageType,
      originalMessageId: msg.id,
      channelId: msg.channelId
    };
  }

  public async getMessages(channelId: string): Promise<{
    messageId: string;
    content: string;
    timestamp: number;
    senderId: string;
    senderName?: string;
    channelId: string;
    status?: string;
    threadId?: string;
    parentMessageId?: string;
    attachments?: { id: string; name: string; url: string; type: string; size: number }[];
    encrypted: boolean;
  }[]> {
    const raw = this.nostrService.getChannelMessages(channelId);
    const results: Awaited<ReturnType<SecureChatIntegrationService['getMessages']>> = [];
    for (const msg of raw) {
      const processed = await this.processIncomingMessage(this.nostrMessageToRawInput(msg), 'nostr');
      if (!processed) continue;
      results.push({
        messageId: processed.id,
        content: processed.content,
        timestamp: processed.timestamp,
        senderId: processed.senderId,
        senderName: processed.senderName,
        channelId,
        status: processed.status,
        attachments: processed.attachments,
        encrypted: this.arrivedEncrypted(processed)
      });
    }
    return results;
  }

  /** Arrived as an envelope and was read. A failed decryption shows a placeholder, not the message. */
  private arrivedEncrypted(message: SecureChatMessage): boolean {
    return message.metadata?.encrypted === true && message.metadata?.decryptionFailed !== true;
  }

  public subscribeToMessages(channelId: string, callback: (message: {
    messageId: string;
    content: string;
    timestamp: number;
    senderId: string;
    senderName?: string;
    channelId: string;
    status?: string;
    attachments?: { id: string; name: string; url: string; type: string; size: number }[];
    encrypted: boolean;
  }) => void): () => void {
    this.nostrService.subscribeToChannel(channelId);

    if (!this.seenMessageIds.has(channelId)) {
      this.seenMessageIds.set(channelId, new Set());
    }
    const seen = this.seenMessageIds.get(channelId)!;
    this.nostrService.getChannelMessages(channelId).forEach(m => seen.add(m.id));

    // Deliver already-cached history first, matching NostrChatAdapter's
    // own subscribeToMessages behavior.
    this.getMessages(channelId)
      .then(history => history.forEach(m => callback(m)))
      .catch(err => log.warn('⚠️ Failed to deliver initial channel history:', err));

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<NostrMessage>;
      const msg = customEvent.detail;
      if (msg.channelId !== channelId || seen.has(msg.id)) return;
      seen.add(msg.id);

      this.processIncomingMessage(this.nostrMessageToRawInput(msg), 'nostr')
        .then(processed => {
          if (!processed) return;
          callback({
            messageId: processed.id,
            content: processed.content,
            timestamp: processed.timestamp,
            senderId: processed.senderId,
            senderName: processed.senderName,
            channelId,
            status: processed.status,
            attachments: processed.attachments,
            encrypted: this.arrivedEncrypted(processed)
          });

          // Phase T4.1 — only this LIVE-arrival path, not the initial
          // history-delivery branch above or getMessages() — a real-time
          // notification for a message someone just opened a channel and
          // loaded history for would be noise, not news. Skip a relay
          // echo of the local user's own just-sent message.
          if (processed.senderId !== nostrIdentityService.getPubkey()) {
            hudInfo(processed.senderName || processed.senderId, processed.content);
          }
        })
        .catch(err => log.warn('⚠️ Failed to process incoming channel message:', err));
    };

    window.addEventListener('nostr-message-received', handler);

    return () => {
      window.removeEventListener('nostr-message-received', handler);
      this.nostrService.unsubscribeFromChannel(channelId);
      this.seenMessageIds.delete(channelId);
    };
  }

  public isPQCEnabled(): boolean {
    return this.config.enablePQC;
  }

  public setPQCEnabled(enabled: boolean): void {
    this.config.enablePQC = enabled;
  }

  public isEncryptionEnabled(): boolean {
    return this.config.enablePQC;
  }

  public enableEncryption(enabled: boolean): void {
    this.config.enablePQC = enabled;
  }

  /** Honest empty stub, matching NostrChatAdapter's own presence implementation (getUsers() always returns []) — real presence tracking is a separate, not-yet-built feature for either provider, not a gap unique to this one. */
  public async getActiveUsers(): Promise<{
    userId: string;
    userName: string;
    status: string;
    lastSeen?: number;
    publicKey?: string;
  }[]> {
    return [];
  }

  public subscribeToPresence(_channelId: string, callback: (users: {
    userId: string;
    userName: string;
    status: string;
    lastSeen?: number;
    publicKey?: string;
  }[]) => void): () => void {
    callback([]);
    return () => {};
  }

  /** Genuinely unsupported by the underlying Nostr transport — NostrChatAdapter throws the identical error for these same actions, so claiming support here (silently no-op'ing, say) would be dishonest, not just incomplete. */
  private unsupported(feature: string): never {
    throw new Error(`SecureChatIntegrationService: '${feature}' is not supported by the Nostr transport this service is built on`);
  }

  public async editMessage(): Promise<{
    messageId: string; content: string; timestamp: number; editedAt: number;
    senderId: string; senderName?: string; channelId: string; status?: string;
  }> {
    return this.unsupported('editMessage');
  }

  public async deleteMessage(): Promise<void> {
    return this.unsupported('deleteMessage');
  }

  public async createThread(): Promise<{
    messageId: string; content: string; timestamp: number; senderId: string;
    senderName?: string; channelId: string; threadId: string; parentMessageId: string; status?: string;
  }> {
    return this.unsupported('createThread');
  }

  public async getThreadMessages(): Promise<{
    messageId: string; content: string; timestamp: number; senderId: string;
    senderName?: string; channelId: string; threadId: string; status?: string;
  }[]> {
    return this.unsupported('getThreadMessages');
  }

  public subscribeToThreadMessages(): () => void {
    return this.unsupported('subscribeToThreadMessages');
  }

  public async addReaction(): Promise<void> {
    return this.unsupported('addReaction');
  }

  public async removeReaction(): Promise<void> {
    return this.unsupported('removeReaction');
  }

  public async searchMessages(): Promise<{
    messages: {
      messageId: string; content: string; timestamp: number; senderId: string;
      senderName?: string; channelId: string; status?: string;
    }[];
    totalResults: number;
    hasMore: boolean;
    executionTimeMs: number;
  }> {
    return this.unsupported('searchMessages');
  }

  /**
   * Synchronize contacts from Nostr network
   */
  public async synchronizeContacts(): Promise<ContactSyncResult> {
    if (!this.config.enableNostr) {
      return { synchronized: 0, failed: 0, errors: ['Nostr disabled'], contacts: [] };
    }

    try {
      log.debug('🔄 Synchronizing contacts from Nostr network...');

      // Get team channels from Nostr service
      const channels = this.nostrService.getTeamChannels();
      const contacts: SecureChatContact[] = [];
      let synchronized = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const channel of channels) {
        try {
          const contact: SecureChatContact = {
            id: channel.id,
            name: channel.name,
            status: 'online', // Default status
            lastSeen: Date.now(),
            publicKey: channel.id, // Use channel ID as public key placeholder
            metadata: {
              nostrChannel: channel,
              synchronized: true,
              lastSync: Date.now()
            }
          };

          contacts.push(contact);
          synchronized++;
        } catch (contactError) {
          failed++;
          errors.push(`Failed to sync contact ${channel.id}: ${contactError}`);
        }
      }

      log.debug(`✅ Contact sync complete: ${synchronized} synchronized, ${failed} failed`);
      return { synchronized, failed, errors, contacts };

    } catch (error) {
      log.error('❌ Contact synchronization failed:', error);
      return {
        synchronized: 0,
        failed: 1,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        contacts: []
      };
    }
  }

  /**
   * Get service health status
   */
  public getServiceStatus(): {
    integrated: boolean;
    services: {
      nostr: { available: boolean; connected: boolean; relays: number };
      ipfs: { available: boolean; stored: number; quota: number };
      pqc: { available: boolean; algorithm: string };
    };
    config: ChatServiceConfig;
  } {
    const nostrStatus = this.nostrService.getServiceStatus();
    
    return {
      integrated: this.isInitialized,
      services: {
        nostr: {
          available: this.config.enableNostr,
          connected: nostrStatus.initialized,
          relays: nostrStatus.referenceRelays
        },
        ipfs: {
          available: this.config.enableIPFS,
          stored: this.getIPFSStorageStatsSync(),
          quota: 1024 * 1024 * 1024 // 1GB default quota
        },
        pqc: {
          available: this.config.enablePQC,
          algorithm: 'ML-KEM-768+ML-DSA-65'
        }
      },
      config: this.config
    };
  }

  /**
   * Emergency protocol activation
   */
  public async activateEmergencyMode(): Promise<void> {
    log.warn('🚨 EMERGENCY MODE ACTIVATED');
    
    this.config.emergencyMode = true;
    this.config.threatLevel = 'critical';
    this.config.enablePQC = true; // Force encryption
    
    // Switch to emergency relay configuration — additional real public relays, joining
    // (not replacing) the primary set for redundancy under threat conditions.
    // Two of these were once retired endpoints. Then, until 2026-09-19, all three
    // were relays ALREADY in the primary pool, so switching added nothing at all.
    // It adds the measured pool's relays beyond that surface now, and none at
    // all once the build keeps chat to its configured relays (plan item 0.3).
    const emergencyRelays = emergencyChatRelays();

    // Actually add the emergency relays to the live relay pool, rather than just logging intent.
    if (this.nostrService) {
      try {
        log.debug('🚨 Adding emergency relays:', emergencyRelays);
        const results = await Promise.all(
          emergencyRelays.map(relay => this.nostrService.addRelay(relay))
        );
        log.warn('🚨 Emergency relays added:', emergencyRelays.filter((_, i) => results[i]));
      } catch (error) {
        log.error('Failed to switch to emergency relays:', error);
      }
    }

    log.warn('🚨 All communications now use emergency protocols');
  }

  /**
   * AI-powered threat detection (placeholder)
   */
  public async analyzeThreatLevel(message: string): Promise<ThreatLevel> {
    // Placeholder for AI threat detection
    const keywords = ['urgent', 'classified', 'emergency', 'threat', 'attack'];
    const hasKeywords = keywords.some(keyword => 
      message.toLowerCase().includes(keyword)
    );
    
    return hasKeywords ? 'high' : 'normal';
  }

  /**
   * Get IPFS storage statistics (sync version for status calls)
   */
  private getIPFSStorageStatsSync(): number {
    try {
      // Simulate getting storage stats from IPFS service
      // In a real implementation, this would query the IPFS node
      const mockStoredMessages = 150; // Average stored messages
      const avgMessageSize = 2048; // 2KB per message
      return mockStoredMessages * avgMessageSize;
    } catch (error) {
      log.warn('Failed to get IPFS storage stats:', error);
      return 0;
    }
  }

  // Helper methods
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /*
   * `mapThreatToClassification(threat)` stood here, mapping a chat threat
   * level onto a clearance tier: normal -> 'UNCLASSIFIED', elevated ->
   * 'CONFIDENTIAL', high -> 'SECRET', critical -> 'TOP_SECRET'.
   *
   * Those are different questions. How dangerous a situation is says nothing
   * about who may read a message about it — an urgent warning is usually the
   * thing you most want distributed. And it had ZERO callers, so the
   * conflation never even executed.
   */

  private mapMessageTypeToNostr(type: MessageType): 'text' | 'intelligence' | 'alert' | 'status' {
    const mapping: Record<MessageType, 'text' | 'intelligence' | 'alert' | 'status'> = {
      text: 'text',
      image: 'text',
      file: 'text',
      voice: 'text',
      emergency: 'alert',
      command: 'intelligence'
    };
    return mapping[type] || 'text';
  }

  private mapNostrToMessageType(nostrType: string): MessageType {
    const mapping: Record<string, MessageType> = {
      text: 'text',
      intelligence: 'file',
      alert: 'emergency',
      status: 'command'
    };
    return mapping[nostrType] || 'text';
  }
}

// Export singleton instance
export const secureChatIntegration = SecureChatIntegrationService.getInstance();
