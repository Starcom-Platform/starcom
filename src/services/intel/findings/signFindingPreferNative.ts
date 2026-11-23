/**
 * Sign through the host's isolated signer when there is one.
 *
 * ─── WHY THIS IS NOT JUST A ROUTING CHOICE ─────────────────────────────────
 *
 * In a browser this node's ML-DSA private key lives in IndexedDB, as a plain
 * number[], reachable by any script that reaches the page — in an application
 * whose job includes loading pages written by the people under investigation.
 * The desktop host keeps the key in a process with no network and no browsing
 * context, and hands back only a signature.
 *
 * So the two paths are not equivalent and this is not a fallback in the usual
 * sense: it is the difference between a key an attacker could read and one they
 * could at most ask to be used.
 *
 * ─── WHY THE HOST'S ANSWER IS CHECKED ──────────────────────────────────────
 *
 * The signer canonicalises independently — it must, or accepting a digest would
 * let any caller sign anything. Two implementations of the same canonical form
 * is exactly where a format quietly diverges, and a signature over a subtly
 * different string is valid, unverifiable, and indistinguishable from a correct
 * one until a peer rejects it.
 *
 * So the canonical string the signer reports is compared against this
 * application's own `stableStringify` before the signature is used. Divergence
 * is refused rather than published. The check costs one string comparison; the
 * failure it prevents is a claim nobody else can verify carrying this node's
 * name.
 */
import { nativeHost, type SignableKind } from '../../native/nativeHost';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { ownPublishingKeys } from './ownPublishingKeys';
import { manifestSigningKeyStore } from '../../crypto/ManifestSigningKeyStore';
import { signFinding, stableStringify, type SignableFindingContent, type SignedFinding } from './signFinding';
import { isRefutation } from './refutation';
import { isRetraction } from './retraction';

export type SigningRoute = 'host-signer' | 'browser-key';

export interface SignedWithRoute {
  signed: SignedFinding;
  /**
   * Which path produced it. Surfaced rather than hidden because the two differ in
   * how well the key was protected, and an operator publishing under their own
   * name is entitled to know which one they used.
   */
  route: SigningRoute;
}

/**
 * What the operator is actually being asked to sign.
 *
 * This was the literal string 'finding' for all three, and all three go through
 * here: a finding, a refutation, and a RETRACTION. The kind is what the host
 * shows the person at the moment it asks them to authorise with their own key,
 * so someone withdrawing a claim about a named individual was being told they
 * were publishing a finding. That is the one moment where being told the wrong
 * thing matters most, and it is the same concern publisherConsent exists for.
 *
 * Derived from the content rather than passed in, because a parameter is a
 * thing three call sites can get wrong independently and this one already had.
 *
 * A host that does not recognise a kind fails loudly here — there is
 * deliberately no catch, since falling back to the browser key would be a
 * silent downgrade of key protection the operator did not choose. And a host
 * that misbehaves in any subtler way is caught by the canonical-form check
 * below, which refuses the signature rather than publishing it.
 */
function signingKind(content: SignableFindingContent): SignableKind {
  if (isRetraction(content)) return 'retraction';
  if (isRefutation(content)) return 'refutation';
  return 'finding';
}

export async function signFindingPreferNative(
  content: SignableFindingContent,
): Promise<SignedWithRoute> {
  const host = nativeHost();

  if (host) {
    const status = await host.signer.status().catch(() => null);
    if (status?.ready) {
      const block = await host.signer.sign(signingKind(content), content as unknown as Record<string, unknown>);

      // The one check that matters. A signature over a different canonical
      // string is valid and useless, and looks exactly like a good one.
      const expected = stableStringify(content);
      if (block.canonical !== expected) {
        throw new Error(
          'Refusing a signature from the host: its canonical form differs from this build\'s. '
          + 'Publishing it would produce a claim no peer could verify.',
        );
      }

      // Remembered on BOTH routes, so our own echo off the relays is
      // recognised whichever key produced it — and still recognised after the
      // host appears or disappears mid-session and the key changes under us.
      ownPublishingKeys.remember(block.pubkey);
      return {
        signed: { content, signature: { alg: 'ml-dsa-65', pubkey: block.pubkey, sig: block.sig } },
        route: 'host-signer',
      };
    }
  }

  // Browser, or a host whose signer could not start. The key is less well
  // protected here and that is a property of the environment, not a defect —
  // the alternative is refusing to let a browser user publish at all.
  const keys = await manifestSigningKeyStore.getOrCreate(() => ml_dsa65.keygen());
  const signed = signFinding(content, keys.secretKey);
  ownPublishingKeys.remember(signed.signature.pubkey);
  return { signed, route: 'browser-key' };
}
