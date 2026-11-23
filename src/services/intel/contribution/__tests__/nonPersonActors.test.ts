import { describe, it, expect } from 'vitest';
import { computeContributionSummary, NON_PERSON_ACTORS } from '../computeContributionSummary';

const report = (history: Array<{ action: string; user?: string; timestamp: string }>) =>
  ({ collaborators: [], history } as never);

describe('placeholders and batch jobs are not analysts', () => {
  it('excludes the no-identity sentinel from the contributor list', () => {
    // 'operative' is IntelWorkspaceManager's stand-in for "no identity was
    // available". Counting it puts a placeholder in a list of people.
    const s = computeContributionSummary([], [], [report([
      { action: 'UPDATED', user: 'operative', timestamp: '2026-01-01T00:00:00Z' },
      { action: 'UPDATED', user: 'realpubkey', timestamp: '2026-01-02T00:00:00Z' },
    ])]);
    expect(s.map((c) => c.userId)).toEqual(['realpubkey']);
  });

  it('excludes bulk-import attribution', () => {
    const s = computeContributionSummary([], [], [report([
      { action: 'IMPORTED', user: 'import', timestamp: '2026-01-01T00:00:00Z' },
    ])]);
    expect(s).toEqual([]);
  });

  it('still counts a genuine actor whose id merely looks unusual', () => {
    const s = computeContributionSummary([], [], [report([
      { action: 'UPDATED', user: 'npub1operativexyz', timestamp: '2026-01-01T00:00:00Z' },
    ])]);
    expect(s.map((c) => c.userId)).toEqual(['npub1operativexyz']);
  });

  it('leaves unattributed entries attributed to nobody, as before', () => {
    const s = computeContributionSummary([], [], [report([
      { action: 'UPDATED', timestamp: '2026-01-01T00:00:00Z' },
    ])]);
    expect(s).toEqual([]);
  });

  it('names the sentinels it knows about', () => {
    expect(NON_PERSON_ACTORS.has('operative')).toBe(true);
    expect(NON_PERSON_ACTORS.has('import')).toBe(true);
  });
});
