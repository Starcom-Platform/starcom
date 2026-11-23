import { CaseActivityAction } from '../../../types/intel/IntelCaseUI';

/**
 * Which parts of a case's history the activity log actually records.
 *
 * `CaseActivityAction` is a vocabulary of what a case *can* do. It is not a
 * statement about what gets written down, and for most of this codebase's life
 * the two were badly out of step — six of fourteen actions had no producer at
 * all, including STATUS_CHANGED, whose write was gated behind an `actorId` no
 * caller supplied. A case therefore replayed as "created, commented, never
 * changed status", and `replayCase` raised no gap, because nothing had been
 * logged to be missing.
 *
 * That is the specific failure `replayCase`'s own header warns about: a
 * plausible history is worse than an obviously partial one, because a reader
 * cannot tell a complete record from a convincing one. A reconstruction that
 * silently omits an entire category of event is exactly the convincing kind.
 *
 * So `CaseReplayPanel` states its coverage, and these lists are what it states
 * it from. They are NOT maintained by hand in the usual sense:
 * `scripts/guard-activity-action-coverage.mjs` derives the true split from
 * actual producers in `src/` and fails the build if these disagree — in either
 * direction. Overstating coverage misleads a reader; understating it (leaving
 * an action here after wiring its producer) misleads them too.
 *
 * To move an action from unrecorded to recorded: write the producer, then move
 * it. The build will tell you if you do only one.
 */
export const RECORDED_CASE_ACTIONS: CaseActivityAction[] = [
  CaseActivityAction.CREATED,
  CaseActivityAction.UPDATED,
  CaseActivityAction.COMMENTED,
  CaseActivityAction.ENTITY_LINKED,
  CaseActivityAction.ENTITY_UNLINKED,
  CaseActivityAction.CONTRADICTION_LINKED,
  CaseActivityAction.CONTRADICTION_UNLINKED,
  CaseActivityAction.POSITION_STATED,
  CaseActivityAction.REQUIREMENT_RAISED,
  CaseActivityAction.REQUIREMENT_ANSWERED,
  CaseActivityAction.REQUIREMENT_CLOSED,
  CaseActivityAction.COLLABORATOR_ADDED,
  CaseActivityAction.COLLABORATOR_REMOVED,
  CaseActivityAction.SHARED,
  CaseActivityAction.STATUS_CHANGED,
  CaseActivityAction.RESTORED,
  CaseActivityAction.SOURCE_ADDED,
  CaseActivityAction.SOURCE_REMOVED,
];

/**
 * Actions the log can express but nothing currently writes. A replay is blind
 * to every one of these, and says so.
 */
export const UNRECORDED_CASE_ACTIONS: CaseActivityAction[] = [
  CaseActivityAction.ASSIGNED,
  CaseActivityAction.CASE_LINKED,
  CaseActivityAction.CASE_UNLINKED,
  CaseActivityAction.CLOSED,
  CaseActivityAction.REOPENED,
];

/** Human-readable, for the panel's coverage line. */
export const describeAction = (a: CaseActivityAction): string =>
  a.toLowerCase().replace(/_/g, ' ');
