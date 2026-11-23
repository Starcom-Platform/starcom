/**
 * The steps a report, a case and a mission move through, in words (plan item
 * 1.7, stories S9 and S19).
 *
 * A mission moved on with "Move to PLANNING" and "Move to READY_FOR_PACKAGE".
 * A report's editor offered every status as a code, whether the move was
 * allowed or not. A case's form offered all six and saved past the table the
 * service checks. Each status and each move now has words here, and the moves
 * offered are read from the three transition tables the services enforce, so
 * what a person is offered and what the service accepts cannot drift apart.
 */
import { VALID_REPORT_STATUS_TRANSITIONS } from '../../../types/intel/IntelReportUI';
import { VALID_CASE_STATUS_TRANSITIONS } from '../../../types/intel/IntelCaseUI';
import { VALID_MISSION_STATUS_TRANSITIONS } from '../../../types/intel/MissionUI';
import { en, type Messages } from '../../../i18n/app/en';

export type SteppedKind = 'report' | 'case' | 'mission';
export const STEPPED_KINDS: readonly SteppedKind[] = ['report', 'case', 'mission'];

const TABLES: Record<SteppedKind, Record<string, readonly string[]>> = {
  report: VALID_REPORT_STATUS_TRANSITIONS,
  case: VALID_CASE_STATUS_TRANSITIONS,
  mission: VALID_MISSION_STATUS_TRANSITIONS,
};

/**
 * What each status is called and means, and what each move is called, by where it starts and where it
 * leads: in the catalogue (D-ML, L3), so a screen in another language hands its own words in. English
 * when none are.
 */
type StepWords = Messages['shared'];
const STATUSES = (words: StepWords): Record<SteppedKind, Partial<Record<string, { name: string; means: string }>>> => words.statuses;
const MOVES = (words: StepWords): Record<SteppedKind, Partial<Record<string, string>>> => words.moves;

/**
 * Moves made by publishing, never offered as a step: the package is signed
 * there, and dispatch needs a relay's receipt (plan item 0.7).
 */
const BY_PUBLISHING: Record<SteppedKind, readonly string[]> = { report: [], case: [], mission: ['PACKAGED', 'DISPATCHED'] };

/** Moves that ask more than a click, made by a control of their own: closing a mission asks how it ended (D-MX, MX12). */
const BY_THEIR_OWN_CONTROL: Record<SteppedKind, readonly string[]> = { report: [], case: [], mission: ['CLOSED'] };

/** The way forward, first status to last. The rest are to one side of it. */
const PATHS: Record<SteppedKind, readonly string[]> = {
  report: ['DRAFT', 'SUBMITTED', 'REVIEWED', 'APPROVED'],
  case: ['NEW', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  mission: ['DRAFT', 'PLANNING', 'READY_FOR_PACKAGE', 'PACKAGED', 'DISPATCHED', 'CLOSED'],
};

/**
 * What a status means at a glance (BD24), for the one status chip: working,
 * waiting on something (amber), done (green), or closed (grey). Cyan, which is
 * ours and interactive, is never a status. A status not listed reads as
 * working, never as done.
 */
export type StatusTone = 'working' | 'waiting' | 'done' | 'closed';

const TONES: Record<SteppedKind, Partial<Record<string, StatusTone>>> = {
  report: { APPROVED: 'done', ARCHIVED: 'closed' },
  case: { PENDING: 'waiting', RESOLVED: 'done', CLOSED: 'closed' },
  mission: { PACKAGED: 'waiting', DISPATCHED: 'done', CLOSED: 'closed' },
};

export const statusTone = (kind: SteppedKind, status: string): StatusTone => TONES[kind][status] ?? 'working';

export const statusName = (kind: SteppedKind, status: string, words: StepWords = en.shared): string => STATUSES(words)[kind][status]?.name ?? status;
export const statusMeans = (kind: SteppedKind, status: string, words: StepWords = en.shared): string => STATUSES(words)[kind][status]?.means ?? '';
export const pathOf = (kind: SteppedKind): string[] => [...PATHS[kind]];

/** The moves open from a status, in the table's order, each with its words. */
export function movesFrom(kind: SteppedKind, status: string, words: StepWords = en.shared): Array<{ to: string; label: string }> {
  return (TABLES[kind][status] ?? [])
    .filter((to) => !BY_PUBLISHING[kind].includes(to) && !BY_THEIR_OWN_CONTROL[kind].includes(to))
    // A move with no words shows as its codes, and the steps' test fails on it.
    .map((to) => ({ to, label: MOVES(words)[kind][`${status}>${to}`] ?? `${status}>${to}` }));
}
