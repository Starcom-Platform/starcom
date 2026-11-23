/**
 * An IntelWeb saved view says when it was saved, in UTC with its year, and the
 * local time on hover (decision D-E, settled 2026-09-14 for step 9). It printed the
 * browser's local time with no zone.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GraphControls } from '../GraphControls';
import { GraphContext, type GraphContextValue } from '../GraphContext';
import { localTimeTitle } from '../../../../../utils/utcTime';

const savedAt = Date.UTC(2026, 8, 14, 19, 33);

const value: GraphContextValue = {
  filters: { confidenceRange: [0.3, 1] as [number, number], nodeTypes: ['report'], edgeTypes: ['reference'] },
  setFilters: () => {},
  physics: { charge: -300, linkDistance: 80, linkStrength: 0.1, friction: 0.9, alpha: 1, alphaDecay: 0.0228, gravity: 0.1, theta: 0.8 } as never,
  setPhysics: () => {},
  graphMode: '2d',
  setGraphMode: () => {},
  frozen: false,
  setFrozen: () => {},
  nodeCount: 3,
  edgeCount: 0,
  timestamps: [new Date('2026-09-10T00:00:00Z')],
  vaultHash: 'vault-test',
  fullGraph: null,
  activeGraph: null,
  isolateState: { rootId: null, depth: 1, active: false },
  applyIsolate: () => {},
  clearIsolate: () => {},
  sizingMode: 'degree',
  setSizingMode: () => {},
} as GraphContextValue;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('vault-test.ui.controlsOpen', '1');
  localStorage.setItem('vault-test.ui.controlsTab', 'views');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GraphControls: when a view was saved', () => {
  it('shows it in UTC with the year, and the local time on hover', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(savedAt);
    render(
      <GraphContext.Provider value={value}>
        <GraphControls />
      </GraphContext.Provider>
    );

    fireEvent.change(screen.getByPlaceholderText('New view name'), { target: { value: 'Port watch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save View' }));

    expect(screen.getByText('14 Sep 2026 19:33Z')).toHaveAttribute('title', localTimeTitle(savedAt));
  });
});
