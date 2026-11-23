/**
 * Starcom Uplink as the person's signer, in the app (decision D-EX, E3, EX39, K4): when Uplink holds
 * this person's key, it is the signer, offered in the shape a NIP-07 extension has, so every path that
 * already prefers an extension (who signs, signing, NIP-44 sealing) uses it unchanged, and chat signs
 * through it too. The key then never sits in Starcom's page.
 *
 * It counts only when this page holds no key of its own, or the same key: a key brought back from a
 * backup that differs from Uplink's is the person's choice, and is not overruled.
 */
import type { Event as NostrToolsEvent } from 'nostr-tools';
import nostrService from '../services/nostrService';
import type { EventToSign, ResultOf, UplinkAnswer } from './protocol';
import { asksFirst, kindWords } from './uplink/signerRules';
import { refusalSaid, uplinkPurpose, type Purpose } from './purposes';
import { uplinkWords } from '../i18n/uplink/uplinkWords';
import { languageNow } from '../i18n/app/i18n';
import { askUplink, onUplinkChange, uplinkNow } from './useStarcomUplink';

/** Long enough for the person to type their passphrase and read what they are asked to sign. */
const PERSON_WAIT_MS = 180_000;

let status: ResultOf['signer.status'] | null = null;

export interface UplinkSigner {
  getPublicKey(): Promise<string>;
  signEvent(event: Record<string, unknown>): Promise<NostrToolsEvent>;
  nip44: {
    encrypt(peer: string, plaintext: string): Promise<string>;
    decrypt(peer: string, ciphertext: string): Promise<string>;
  };
}

const refused = (answer: UplinkAnswer) => new Error(answer.ok === false ? refusalSaid(answer.refusal, answer.reason) : 'Uplink answered something else');

/**
 * Why a signature is asked for, in words Uplink shows: from the kind, as the caller gave none. Said in the
 * language shown, the kind in Uplink's own words for it (loaded only when Uplink signs), and in English.
 */
async function purposeFor(kind: number): Promise<Purpose> {
  const { m } = await uplinkWords(languageNow(), []);
  return uplinkPurpose(asksFirst(kind) ? 'publish' : 'sign', { said: { what: kindWords(kind, m) }, english: { what: kindWords(kind) } });
}

/** Uplink's signer, when it holds this person's key; else null, and this page's own key signs. */
export function uplinkSigner(): UplinkSigner | null {
  const pubkey = status?.held ? status.pubkey : undefined;
  if (!pubkey) return null;
  if (nostrService.holdsOwnKey() && nostrService.getPublicKey() !== pubkey) return null;
  return {
    getPublicKey: async () => pubkey,
    async signEvent(event) {
      const e = event as unknown as EventToSign;
      const toSign: EventToSign = { kind: e.kind, created_at: e.created_at, tags: e.tags, content: e.content };
      const why = await purposeFor(e.kind);
      const answer = await askUplink('signer.sign', why.said, { event: toSign }, PERSON_WAIT_MS, why.english);
      if (answer.ok === false) throw refused(answer);
      return answer.result.event as NostrToolsEvent;
    },
    nip44: {
      async encrypt(peer, plaintext) {
        const why = uplinkPurpose('seal');
        const answer = await askUplink('signer.encrypt', why.said, { peer, plaintext }, PERSON_WAIT_MS, why.english);
        if (answer.ok === false) throw refused(answer);
        return answer.result.ciphertext;
      },
      async decrypt(peer, ciphertext) {
        const why = uplinkPurpose('open');
        const answer = await askUplink('signer.decrypt', why.said, { peer, ciphertext }, PERSON_WAIT_MS, why.english);
        if (answer.ok === false) throw refused(answer);
        return answer.result.plaintext;
      },
    },
  };
}

/** Points chat's signing at Uplink while it is the signer, and back at this page's key when it is not. */
function wire(): void {
  const signer = uplinkSigner();
  if (signer) nostrService.useSigner((template) => signer.signEvent(template as unknown as Record<string, unknown>), status!.pubkey);
  else nostrService.useSigner(null);
}

/** Asks Uplink whether it holds a key, and whose; then wires the signer to match. */
export async function refreshUplinkSigner(): Promise<ResultOf['signer.status'] | null> {
  const now = uplinkNow();
  if (now.status !== 'connected' || !now.hello.capabilities.some((c) => c.id === 'signer.status')) {
    status = null;
  } else {
    const why = uplinkPurpose('status');
    const answer = await askUplink('signer.status', why.said, {}, undefined, why.english);
    status = answer.ok ? answer.result : null;
  }
  wire();
  return status;
}

/** What Uplink last said of the key, for showing the person. */
export const uplinkSignerStatus = (): ResultOf['signer.status'] | null => status;

// Asked again whenever Uplink arrives or leaves.
if (typeof window !== 'undefined') onUplinkChange(() => { void refreshUplinkSigner(); });
