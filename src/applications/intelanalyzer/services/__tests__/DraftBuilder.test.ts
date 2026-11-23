import { describe, it, expect } from 'vitest';
import { DraftBuilder } from '../DraftBuilder';

describe('DraftBuilder', () => {
  const board = {
    id: 'b1', name: 'Alpha Board', savedAt: Date.now(),
    state: {
      view: 'table',
      filters: { tags: ['x'] } as any,
      selection: null,
      notes: 'Hypothesis: activity surge near port.',
      pins: [
        { id: 'e1', type: 'event', title: 'Report A' },
        { id: 'e2', type: 'intelItem', title: 'Intel B' }
      ],
      watch: { tags: ['alpha','bravo'], entities: ['ent-1'] }
    }
  } as any;

  it('builds payload with notes summary and citations; includes watch tags when requested', () => {
    const res = DraftBuilder.buildFromBoard(board, {
      title: 'Draft From Alpha',
      visibility: 'limited',
      sensitivity: 'careful',
      includeFilters: true,
      includeWatchlists: true,
      redactSensitive: false
    });

    expect(res.report.title).toBe('Draft From Alpha');
    expect(res.report.visibility).toBe('limited');
    expect(res.report.sensitivity).toBe('careful');
    expect(res.report.summary).toMatch(/Hypothesis/);
    expect(res.report.tags).toEqual(['alpha','bravo']);
    expect(res.citations.length).toBe(2);
    expect(res.report.content).toMatch(/## Evidence/);
  });

  it('adds what the pinned reports rest on, after the evidence, when the reports are given (plan item 4.3)', () => {
    const withReport = { ...board, state: { ...board.state, pins: [...board.state.pins, { id: 'r1', type: 'report', title: 'R1' }] } };
    const r1 = {
      id: 'r1', title: 'R1', content: 'c', author: 'npub-a', category: 'GENERAL', tags: [], status: 'SUBMITTED',
      createdAt: new Date('2026-09-10T00:00:00Z'), updatedAt: new Date('2026-09-10T00:00:00Z'), reliability: 'B',
    } as any;
    const { report } = DraftBuilder.buildFromBoard(withReport, { title: 't' }, [r1]);
    const at = report.content.indexOf('## What the pinned reports rest on');
    expect(at).toBeGreaterThan(report.content.indexOf('## Evidence'));
    expect(report.content).toContain('- Reliability: 1 graded B.');
    // Built without the reports, it says nothing it could not read.
    expect(DraftBuilder.buildFromBoard(withReport, { title: 't' }).report.content).not.toContain('What the pinned reports rest on');
  });
});
