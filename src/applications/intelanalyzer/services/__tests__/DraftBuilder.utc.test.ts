/**
 * A draft's summary says when it was made in UTC, with its year (decision D-E,
 * settled 2026-09-14 for step 9). It wrote the author's local time with no zone,
 * into text other people read later and elsewhere.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DraftBuilder } from '../DraftBuilder';

afterEach(() => {
  vi.useRealTimers();
});

describe('DraftBuilder: when a draft was made', () => {
  it('writes the time into the summary in UTC, with the year', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 8, 14, 19, 33));
    const board = {
      id: 'b1', name: 'Alpha Board', savedAt: Date.now(),
      state: { view: 'table', filters: {}, selection: null, notes: '', pins: [], watch: { tags: [], entities: [] } },
    } as never;

    const res = DraftBuilder.buildFromBoard(board, {
      title: 'Draft',
      visibility: 'public',
      sensitivity: 'open',
      includeFilters: false,
      includeWatchlists: false,
      redactSensitive: false,
    } as never);

    expect(res.report.summary).toBe('Draft created from board "Alpha Board" on 14 Sep 2026 19:33Z.');
  });
});
