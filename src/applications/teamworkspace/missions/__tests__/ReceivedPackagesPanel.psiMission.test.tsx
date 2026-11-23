/**
 * Psi Watch's missions in the Missions app (decision D-PW, PW91–PW93): listed apart under the one badge, each opening
 * the psi variant of the field mission's card, its window and where the cursor stands against it, its places and
 * sources, "Go to the peak" opening Psi Watch at it, and "Take this mission" kept on this device. The kit's sample is
 * said to be one, and offers nothing a key published.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import missionFixture from '../../../../services/psiWatch/kit-v0/fixtures/psi/psi_mission_package.json';
import windowFixture from '../../../../services/psiWatch/kit-v0/fixtures/psi/psi_window.json';

const nav = vi.hoisted(() => ({ to: [] as string[], modes: [] as unknown[] }));
vi.mock('../../../../services/intel/useMissionLabels', () => ({
  useMissionLabels: () => ({ claims: () => [], answered: false }),
}));
vi.mock('../../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: (app: string) => { nav.to.push(app); } }) }));
vi.mock('../../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
vi.mock('../../../../services/reviews/reviewBroadcast', () => ({ fetchReviews: async () => [] }));
vi.mock('../../../../context/VisualizationModeContext', async (original) => ({
  ...(await original<object>()),
  useVisualizationModeOptional: () => ({ setVisualizationMode: (mode: unknown) => { nav.modes.push(mode); } }),
}));
const kit = vi.hoisted(() => ({ fixtures: [] as unknown[] }));
vi.mock('../../../../components/PsiWatch/usePsiKit', () => ({ usePsiKit: () => ({ fixtures: kit.fixtures, status: 'ready' }) }));

import { ReceivedPackagesPanel } from '../ReceivedPackagesPanel';
import type { ReceivedPackages } from '../../../../services/intel/useReceivedPackages';
import { takenMissions } from '../../../../services/intel/received/takenMissions';
import { missionWindowMark, resetMissionWindowMarkForTests } from '../../../../features/psi/missionWindowMark';
import { psiLists, resetPsiListsForTests } from '../../../../features/psi/psiListsPanel';

const NOTHING: ReceivedPackages = { accepted: [], refused: [], counters: { seen: 0, accepted: 0, refused: 0, refusedBy: {} }, publishers: [] };
const ADDRESS = `30079:${missionFixture.event.pubkey}:psi_mission_package_focus-fixture`;

beforeEach(() => {
  kit.fixtures = [
    { ...missionFixture, family: 'psi_mission_package', file: 'psi_mission_package.json' },
    { ...windowFixture, family: 'psi_window', file: 'psi_window.json' },
  ];
  nav.to = []; nav.modes = [];
  takenMissions.reset();
  resetMissionWindowMarkForTests();
  resetPsiListsForTests();
  window.sessionStorage.clear();
});

const openTheCard = async () => {
  render(<ReceivedPackagesPanel received={NOTHING} />);
  const row = await screen.findByTestId('received-psi-mission');
  fireEvent.click(within(row).getByRole('button', { name: 'Open' }));
  return screen.getByTestId('received-package-detail');
};

describe('a psi mission in the Missions app', () => {
  it('is listed apart, under the one badge, with its window, while nothing else has arrived', async () => {
    render(<ReceivedPackagesPanel received={NOTHING} />);
    const list = await screen.findByTestId('received-psi-missions');
    expect(within(list).getByText('Experimental')).toBeInTheDocument();
    expect(within(list).getByText('Psi Watch focus window (FIXTURE)')).toBeInTheDocument();
    expect(list).toHaveTextContent('Its window: 1 Nov 2026 14:54Z to 2 Nov 2026 02:03Z, peak 1 Nov 2026 20:28Z');
  });

  it("opens the psi variant of the card: the badge, its window and places, its asks, and that it is the kit's sample", async () => {
    const detail = await openTheCard();
    expect(within(detail).getByTestId('received-psi-badge')).toHaveTextContent('Experimental');
    const facts = within(detail).getByTestId('psi-mission-facts');
    expect(facts).toHaveTextContent('In Sahel Zone');
    expect(facts).toHaveTextContent('Computed with skyfield 1.54');
    expect(facts).toHaveTextContent('Registration: none named');
    expect(within(detail).getByTestId('received-asks')).toHaveTextContent('Note what you see in the window, and when');
    // Said once, where the card says who signed it.
    expect(detail.textContent!.split('A sample from the build kit: invented, and not signed.')).toHaveLength(2);
    expect(within(detail).queryByRole('button', { name: 'Show what this key published' })).toBeNull();
    // Its window is marked on the time bar while the card is open (PW92).
    expect(missionWindowMark()).toMatchObject({ key: ADDRESS, peakMs: 1793564907000 });
  });

  it('goes to the peak in Psi Watch, at this mission in the Lists', async () => {
    const detail = await openTheCard();
    fireEvent.click(within(detail).getByTestId('psi-mission-go-to-peak'));
    expect(nav.modes).toEqual([{ mode: 'PsiWatch', subMode: 'PsiWindows' }]);
    expect(nav.to).toEqual(['cybercommand']);
    expect(psiLists()).toMatchObject({ open: true, tab: 'missions', mission: ADDRESS });
    await waitFor(() => expect(screen.queryByTestId('received-package-detail')).toBeNull());
  });

  it('is taken on and kept here with its window, which the taken list states (PW93)', async () => {
    const detail = await openTheCard();
    // It states no safety limits, so it is taken at once.
    act(() => { fireEvent.click(within(detail).getByTestId('mission-take-button')); });
    const taken = takenMissions.all().find((m) => m.title === 'Psi Watch focus window (FIXTURE)');
    expect(taken?.psiWindow).toEqual({ fromMs: 1793544872000, peakMs: 1793564907000, untilMs: 1793585037000 });
  });

  it('shows none with ?psi=off', async () => {
    window.sessionStorage.setItem('starcom:psi-off', '1');
    const { container } = render(<ReceivedPackagesPanel received={NOTHING} />);
    await act(async () => { await Promise.resolve(); });
    expect(container).toBeEmptyDOMElement();
  });
});
