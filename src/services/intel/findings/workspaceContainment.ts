/**
 * Contained work — intel that cannot federate, so it can be done freely.
 *
 * ─── WHY THIS IS A CAPABILITY, NOT A RESTRICTION ───────────────────────────
 *
 * Finding people is ordinary intelligence work. Journalism runs on it,
 * recruiting runs on it, and OSINT is a discipline with a literature. Nothing
 * here exists to make that harder, and anyone reading this file as a limit on
 * research has read it backwards.
 *
 * What the codebase already had was a gate at the moment of PUBLICATION —
 * `evaluatePublication` refusing a person-subject without explicit consent,
 * because a signed claim about a named individual on public relays is not
 * quietly correctable. That gate is right and it stays.
 *
 * What it did not have was the other half: a way to say "this is working
 * material" and have that be STRUCTURALLY TRUE rather than a matter of nobody
 * having pressed the button. Without it, every piece of research sits one
 * mis-click from a permanent public record, and the only available discipline
 * is caution — which is a bad way to run an investigation and an exhausting way
 * to think.
 *
 * So: contained work is work the publication path refuses to accept at all.
 * Not gated, not warned about, not consent-prompted. Refused, at a layer above
 * consent, so that a person can research freely precisely BECAUSE the result
 * cannot escape by accident.
 *
 * ─── WHY PEOPLE DEFAULT TO CONTAINED ───────────────────────────────────────
 *
 * The population this network looks for — whistleblowers, ex-intelligence,
 * ex-police, people who know what their institution did — are people for whom
 * premature exposure is dangerous from the side they are blowing the whistle
 * on. Containment by default is not suspicion of the researcher. It is the
 * difference between recruiting someone and burning them.
 *
 * Lifting containment is a deliberate act with a stated reason, and the reason
 * is recorded. That is what makes it a decision rather than a slip.
 */

/** Why this material is held in the workspace rather than being publishable. */
export type ContainmentReason =
  /**
   * The subject is a person and no one has decided to publish about them.
   * The DEFAULT for person-subjects, and the common case: most research about
   * people never should be published, and never needs to be.
   */
  | 'person-subject-default'
  /** Research in progress. Conclusions not reached, let alone published. */
  | 'working-material'
  /** A source spoke on terms that do not extend to publication. */
  | 'source-terms'
  /** Someone decided, for a reason recorded alongside. */
  | 'operator-decision';

export interface Containment {
  contained: true;
  reason: ContainmentReason;
  /** Free text from whoever contained it. Absent for the automatic default. */
  note?: string;
}

export interface Releasable {
  contained: false;
  /**
   * Who decided this may leave the workspace, and why.
   *
   * Required. Releasing without a stated reason is exactly the accidental
   * publication containment exists to prevent, and an empty field would let it
   * happen while looking deliberate.
   */
  releasedBy: string;
  releasedReason: string;
  releasedAt: string;
}

export type ContainmentState = Containment | Releasable;

/**
 * The default state for new material.
 *
 * Person-subjects are contained; everything else is working material, which is
 * also contained. The difference is only the recorded reason — nothing starts
 * publishable, because "publishable unless someone thought about it" is the
 * arrangement that produces accidents.
 */
export function defaultContainment(subjectKind?: string): Containment {
  return subjectKind === 'person'
    ? { contained: true, reason: 'person-subject-default' }
    : { contained: true, reason: 'working-material' };
}

/**
 * Release material from the workspace, deliberately.
 *
 * This does not publish anything and does not bypass `evaluatePublication` —
 * the person-consent gate still applies afterwards. It only makes the material
 * eligible to reach that gate at all.
 *
 * Two decisions rather than one is the point. Deciding to stop treating
 * something as private and deciding to broadcast it are different judgements,
 * and collapsing them into a single button is how the second gets made by
 * someone who only meant the first.
 */
export function release(by: string, reason: string, at: Date = new Date()): Releasable | Containment {
  const trimmedBy = by.trim();
  const trimmedReason = reason.trim();
  if (!trimmedBy || !trimmedReason) {
    // Refusing rather than releasing-with-a-blank: an unattributed release is
    // indistinguishable from an accident after the fact.
    return { contained: true, reason: 'operator-decision', note: 'release refused: no releaser or reason given' };
  }
  return {
    contained: false,
    releasedBy: trimmedBy,
    releasedReason: trimmedReason,
    releasedAt: at.toISOString(),
  };
}

/** Explicit type guard — the union discriminates on a boolean literal, and an
 *  inline `!state.contained` was not narrowing reliably across call sites.
 *
 *  NOT exported: it is used by mayLeaveWorkspace and explainContainment here and
 *  by nothing else. Callers ask `mayLeaveWorkspace`, which is the question they
 *  actually have — a narrower export is a smaller surface to keep honest. */
function isReleased(state: ContainmentState): state is Releasable {
  return state.contained === false;
}

/**
 * Whether material may be offered to the publication gate.
 *
 * ABSENT MEANS NOT CONTAINMENT-MANAGED, and therefore passes.
 *
 * The first version of this returned false for undefined, on the reasoning that
 * unrecorded material is material nobody decided to publish. That reasoning is
 * fine and the rule was wrong: it made containment a new universal barrier in
 * front of a publication path that already has provenance and person gates of
 * its own, and broke 19 existing tests to protect a case it does not cover.
 *
 * Containment exists for material that OPTS IN — workspace research, candidate
 * lists, anything a person is actively working. For that material the guarantee
 * is absolute. For everything else the gates that were already there remain the
 * gates, and adding a third one that everyone has to remember to satisfy is how
 * safety machinery gets routed around instead of used.
 */
export function mayLeaveWorkspace(state: ContainmentState | undefined): boolean {
  if (!state) return true;
  return isReleased(state);
}

/** A sentence for a UI, saying what is true rather than what is forbidden. */
export function explainContainment(state: ContainmentState | undefined): string {
  const WORKING = 'Held in the workspace as working material. Nothing here can federate.';
  if (!state) return WORKING;

  if (isReleased(state)) {
    return `Released by ${state.releasedBy} on ${state.releasedAt.slice(0, 10)}: ${state.releasedReason}. `
      + 'Publication is still a separate decision.';
  }

  switch (state.reason) {
    case 'person-subject-default':
      return 'Held in the workspace. Research about people stays local unless someone '
        + 'deliberately releases it — so it can be done without watching every keystroke.';
    case 'source-terms':
      return 'Held in the workspace: a source\'s terms do not extend to publication.';
    case 'operator-decision':
      return `Held in the workspace by decision.${state.note ? ` ${state.note}` : ''}`;
    case 'working-material':
    default:
      return WORKING;
  }
}
