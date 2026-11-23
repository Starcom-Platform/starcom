/**
 * DataIntegrityBanner — Phase 1 roadmap item ("the data-integrity
 * dashboard tile"). Designed for outside visibility from the start, per
 * the roadmap's collective-value revision — this is the metric that lets
 * anyone relying on this instance's output check "how much of this is
 * real" instead of trusting it on faith.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DataIntegrityBanner from '../DataIntegrityBanner';
import type { EnhancedMissionResult } from '../../../applications/netrunner/execution/BotMissionExecutor';

const loadMissionHistory = vi.fn();

vi.mock('../../../applications/netrunner/services/persistence/NetRunnerPersistence', () => ({
  loadMissionHistory: (...args: unknown[]) => loadMissionHistory(...args)
}));

function makeMission(overrides: Partial<EnhancedMissionResult> = {}): EnhancedMissionResult {
  return {
    missionId: 'm1',
    botId: 'bot-1',
    target: 'example.com',
    status: 'success',
    intelCollected: 3,
    operationsPerformed: [],
    duration: 100,
    completedAt: Date.now(),
    errors: [],
    usedMockData: false,
    qualityScore: 80,
    confidenceLevel: 0.8,
    specializedFindings: {},
    toolsUsed: [],
    processingStages: [],
    rawDataGenerated: 0,
    observationsCreated: 0,
    correlationOpportunities: [],
    suggestedNextActions: [],
    ...overrides
  };
}

describe('DataIntegrityBanner', () => {
  beforeEach(() => {
    loadMissionHistory.mockReset();
  });

  it('shows a real percentage derived from actual mission history', async () => {
    loadMissionHistory.mockResolvedValue([
      makeMission({ usedMockData: false }),
      makeMission({ usedMockData: false }),
      makeMission({ usedMockData: false }),
      makeMission({ usedMockData: true })
    ]);

    render(<DataIntegrityBanner />);

    expect(await screen.findByText('75%')).toBeTruthy();
    expect(screen.getByText(/3\/4 recent collections/)).toBeTruthy();
  });

  it('an instance running entirely on mock data honestly reports 0%, not hidden or omitted', async () => {
    loadMissionHistory.mockResolvedValue([
      makeMission({ usedMockData: true }),
      makeMission({ usedMockData: true })
    ]);

    render(<DataIntegrityBanner />);

    expect(await screen.findByText('0%')).toBeTruthy();
  });

  it('renders nothing when there is no mission history yet — no misleading 0% before anything has run', async () => {
    loadMissionHistory.mockResolvedValue([]);

    const { container } = render(<DataIntegrityBanner />);

    await waitFor(() => expect(loadMissionHistory).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('fails quiet on a load error rather than crashing the dashboard', async () => {
    loadMissionHistory.mockRejectedValue(new Error('storage unavailable'));

    const { container } = render(<DataIntegrityBanner />);

    await waitFor(() => expect(loadMissionHistory).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});
