import type { SubjectKind } from '../../../types/intel/SourceObservation';
import { mayLeaveWorkspace, explainContainment, type ContainmentState } from './workspaceContainment';

/**
 * What this instance is willing to publish about whom.
 *
 * The data model permits findings about named individuals. Kind 30082 goes to
 * public relays. This instance can be wrong. Those three facts together mean a
 * mistaken claim about a real person becomes a permanent, broadcast, signed
 * assertion — and the harm from being wrong about a person is categorically
 * different from being wrong about an earthquake.
 *
 * So publishing a claim about a person is a DELIBERATE ACT here, not a default.
 * The gate is not a judgement that such findings are illegitimate; naming who
 * did what is much of the point of public-interest intelligence. It is a
 * judgement that it should never happen because nobody thought about it.
 *
 * Retraction (see retraction.ts) is the other half. A system that can publish
 * about people needs both a moment of deliberation before, and a way to
 * withdraw after.
 */

/**
 * How a person-subject stands in relation to public power.
 *
 * Deliberately NOT a measure of how important someone is. It asks a narrow
 * question: does this person hold power or a public role, and is the claim
 * about their exercise of it? A senator's committee votes qualify; the same
 * senator's medical history does not.
 */
/**
 * The same values as SubjectRole, available at RUNTIME.
 *
 * A union type vanishes at compile time, which is exactly when a value arriving
 * from JSON or a relay needs checking. Kept adjacent to the type so the two are
 * read together; the vectors fail if they diverge.
 *
 * Module-private. It was exported and read only by the function below, which
 * the orphan-export guard calls an unwired capability — and it failed the
 * DEPLOY build while passing locally, because the guard counts any other file
 * containing the identifier as a consumer and `scripts/peer/publication.mjs`
 * declares its own independent copy of the same name. The local pass was a
 * coincidence between two implementations, not a wiring.
 */
const SUBJECT_ROLES: ReadonlySet<string> = new Set([
  'public-office', 'corporate-officer', 'criminal-persona', 'private',
]);

export type SubjectRole =
  /** Holds public office or state power, and the claim is about that role. */
  | 'public-office'
  /** A named officer of an organisation, acting in a role they hold publicly. */
  | 'corporate-officer'
  /** An operational persona attributed by conduct — a threat actor's handle. */
  | 'criminal-persona'
  /** No public role. The default when nobody said, because it is the safe read. */
  | 'private';

export type PublicationDecision =
  | { allowed: true }
  | { allowed: false; reason: string; requiresExplicitConsent: true };

export interface PublicationPolicyOptions {
  /**
   * Whether the finding's evidence is fabricated — CorroboratedFinding.isMock.
   *
   * Refused unless explicitly `false`. Required in practice, though typed
   * optional so the existing call shape still compiles: a caller that forgets
   * it gets a refusal, which is the safe direction to fail.
   */
  isMock?: boolean;
  /**
   * Set only by an operator making a considered decision about a specific
   * finding. Never a global default, never inferred, never remembered — the
   * deliberation is the safeguard, and a persisted flag would remove it.
   */
  consentToPublishAboutPerson?: boolean;
  /**
   * Whether this material has been deliberately released from the workspace.
   *
   * Checked FIRST, above every other consideration including consent. Contained
   * material is not refused because it is dangerous — it is refused because
   * nobody has decided it is a publication at all, and the point of containment
   * is that research can proceed freely without the result being one keystroke
   * from a permanent public record.
   *
   * Undefined is contained. Material whose state nobody recorded is material
   * nobody decided to publish.
   */
  containment?: ContainmentState;
  /**
   * What relationship the subject has to public power, and whether the claim is
   * about THAT relationship.
   *
   * Added because a stress test found the gate discriminating on the wrong
   * axis. It asked "is the subject a person?", which puts a sitting legislator
   * taking payments from a company they regulate in the same bucket as a
   * whistleblower's identity deduced from document metadata. Both are people.
   * Nothing else about them is alike.
   *
   * The consequence was measurable and ran in BOTH directions: with one
   * operator checkbox the gate published all four of the cases it must never
   * publish, and it had no way to say that the legislator was the easiest
   * publication decision in journalism.
   *
   * The axis used here is the one journalism and defamation law already use —
   * public figure acting in a public capacity, on a matter of public concern.
   * That is not a house rule invented for this codebase.
   */
  subjectRole?: SubjectRole;
  /**
   * Why publishing about a PRIVATE individual serves the public.
   *
   * Required for `private`, and a checkbox will not do. An editor asks this
   * question out loud and the reporter has to answer it; recording the answer is
   * what makes the decision someone's rather than the interface's.
   */
  publicInterestJustification?: string;
}

export function evaluatePublication(
  subjectKind: SubjectKind,
  options: PublicationPolicyOptions = {},
): PublicationDecision {
  /**
   * Containment first, above consent and above provenance.
   *
   * Not a stricter gate — a DIFFERENT one, and the order matters. The checks
   * below ask "should this be published?"; this one asks "is this a publication
   * at all?" Most research is not, and answering the second question first is
   * what lets the first stay rare enough to be a real moment of deliberation.
   *
   * It also carries the load the person gate should not have to. Research about
   * people is ordinary work; it is publishing about them that is irreversible.
   * Separating the two means an analyst can look for whistleblowers and
   * ex-intelligence contacts without every search feeling like a decision,
   * because the results structurally cannot leave the workspace on their own.
   */
  if (!mayLeaveWorkspace(options.containment)) {
    return {
      allowed: false,
      requiresExplicitConsent: true,
      reason: explainContainment(options.containment)
        + ' Release it from the workspace first — that is a separate decision from publishing,'
        + ' and keeping them separate is what stops the second being made by someone who only'
        + ' meant the first.',
    };
  }

  /**
   * Fabricated evidence never goes on the wire.
   *
   * This check did not exist. Demo data is loaded in dev and demo mode, it
   * flows through the same correlation engine as everything else, and a
   * finding derived entirely from it could be signed with this instance's
   * real key and broadcast to public relays — arriving at every peer as
   * ordinary intelligence, cryptographically attributable to us, with nothing
   * on the wire marking it as invented.
   *
   * `undefined` is refused along with `true`, and that is the whole point:
   * "no contributor said whether it was real" is not permission. Allowing
   * unmeasured provenance would restore the hole for every event type that
   * does not carry the flag yet, which is most of them.
   *
   * There is deliberately no consent option. The person gate below is a
   * judgement an operator can legitimately make; publishing fabricated data
   * as intelligence is not.
   */
  if (options.isMock !== false) {
    return {
      allowed: false,
      requiresExplicitConsent: true,
      reason: options.isMock === true
        ? 'This finding rests on fabricated evidence. Publishing it would broadcast demo data to '
          + 'public relays, signed by this instance, indistinguishable from real intelligence.'
        : 'The evidence behind this finding does not state whether it is real. Unmeasured provenance '
          + 'is not permission to publish — establish it first.',
    };
  }

  if (subjectKind !== 'person') return { allowed: true };

  /**
   * PEOPLE. The gate below used to be a single yes/no, and a stress test of
   * sixteen real investigator cases showed what that cost in both directions:
   * it published a whistleblower's identity, a target's child's home address, a
   * private donor and a recruitment candidate — all on one checkbox — while
   * having nothing to say about the fact that a legislator taking money from
   * the regulator he chairs is the least controversial publication in the
   * profession.
   *
   * The role is what separates them, and it is the caller's to state.
   */
  const role: SubjectRole = options.subjectRole ?? 'private';

  /*
   * VALIDATE THE ROLE AT RUNTIME, not just in the type.
   *
   * TypeScript checks subjectRole at compile time and nothing checks it after.
   * A value arriving from JSON, a relay, an agent, or a typo is just a string —
   * and any string that is not literally 'private' took the public-role branch
   * below, so `subjectRole: 'head-of-state'` with consent published a private
   * individual with no stated public interest.
   *
   * Found by the publication vectors on their first run, comparing this against
   * the standalone reference in scripts/peer/publication.mjs. Nineteen of twenty
   * agreed; this was the twentieth, and it is the difference between a typo
   * being a typo and a typo being a disclosure.
   *
   * Refused rather than coerced to 'private': silently correcting an
   * unrecognised value would hide the mistake from whoever made it.
   */
  if (!SUBJECT_ROLES.has(role)) {
    return {
      allowed: false,
      requiresExplicitConsent: true,
      reason:
        `Unrecognised subjectRole "${role}". Use one of: ${[...SUBJECT_ROLES].join(', ')}. ` +
        'An unrecognised role is refused rather than treated as private, so a typo surfaces ' +
        'as an error instead of quietly changing who this claim is about.',
    };
  }

  // Someone exercising public power, corporate office, or a criminal persona
  // built from their own conduct. Consent is still required — publication about
  // a named person stays a deliberate act — but the gate no longer treats this
  // as the same question as the one below it.
  if (role !== 'private') {
    if (options.consentToPublishAboutPerson === true) return { allowed: true };
    return {
      allowed: false,
      requiresExplicitConsent: true,
      reason:
        `This finding names a person in a ${role.replace('-', ' ')} capacity. That is ordinarily ` +
        'publishable — public power and corporate office are accountable, and a threat actor\'s ' +
        'persona is attributed by their own conduct. Confirm the publication deliberately.',
    };
  }

  /**
   * A PRIVATE individual. Consent alone is not the question here.
   *
   * There is no absolute bar, and that is deliberate: absolute bars get routed
   * around, and there are real cases — a fugitive's location, a private person
   * who has caused public harm. What is required is that someone states why
   * this serves the public and that the reason is recorded, which is exactly
   * what an editor asks before running it.
   */
  const justification = options.publicInterestJustification?.trim();
  if (options.consentToPublishAboutPerson === true && justification) {
    return { allowed: true };
  }

  return {
    allowed: false,
    requiresExplicitConsent: true,
    reason:
      'This finding is about a private individual — someone with no public role that this claim ' +
      'concerns. Publishing broadcasts a signed claim about them to public relays, where being ' +
      'wrong is not quietly correctable and where the people this network exists to protect are ' +
      'the ones most easily harmed. State what public interest it serves, or set subjectRole if ' +
      'they hold public office, corporate office, or a persona attributed by their own conduct.',
  };
}

/**
 * `unknown` is deliberately ALLOWED.
 *
 * Blocking it would mean every unclassified subject needs consent, which makes
 * the prompt routine — and a prompt that appears constantly stops being a
 * moment of deliberation and becomes a key people press. The gate is worth
 * having precisely because it is rare.
 *
 * The cost is real and worth naming: a person misclassified as 'unknown'
 * publishes without the gate. The mitigation is upstream — adapters declaring
 * subjectKind accurately — not a broader block here that would defeat itself.
 */
export const UNKNOWN_SUBJECTS_ARE_ALLOWED = true;
