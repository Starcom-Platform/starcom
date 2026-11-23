/**
 * NetRunner's bot roster, collapsed (decision D-F, step 3.2).
 *
 * Collapsed, the roster is a 32 px strip that hides what overflows it, and it stacked
 * its three controls in a 48 px column, so Create New Bot and Bot Settings were cut
 * off below the strip at every window size. Collapsed, they now sit in a row. jsdom
 * lays nothing out, so this checks the attribute the styles key on; the layout audit
 * measures the rest.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../BotCard', () => ({ default: () => null }));
vi.mock('../../../execution/BotMissionExecutor', () => ({
  botMissionExecutor: {
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
    getBotMetrics: vi.fn(() => ({
      totalMissions: 0, successfulMissions: 0, averageQuality: 0, averageConfidence: 0, totalIntelGenerated: 0,
    })),
    isRunning: vi.fn(() => false),
    getMissionHistory: vi.fn(() => []),
  },
}));

import NetRunnerBottomBar from '../NetRunnerBottomBar';

const renderRoster = (open: boolean) =>
  render(
    <MemoryRouter>
      <NetRunnerBottomBar open={open} height={open ? 268 : 32} onToggle={() => {}} />
    </MemoryRouter>,
  );

const controlsOf = (name: string) =>
  screen.getByRole('button', { name }).closest('[data-controls]');

describe('NetRunnerBottomBar controls', () => {
  it('sit in a row while the roster is collapsed', () => {
    renderRoster(false);

    const controls = controlsOf('Create New Bot');
    expect(controls?.getAttribute('data-controls')).toBe('row');
    expect(controlsOf('Bot Settings')).toBe(controls);
    expect(controlsOf('Expand Bot Roster')).toBe(controls);
  });

  it('stack once the roster is open', () => {
    renderRoster(true);

    expect(controlsOf('Create New Bot')?.getAttribute('data-controls')).toBe('column');
  });
});
