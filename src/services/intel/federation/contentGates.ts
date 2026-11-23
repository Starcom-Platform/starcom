/**
 * The checks every signed payload must pass, whatever shape it is.
 *
 * These lived only in ForeignFindingStore. RefutationStore — the store that
 * actually receives refutations, since the router sends kind 30083 there —
 * applied none of them, so the two stores in one app disagreed about what a
 * conforming payload is. A refutation carrying `confidence: 0.99`, or
 * `schemaVersion: 1`, or a modality nobody registered, was refused by the
 * reference peer implementation and by the claim store, and stored and weighed
 * by the refutation store.
 *
 * That is the divergence the published vectors exist to prevent, occurring
 * inside a single repository, on the one path that runs.
 *
 * Written once here so a rule cannot be enforced in one store and forgotten in
 * the other. The reference implementation in scripts/peer/peer.mjs stays a
 * separate, independent re-derivation on purpose — that is what makes it worth
 * having.
 */

/**
 * Describes how an observation was made. Deliberately NOT an ordering — the
 * consumer ranks these, the same way it derives weight.
 */
export const MODALITIES = new Set([
  'in_person', 'field_attested', 'direct_contact', 'primary_record',
  'secondary_record', 'inference', 'self_attested', 'unknown',
]);

/** Why a claim is being contested. A closed set, like retraction reasons. */
export const REFUTATION_GROUNDS = new Set([
  'contradicting-evidence', 'failed-reproduction', 'source-defect', 'superseded-by-time',
]);

const SCHEMA_VERSION_MIN = 2;

export type ContentGateFailure =
  | 'unsupported-schema'
  | 'declared-weight'
  | 'unknown-modality'
  | 'malformed';

/**
 * The gates shared by every shape. Returns the failure, or null to continue.
 *
 * 'score' is in the declared-weight check because the reference peer rejects it
 * and this did not — a payload carrying `score: 0.95` was refused over there
 * and stored over here.
 */
const FORBIDDEN_KEYS = new Set(['confidence', 'weight', 'score']);

/**
 * Does this payload assert its own weight ANYWHERE?
 *
 * A top-level check is a check on where the last person happened to put it.
 * Depth-bounded so a hostile payload cannot make this walk forever.
 */
function declaresWeightAnywhere(value: unknown, depth = 0): boolean {
  if (depth > 8 || typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return value.some((v) => declaresWeightAnywhere(v, depth + 1));
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(k)) return true;
    if (declaresWeightAnywhere(v, depth + 1)) return true;
  }
  return false;
}

export function contentGateFailure(content: unknown): ContentGateFailure | null {
  if (typeof content !== 'object' || content === null) return 'malformed';
  const c = content as Record<string, unknown>;

  if (typeof c.schemaVersion !== 'number' || c.schemaVersion < SCHEMA_VERSION_MIN) {
    return 'unsupported-schema';
  }

  // A VALID SIGNATURE OVER A FORBIDDEN PAYLOAD IS STILL A REJECTION. A
  // signature proves the bytes are authentic, never that they are permitted,
  // and a self-declared weight is precisely what the derived-weight design
  // exists to refuse.
  //
  // Checked at EVERY depth, not just the top level. method.parameters became an
  // open bag, so `parameters: { confidence: 0.82 }` was type-legal and both
  // validators looked only at the root — the forbidden assertion travelling one
  // level down, through the door the type change opened.
  if (declaresWeightAnywhere(c)) return 'declared-weight';

  const method = c.method as Record<string, unknown> | undefined;
  if (!method) return 'unsupported-schema';
  if (!MODALITIES.has(String(method.modality))) return 'unknown-modality';

  // An empty array is a positive statement — the publisher checked and found
  // nothing weak. A string is a publisher who did not read the format.
  if (!Array.isArray(method.weakBacking)) return 'malformed';

  return null;
}
