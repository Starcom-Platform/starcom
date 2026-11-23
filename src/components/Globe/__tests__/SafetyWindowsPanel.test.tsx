/**
 * The Safety windows' calendar (D-RR, RR1; kit 5.1): grouped by the local day of each start in its own zone; each
 * window's place and areas, its state at the cursor, its times in that zone, when it is busiest, the schedule's line
 * with its age and the score line once; the next 14 days and the last 7 by default, or every window held.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import armed from '../../../services/psiWatch/kit-v0/fixtures/rlsh/recurrence_window.armed.json';

// No relay is read in a test.
const none = vi.hoisted(() => ({ received: { accepted: [], refused: [], counters: { seen: 0, accepted: 0, refused: 0, refusedBy: {} }, publishers: [] }, live: [] as unknown[] }));
vi.mock('../../../services/intel/useReceivedPackages', () => ({ useReceivedPackages: () => none.received }));
vi.mock('../../../services/rlsh/recurrence/liveRlsh', () => ({ liveRlshNotes: () => none.live, subscribeLiveRlsh: () => () => {}, startLiveRlsh: () => () => {} }));
vi.mock('../../../services/intel/useMissionLabels', () => ({ useMissionLabels: () => ({ claims: () => [], answered: false }) }));
vi.mock('../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
vi.mock('../../../services/reviews/reviewBroadcast', () => ({ fetchReviews: async () => [] }));
import { SafetyWindowsPanel } from '../SafetyWindowsPanel';
import { windowsAt } from '../../../services/rlsh/recurrence/useSafetyWindows';
import type { RlshNote } from '../../../services/rlsh/recurrence/recurrence';

const held = { notes: { recurrence_window: [armed.event as RlshNote], recurrence_case: [], mission_totals: [], celebration_safety: [] }, refused: [], samples: true };
const FROM = 1812673800;

beforeEach(() => window.sessionStorage.clear());

describe('SafetyWindowsPanel', () => {
  it("lists a window under its local day and zone, armed, with its place, times, schedule and score line once", () => {
    const cursorS = FROM - 2 * 86_400;
    render(<SafetyWindowsPanel windows={windowsAt(held, cursorS)} cursorS={cursorS} />);
    const day = screen.getByTestId('safety-windows-day');
    expect(day).toHaveTextContent('Thursday, 10 June 2027, Eastern Daylight Time');
    const row = within(day).getByTestId('safety-window-row');
    expect(row).toHaveAttribute('data-state', 'armed');
    expect(within(row).getByTestId('safety-window-state')).toHaveTextContent('Armed · Opens at Thu 10 Jun, 20:30');
    expect(row).toHaveTextContent('Thu 10 Jun, 20:30 to about Fri 11 Jun, 04:05');
    expect(row).toHaveTextContent('Busiest around Fri 11 Jun, 00:20');
    expect(within(row).getAllByTestId('safety-window-score')).toHaveLength(1);
    expect(row.textContent).not.toMatch(/RLSH|hero|patrol/i);
  });

  it('keeps a window outside the next 14 days and the last 7 out until asked for all', () => {
    const cursorS = FROM - 60 * 86_400;
    render(<SafetyWindowsPanel windows={windowsAt(held, cursorS)} cursorS={cursorS} />);
    expect(screen.getByTestId('safety-windows-none')).toHaveTextContent('No window in this range.');
    fireEvent.click(screen.getByTestId('safety-windows-outside'));
    expect(screen.getAllByTestId('safety-window-row')).toHaveLength(1);
  });
  it("opens a window's mission card from its row, once its package is held (the kit's sample with ?rlsh=kit)", async () => {
    window.sessionStorage.setItem('starcom:rlsh-kit-samples', '1');
    const cursorS = FROM - 2 * 86_400;
    render(<SafetyWindowsPanel windows={windowsAt(held, cursorS)} cursorS={cursorS} />);
    fireEvent.click(await screen.findByTestId('safety-window-mission'));
    expect(screen.getByTestId('received-package-detail')).toHaveTextContent('Someone hurt or in danger? Call 911.');
  });
});
