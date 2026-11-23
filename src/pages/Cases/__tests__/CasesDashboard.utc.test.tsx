/**
 * A case's start shows its UTC date alone (decision D-E, settled 2026-09-14 for
 * step 9). It printed the browser's local date, which in the Americas is the day
 * before for a case started in the first hours of a UTC day.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CasesDashboard from '../CasesDashboard';
import { intelCaseService } from '../../../services/intel/IntelCaseService';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));

describe('CasesDashboard: when a case started', () => {
  it('shows the UTC date alone', async () => {
    await intelCaseService.createCase({
      title: 'Grid watch',
      description: 'Tracking relay faults.',
      startDate: new Date(Date.UTC(2026, 6, 26, 2)).toISOString(),
    });
    render(<CasesDashboard />);

    expect(await screen.findByText('Grid watch')).toBeInTheDocument();
    const day = await screen.findByText('26 Jul 2026');
    expect(day.tagName).toBe('TIME');
  });
});
