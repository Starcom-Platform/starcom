/**
 * Two copies of Starcom in one browser, one workspace (found 2026-10-11, building Uplink's side panel,
 * decision D-EX, E2, W6). Each copy kept the whole workspace in memory and saved it whole, so a copy
 * open since morning, saving anything, wrote back the workspace as it was when it opened: every case,
 * report and capture another copy had made since was gone. A copy now saves only its own changes,
 * record by record, over what is stored.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { changesSince, mergeWorkspaces } from '../workspaceMerge';

const ws = (over: Record<string, unknown> = {}) => ({
  version: 2, reports: [], intel: [], packages: [], relationships: [], cases: [], missions: [], deletions: [],
  metadata: { createdAt: '2026-10-01T00:00:00Z', savedAt: 1 }, ...over,
});

describe('changesSince', () => {
  it('finds what a copy added, altered and took out, by collection, and nothing it did not touch', () => {
    const base = ws({ cases: [{ id: 'c1', title: 'Flood' }, { id: 'c2', title: 'Roads' }], intel: [{ id: 'i1', t: 'a' }] });
    const current = ws({ cases: [{ id: 'c1', title: 'Flood response' }, { id: 'c3', title: 'Bridges' }], intel: [{ id: 'i1', t: 'a' }] });
    expect(changesSince(base, current)).toEqual({
      cases: { put: [{ key: 'c1', record: { id: 'c1', title: 'Flood response' }, after: null }, { key: 'c3', record: { id: 'c3', title: 'Bridges' }, after: 'c1' }], removed: ['c2'] },
    });
  });

  it('keys the deletion log by what, which and when, so a restore is a change to its entry', () => {
    const entry = { kind: 'item', id: 'i1', deletedAt: '2026-10-11T21:00:00Z', title: 'x' };
    const base = ws({ deletions: [entry] });
    const current = ws({ deletions: [{ ...entry, restoredAt: '2026-10-11T21:00:05Z' }] });
    expect(changesSince(base, current).deletions?.put.map((p) => p.key)).toEqual(['item:i1:2026-10-11T21:00:00Z']);
  });
});

describe('mergeWorkspaces', () => {
  it('keeps what another copy saved, and lays this copy\'s changes over it, record by record', () => {
    const base = ws({ cases: [{ id: 'c1', title: 'Flood' }], intel: [] });
    const mine = ws({ cases: [{ id: 'c1', title: 'Flood' }], intel: [{ id: 'cap-b', title: 'Mine' }] });
    const theirs = ws({ cases: [{ id: 'c1', title: 'Flood', relatedEntities: ['cap-a'] }], intel: [{ id: 'cap-a', title: 'Theirs' }], metadata: { createdAt: '2026-10-01T00:00:00Z', savedAt: 9 } });
    const merged = mergeWorkspaces(theirs, changesSince(base, mine));
    expect(merged.intel).toEqual([{ id: 'cap-a', title: 'Theirs' }, { id: 'cap-b', title: 'Mine' }]);
    expect(merged.cases).toEqual([{ id: 'c1', title: 'Flood', relatedEntities: ['cap-a'] }]);
    expect(merged.metadata).toEqual(theirs.metadata);
  });

  it('takes out what this copy took out, and keeps what the other copy took out gone', () => {
    const base = ws({ reports: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }] });
    const mine = ws({ reports: [{ id: 'r1' }, { id: 'r3' }] });
    const theirs = ws({ reports: [{ id: 'r2' }, { id: 'r3' }] });
    expect(mergeWorkspaces(theirs, changesSince(base, mine)).reports).toEqual([{ id: 'r3' }]);
  });

  it('puts a record this copy brought back where it was, after the one before it', () => {
    const base = ws({ cases: [{ id: 'c1' }, { id: 'c3' }] });
    const mine = ws({ cases: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }] });
    const theirs = ws({ cases: [{ id: 'c1' }, { id: 'c3' }, { id: 'c4' }] });
    expect(mergeWorkspaces(theirs, changesSince(base, mine)).cases).toEqual([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }]);
  });

  it('lets this copy\'s save of a record both changed stand: the later save of one record wins', () => {
    const base = ws({ cases: [{ id: 'c1', title: 'Flood' }] });
    const mine = ws({ cases: [{ id: 'c1', title: 'Flood (mine)' }] });
    const theirs = ws({ cases: [{ id: 'c1', title: 'Flood (theirs)' }] });
    expect(mergeWorkspaces(theirs, changesSince(base, mine)).cases).toEqual([{ id: 'c1', title: 'Flood (mine)' }]);
  });

  it('keeps the newer state version of the two', () => {
    expect(mergeWorkspaces(ws({ version: 1 }), changesSince(ws(), ws()), 2).version).toBe(2);
  });
});
