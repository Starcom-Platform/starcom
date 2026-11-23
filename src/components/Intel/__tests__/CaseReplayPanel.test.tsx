import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CaseActivityAction } from '../../../types/intel/IntelCaseUI';

const cases = vi.hoisted(() => ({ value: [] as unknown[] }));
vi.mock('../../../services/intel/IntelCaseService', () => ({
  intelCaseService: {
    listCases: () => Promise.resolve(cases.value),
    onChange: () => () => {},
  },
}));

import CaseReplayPanel from '../CaseReplayPanel';

let n = 0;
const entry = (action: string, timestamp: string, details = {}, userId = 'analyst-abc') =>
  ({ id: `e${++n}`, action, timestamp, userId, details });

const aCase = (activityLog: unknown[]) => ([{
  id: 'c1', title: 'Delta flooding', activityLog,
}]);

beforeEach(() => { cases.value = []; });

describe('CaseReplayPanel', () => {
  it('renders nothing when there are no cases to replay', () => {
    const { container } = render(<CaseReplayPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers the cases it can replay', async () => {
    cases.value = aCase([entry(CaseActivityAction.CREATED, '2026-01-01T00:00:00Z', { status: 'NEW' })]);
    render(<CaseReplayPanel />);
    await waitFor(() => expect(screen.getByRole('combobox', { name: /case to replay/i })).toBeInTheDocument());
  });

  it('distinguishes an absent record from nothing having happened', async () => {
    // The two are not the same, and a panel that showed an empty timeline for
    // both would let a missing log read as a quiet case.
    cases.value = aCase([]);
    const { getByRole } = render(<CaseReplayPanel />);
    await waitFor(() => getByRole('combobox', { name: /case to replay/i }));
    const select = getByRole('combobox', { name: /case to replay/i }) as HTMLSelectElement;
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(select, { target: { value: 'c1' } });
    await waitFor(() => expect(screen.getByText(/No history recorded for this case/)).toBeInTheDocument());
    expect(screen.getByText(/does not mean nothing happened/)).toBeInTheDocument();
  });

  it('never shows a name where none was recorded', async () => {
    cases.value = aCase([
      entry(CaseActivityAction.CREATED, '2026-01-01T00:00:00Z', { status: 'NEW' }),
      entry(CaseActivityAction.COMMENTED, '2026-01-02T00:00:00Z', {}, ''),
    ]);
    const { getByRole } = render(<CaseReplayPanel />);
    await waitFor(() => getByRole('combobox', { name: /case to replay/i }));
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(getByRole('combobox', { name: /case to replay/i }), { target: { value: 'c1' } });
    await waitFor(() => expect(screen.getByText(/nobody recorded/i)).toBeInTheDocument());
  });

  it('shows gaps inline rather than behind a toggle', async () => {
    // A tidy sequence of steps reads as a complete account. The gap has to be
    // in the reader's path.
    cases.value = aCase([
      entry(CaseActivityAction.COMMENTED, '2026-01-02T00:00:00Z'),
    ]);
    const { getByRole } = render(<CaseReplayPanel />);
    await waitFor(() => getByRole('combobox', { name: /case to replay/i }));
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(getByRole('combobox', { name: /case to replay/i }), { target: { value: 'c1' } });
    await waitFor(() => expect(screen.getByText(/GAP · no-creation-entry/)).toBeInTheDocument());
  });
});
