/**
 * Psi Watch's Lists (D-PW, PW88–PW90): the daily notes by week, newest first; the registrations with their results;
 * the ledger; and the Intel Reports in the open window, nearest exact first, each shown or charted; one of the left
 * panels.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const kit = vi.hoisted(() => ({ fixtures: [] as unknown[] }));
vi.mock('../usePsiKit', () => ({ usePsiKit: () => ({ fixtures: kit.fixtures, status: 'ready' }) }));
const held = vi.hoisted(() => ({ reports: [] as unknown[] }));
vi.mock('../../../services/psiWatch/lists/useHeldIntelReports', () => ({ useHeldIntelReports: () => held.reports }));
const popup = vi.hoisted(() => ({ answer: true, asked: [] as string[] }));
vi.mock('../../../features/globe/interaction/intelPopupRequests', () => ({
  requestIntelPopup: (id: string) => { popup.asked.push(id); return popup.answer; },
}));

vi.mock('../../../services/intel/useMissionLabels', () => ({ useMissionLabels: () => ({ claims: () => [], answered: false }) }));
vi.mock('../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
vi.mock('../../../services/reviews/reviewBroadcast', () => ({ fetchReviews: async () => [] }));

import missionFixture from '../../../services/psiWatch/kit-v0/fixtures/psi/psi_mission_package.json';
import windowFixture from '../../../services/psiWatch/kit-v0/fixtures/psi/psi_window.json';
import { missionWindowMark, resetMissionWindowMarkForTests } from '../../../features/psi/missionWindowMark';
import { PsiListsPanel } from '../PsiListsPanel';
import { openPsiLists, psiLists, resetPsiListsForTests } from '../../../features/psi/psiListsPanel';
import { eventChart, resetEventChartForTests } from '../../../features/psi/eventChartPanel';
import { openStoryPanel, resetStoryPanelForTests } from '../../../features/story/storyPanel';
import { getPsiLinesState, resetPsiLinesForTests, setPsiLinesEvent } from '../../../services/psiWatch/psiLinesStore';

const KEY = 'p'.repeat(64);
const note = (family: string, d: string, tags: string[][], content = '', publishedS = 1_793_019_600) => ({
  family, event: { kind: 30023, pubkey: KEY, created_at: publishedS, content, tags: [['d', d], ['published_at', String(publishedS)], ...tags] },
});
const DAY = 86_400;
const EXACT = Date.UTC(2026, 9, 27, 2) / 1000;
const report = (id: string, startMs: number, place = true): IntelReportUI => ({
  id, title: `Report ${id}`, startDate: new Date(startMs), createdAt: new Date(startMs), updatedAt: new Date(startMs),
  ...(place ? { latitude: 10, longitude: 20 } : {}),
} as unknown as IntelReportUI);

beforeEach(() => {
  resetPsiListsForTests(); resetEventChartForTests(); resetStoryPanelForTests(); resetPsiLinesForTests(); resetMissionWindowMarkForTests();
  popup.asked = []; popup.answer = true;
  kit.fixtures = [
    note('psi_brief', 'psi-brief-2026-10-26', [['title', 'Psi Watch, Mon 26 Oct 2026']], 'Sky, next 72 h\nMoon and Mars square.'),
    note('psi_brief', 'psi-brief-2026-11-02', [['title', 'Psi Watch, Mon 2 Nov 2026']], 'Sky, next 72 h\nMercury turns direct.', 1_793_019_600 + 7 * DAY),
    note('psi_registration', 'psi-reg-PSI-0002', [['title', 'PSI-0002: The null'], ['registration', 'PSI-0002', 'abc'], ['seal', 'x', '2026-10-26T08:35:00+00:00'], ['rung', '0']]),
    note('psi_ledger', 'psi-ledger-2026-w44', [['title', 'Psi Watch ledger, 2026 week 44'], ['count', 'registered', '3'], ['count', 'scored', '1'], ['count', 'met', '0'], ['count', 'missed', '1']]),
  ];
  held.reports = [];
});

describe('PsiListsPanel', () => {
  it('lists the daily notes newest first, a week at a time', () => {
    act(() => openPsiLists('notes'));
    render(<PsiListsPanel />);
    const weeks = screen.getAllByTestId('psi-lists-week');
    expect(weeks.map((w) => within(w).getByRole('heading').textContent)).toEqual(['Week of 2 Nov 2026', 'Week of 26 Oct 2026']);
    expect(within(weeks[0]).getByText('Psi Watch, Mon 2 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('Experimental')).toBeInTheDocument();
  });

  it('lists the registrations with whether a result exists, and the ledger', () => {
    act(() => openPsiLists('registrations'));
    const { rerender } = render(<PsiListsPanel />);
    expect(screen.getByTestId('psi-lists-registrations')).toHaveTextContent(/PSI-0002: The null · Rung 0, sealed 26 Oct 2026 08:35Z · No result yet\./);
    act(() => openPsiLists('ledger'));
    rerender(<PsiListsPanel />);
    expect(screen.getByTestId('psi-lists-ledger')).toHaveTextContent('Psi Watch ledger, 2026 week 44');
  });

  it("lists the Intel Reports in the open window, nearest exact first, each shown or charted", () => {
    held.reports = [
      report('late', (EXACT + 4 * 3600) * 1000),
      report('near', (EXACT - 3600) * 1000),
      report('outside', (EXACT + 20 * DAY) * 1000),
      report('unplaced', (EXACT + 2 * 3600) * 1000, false),
    ];
    act(() => setPsiLinesEvent({ title: 'Moon and Mars at change (square)', bodies: ['Moon', 'Mars'], from: EXACT - 5 * 3600, until: EXACT + 5 * 3600, exact: EXACT }));
    act(() => openPsiLists('intel'));
    render(<PsiListsPanel />);
    expect(screen.getByTestId('psi-lists-window')).toHaveTextContent('Moon and Mars at change (square): 26 Oct 21:00Z to 27 Oct 07:00Z, exact 27 Oct 02:00Z');
    const rows = screen.getAllByTestId('psi-lists-intel-row');
    expect(rows.map((r) => r.textContent?.split(' · ')[0])).toEqual(['Report near', 'Report unplaced', 'Report late']);
    expect(rows[0]).toHaveTextContent('1 h before exact');
    expect(within(rows[1]).queryByText('Chart')).toBeNull();
    fireEvent.click(within(rows[0]).getByTestId('psi-lists-show'));
    expect(popup.asked).toEqual(['near']);
    expect(screen.queryByTestId('psi-lists-said')).toBeNull();
    popup.answer = false;
    fireEvent.click(within(rows[2]).getByTestId('psi-lists-show'));
    expect(screen.getByTestId('psi-lists-said')).toHaveTextContent('Not drawn on the globe now, so it cannot be shown.');
    fireEvent.click(within(rows[0]).getByText('Chart'));
    expect(eventChart()).toMatchObject({ open: true, subject: { title: 'Report near', place: { lat: 10, lng: 20 } } });
    // The chart is one of the left panels: the lists gave way to it.
    expect(psiLists().open).toBe(false);
  });

  it('asks for a sky event when none is open, and is one of the left panels', () => {
    act(() => openPsiLists('intel'));
    render(<PsiListsPanel />);
    expect(screen.getByText('Open a sky event in the Psi panel: its window is the one listed.')).toBeInTheDocument();
    act(() => openStoryPanel(null));
    expect(psiLists().open).toBe(false);
  });
  it("lists the psi missions: one chosen marks its window, and Open shows its card, closing which leaves the row's mark", async () => {
    kit.fixtures = [
      ...kit.fixtures,
      { ...missionFixture, family: 'psi_mission_package', file: 'psi_mission_package.json' },
      { ...windowFixture, family: 'psi_window', file: 'psi_window.json' },
    ];
    act(() => openPsiLists('missions'));
    render(<PsiListsPanel />);
    const row = await screen.findByTestId('psi-lists-mission');
    expect(row).toHaveTextContent('Psi Watch focus window (FIXTURE)');
    expect(missionWindowMark()).toBeNull();
    fireEvent.click(within(row).getByTestId('psi-lists-mission-choose'));
    expect(within(row).getByTestId('psi-mission-facts')).toHaveTextContent('In Sahel Zone');
    expect(missionWindowMark()?.peakMs).toBe(1793564907000);
    fireEvent.click(within(row).getByTestId('psi-lists-mission-open'));
    const card = screen.getByTestId('received-package-detail');
    expect(within(card).getByTestId('received-psi-badge')).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Close' }));
    expect(missionWindowMark()?.peakMs).toBe(1793564907000);
    fireEvent.click(within(row).getByTestId('psi-lists-mission-choose'));
    expect(missionWindowMark()).toBeNull();
  });
  it('opens what a daily note names: a sky event in the Psi panel, the lists closing for it', () => {
    kit.fixtures = [
      note('psi_brief', 'psi-brief-2026-11-09', [['title', 'Psi Watch, Mon 9 Nov 2026'], ['a', `31923:${KEY}:psi-sky-aspect-Moon_Mars`]], 'Sky, next 72 h\nMoon square Mars.'),
      { family: 'psi_sky_event', event: { kind: 31923, pubkey: KEY, created_at: 1, content: '', tags: [['d', 'psi-sky-aspect-Moon_Mars'], ['title', 'Moon square Mars'], ['window', '10', '20', '30'], ['exact', '20']] } },
    ];
    act(() => openPsiLists('notes'));
    render(<PsiListsPanel />);
    const points = screen.getByTestId('psi-lists-note-points');
    expect(points).toHaveTextContent('It namesMoon square MarsOpen');
    fireEvent.click(within(points).getByTestId('psi-lists-open-sky'));
    expect(getPsiLinesState().opened).toBe(`31923:${KEY}:psi-sky-aspect-Moon_Mars`);
    expect(psiLists().open).toBe(false);
  });
});
