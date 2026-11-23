import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import ConflictBadge from '../ConflictBadge';
import type { LocationConflict } from '../../../state/correlationUtils';

// Lightweight mock for MUI Chip, same convention as AnomalyBadge.test.tsx
vi.mock('@mui/material', () => {
  const React = require('react');
  const Chip = ({ label, ...props }: any) => React.createElement('span', { 'data-testid': props['data-testid'], ...props }, label);
  return { Chip };
});

function makeConflict(overrides: Partial<LocationConflict> = {}): LocationConflict {
  return {
    entity: 'John Smith',
    sourceIdA: 'report-a',
    sourceIdB: 'report-b',
    distanceKm: 3900,
    hoursApart: 6,
    strength: 0.5,
    ...overrides
  };
}

describe('ConflictBadge', () => {
  it('renders when the current event is one side of a detected conflict', () => {
    render(<ConflictBadge sourceId="report-a" locationConflicts={[makeConflict()]} />);
    expect(screen.getByTestId('inspector-conflict-badge')).toBeTruthy();
  });

  it('renders for the OTHER side of the conflict too — both reports get the badge', () => {
    render(<ConflictBadge sourceId="report-b" locationConflicts={[makeConflict()]} />);
    expect(screen.getByTestId('inspector-conflict-badge')).toBeTruthy();
  });

  it('does not render when the current event is not part of any conflict', () => {
    render(<ConflictBadge sourceId="report-unrelated" locationConflicts={[makeConflict()]} />);
    expect(screen.queryByTestId('inspector-conflict-badge')).toBeNull();
  });

  it('does not render when there are no conflicts at all', () => {
    render(<ConflictBadge sourceId="report-a" locationConflicts={[]} />);
    expect(screen.queryByTestId('inspector-conflict-badge')).toBeNull();
  });

  it('does not render without a sourceId', () => {
    render(<ConflictBadge locationConflicts={[makeConflict()]} />);
    expect(screen.queryByTestId('inspector-conflict-badge')).toBeNull();
  });

  it('the tooltip surfaces strength as a confidence percentage (phase 2)', () => {
    render(<ConflictBadge sourceId="report-a" locationConflicts={[makeConflict({ strength: 0.85 })]} />);
    expect(screen.getByTestId('inspector-conflict-badge').getAttribute('title')).toContain('85%');
  });
});
