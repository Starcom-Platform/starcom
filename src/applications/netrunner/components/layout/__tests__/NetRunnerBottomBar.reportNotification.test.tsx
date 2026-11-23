/**
 * A bot mission that persisted its findings as a real Intel Report used to
 * report that only via console.log — an operative running the mission had
 * no way to know it happened, let alone a way to go look at what was
 * created. handleMissionEvent (NetRunnerBottomBar.tsx) now builds a
 * notification naming the report and, when BotCard's event carries a
 * reportId, gives the snackbar a real "View Report" action that deep-links
 * into the Intel Dashboard. BotCard itself is stubbed here — its own test
 * file (BotCard.test.tsx) already covers exactly what ends up in the event
 * payload; this covers what NetRunnerBottomBar does with it.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { MissionEvent } from '../BotCard';

// Which event the stubbed BotCard fires; null means the saved-report event.
const firedEvent = vi.hoisted(() => ({ current: null as MissionEvent | null }));

vi.mock('../BotCard', () => ({
  default: ({ onMissionEvent }: { onMissionEvent?: (e: MissionEvent) => void }) => (
    <button
      onClick={() => onMissionEvent?.(firedEvent.current ?? {
        botName: 'WebSpider Alpha',
        status: 'success',
        target: 'example.com',
        reportId: 'report-42',
        reportTitle: 'example.com — reconnaissance findings',
      })}
    >
      fire mission event
    </button>
  ),
}));

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

function renderWithRoutes() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<NetRunnerBottomBar open height={200} onToggle={() => {}} />} />
        <Route path="/intel" element={<div>Intel Dashboard page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('NetRunnerBottomBar — report-created notification', () => {
  it('names the created report in the toast and offers a working "View Report" link', async () => {
    renderWithRoutes();

    // The real bot roster seeds several default bots, each rendering the
    // stubbed BotCard above — any one firing its mission event exercises
    // the same handleMissionEvent path, so the first is enough.
    const [fireButton] = await screen.findAllByText('fire mission event');
    fireEvent.click(fireButton);

    expect(await screen.findByText(/saved as Intel Report "example\.com — reconnaissance findings"/i)).toBeTruthy();
    const viewReport = screen.getByTestId('snackbar-action');
    expect(viewReport.textContent).toBe('View Report');

    fireEvent.click(viewReport);

    expect(await screen.findByText('Intel Dashboard page')).toBeTruthy();
  });

  it('says why no report was made when the findings were sample data, with nothing to view', async () => {
    firedEvent.current = {
      botName: 'WebSpider Alpha',
      status: 'success',
      target: 'example.com',
      reportNotSaved: 'Censys returned sample data, not collection, so no Intel Report was made from it',
    };
    try {
      renderWithRoutes();
      const [fireButton] = await screen.findAllByText('fire mission event');
      fireEvent.click(fireButton);

      expect(await screen.findByText(
        'WebSpider Alpha: mission on "example.com" completed — Censys returned sample data, not collection, so no Intel Report was made from it'
      )).toBeTruthy();
      expect(screen.queryByTestId('snackbar-action')).toBeNull();
    } finally {
      firedEvent.current = null;
    }
  });

  // Whether the findings were shared went only to the console (plan item 9.3).
  async function notificationFor(event: MissionEvent) {
    firedEvent.current = event;
    try {
      renderWithRoutes();
      const [fireButton] = await screen.findAllByText('fire mission event');
      fireEvent.click(fireButton);
      return await screen.findByRole('status');
    } finally {
      firedEvent.current = null;
    }
  }

  it('says the findings were shared, and on how many relays', async () => {
    const toast = await notificationFor({ botName: 'WebSpider Alpha', status: 'success', target: 'example.com', sharing: { published: true, relays: 3 } });
    expect(toast.textContent).toContain('WebSpider Alpha: mission on "example.com" completed — shared with the team on 3 relays');
    expect(toast.className).toContain('snackbar-success');
  });

  it('says plainly when the findings were not published, and does not show it in green', async () => {
    const toast = await notificationFor({ botName: 'WebSpider Alpha', status: 'success', target: 'example.com', sharing: { published: false, why: 'no relay took it' } });
    expect(toast.textContent).toContain('WebSpider Alpha: mission on "example.com" completed — not published: no relay took it');
    expect(toast.className).not.toContain('snackbar-success');
  });
});
