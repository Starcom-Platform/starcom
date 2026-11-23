#!/usr/bin/env node
/**
 * Publication policy — a reference implementation any publisher can run.
 *
 * ─── WHY THIS IS NOT A SHARED LIBRARY ──────────────────────────────────────
 *
 * Starcom refuses a claim about a private individual with no stated public
 * interest. It refuses fabricated evidence. It refuses material still held in a
 * workspace. Those checks live in Starcom's TypeScript, so a peer publishing
 * under its own key — which is how Mecha Jono should publish, and how every
 * liability protection stays intact — does not run them.
 *
 * The result is that a peer can sign and broadcast something Starcom would have
 * refused, and Starcom only declines it on INGEST. Refusing afterwards is much
 * worse than checking beforehand: by then the claim is signed, on relays, and
 * about a real person who did not consent.
 *
 * So the checks are extracted. But NOT as a dependency everyone imports —
 * `deriveClaimWeight` records why that pattern is wrong for this network, and
 * the argument holds here for a second reason. A single library everyone
 * imports makes Starcom the moderator of what other people may publish, which
 * is precisely the role the architecture is built to avoid. We do not host
 * their content, we do not hold their keys, and we should not own their policy.
 *
 * What this is instead: a REFERENCE. Copy it, port it, or write your own and
 * check it against the published vectors. The vectors are the shared artifact;
 * the code is a worked example. That is the same arrangement as peer.mjs and
 * the claims spec, and it is the arrangement that lets four nodes disagree
 * about implementation while agreeing about outcomes.
 *
 * ─── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────
 *
 * It does not report. No network call, no telemetry, no count. A guardrail that
 * tells anyone what it refused turns protection into knowledge, and knowledge
 * into a duty. This runs on your machine and its answer is yours.
 *
 * It imports nothing — not from Starcom, not from npm.
 *
 * Usage:  import { evaluatePublication } from './publication.mjs'
 * Vectors: docs/spec/publication-vectors/
 */

/**
 * How a person-subject stands in relation to public power.
 *
 * Not a measure of importance. It asks one narrow question: does this person
 * hold power or a public role, and is the claim ABOUT their exercise of it? A
 * legislator's committee votes qualify; the same legislator's medical history
 * does not.
 */
export const SUBJECT_ROLES = new Set([
  'public-office',
  'corporate-officer',
  'criminal-persona',
  'private',
]);

/** Statuses that mean material is held in a workspace rather than publishable. */
export const CONTAINMENT_REASONS = new Set([
  'person-subject-default',
  'working-material',
  'source-terms',
  'operator-decision',
]);

/** Whether material has been deliberately released from a workspace. */
export function mayLeaveWorkspace(containment) {
  // Absent means NOT containment-managed, and passes. Containment is opt-in and
  // absolute for material that opts in; a third gate everyone must remember to
  // satisfy is how safety machinery gets routed around instead of used.
  if (!containment) return true;
  return containment.contained === false;
}

/**
 * Decide whether a claim may be published.
 *
 * Returns { allowed: true } or { allowed: false, reason, requiresExplicitConsent }.
 * The reason is meant to be shown to whoever is publishing, in those words: a
 * refusal that explains itself makes the person better at the work, and is
 * evidence they were told what the risk was before proceeding.
 *
 * ORDER MATTERS and is not arbitrary:
 *
 *   1. containment   is this a publication at all?
 *   2. provenance    is the evidence real?
 *   3. subject       should this be published about this person?
 *
 * Most research never reaches 3, which is what keeps the consent prompt rare
 * enough to still be a moment of deliberation rather than a key people press.
 */
export function evaluatePublication(subjectKind, options = {}) {
  const refuse = (reason) => ({ allowed: false, reason, requiresExplicitConsent: true });

  // 1 — Contained material is not a publication candidate. This asks a
  // different question from the checks below, not a stricter version of one.
  if (!mayLeaveWorkspace(options.containment)) {
    return refuse(
      'Held in the workspace. Release it first — that is a separate decision from '
      + 'publishing, and keeping them separate is what stops the second being made '
      + 'by someone who only meant the first.',
    );
  }

  // 2 — Fabricated evidence never goes on the wire, and `undefined` is refused
  // alongside `true`. "Nobody said whether it was real" is not permission:
  // allowing unmeasured provenance reopens the hole for every event type that
  // does not carry the flag, which is most of them.
  if (options.isMock !== false) {
    return refuse(
      options.isMock === true
        ? 'This rests on fabricated evidence. Publishing it would broadcast demo data, '
          + 'signed, indistinguishable from real intelligence.'
        : 'The evidence does not state whether it is real. Unmeasured provenance is not '
          + 'permission to publish — establish it first.',
    );
  }

  // 3 — Anything that is not a person publishes without ceremony. Companies,
  // infrastructure, vessels, places: institutions are accountable and this is
  // the ordinary case.
  if (subjectKind !== 'person') return { allowed: true };

  /*
   * PEOPLE. The gate here was once a single yes/no, and a stress test of
   * seventeen real investigator cases showed what that cost in BOTH directions:
   * on one checkbox it published a whistleblower's identity, a target's child's
   * home address, a private donor and a recruitment candidate — while having
   * nothing to say about a legislator taking money from the regulator he
   * chairs, which is the least controversial publication in journalism.
   *
   * The role separates them, and it is the caller's to state. Absent means
   * private, because that is the safe read.
   */
  const role = options.subjectRole ?? 'private';
  if (!SUBJECT_ROLES.has(role)) {
    return refuse(`Unrecognised subjectRole "${role}". Use one of: ${[...SUBJECT_ROLES].join(', ')}.`);
  }

  if (role !== 'private') {
    if (options.consentToPublishAboutPerson === true) return { allowed: true };
    return refuse(
      `This names a person in a ${role.replace('-', ' ')} capacity. That is ordinarily `
      + 'publishable — public power and corporate office are accountable, and a threat '
      + "actor's persona is attributed by their own conduct. Confirm deliberately.",
    );
  }

  /*
   * A PRIVATE individual. Consent alone is not the question.
   *
   * There is deliberately no absolute bar: absolute bars get routed around, and
   * real cases exist — a fugitive's location, a private person causing public
   * harm. What is required is that someone STATES why this serves the public
   * and that the reason is recorded, which is the question an editor asks out
   * loud before running it.
   */
  const justification = String(options.publicInterestJustification ?? '').trim();
  if (options.consentToPublishAboutPerson === true && justification) {
    return { allowed: true };
  }

  return refuse(
    'This is about a private individual — someone with no public role that this claim '
    + 'concerns. Publishing broadcasts a signed claim about them where being wrong is not '
    + 'quietly correctable, and where the people this network exists to protect are the '
    + 'ones most easily harmed. State what public interest it serves, or set subjectRole '
    + 'if they hold public office, corporate office, or a persona attributed by their own '
    + 'conduct.',
  );
}
