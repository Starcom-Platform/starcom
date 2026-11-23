/**
 * Steps that make sense (plan item 1.7, stories S9 and S19). A mission moved
 * on with "Move to PLANNING" and "Move to READY_FOR_PACKAGE"; a report offered
 * every status as a code, allowed or not; a case's form offered all six. Each
 * status and each move now has words, read against the three transition tables
 * the services enforce, so a move added to a table without words fails here.
 */
import { describe, it, expect } from 'vitest';
import { movesFrom, statusName, statusMeans, pathOf, statusTone, STEPPED_KINDS } from '../statusSteps';
import { VALID_REPORT_STATUS_TRANSITIONS } from '../../../../types/intel/IntelReportUI';
import { VALID_CASE_STATUS_TRANSITIONS } from '../../../../types/intel/IntelCaseUI';
import { VALID_MISSION_STATUS_TRANSITIONS } from '../../../../types/intel/MissionUI';

const TABLES = { report: VALID_REPORT_STATUS_TRANSITIONS, case: VALID_CASE_STATUS_TRANSITIONS, mission: VALID_MISSION_STATUS_TRANSITIONS } as const;
const code = /[A-Z]{2,}|_/;

describe('the steps of a report, a case and a mission', () => {
  it('offers exactly the moves each table allows, less those publishing makes and closing, which asks how it ended', () => {
    for (const kind of STEPPED_KINDS) {
      for (const [from, targets] of Object.entries(TABLES[kind] as Record<string, string[]>)) {
        const offered = movesFrom(kind, from).map((m) => m.to);
        const expected = kind === 'mission' ? targets.filter((t) => t !== 'PACKAGED' && t !== 'DISPATCHED' && t !== 'CLOSED') : targets;
        expect(offered, `${kind} from ${from}`).toEqual(expected);
      }
    }
  });

  it('names every status and every move in words, never as a code', () => {
    for (const kind of STEPPED_KINDS) {
      for (const from of Object.keys(TABLES[kind])) {
        expect(statusName(kind, from), `${kind} ${from}`).not.toMatch(code);
        expect(statusMeans(kind, from).length, `${kind} ${from} means`).toBeGreaterThan(10);
        for (const move of movesFrom(kind, from)) expect(move.label, `${kind} ${from}>${move.to}`).not.toMatch(code);
      }
    }
  });

  it('says what each move does', () => {
    expect(movesFrom('mission', 'DRAFT')).toEqual([{ to: 'PLANNING', label: 'Start planning' }]);
    expect(movesFrom('mission', 'PLANNING').map((m) => m.label)).toEqual(['Back to draft', 'Mark ready to publish']);
    // Closing asks how it ended, so it has a control of its own (D-MX, MX12).
    expect(movesFrom('mission', 'DISPATCHED')).toEqual([]);
    expect(movesFrom('report', 'DRAFT').map((m) => m.label)).toEqual(['Submit for review', 'Archive']);
    expect(movesFrom('report', 'REVIEWED').map((m) => m.label)).toEqual(['Approve', 'Review again', 'Archive']);
    expect(movesFrom('case', 'CLOSED').map((m) => m.label)).toEqual(['Reopen']);
    expect(statusName('mission', 'READY_FOR_PACKAGE')).toBe('Ready to publish');
    expect(statusName('case', 'PENDING')).toBe('On hold');
  });

  it('lays out the way forward, from the first status to the last', () => {
    expect(pathOf('report')).toEqual(['DRAFT', 'SUBMITTED', 'REVIEWED', 'APPROVED']);
    expect(pathOf('mission')).toEqual(['DRAFT', 'PLANNING', 'READY_FOR_PACKAGE', 'PACKAGED', 'DISPATCHED', 'CLOSED']);
    expect(pathOf('case')).toEqual(['NEW', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
  });
});

// BD24: a status is drawn by what it means, and cyan, which is ours and
// interactive, is never one. Working is plain, waiting amber, done green, and
// closed grey, each with its own shape.
describe('what each status means at a glance', () => {
  it('names a tone for every status a record can have', () => {
    const tables = { report: VALID_REPORT_STATUS_TRANSITIONS, case: VALID_CASE_STATUS_TRANSITIONS, mission: VALID_MISSION_STATUS_TRANSITIONS };
    for (const kind of STEPPED_KINDS) {
      for (const status of Object.keys(tables[kind])) expect(statusTone(kind, status), `${kind} ${status}`).toMatch(/^(working|waiting|done|closed)$/);
    }
  });

  it('is waiting only on hold or packaged, done when approved, resolved or dispatched, closed when closed or archived', () => {
    expect(statusTone('case', 'PENDING')).toBe('waiting');
    expect(statusTone('mission', 'PACKAGED')).toBe('waiting');
    expect(statusTone('report', 'APPROVED')).toBe('done');
    expect(statusTone('case', 'RESOLVED')).toBe('done');
    expect(statusTone('mission', 'DISPATCHED')).toBe('done');
    expect(statusTone('case', 'CLOSED')).toBe('closed');
    expect(statusTone('mission', 'CLOSED')).toBe('closed');
    expect(statusTone('report', 'ARCHIVED')).toBe('closed');
    for (const [kind, status] of [['report', 'DRAFT'], ['report', 'SUBMITTED'], ['report', 'REVIEWED'], ['case', 'NEW'], ['case', 'OPEN'], ['case', 'IN_PROGRESS'], ['mission', 'DRAFT'], ['mission', 'PLANNING'], ['mission', 'READY_FOR_PACKAGE']] as const) {
      expect(statusTone(kind, status), `${kind} ${status}`).toBe('working');
    }
  });

  it('reads a status it does not know as working, never as done', () => {
    expect(statusTone('mission', 'SOMETHING_NEW')).toBe('working');
  });
});

