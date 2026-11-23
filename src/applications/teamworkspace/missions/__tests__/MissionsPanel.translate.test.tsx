/**
 * "Translate" beneath a comment someone left on a mission (D-ML, chat and captures). A comment is not
 * Public, so only this device translates it (ML6).
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import React from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MissionsPanel } from '../MissionsPanel';
import { missionService } from '../../../../services/intel/MissionService';

vi.mock('../../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));
vi.mock('../../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
vi.mock('../../../../services/intel/useReceivedPackages', () => ({
  useReceivedPackages: () => ({ accepted: [], refused: [], counters: { seen: 0, accepted: 0, refused: 0, refusedBy: {} }, publishers: [] }),
}));

beforeEach(() => {
  (globalThis as { Translator?: unknown }).Translator = { availability: async () => 'available', create: async () => ({ translate: async (t: string) => t }) };
});
afterEach(() => { delete (globalThis as { Translator?: unknown }).Translator; });

describe("MissionsPanel — someone's comment, translated here", () => {
  it('offers Translate beneath a comment in another language', async () => {
    const mission = await missionService.createMission({ title: `Brücke ${Date.now()}`, briefing: 'Body', visibility: 'limited' });
    await missionService.saveMission({
      ...mission,
      comments: [{ id: 'c-de', content: 'Der Fluss ist über Nacht um drei Meter gestiegen, und die Brücke ist gesperrt.', createdAt: new Date().toISOString(), createdBy: 'b'.repeat(64), mentions: [], attachments: [] }],
    });
    render(<MissionsPanel teamMembers={[]} selectMissionId={mission.id} />);
    const detail = await screen.findByTestId('mission-detail-dialog');
    expect(await within(detail).findByTestId('comment-translate-c-de')).toBeTruthy();
  });
});
