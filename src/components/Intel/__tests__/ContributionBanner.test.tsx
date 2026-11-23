/**
 * ContributionBanner — Phase 2 roadmap item ("attribution/contribution
 * tile"). Surfaces existing collaborators[]/activityLog data; adds no
 * new metric that isn't already real and attributable.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ContributionBanner from '../ContributionBanner';

const listCases = vi.fn();
const listMissions = vi.fn();
const listReports = vi.fn();

vi.mock('../../../services/intel/IntelCaseService', () => ({
  intelCaseService: { listCases: (...args: unknown[]) => listCases(...args) }
}));
vi.mock('../../../services/intel/MissionService', () => ({
  missionService: { listMissions: (...args: unknown[]) => listMissions(...args) }
}));
vi.mock('../../../services/intel/IntelReportService', () => ({
  intelReportService: { listReports: (...args: unknown[]) => listReports(...args) }
}));

describe('ContributionBanner', () => {
  beforeEach(() => {
    listCases.mockReset();
    listMissions.mockReset();
    listReports.mockReset();
  });

  it('shows the top contributor derived from real collaborators/activityLog data', async () => {
    listCases.mockResolvedValue([{
      collaborators: [{ userId: 'alice', name: 'alice', role: 'EDITOR', addedAt: '2026-01-01T00:00:00.000Z', addedBy: 'bob' }],
      activityLog: [{ id: '1', action: 'CREATED', timestamp: '2026-01-01T00:00:00.000Z', userId: 'alice', details: {} }]
    }]);
    listMissions.mockResolvedValue([]);
    listReports.mockResolvedValue([]);

    render(<ContributionBanner />);

    expect(await screen.findByText('alice', { exact: false })).toBeTruthy();
  });

  it('renders nothing when there is no collaboration or activity data yet', async () => {
    listCases.mockResolvedValue([]);
    listMissions.mockResolvedValue([]);
    listReports.mockResolvedValue([]);

    const { container } = render(<ContributionBanner />);

    await waitFor(() => expect(listCases).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('fails quiet on a load error rather than crashing the dashboard', async () => {
    listCases.mockRejectedValue(new Error('storage unavailable'));
    listMissions.mockResolvedValue([]);
    listReports.mockResolvedValue([]);

    const { container } = render(<ContributionBanner />);

    await waitFor(() => expect(listCases).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('never displays a fabricated "findings corroborated" or "contradictions resolved" stat', async () => {
    listCases.mockResolvedValue([{
      collaborators: [{ userId: 'alice', name: 'alice', role: 'EDITOR', addedAt: '2026-01-01T00:00:00.000Z', addedBy: 'bob' }],
      activityLog: []
    }]);
    listMissions.mockResolvedValue([]);
    listReports.mockResolvedValue([]);

    render(<ContributionBanner />);

    await screen.findByText('alice', { exact: false });
    expect(screen.queryByText(/corroborated/i)).toBeNull();
    expect(screen.queryByText(/contradictions resolved/i)).toBeNull();
  });
});
