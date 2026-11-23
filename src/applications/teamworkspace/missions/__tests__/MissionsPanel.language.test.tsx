/**
 * The Missions screen in the language chosen (decision D-ML, L3): its heading, each card's counts by the
 * language's own plural rules, and the mission's page, down to its activity said in words rather than codes.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MissionsPanel } from '../MissionsPanel';
import { missionService } from '../../../../services/intel/MissionService';
import { setLanguage } from '../../../../i18n/app/i18n';

vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
vi.mock('../../../../services/intel/useReceivedPackages', () => ({
  useReceivedPackages: () => ({ accepted: [], refused: [], counters: { seen: 0, accepted: 0, refused: 0, refusedBy: {} }, publishers: [] }),
}));

afterEach(async () => { await setLanguage('en', false); });

describe('The Missions screen, in another language', () => {
  it('speaks Ukrainian: the heading, a card counted by its plural rules, and the mission page', async () => {
    const mission = await missionService.createMission({
      title: `Міст ${Date.now()}`, briefing: 'Body', visibility: 'limited', objectives: ['Оглянути', 'Сфотографувати'],
    });
    await setLanguage('uk', false);
    render(<MissionsPanel teamMembers={[]} selectMissionId={mission.id} />);

    expect(await screen.findByRole('heading', { name: 'Місії' })).toBeTruthy();
    // The heading draws at once, the list once it has loaded: wait for the row, which under load came late.
    expect((await screen.findByTestId(`open-mission-${mission.id}`)).textContent).toMatch(/2 цілі · 0 звітів за нею · 0 справ/);

    const detail = await screen.findByTestId('mission-detail-dialog');
    expect(within(detail).getByText('Пов’язані звіти розвідданих')).toBeTruthy();
    expect(within(detail).getByRole('button', { name: 'Видалити місію' })).toBeTruthy();
    expect(within(detail).getAllByText('Створено').length).toBeGreaterThan(0);
  });

  it('says its activity in English words, not codes', async () => {
    const mission = await missionService.createMission({ title: `Bridge ${Date.now()}`, briefing: 'Body', visibility: 'limited' });
    render(<MissionsPanel teamMembers={[]} selectMissionId={mission.id} />);
    const detail = await screen.findByTestId('mission-detail-dialog');
    expect(within(detail).getAllByText('Created').length).toBeGreaterThan(0);
    expect(within(detail).queryByText('CREATED')).toBeNull();
  });
});
