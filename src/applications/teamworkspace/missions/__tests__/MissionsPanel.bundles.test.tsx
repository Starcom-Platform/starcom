/**
 * Where bundles meet the Missions panel (plan item 2.4, slice c): a mission
 * says who it came from and can be exported as a file, and "Import bundle"
 * sits beside "New Mission".
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MissionsPanel } from '../MissionsPanel';
import { missionService } from '../../../../services/intel/MissionService';
import { intelWorkspaceManager } from '../../../../services/intel/IntelWorkspaceManager';

vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
vi.mock('../../../../services/intel/useReceivedPackages', () => ({
  useReceivedPackages: () => ({ accepted: [], refused: [], counters: { seen: 0, accepted: 0, refused: 0, refusedBy: {} }, publishers: [] }),
}));

const PRIYA = 'c'.repeat(64);

describe('MissionsPanel — bundles', () => {
  it('shows who a received mission came from, and offers to export it as a file', async () => {
    const mission = await missionService.createMission({ title: `Received ${Date.now()}`, briefing: 'Body' });
    const stored = intelWorkspaceManager.getMission(mission.id)!;
    await intelWorkspaceManager.putFromBundle('mission', { ...stored, receivedFrom: { pubkey: PRIYA, sentAt: '2026-09-27T14:00:00.000Z' } } as unknown as Record<string, unknown>);
    render(<MissionsPanel teamMembers={[]} selectMissionId={mission.id} />);

    const dialog = await screen.findByTestId('mission-detail-dialog');
    expect(within(dialog).getByTestId('received-from').textContent).toMatch(/^From .+, 27 Sep 2026/);
    expect(within(dialog).getByRole('button', { name: 'Export as file' })).toBeTruthy();
  });

  it('opens the import beside New Mission', async () => {
    render(<MissionsPanel teamMembers={[]} />);
    fireEvent.click(await screen.findByTestId('import-bundle'));
    expect(await screen.findByTestId('import-bundle-dialog')).toBeTruthy();
  });
});
