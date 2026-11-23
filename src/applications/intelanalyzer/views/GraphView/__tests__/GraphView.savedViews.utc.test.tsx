/**
 * A saved graph view says when it was saved, in UTC with its year, and the local
 * time on hover (decision D-E, settled 2026-09-14 for step 9). It printed the
 * browser's local time with no zone.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('react-force-graph-2d', () => ({
  __esModule: true,
  default: () => <div data-testid="force-graph-mock" />,
}));
// An empty workspace, given at once. The real provider loads after mounting, and a
// load that finished after this test ended set state in a torn-down environment.
// The same object every call: fresh arrays each render re-ran the views' and the
// correlations' effects without end, and the test never finished.
const workspace = vi.hoisted(() => ({ reports: [], intelItems: [], loading: false, refresh: async () => {} }));
vi.mock('../../../../../services/intel/IntelWorkspaceContext', () => ({
  useIntelWorkspace: () => workspace,
}));
import { FilterProvider } from '../../../state/FilterContext';
import { SelectionProvider } from '../../../state/SelectionContext';
import { CorrelationProvider } from '../../../state/CorrelationContext';
import GraphView from '../GraphView';
import { localTimeTitle } from '../../../../../utils/utcTime';

const savedAt = Date.UTC(2026, 8, 14, 19, 33);

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GraphView: when a view was saved', () => {
  it('shows it in UTC with the year, and the local time on hover', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(savedAt);
    render(
      <FilterProvider>
        <SelectionProvider>
          <CorrelationProvider>
            <GraphView />
          </CorrelationProvider>
        </SelectionProvider>
      </FilterProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Manage Views' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getAllByRole('textbox')[0], { target: { value: 'Port watch' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(within(dialog).getByText('14 Sep 2026 19:33Z')).toHaveAttribute('title', localTimeTitle(savedAt));
  });
});
