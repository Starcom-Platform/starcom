/**
 * IntelWeb's graph controls say how many records the time window placed by when
 * they were written, once a range is set (decision D-E).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphControls } from '../GraphControls';
import { GraphContext, type GraphContextValue } from '../GraphContext';

const baseFilters = { confidenceRange: [0.3, 1] as [number, number], nodeTypes: ['report'], edgeTypes: ['reference'] };

const value = (over: Partial<GraphContextValue>): GraphContextValue => ({
  filters: baseFilters,
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
  ...over,
});

const renderControls = (over: Partial<GraphContextValue>) =>
  render(
    <GraphContext.Provider value={value(over)}>
      <GraphControls />
    </GraphContext.Provider>
  );

describe('GraphControls: records the time window placed by when they were written', () => {
  beforeEach(() => {
    localStorage.clear();
    // The panel remembers whether it was open; open it the way a returning user would find it.
    localStorage.setItem('vault-test.ui.controlsOpen', '1');
  });

  it('says how many, once a range is set', () => {
    renderControls({
      filters: { ...baseFilters, timeRange: [new Date('2026-09-01T00:00:00Z'), new Date('2026-09-14T00:00:00Z')] },
      timedNodes: 3,
      placedByWritten: 2,
    });

    expect(screen.getByTestId('graph-placed-by-written')).toHaveTextContent(
      '2 of 3 records placed by when they were written — no stated event time.'
    );
  });

  it('says nothing before a range is set', () => {
    renderControls({ timedNodes: 3, placedByWritten: 2 });
    expect(screen.queryByTestId('graph-placed-by-written')).not.toBeInTheDocument();
  });
});
