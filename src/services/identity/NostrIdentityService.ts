// NostrIdentityService.ts — the single source of truth for "what's my pubkey" / "sign
// this as me" across the app.
//
// Before this file: two disconnected identity paths existed. nostrService.ts maintains
// its own persisted keypair (localStorage['nostr_secret_key']) that live chat
// (NostrChatAdapter / SecureChatContext) already signs with. NostrIntelBroadcastService
// (report/package broadcast) instead takes a signer per call — a raw secret key or a
// NIP-07 browser-extension object — and throws if neither is supplied and no extension
// is installed. A user's "chat identity" and "report-publishing identity" could
// therefore silently be different keys, or the latter could simply fail.
//
// This wraps nostrService's already-real, already-persisted keypair rather than
// introducing a third key store — that's the one every part of the app should converge
// on, since it's the one live chat already depends on working.
import { useEffect, useState } from 'react';
import { refuseUnder13 } from './ageAnswer';
import nostrService from '../nostrService';
import { subscribeIdentityNotice, type IdentityNotice } from './identityNotice';
import { KeyLockedError, subscribeKeyLock } from './keyLock';
import { signInToRelaysAs } from '../nostr/relayPool';
import type { Event as NostrToolsEvent } from 'nostr-tools';
import { uplinkSigner } from '../../extension/uplinkSigner';

export interface UnsignedNostrEvent {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}

/** Duck-typed to match the NIP-07 `window.nostr` shape that NostrIntelBroadcastService
 * (and any other existing signer-accepting call site) already knows how to consume. */
export interface NostrSigner {
  getPublicKey(): Promise<string>;
  signEvent(event: Record<string, unknown>): Promise<NostrToolsEvent>;
}

/** Where an identity comes from, which decides who holds the secret key. */
export type IdentitySource = 'extension' | 'local' | 'none';

/** What NIP-07 adds for encryption, when an extension offers it. */
interface Nip44Capable {
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
}

const NO_NIP44 = "Your signing extension cannot encrypt (NIP-44), so it cannot seal or open a bundle sent over a relay. "
  + 'An extension that supports NIP-44 can, and so can exporting the bundle as a file.';

/**
 * The signer that holds the key outside this page: Starcom Uplink when it holds this person's key (D-EX,
 * E3), else the NIP-07 object a signing extension puts on the window, if one is installed.
 */
function browserExtension(): (NostrSigner & Nip44Capable) | null {
  const uplink = uplinkSigner();
  if (uplink) return uplink;
  const injected = (globalThis as { nostr?: NostrSigner }).nostr;
  return injected && typeof injected.signEvent === 'function' && typeof injected.getPublicKey === 'function'
    ? injected
    : null;
}

class NostrIdentityService {
  constructor() {
    // Unlocking changes what this browser can read and sign, as an extension answering does: whoever listens for
    // that (accessChanges: the sealed inbox, received packages, replies) starts again (D-KL).
    subscribeKeyLock(() => this.signerListeners.forEach((listener) => listener()));
  }

  /** True when a signing extension is installed, whose key this app never sees. */
  hasExtension(): boolean {
    return browserExtension() !== null;
  }

  /**
   * The hex pubkey this browser holds, or null when it has none YET.
   *
   * Null is now an ordinary answer rather than a failure: a key is created when
   * something needs a signature, so before that there is genuinely no identity, and
   * a caller that treats null as an error would be treating "has not signed anything"
   * as broken. Synchronous, and therefore local-key only — an extension's pubkey
   * arrives over an async bridge; see whoAmI().
   */
  getPubkey(): string | null {
    return nostrService.getPublicKey();
  }

  /**
   * Who this app will sign as, extension first, WITHOUT creating anything.
   *
   * An installed extension wins because the key then lives where this app cannot
   * read it — the app asks for a signature and never holds the secret. That is a
   * better arrangement than anything this origin can do with localStorage, so when
   * it is available it is what gets used.
   */
  async whoAmI(): Promise<{ pubkey: string | null; source: IdentitySource }> {
    const extension = browserExtension();
    if (extension) {
      try {
        const pubkey = await extension.getPublicKey();
        this.answered({ extensionPubkey: pubkey, extensionDeclined: false });
        return { pubkey, source: 'extension' };
      } catch {
        // An installed extension that refuses is not an absent one: the person may
        // have declined the prompt. Fall through to whatever is local, and say which.
      }
    }
    this.answered({ extensionPubkey: null, extensionDeclined: extension !== null });
    const local = nostrService.getPublicKey();
    return local ? { pubkey: local, source: 'local' } : { pubkey: null, source: 'none' };
  }

  /**
   * What the extension said when whoAmI() last asked: its key, or that it
   * declined. Null until asked. An answer given before an extension appeared
   * says nothing about it, which is why "declined" is kept apart from "absent".
   */
  private lastAnswer: { extensionPubkey: string | null; extensionDeclined: boolean } | null = null;

  private signerListeners = new Set<() => void>();

  private answered(next: { extensionPubkey: string | null; extensionDeclined: boolean }): void {
    const changed = next.extensionPubkey !== this.lastAnswer?.extensionPubkey
      || next.extensionDeclined !== this.lastAnswer?.extensionDeclined;
    this.lastAnswer = next;
    if (changed) this.signerListeners.forEach((listener) => listener());
  }

  /**
   * Tells a listener when an extension's answer changes who signs. This
   * browser's own key changing is told by the identity notice instead.
   */
  subscribeSigner(listener: () => void): () => void {
    this.signerListeners.add(listener);
    return () => { this.signerListeners.delete(listener); };
  }

  /**
   * Who this app signs as, known without asking (plan item 2.2). Records are
   * attributed with this, and the publish review names it.
   *
   * getPubkey() is this browser's key only, so with an extension installed the
   * work was recorded under a key that signed nothing the person published.
   * Without an extension this is that key, read live. With one, it is the
   * extension's key once it has answered, or null while it has not been asked:
   * not known yet is the honest answer. Creates nothing.
   */
  signerPubkey(): string | null {
    if (!browserExtension()) return nostrService.getPublicKey();
    if (this.lastAnswer?.extensionPubkey) return this.lastAnswer.extensionPubkey;
    // Declined, so signing falls back to this browser's key as whoAmI does.
    if (this.lastAnswer?.extensionDeclined) return nostrService.getPublicKey();
    return null;
  }

  /** Asks who signs now, extension first, and keeps the answer for signerPubkey(). Creates nothing. */
  async refreshSigner(): Promise<string | null> {
    return (await this.whoAmI()).pubkey;
  }

  /**
   * The key the record being written now is attributed to and will be signed by
   * (plan item 2.2). With an extension, its key, and no local key is made: before
   * this, creating a case minted a second key beside the extension's. Without one,
   * or when the person declines it, this browser's key, created for `reason` if
   * there is none yet, as signing does.
   */
  async ensureSigner(reason: string): Promise<string> {
    const { pubkey, source } = await this.whoAmI();
    if (source === 'extension' && pubkey) return pubkey;
    return pubkey ?? nostrService.ensureIdentity(reason);
  }

  /**
   * Create an identity in this browser, for `reason`, and return its pubkey.
   *
   * Only for a caller that is about to need a signature and wants to say so in its
   * own words. Signing already does this on its own.
   */
  ensureLocalIdentity(reason: string): string {
    return nostrService.ensureIdentity(reason);
  }

  /** The pubkey of a key the person moved into Starcom Uplink, while this page holds none (D-EX, E3). */
  heldByUplink(): string | null {
    return nostrService.holdsOwnKey() ? null : nostrService.heldByUplink();
  }

  /** The passphrase lock on this browser's own key (D-KL): none, locked, or unlocked for this visit. */
  keyLockState(): 'none' | 'locked' | 'unlocked' {
    return nostrService.lockState();
  }

  /**
   * Whether what signs as the person now is this browser's key, locked: a signing extension that answers holds its
   * own key, so this browser's lock is not in its way.
   */
  isLocked(): boolean {
    if (!nostrService.isLocked()) return false;
    return !browserExtension() || this.lastAnswer?.extensionDeclined === true;
  }

  /** Locks this browser's key with a passphrase (D-KL). `cost` is scrypt's, for tests. */
  lockKey(passphrase: string, cost?: number): Promise<void> {
    return nostrService.lock(passphrase, cost);
  }

  /** Removes the passphrase lock, asking for the passphrase first when the key is locked. */
  removeKeyLock(): Promise<void> {
    return nostrService.removeLock();
  }

  /** Opens the locked key for this visit, asking for its passphrase, for `reason`. Only for a person's own act. */
  unlockFor(reason: string): Promise<void> {
    return nostrService.unlockFor(reason);
  }

  /** The `nsec1…` for this browser's identity. Throws when there is none, or it is locked. */
  exportNsec(): string {
    return nostrService.exportNsec();
  }

  /** The `nsec1…`, asking for the passphrase first when the key is locked: for a person who asked to see it. */
  exportNsecUnlocking(reason?: string): Promise<string> {
    return nostrService.exportNsecUnlocking(reason);
  }

  /** Adopt an identity from an `nsec1…`. Returns its pubkey. */
  importNsec(nsec: string): string {
    return nostrService.importNsec(nsec);
  }

  /** Delete this browser's identity. Nothing already published stops existing. */
  forgetIdentity(): void {
    nostrService.forgetIdentity();
  }

  /**
   * Sign an event as the current identity. Passes a shallow copy downstream —
   * nostr-tools' finalizeEvent (which nostrService.signEvent delegates to)
   * mutates whatever object it's given in place, adding id/pubkey/sig
   * directly onto it. Without the copy, a caller holding a reference to the
   * object it passed in would see it silently transform into the signed
   * event too, which is surprising for a method that looks pure.
   */
  sign(event: UnsignedNostrEvent): NostrToolsEvent {
    return nostrService.signEvent({ ...event });
  }

  /**
   * Sign as the identity this browser already has, and never create one.
   *
   * For signatures no person asked for at that moment, such as signing in to a
   * relay they joined (plan item 0.3): code that runs on its own may use an
   * identity but must never make one. The extension signs when there is one.
   */
  async signWithExisting(event: UnsignedNostrEvent): Promise<NostrToolsEvent> {
    // Under 13, nothing is signed, an extension's key included (D-RS, RS39).
    refuseUnder13();
    const extension = browserExtension();
    if (extension) return extension.signEvent({ ...event });
    if (!nostrService.getPublicKey()) {
      throw new Error('No identity to sign with. Nothing was signed, and no identity was created.');
    }
    // Nobody asked for this signature in person, so nobody is asked for a passphrase: a read waits for the unlock,
    // and starts again after it (D-KL).
    if (nostrService.isLocked()) throw new KeyLockedError();
    return this.sign(event);
  }

  /**
   * A NIP-07-shaped signer object usable anywhere a caller already accepts one — e.g.
   * `NostrIntelBroadcastService.publishIntelReport(payload, nostrIdentityService.asSigner())`.
   * Lets existing signer-accepting call sites use this identity with no signature
   * change on their end: they were already built to accept a duck-typed
   * `{ getPublicKey, signEvent }` object matching the browser-extension shape.
   */
  /**
   * NIP-44 encryption as the signer (plan item 2.4), by the rule asSigner()
   * signs by: the extension when one is installed, so its key stays outside
   * this app, and this browser's key when not. An extension that cannot
   * encrypt is said to be one, never passed over for a key it did not choose.
   */
  async nip44Encrypt(peer: string, plaintext: string, reason = 'sealing what you send'): Promise<string> {
    const extension = browserExtension();
    if (extension) {
      if (!extension.nip44) throw new Error(NO_NIP44);
      return extension.nip44.encrypt(peer, plaintext);
    }
    // Sealing is always something the person is sending, so a locked key is asked for (D-KL).
    await nostrService.unlockFor(reason);
    return nostrService.nip44Encrypt(peer, plaintext);
  }

  /**
   * Opens what was sealed to this key. With `reason`, a locked key is asked for: the person is opening something.
   * Without one, as the sealed inbox reads on its own, a locked key throws KeyLockedError and nobody is asked (D-KL).
   */
  async nip44Decrypt(peer: string, payload: string, reason?: string): Promise<string> {
    const extension = browserExtension();
    if (extension) {
      if (!extension.nip44) throw new Error(NO_NIP44);
      return extension.nip44.decrypt(peer, payload);
    }
    if (reason) await nostrService.unlockFor(reason);
    return nostrService.nip44Decrypt(peer, payload);
  }

  asSigner(reason = 'signing what you asked for'): NostrSigner {
    return {
      getPublicKey: async () => (await this.whoAmI()).pubkey
        // Reached only when there is no extension and no local key, which cannot
        // happen through signEvent below — that one creates an identity. A caller
        // asking who it is before signing anything gets the honest answer.
        ?? nostrService.ensureIdentity('publishing as you'),
      /*
       * The extension signs when there is one, so the secret key stays outside this
       * app entirely. This is the async path, which is the only kind an extension can
       * serve; sign() below is synchronous and therefore always the local key.
       */
      signEvent: async (event) => {
        refuseUnder13();
        const extension = browserExtension();
        if (extension) return extension.signEvent(event);
        // Every caller is a person's own act (publishing, sending, joining), so a locked key is asked for (D-KL).
        // What drains on its own checks isLocked() first (FindingsPublisherService.canSign).
        await nostrService.unlockFor(reason);
        return this.sign(event as unknown as UnsignedNostrEvent);
      },
    };
  }
}

export const nostrIdentityService = new NostrIdentityService();

// Relays the person joined are signed in to as this identity (plan item 0.3).
signInToRelaysAs(nostrIdentityService);

/**
 * React hook for components that want to know who they are.
 *
 * It subscribes now, rather than reading once on mount as it used to: an identity is
 * created when something first needs a signature, which can happen long after any of
 * these components mounted. A plain read would have shown "no identity" for the rest
 * of the session.
 */
export function useNostrIdentity(): { pubkey: string | null; source: IdentitySource; notice: IdentityNotice | null } {
  const [state, setState] = useState<{ pubkey: string | null; source: IdentitySource }>(
    () => ({ pubkey: nostrIdentityService.getPubkey(), source: nostrIdentityService.getPubkey() ? 'local' : 'none' }),
  );
  const [notice, setNotice] = useState<IdentityNotice | null>(null);

  useEffect(() => {
    let live = true;
    const refresh = () => {
      void nostrIdentityService.whoAmI().then((next) => { if (live) setState(next); });
    };
    refresh();
    // A creation or an import is exactly when this changes.
    const stop = subscribeIdentityNotice((next) => { setNotice(next); refresh(); });
    return () => { live = false; stop(); };
  }, []);

  return { ...state, notice };
}
