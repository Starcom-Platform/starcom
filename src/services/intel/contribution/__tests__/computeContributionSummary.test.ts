import { describe, it, expect } from 'vitest';
import { computeContributionSummary } from '../computeContributionSummary';
import type { IntelCaseUI } from '../../../../types/intel/IntelCaseUI';
import type { MissionUI } from '../../../../types/intel/MissionUI';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';

type CasePick = Pick<IntelCaseUI, 'collaborators' | 'activityLog'>;
type MissionPick = Pick<MissionUI, 'collaborators' | 'activityLog'>;
type ReportPick = Pick<IntelReportUI, 'collaborators' | 'history'>;

function makeCollaborator(userId: string, overrides: Partial<CasePick['collaborators'][number]> = {}) {
  return { userId, name: userId, addedAt: '2026-01-01T00:00:00.000Z', addedBy: 'someone', ...overrides };
}

describe('computeContributionSummary', () => {
  it('counts collaborator membership across cases, missions, and reports', () => {
    const cases: CasePick[] = [{ collaborators: [makeCollaborator('alice')], activityLog: [] }];
    const missions: MissionPick[] = [{ collaborators: [makeCollaborator('alice')], activityLog: [] }];
    const reports: ReportPick[] = [{ collaborators: [makeCollaborator('alice')], history: [] }];

    const [summary] = computeContributionSummary(cases, missions, reports);
    expect(summary.userId).toBe('alice');
    expect(summary.collaborations).toBe(3);
  });

  it('counts activityLog entries per userId, broken down by action type', () => {
    const cases: CasePick[] = [{
      collaborators: [],
      activityLog: [
        { id: '1', action: 'CREATED', timestamp: '2026-01-01T00:00:00.000Z', userId: 'bob', details: {} },
        { id: '2', action: 'COMMENTED', timestamp: '2026-01-02T00:00:00.000Z', userId: 'bob', details: {} }
      ]
    }];

    const [summary] = computeContributionSummary(cases, [], []);
    expect(summary.userId).toBe('bob');
    expect(summary.activityCount).toBe(2);
    expect(summary.actionsByType).toEqual({ CREATED: 1, COMMENTED: 1 });
  });

  it('counts report history entries only when `user` is set — never guesses an unattributed entry', () => {
    const reports: ReportPick[] = [{
      collaborators: [],
      history: [
        { timestamp: '2026-01-01T00:00:00.000Z', action: 'CREATED', user: 'carol' },
        { timestamp: '2026-01-02T00:00:00.000Z', action: 'UPDATED' } // no user
      ]
    }];

    const summaries = computeContributionSummary([], [], reports);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].userId).toBe('carol');
    expect(summaries[0].activityCount).toBe(1);
  });

  it('does not invent a "findings corroborated" or "contradictions resolved" field — only real, attributable data', () => {
    const cases: CasePick[] = [{ collaborators: [makeCollaborator('dave')], activityLog: [] }];
    const [summary] = computeContributionSummary(cases, [], []);
    expect(Object.keys(summary).sort()).toEqual(['actionsByType', 'activityCount', 'collaborations', 'lastActive', 'userId']);
  });

  it('tracks the most recent timestamp across activity entries and collaborator.lastActive', () => {
    const cases: CasePick[] = [{
      collaborators: [makeCollaborator('erin', { lastActive: '2026-03-01T00:00:00.000Z' })],
      activityLog: [
        { id: '1', action: 'CREATED', timestamp: '2026-01-01T00:00:00.000Z', userId: 'erin', details: {} }
      ]
    }];

    const [summary] = computeContributionSummary(cases, [], []);
    expect(summary.lastActive).toBe('2026-03-01T00:00:00.000Z');
  });

  it('returns null lastActive, not a fabricated date, when nothing is recorded', () => {
    const cases: CasePick[] = [{ collaborators: [makeCollaborator('frank', { lastActive: undefined })], activityLog: [] }];
    const [summary] = computeContributionSummary(cases, [], []);
    expect(summary.lastActive).toBeNull();
  });

  it('sorts most-active (activity + collaborations) contributors first', () => {
    const cases: CasePick[] = [
      { collaborators: [makeCollaborator('quiet-analyst')], activityLog: [] },
      {
        collaborators: [makeCollaborator('busy-analyst')],
        activityLog: [
          { id: '1', action: 'CREATED', timestamp: '2026-01-01T00:00:00.000Z', userId: 'busy-analyst', details: {} },
          { id: '2', action: 'UPDATED', timestamp: '2026-01-02T00:00:00.000Z', userId: 'busy-analyst', details: {} }
        ]
      }
    ];

    const summaries = computeContributionSummary(cases, [], []);
    expect(summaries[0].userId).toBe('busy-analyst');
  });

  it('returns an empty array, not an error, when there is nothing to summarize', () => {
    expect(computeContributionSummary([], [], [])).toEqual([]);
  });
});
