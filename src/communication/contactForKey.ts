import type { ChatContact } from '../types/SecureChat';

/**
 * A contact for a key and a name (plan item 2.7): what "Verify & Add" makes,
 * and what a direct message from someone not yet a contact opens a window
 * with. Fields the contact model requires are filled honestly rather than
 * invented: no post-quantum key material (the prekey bundle is fetched when
 * it is needed), and neutral starting values.
 *
 * `vouched` says whether a person vouched for the key by adding it. A
 * stranger's contact was filled with the same verification, "web-of-trust" by
 * the local operator, that nobody made (plan item 9.9); it now claims none.
 * Starcom scores nobody (refusal R-6): the model requires a number, and it is 0.
 */
export function contactForKey(
  pubkey: string,
  displayName: string,
  { vouched, now = new Date() }: { vouched: boolean; now?: Date },
): ChatContact {
  return {
    pubkey,
    displayName,
    pqcPublicKey: {
      algorithm: 'CRYSTALS-Kyber-768',
      keyData: new Uint8Array(0),
      securityLevel: 'NIST-3',
      createdAt: now,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    },
    verifiedIdentity: {
      pubkey,
      displayName,
      verificationMethod: vouched ? 'web-of-trust' : 'none',
      verifiedBy: vouched ? 'local-operator' : '',
      verificationDate: now,
      verificationSignature: '',
    },
    lastVerified: now,
    isVerified: false,
    behaviorSignature: '',
    lastActivity: now,
    isOnline: false,
    lastSeen: now,
    preferredRelays: [],
  };
}
