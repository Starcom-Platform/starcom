/**
 * Whether an incoming claim's published facts yield a weight this node can use.
 *
 * ─── THIS FILE USED TO CONTAIN A SECOND COPY OF THE DERIVATION ─────────────
 *
 * It was written with a docstring arguing that duplication was deliberate and
 * load-bearing: that a network where every node imports one shared derivation
 * has author-declared confidence again, with the declaration moved into a
 * dependency.
 *
 * That argument is sound, and it is about SEPARATE NODES. It says nothing in
 * favour of two copies inside one application — and `deriveAttestationWeight`
 * already existed one directory away with twelve consumers, including
 * `foreignFinding.ts` in this very folder. The only thing a second in-process
 * copy can contribute is a way for this node to judge the same claim two ways,
 * and `ingest-check.mjs` would never have caught it, because it compares this
 * app against peer.mjs rather than against itself.
 *
 * The copies were checked before this one was removed: they agreed on all six
 * cases in derivationAgreement.test.ts. No claim was ever judged inconsistently.
 * The duplicate was a latent hazard rather than a live defect, and it is gone.
 *
 * Cross-node independence is unaffected. peer.mjs, conformance.mjs and
 * verify-finding.mjs remain genuinely separate implementations, and the 21
 * conformance vectors are what keep them honest.
 *
 * ─── WHAT REMAINS HERE ─────────────────────────────────────────────────────
 *
 * One guard, which is new and belongs to ingest rather than to derivation.
 */
import { explainAttestationWeight } from '../findings/deriveAttestationWeight';

/**
 * Whether the published facts produce a weight a consumer can actually rank.
 *
 * Field-by-field validation cannot answer this. A claim can carry every
 * required field, correctly shaped, and still be unrankable, because the fields
 * have to work together — omit `parameters.windowHours` and the derivation
 * multiplies by NaN. NaN compares false against every threshold, so such a
 * claim is accepted, stored, and then sorts below everything forever, with no
 * error raised anywhere.
 *
 * That is not hypothetical: the first batch generator written against this spec
 * produced 191 claims in exactly that state, and every conformance check passed
 * them.
 *
 * The check runs the real derivation rather than restating its preconditions. A
 * restatement is a second copy of that knowledge, free to drift — which is the
 * same mistake this file used to embody at a larger scale.
 */
export function yieldsUsableWeight(content: unknown): boolean {
  try {
    const { weight } = explainAttestationWeight(
      content as Parameters<typeof explainAttestationWeight>[0],
    );
    return Number.isFinite(weight) && weight >= 0 && weight <= 1;
  } catch {
    return false;
  }
}
