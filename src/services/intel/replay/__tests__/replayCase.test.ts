import { describe, it, expect } from 'vitest';
import { replayCase, replayTimeline, digestLog, exportReplay } from '../replayCase';
import { CaseActivityAction } from '../../../../types/intel/IntelCaseUI';

let seq = 0;
const e = (action: string, timestamp: string, details: Record<string, unknown> = {}, userId = 'analyst-1') =>
  ({ id: `e${++seq}`, action, timestamp, userId, details } as never);

const created = (t = '2026-01-01T00:00:00Z') => e(CaseActivityAction.CREATED, t, { status: 'NEW' });

describe('reconstructing state', () => {
  it('rebuilds status from the log', () => {
    const s = replayCase([
      created(),
      e(CaseActivityAction.STATUS_CHANGED, '2026-01-02T00:00:00Z', { from: 'NEW', to: 'OPEN' }),
      e(CaseActivityAction.STATUS_CHANGED, '2026-01-03T00:00:00Z', { from: 'OPEN', to: 'IN_PROGRESS' }),
    ]);
    expect(s.status).toBe('IN_PROGRESS');
    expect(s.applied).toBe(3);
  });

  it('reconstructs the state at a past point, not just the latest', () => {
    const log = [
      created(),
      e(CaseActivityAction.STATUS_CHANGED, '2026-01-02T00:00:00Z', { from: 'NEW', to: 'OPEN' }),
      e(CaseActivityAction.STATUS_CHANGED, '2026-01-05T00:00:00Z', { from: 'OPEN', to: 'CLOSED' }),
    ];
    expect(replayCase(log, '2026-01-03T00:00:00Z').status).toBe('OPEN');
    expect(replayCase(log).status).toBe('CLOSED');
  });

  it('includes an entry at exactly the cutoff instant', () => {
    // A timestamp names a moment, not a boundary. Excluding it would make
    // "the state at 14:00" differ from the state right after the 14:00 entry.
    const log = [created('2026-01-01T00:00:00Z')];
    expect(replayCase(log, '2026-01-01T00:00:00Z').applied).toBe(1);
  });

  it('tracks linked entities, collaborators, assignment and comments', () => {
    const s = replayCase([
      created(),
      e(CaseActivityAction.ENTITY_LINKED, '2026-01-02T00:00:00Z', { entityId: 'rep-1' }),
      e(CaseActivityAction.ENTITY_LINKED, '2026-01-03T00:00:00Z', { entityId: 'rep-2' }),
      e(CaseActivityAction.ENTITY_UNLINKED, '2026-01-04T00:00:00Z', { entityId: 'rep-1' }),
      e(CaseActivityAction.COLLABORATOR_ADDED, '2026-01-05T00:00:00Z', { userId: 'bob' }),
      e(CaseActivityAction.ASSIGNED, '2026-01-06T00:00:00Z', { assignedTo: 'carol' }),
      e(CaseActivityAction.COMMENTED, '2026-01-07T00:00:00Z'),
    ]);
    expect(s.linkedEntities).toEqual(['rep-2']);
    expect(s.collaborators).toEqual(['bob']);
    expect(s.assignedTo).toEqual(['carol']);
    expect(s.commentCount).toBe(1);
  });

  it('has no status before a creation entry', () => {
    expect(replayCase([]).status).toBeNull();
  });
});

describe('determinism', () => {
  it('gives the same reconstruction whatever order the log arrives in', () => {
    // Array order depends on how the log was loaded. A reconstruction that
    // changes with it is a rendering, not a reconstruction.
    const log = [
      created(),
      e(CaseActivityAction.ENTITY_LINKED, '2026-01-02T00:00:00Z', { entityId: 'a' }),
      e(CaseActivityAction.ENTITY_LINKED, '2026-01-03T00:00:00Z', { entityId: 'b' }),
    ];
    const forward = replayCase(log);
    const reversed = replayCase([...log].reverse());
    expect(reversed).toEqual(forward);
  });

  it('breaks timestamp ties by id, not by position', () => {
    const a = { id: 'aaa', action: CaseActivityAction.ENTITY_LINKED, timestamp: '2026-01-02T00:00:00Z', userId: 'x', details: { entityId: 'first' } } as never;
    const b = { id: 'bbb', action: CaseActivityAction.ENTITY_LINKED, timestamp: '2026-01-02T00:00:00Z', userId: 'x', details: { entityId: 'second' } } as never;
    expect(replayCase([created(), a, b]).linkedEntities).toEqual(
      replayCase([created(), b, a]).linkedEntities);
  });

  it('is idempotent — replaying twice gives the same answer', () => {
    const log = [created(), e(CaseActivityAction.COMMENTED, '2026-01-02T00:00:00Z')];
    expect(replayCase(log)).toEqual(replayCase(log));
  });
});

describe('never guess an actor', () => {
  it('records an entry with no user as unattributed rather than assigning one', () => {
    // Attributing it to the owner, or to whoever acted last, manufactures a
    // chain of custody — the exact artefact a court would rely on and the
    // exact one it must not be able to.
    const s = replayCase([
      created(),
      e(CaseActivityAction.COMMENTED, '2026-01-02T00:00:00Z', {}, ''),
    ]);
    expect(s.unattributed).toHaveLength(1);
    expect(s.unattributed[0].action).toBe(CaseActivityAction.COMMENTED);
  });

  it('does not carry attribution forward from a neighbouring entry', () => {
    const s = replayCase([
      e(CaseActivityAction.CREATED, '2026-01-01T00:00:00Z', { status: 'NEW' }, 'alice'),
      e(CaseActivityAction.COMMENTED, '2026-01-02T00:00:00Z', {}, ''),
      e(CaseActivityAction.COMMENTED, '2026-01-03T00:00:00Z', {}, 'alice'),
    ]);
    expect(s.unattributed.map((u) => u.at)).toEqual(['2026-01-02T00:00:00Z']);
  });
});

describe('gaps are output, not noise', () => {
  it('says so when the log does not begin with a creation', () => {
    const s = replayCase([e(CaseActivityAction.COMMENTED, '2026-01-02T00:00:00Z')]);
    expect(s.gaps.map((g) => g.kind)).toContain('no-creation-entry');
  });

  it('reports a status change that does not follow from the replayed state', () => {
    // An entry is missing, or one was recorded wrongly. Either way the record
    // is incomplete and a reader must be able to see that.
    const s = replayCase([
      created(),
      e(CaseActivityAction.STATUS_CHANGED, '2026-01-02T00:00:00Z', { from: 'IN_PROGRESS', to: 'CLOSED' }),
    ]);
    expect(s.gaps.map((g) => g.kind)).toContain('status-discontinuity');
    expect(s.status).toBe('CLOSED'); // still applied — the entry is evidence
  });

  it('reports a removal for something never recorded as added', () => {
    const s = replayCase([created(), e(CaseActivityAction.ENTITY_UNLINKED, '2026-01-02T00:00:00Z', { entityId: 'ghost' })]);
    expect(s.gaps.map((g) => g.kind)).toContain('removal-without-addition');
  });

  it('reports simultaneous entries even though it orders them deterministically', () => {
    // Determinism is not the same as correctness: the true order genuinely is
    // not recorded, and saying so is the honest output.
    const s = replayCase([
      created(),
      e(CaseActivityAction.COMMENTED, '2026-01-02T00:00:00Z'),
      e(CaseActivityAction.COMMENTED, '2026-01-02T00:00:00Z'),
    ]);
    expect(s.gaps.map((g) => g.kind)).toContain('simultaneous-entries');
  });

  it('reports an action it does not model, rather than skipping it', () => {
    // A state that looks complete while ignoring evidence is worse than an
    // obviously partial one.
    const s = replayCase([created(), e('EVIDENCE_DESTROYED', '2026-01-02T00:00:00Z')]);
    expect(s.gaps.map((g) => g.kind)).toContain('unmodelled-action');
    expect(s.gaps.find((g) => g.kind === 'unmodelled-action')?.detail).toMatch(/EVIDENCE_DESTROYED/);
  });

  it('reports no gaps for a complete, well-formed log', () => {
    const s = replayCase([
      created(),
      e(CaseActivityAction.STATUS_CHANGED, '2026-01-02T00:00:00Z', { from: 'NEW', to: 'OPEN' }),
      e(CaseActivityAction.ENTITY_LINKED, '2026-01-03T00:00:00Z', { entityId: 'rep-1' }),
    ]);
    expect(s.gaps).toEqual([]);
    expect(s.unattributed).toEqual([]);
  });
});

describe('walking the investigation forward', () => {
  it('yields the state after each entry, so each action can be seen to do something', () => {
    const steps = replayTimeline([
      created(),
      e(CaseActivityAction.STATUS_CHANGED, '2026-01-02T00:00:00Z', { from: 'NEW', to: 'OPEN' }),
      e(CaseActivityAction.ENTITY_LINKED, '2026-01-03T00:00:00Z', { entityId: 'rep-1' }),
    ]);
    expect(steps).toHaveLength(3);
    expect(steps[0].state.status).toBe('NEW');
    expect(steps[1].state.status).toBe('OPEN');
    expect(steps[2].state.linkedEntities).toEqual(['rep-1']);
  });
});

describe('exporting a replay someone else can check', () => {
  const log = [
    created(),
    e(CaseActivityAction.STATUS_CHANGED, '2026-01-02T00:00:00Z', { from: 'NEW', to: 'OPEN' }),
  ];

  it('digests the log so a replay can be matched to it', () => {
    expect(digestLog(log)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives the same digest whatever order the entries arrive in', () => {
    expect(digestLog([...log].reverse())).toBe(digestLog(log));
  });

  it('changes the digest when an entry is edited', () => {
    const tampered = [log[0], { ...log[1], details: { from: 'NEW', to: 'CLOSED' } }] as never[];
    expect(digestLog(tampered)).not.toBe(digestLog(log));
  });

  it('changes the digest when an entry is removed', () => {
    expect(digestLog([log[0]])).not.toBe(digestLog(log));
  });

  it('survives a round trip through storage without reporting false tampering', () => {
    // Details keys sorted, so an object rebuilt in a different key order
    // digests the same. Otherwise every reload would look like an edit.
    const roundTripped = JSON.parse(JSON.stringify(log)).map((x: Record<string, unknown>) => ({
      ...x, details: Object.fromEntries(Object.entries(x.details as object).reverse()),
    }));
    expect(digestLog(roundTripped)).toBe(digestLog(log));
  });

  it('carries its own limits, including what it cannot prove', () => {
    // In the artifact rather than in documentation, because the two get
    // separated and the caveat is the half most likely to be dropped.
    const a = exportReplay('Case 1', log, undefined, new Date('2026-08-21T00:00:00Z'));
    expect(a.limits[0]).toMatch(/does NOT prove the log itself was not rewritten/);
  });

  it('names unattributed actions and gaps in its limits', () => {
    const messy = [e(CaseActivityAction.COMMENTED, '2026-01-02T00:00:00Z', {}, '')];
    const a = exportReplay('Case 2', messy);
    expect(a.limits.some((l) => /no recorded actor/.test(l))).toBe(true);
    expect(a.limits.some((l) => /gap/.test(l))).toBe(true);
  });
});

/* D-DP, DP7: a case's sources, the articles it rests on, are part of its history. */
describe('a case\'s sources in its replay', () => {
  it('adds and removes them as the log says', () => {
    const state = replayCase([
      e(CaseActivityAction.CREATED, '2026-10-13T09:00:00.000Z'),
      e(CaseActivityAction.SOURCE_ADDED, '2026-10-13T09:00:01.000Z', { url: 'https://a.example/1' }),
      e(CaseActivityAction.SOURCE_ADDED, '2026-10-13T09:00:02.000Z', { url: 'https://b.example/2' }),
      e(CaseActivityAction.SOURCE_REMOVED, '2026-10-13T09:00:03.000Z', { url: 'https://a.example/1' }),
    ]);
    expect(state.sources).toEqual(['https://b.example/2']);
    expect(state.gaps).toEqual([]);
  });

  it('says so when one is removed that the log never added', () => {
    const state = replayCase([
      e(CaseActivityAction.CREATED, '2026-10-13T09:00:00.000Z'),
      e(CaseActivityAction.SOURCE_REMOVED, '2026-10-13T09:00:01.000Z', { url: 'https://a.example/1' }),
    ]);
    expect(state.gaps.map((g) => g.kind)).toEqual(['removal-without-addition']);
  });
});
