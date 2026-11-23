/**
 * Gift wraps (NIP-59), written over the signer (plan item 2.4).
 *
 * nostr-tools' nip59 takes the secret key's bytes, which a signing extension
 * never gives, so the seal is made and opened through the signer's NIP-44:
 * the extension's when one is installed, this browser's key when not.
 *
 *   rumor  the event itself, unsigned, with its author and id;
 *   seal   kind 13, the rumor encrypted to the recipient, signed by the
 *          sender, so the recipient knows who sent it;
 *   wrap   kind 1059, the seal encrypted to the recipient, signed by a key
 *          used once, and addressed by a p tag. A relay sees who receives
 *          something and roughly when, never who sent it or what it is.
 *
 * Both timestamps are set up to two days back, as NIP-59 says, so the time a
 * relay sees does not give the moment away.
 */
import {
  finalizeEvent, generateSecretKey, getEventHash, nip44, verifyEvent,
  type Event, type UnsignedEvent,
} from 'nostr-tools';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { PROTOCOL_KINDS } from './kindRegistry';
import { exposedSince, retiredKey } from './publisherKeys';

export type Rumor = UnsignedEvent & { id: string };

/** NIP-44's limit on what one encryption may hold. */
const NIP44_MAX = 65_535;
const TWO_DAYS = 2 * 24 * 60 * 60;

const aWhileAgo = (): number => Math.floor(Date.now() / 1000) - Math.floor(Math.random() * TWO_DAYS);

export class TooLargeToWrap extends Error {}
export class SealRefused extends Error {}

/** Why nothing may be sealed to this key, or null when it may. */
export function sealRefusal(recipient: string): string | null {
  const exposed = exposedSince(recipient);
  return exposed
    ? `Nothing is sealed to this key. Its secret was exposed on ${exposed}, so whoever holds it could see who sent it. Nothing was sent.`
    : null;
}

/**
 * The event itself, unsigned, as the signer: made once, however many it is wrapped for. Its time is now, or the
 * one given (a mission report says only its day, D-MF MF12).
 */
export async function makeRumor(template: { kind: number; tags: string[][]; content: string }, createdAt?: number): Promise<Rumor> {
  const me = await nostrIdentityService.ensureSigner('sending a sealed message');
  const unsigned: UnsignedEvent = { ...template, pubkey: me, created_at: createdAt ?? Math.floor(Date.now() / 1000) };
  return { ...unsigned, id: getEventHash(unsigned) };
}

/** Seals a rumor as the signer and wraps it for one recipient. Sends nothing. */
export async function wrapRumor(rumor: Rumor, recipient: string): Promise<Event> {
  // Refused here, where every seal is made, so no path can seal to a key whose secret is out.
  const refusal = sealRefusal(recipient);
  if (refusal) throw new SealRefused(refusal);
  const rumorText = JSON.stringify(rumor);
  // The seal's JSON, base64 inside the wrap, must fit too: about a third larger.
  if (new TextEncoder().encode(rumorText).length > (NIP44_MAX - 1_000) * 0.74) {
    throw new TooLargeToWrap('This is too large to send in one sealed message.');
  }
  const seal = await nostrIdentityService.asSigner().signEvent({
    kind: PROTOCOL_KINDS.NIP59_SEAL,
    created_at: aWhileAgo(),
    tags: [],
    content: await nostrIdentityService.nip44Encrypt(recipient, rumorText),
  });
  const once = generateSecretKey();
  return finalizeEvent({
    kind: PROTOCOL_KINDS.NIP59_GIFT_WRAP,
    created_at: aWhileAgo(),
    tags: [['p', recipient]],
    content: nip44.encrypt(JSON.stringify(seal), nip44.getConversationKey(once, recipient)),
  }, once);
}

/** Seals this event as the signer and wraps it for one recipient. Sends nothing. */
export async function sealAndWrap(template: { kind: number; tags: string[][]; content: string }, recipient: string, createdAt?: number): Promise<Event> {
  return wrapRumor(await makeRumor(template, createdAt), recipient);
}

/** Said of a wrap that waits for the key to be unlocked (D-KL). */
export const LOCKED_TO_OPEN = 'Your key is locked. Unlock it to open what was sent to you.';

/**
 * Opens a wrap addressed to the signer, or says why it cannot be trusted. Never asks for a passphrase: a wrap read
 * while the key is locked is refused with `locked`, which is no verdict on the wrap, and is opened after the unlock.
 */
export async function unwrapGift(wrap: Event): Promise<{ rumor: Rumor; sender: string } | { refused: string; locked?: true }> {
  const { pubkey: me } = await nostrIdentityService.whoAmI();
  if (!me) return { refused: 'There is no key in this browser to open it with.' };
  if (nostrIdentityService.isLocked()) return { refused: LOCKED_TO_OPEN, locked: true };
  if (wrap.kind !== PROTOCOL_KINDS.NIP59_GIFT_WRAP || !verifyEvent(wrap)) return { refused: 'This is not a gift wrap, or it was changed.' };
  if (!wrap.tags.some((t) => t[0] === 'p' && t[1] === me)) return { refused: 'This sealed message is not addressed to you.' };

  let seal: Event;
  try {
    seal = JSON.parse(await nostrIdentityService.nip44Decrypt(wrap.pubkey, wrap.content));
  } catch (e) {
    return { refused: e instanceof Error && /NIP-44/.test(e.message) ? e.message : 'This sealed message could not be opened: it was changed, or it is not for this key.' };
  }
  if (seal.kind !== PROTOCOL_KINDS.NIP59_SEAL || !verifyEvent(seal)) return { refused: 'The seal inside was changed, or is not a seal.' };
  // A wrap is signed by a key used once, so the pool cannot see who sealed it: the seal's key is checked here (MX31).
  if (retiredKey(seal.pubkey, Math.floor(Date.now() / 1000))) {
    return { refused: 'Sealed under a key no longer read: its secret was exposed, and its publisher now signs with a newer key.' };
  }

  let rumor: Rumor;
  try {
    rumor = JSON.parse(await nostrIdentityService.nip44Decrypt(seal.pubkey, seal.content));
  } catch {
    return { refused: 'The seal inside could not be opened.' };
  }
  if (rumor.pubkey !== seal.pubkey) {
    return { refused: 'The message inside names an author who is not the one who sealed it.' };
  }
  const { id: _id, ...unsigned } = rumor;
  if (getEventHash(unsigned as UnsignedEvent) !== rumor.id) return { refused: 'The message inside was changed.' };
  return { rumor, sender: seal.pubkey };
}
