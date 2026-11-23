/**
 * The mission card's field variant for a safety night (decision D-RR, RR2, RR3; Mecha Jono's kit 5.4): the kit's
 * sample only with ?rlsh=kit, standing as it stood at the cursor. The 911 card above everything; the state with its
 * age; the window in the place's zone; the score line; the three checklists coded P1…T1; the topics to look up; no
 * claim count; and after the window, the totals and who took part, hidden until it closes.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

const clock = vi.hoisted(() => ({ ms: Date.UTC(2026, 10, 11) }));
vi.mock('../../../../context/TemporalContext', async (original) => ({
  ...(await original<object>()),
  useTemporalStateOptional: () => ({ get currentTime() { return clock.ms; }, isLive: false, setCurrentTime: () => {} }),
}));
vi.mock('../../../../services/intel/useMissionLabels', () => ({ useMissionLabels: () => ({ claims: () => [], answered: false }) }));
vi.mock('../../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));
vi.mock('../../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
vi.mock('../../../../services/reviews/reviewBroadcast', () => ({ fetchReviews: async () => [] }));
// No relay is read in a test: the live windows' reader holds nothing.
const noLive = vi.hoisted(() => ({ notes: [] as unknown[] }));
vi.mock('../../../../services/rlsh/recurrence/liveRlsh', () => ({
  liveRlshNotes: () => noLive.notes, subscribeLiveRlsh: () => () => {}, startLiveRlsh: () => () => {},
}));

import { ReceivedPackagesPanel } from '../ReceivedPackagesPanel';
import type { ReceivedPackages } from '../../../../services/intel/useReceivedPackages';
import { takenMissions } from '../../../../services/intel/received/takenMissions';
import { resetAge, setAgeAnswer } from '../../../../services/identity/ageAnswer';
import { agreeToWarning, resetAdventures } from '../../../../services/roster/adventure';

const NOTHING: ReceivedPackages = { accepted: [], refused: [], counters: { seen: 0, accepted: 0, refused: 0, refusedBy: {} }, publishers: [] };

const openSample = async () => {
  render(<ReceivedPackagesPanel received={NOTHING} />);
  const row = await screen.findByTestId('received-rlsh-sample');
  fireEvent.click(within(row).getByRole('button', { name: 'Open' }));
  const detail = screen.getByTestId('received-package-detail');
  // The card reads the kit's notes for itself: its window note gives the score line once read.
  await within(detail).findByTestId('safety-night-score');
  return detail;
};

beforeEach(() => {
  window.sessionStorage.clear();
  window.sessionStorage.setItem('starcom:rlsh-kit-samples', '1');
  takenMissions.reset();
  // Someone 18 or over who has agreed to the field warning: the gate itself is tested with field missions.
  resetAge(); resetAdventures(); setAgeAnswer('18_plus'); agreeToWarning();
  clock.ms = Date.UTC(2026, 10, 11);
});

describe('a safety night in Missions', () => {
  it('shows nothing without ?rlsh=kit', async () => {
    window.sessionStorage.clear();
    const { container } = render(<ReceivedPackagesPanel received={NOTHING} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });

  it('before the night: the 911 card first, armed, the window in New York time, three coded checklists, the topics, no claims', async () => {
    const detail = await openSample();
    const call = within(detail).getByTestId('safety-night-911');
    expect(call).toHaveTextContent('Someone hurt or in danger? Call 911.This is not an emergency service.');
    // Above everything else in the card.
    expect(call.compareDocumentPosition(within(detail).getByTestId('safety-night-top')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(detail).getByTestId('safety-night-state')).toHaveTextContent(/^Armed · Opens at Thu 10 Jun, 20:30 · As of Tue 8 Jun, 12:00$/);
    expect(within(detail).getByTestId('safety-night-top')).toHaveTextContent('Times shown in Eastern Daylight Time');
    expect(within(detail).getByTestId('safety-night-phase-before')).toHaveTextContent(/P1 · Read the Case/);
    expect(within(detail).getByTestId('safety-night-phase-night')).toHaveTextContent(/S2 · Call 911/);
    expect(within(detail).getByTestId('safety-night-phase-after')).toHaveTextContent(/T1 · /);
    expect(within(detail).getByTestId('safety-night-checks')).toHaveTextContent('Look this up for where you are:Face coverings in public');
    expect(within(detail).queryByTestId('received-claims')).toBeNull();
    expect(within(detail).queryByTestId('safety-night-after')).toBeNull();
    expect(within(detail).getByTestId('mission-take-button')).toBeInTheDocument();
    expect(detail).toHaveTextContent('A sample from the build kit: invented, and not signed.');
  });

  it('just after the window, before its ending: closed by the clock, and who took part not counted yet', async () => {
    clock.ms = 1_812_705_000_000;
    const detail = await openSample();
    expect(within(detail).getByTestId('safety-night-state')).toHaveTextContent(/^Closed · Closed: the window has passed\./);
    expect(within(detail).getByTestId('safety-night-coalition')).toHaveTextContent('Not counted yet.');
    expect(within(detail).queryByTestId('safety-night-totals')).toBeNull();
  });

  it('once the totals are in: the ending, nothing offered, the totals counts only, and who took part', async () => {
    clock.ms = 1_812_900_000_000;
    const detail = await openSample();
    expect(within(detail).getByTestId('safety-night-state')).toHaveTextContent(/^Closed · Its window has passed\./);
    expect(within(detail).queryByTestId('mission-take-button')).toBeNull();
    expect(within(detail).getByTestId('safety-night-checklists')).toHaveAttribute('aria-disabled', 'true');
    expect(within(detail).queryByTestId('safety-night-checks')).toBeNull();
    const totals = await within(detail).findByTestId('safety-night-totals');
    expect(totals).toHaveTextContent('Totals, as of 12 Jun 2027, from 3 settled reports');
    expect(totals).toHaveTextContent('Water bottles handed out: 212');
    expect(totals).toHaveTextContent('Counts only. Who reported is never shown.');
    expect(within(detail).getByTestId('safety-night-coalition')).toHaveTextContent('Taking part: 9');
    expect(within(detail).getByTestId('safety-night-coalition')).not.toHaveTextContent('Agents');
  });
  it("opens its Case: each night, every count on its own line with whose it is, never summed; the decisions; the settled answers", async () => {
    const detail = await openSample();
    fireEvent.click(within(detail).getByTestId('safety-night-case'));
    const view = screen.getByTestId('safety-night-case-view');
    const nights = within(view).getAllByTestId('safety-night-case-night');
    expect(nights).toHaveLength(10);
    expect(nights[0]).toHaveTextContent('1 May 2025 · First-round clinch, away (Detroit) · away');
    // Our own count, with its typical night and the link; an outlet's, as it reported it.
    expect(nights[0]).toHaveTextContent("16 EMS incidents dispatched with an injury call typeour count from FDNY's EMS dispatch records · typical 8 · Source");
    expect(view).toHaveTextContent('6 people arrestedthe NYPD, as CBS News New York reported it');
    expect(within(view).getAllByTestId('safety-night-case-count')).toHaveLength(38);
    expect(within(view).getByTestId('safety-night-case-decisions')).toHaveTextContent('Whose decision: the NYPD');
    expect(within(view).getAllByTestId('safety-night-case-answer')).toHaveLength(4);
    expect(within(view).getAllByTestId('safety-night-case-score')).toHaveLength(1);
    expect(view.textContent).not.toMatch(/RLSH|hero|patrol/i);
  });
});
