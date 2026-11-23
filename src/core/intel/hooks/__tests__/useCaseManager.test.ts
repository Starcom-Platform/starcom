/**
 * The case loop (plan item 1.1).
 *
 * loadData depended on the selected case and wrote a fresh copy of it back, so
 * selecting a case changed loadData, which re-ran the load effect, which
 * selected a fresh copy again — forever. Every turn set the shared loading
 * flag, so the whole table was replaced by a spinner the moment anyone clicked
 * a row. Only the selected id is kept now; the case is read from the list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockGetCases = vi.fn();
const mockGetCaseStats = vi.fn();
const mockGetCaseById = vi.fn();

vi.mock('../../adapters/caseManagerAdapter', () => ({
  caseManagerAdapter: {
    getCases: (...args: unknown[]) => mockGetCases(...args),
    getCaseStats: (...args: unknown[]) => mockGetCaseStats(...args),
    getCaseById: (...args: unknown[]) => mockGetCaseById(...args),
  },
}));

import { useCaseManager } from '../useCaseManager';

const aCase = (id: string, title: string) => ({
  id, caseNumber: id, title, description: 'Body', status: 'OPEN', priority: 'MEDIUM',
  assignedTo: [], startDate: new Date('2026-09-01T00:00:00Z'), relatedEntities: [], relatedCases: [],
  tags: [], metadata: {}, updatedAt: new Date('2026-09-01T00:00:00Z'), collaborators: [], comments: [],
  activityLog: [], permissions: {},
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let stored = [aCase('case-1', 'Newark food banks'), aCase('case-2', 'Relay outage')];

describe('useCaseManager — selecting a case', () => {
  beforeEach(() => {
    stored = [aCase('case-1', 'Newark food banks'), aCase('case-2', 'Relay outage')];
    // Fresh objects on every read, as the real adapter returns: the loop needs a
    // new identity each time to keep turning, and a real store always gives one.
    mockGetCases.mockReset().mockImplementation(async () => stored.map((c) => ({ ...c })));
    mockGetCaseStats.mockReset().mockResolvedValue({ totalCases: stored.length });
    mockGetCaseById.mockReset().mockImplementation(async (id: string) => {
      const found = stored.find((c) => c.id === id);
      return found ? { ...found } : null;
    });
  });

  // Selection is started inside a synchronous act() and then observed OUTSIDE
  // act. An async act() drains every queued update before it returns, which
  // hides both faults: it batches a brief loading=true away, and with the loop
  // running it never returns at all.
  it('settles: selecting a case does not re-read the store in a loop', async () => {
    const { result } = renderHook(() => useCaseManager());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { void result.current.selectCase('case-1'); });
    await waitFor(() => expect(result.current.selectedCase?.id).toBe('case-1'));
    const readsAfterSelecting = mockGetCases.mock.calls.length;
    await sleep(250);

    expect(mockGetCases.mock.calls.length).toBe(readsAfterSelecting);
  });

  it('never blanks the list: the shared loading flag stays down while selecting', async () => {
    const loadingByRender: boolean[] = [];
    const { result } = renderHook(() => {
      const manager = useCaseManager();
      loadingByRender.push(manager.loading);
      return manager;
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const rendersBeforeSelecting = loadingByRender.length;

    act(() => { void result.current.selectCase('case-2'); });
    await sleep(150);

    expect(loadingByRender.length).toBeGreaterThan(rendersBeforeSelecting);
    expect(loadingByRender.slice(rendersBeforeSelecting)).not.toContain(true);
  });

  it('shows the case as the list has it now, not a copy taken when it was selected', async () => {
    const { result } = renderHook(() => useCaseManager());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { void result.current.selectCase('case-1'); });
    await waitFor(() => expect(result.current.selectedCase?.id).toBe('case-1'));

    stored = [aCase('case-1', 'Newark food banks, two closed'), stored[1]];
    act(() => { void result.current.refreshData(); });

    await waitFor(() => expect(result.current.selectedCase?.title).toBe('Newark food banks, two closed'));
  });

  it('lets go of a case that is no longer in the list', async () => {
    const { result } = renderHook(() => useCaseManager());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { void result.current.selectCase('case-2'); });
    await waitFor(() => expect(result.current.selectedCase?.id).toBe('case-2'));

    stored = [stored[0]];
    act(() => { void result.current.refreshData(); });

    await waitFor(() => expect(result.current.cases).toHaveLength(1));
    expect(result.current.selectedCase).toBeNull();
  });
});
