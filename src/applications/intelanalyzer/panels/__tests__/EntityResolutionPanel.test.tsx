import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@mui/icons-material/ExpandMore', () => ({ default: () => null }));
vi.mock('@mui/icons-material/ExpandLess', () => ({ default: () => null }));

const confirmMergeSuggestion = vi.fn();
const rejectMergeSuggestion = vi.fn();
let mergeSuggestions: { nameA: string; nameB: string; similarity: number }[] = [];

vi.mock('../../state/CorrelationContext', () => ({
  useCorrelation: () => ({
    mergeSuggestions,
    confirmMergeSuggestion,
    rejectMergeSuggestion
  })
}));

import EntityResolutionPanel from '../EntityResolutionPanel';

describe('EntityResolutionPanel', () => {
  it('renders nothing when there are no undecided suggestions', () => {
    mergeSuggestions = [];
    const { container } = render(<EntityResolutionPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('lists each suggestion with its similarity', () => {
    mergeSuggestions = [{ nameA: 'Acme Corporation', nameB: 'Acme Corporatoin', similarity: 0.95 }];
    render(<EntityResolutionPanel />);
    expect(screen.getByText('Acme Corporation', { exact: false })).toBeTruthy();
    expect(screen.getByText('Acme Corporatoin', { exact: false })).toBeTruthy();
    expect(screen.getByText('95% match')).toBeTruthy();
  });

  it('shows a count badge matching the number of suggestions', () => {
    mergeSuggestions = [
      { nameA: 'A', nameB: 'B', similarity: 0.9 },
      { nameA: 'C', nameB: 'D', similarity: 0.9 }
    ];
    render(<EntityResolutionPanel />);
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('"Same entity" calls confirmMergeSuggestion with the pair', async () => {
    mergeSuggestions = [{ nameA: 'Acme Corporation', nameB: 'Acme Corporatoin', similarity: 0.95 }];
    confirmMergeSuggestion.mockClear();
    render(<EntityResolutionPanel />);
    await userEvent.click(screen.getByText('Same entity'));
    expect(confirmMergeSuggestion).toHaveBeenCalledWith('Acme Corporation', 'Acme Corporatoin');
  });

  it('"Different" calls rejectMergeSuggestion with the pair', async () => {
    mergeSuggestions = [{ nameA: 'Acme Corporation', nameB: 'Acme Corporatoin', similarity: 0.95 }];
    rejectMergeSuggestion.mockClear();
    render(<EntityResolutionPanel />);
    await userEvent.click(screen.getByText('Different'));
    expect(rejectMergeSuggestion).toHaveBeenCalledWith('Acme Corporation', 'Acme Corporatoin');
  });
});
