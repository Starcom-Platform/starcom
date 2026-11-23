/* @vitest-environment jsdom */
/**
 * A saved board says when it was saved, in UTC with its year, and the local time
 * on hover (decision D-E, settled 2026-09-14 for step 9). It printed the browser's
 * local time with no zone.
 */
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApplicationRouterProvider } from '../../../../components/Router/ApplicationRouter';
import BoardsPanel from '../BoardsPanel';
import { BoardsProvider } from '../../state/BoardsContext';
import { FilterProvider } from '../../state/FilterContext';
import { SelectionProvider } from '../../state/SelectionContext';
import { localTimeTitle } from '../../../../utils/utcTime';

vi.mock('../../../../services/intel/IntelWorkspaceContext', () => ({ useIntelWorkspace: () => ({ reports: [], intelItems: [] }) }));

const savedAt = Date.UTC(2026, 8, 14, 19, 33);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('intelAnalyzer.boards', JSON.stringify([{
    id: 'b1',
    name: 'Grid watch',
    savedAt,
    state: { view: 'timeline', filters: {}, selection: null, notes: '', pins: [], watch: { entities: [], tags: [] } },
  }]));
});

describe('BoardsPanel: when a board was saved', () => {
  it('shows it in UTC with the year, and the local time on hover', () => {
    render(
      <ApplicationRouterProvider>
        <MemoryRouter>
          <BoardsProvider>
            <FilterProvider>
              <SelectionProvider>
                <BoardsPanel currentView="timeline" setCurrentView={vi.fn()} activeBoardId={null} onActiveBoardChange={vi.fn()} />
              </SelectionProvider>
            </FilterProvider>
          </BoardsProvider>
        </MemoryRouter>
      </ApplicationRouterProvider>
    );

    expect(screen.getByText('Grid watch')).toBeInTheDocument();
    expect(screen.getByText('14 Sep 2026 19:33Z')).toHaveAttribute('title', localTimeTitle(savedAt));
  });
});
