/**
 * Moving the person's key into Starcom Uplink (decision D-EX, E3, EX39, K6), at their click in "Your key".
 *
 * Uplink takes the key and seals it under a passphrase the person sets in Uplink's own window, so
 * Starcom's page never sees the passphrase. Then Uplink signs a check, and the signature must verify as
 * the same key. Only then does this page forget the key, keeping just whose it was, so it never makes a
 * second one while Uplink is away (nostrService.handOverToUplink). Short of that, nothing moves.
 */
import { verifyEvent } from 'nostr-tools';
import nostrService from '../services/nostrService';
import type { UplinkAnswer } from './protocol';
import { refreshUplinkSigner } from './uplinkSigner';
import { askUplink } from './useStarcomUplink';
import { refusalSaid, uplinkPurpose } from './purposes';

/** Long enough to set a passphrase, typed twice. */
const PERSON_WAIT_MS = 300_000;
/** NIP-42's kind: a relay sign-in, which Uplink signs quietly and no relay is ever sent. */
const CHECK_KIND = 22242;

const said = (answer: UplinkAnswer) => new Error(answer.ok === false ? refusalSaid(answer.refusal, answer.reason) : 'Uplink answered something else');

export async function moveKeyToUplink(deps: { ask?: typeof askUplink; refresh?: typeof refreshUplinkSigner } = {}): Promise<string> {
  const ask = deps.ask ?? askUplink;
  const refresh = deps.refresh ?? refreshUplinkSigner;
  const pubkey = nostrService.getPublicKey();
  if (!pubkey || !nostrService.holdsOwnKey()) throw new Error('This browser holds no key to move.');

  const moving = uplinkPurpose('move');
  // A key locked here (D-KL) is opened first, with its passphrase: Uplink seals it again under its own.
  const nsec = await nostrService.exportNsecUnlocking('moving your key into Starcom Uplink');
  const taken = await ask('signer.import', moving.said, { nsec }, PERSON_WAIT_MS, moving.english);
  if (taken.ok === false) throw said(taken);
  if (taken.result.pubkey !== pubkey) throw new Error('Uplink took a different key, so nothing was moved.');

  // The proof: a signature from Uplink that verifies as this person's key.
  const challenge = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const checking = uplinkPurpose('check');
  const check = await ask('signer.sign', checking.said, {
    event: { kind: CHECK_KIND, created_at: Math.floor(Date.now() / 1000), tags: [['relay', 'starcom-key-move-check'], ['challenge', challenge]], content: '' },
  }, PERSON_WAIT_MS, checking.english);
  if (check.ok === false) throw said(check);
  const signed = check.result.event;
  // Checked on a plain copy: nostr-tools marks an event it has verified, and a copy carries the mark.
  const proven = signed.pubkey === pubkey && signed.tags.some((t) => t[0] === 'challenge' && t[1] === challenge) && verifyEvent(JSON.parse(JSON.stringify(signed)));
  if (!proven) throw new Error('Uplink did not sign as you, so nothing was moved.');

  nostrService.handOverToUplink(pubkey);
  await refresh();
  return pubkey;
}
