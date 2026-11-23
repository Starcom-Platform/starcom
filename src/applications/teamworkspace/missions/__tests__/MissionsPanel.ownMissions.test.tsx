/**
 * A person's own missions, under the ones received (decision D-MF, MF1). With missions open on the network
 * and none of one's own, the screen said "No missions yet": a first visit read that under 85 of them.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReceivedPackages } from '../../../../services/intel/useReceivedPackages';
import { MissionsPanel } from '../MissionsPanel';

const received = vi.hoisted(() => ({ current: null as unknown as ReceivedPackages }));

vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
vi.mock('../../../../services/intel/useReceivedPackages', () => ({ useReceivedPackages: () => received.current }));

const NONE: ReceivedPackages = { accepted: [], refused: [], counters: { seen: 0, accepted: 0, refused: 0, refusedBy: {} }, publishers: [] };
const ONE: ReceivedPackages = {
  accepted: [{
    event: { id: 'evt-1', pubkey: 'e'.repeat(64), created_at: 1, kind: 30079, tags: [['d', 'starcom_mission_package_naloxone']], content: '', sig: '' },
    check: {
      ok: true,
      manifest: {
        id: 'naloxone', name: 'Carry naloxone in New Mexico', version: '1.0.0', description: 'MISSION: Put naloxone in more pockets.',
        visibility: 'public', createdAt: '2026-10-16T09:00:00Z', author: 'Mecha Jono', license: 'CC-BY-4.0',
        reports: [], intel: [], assets: [], metadata: {},
      },
    },
    relay: 'wss://record.cosmiccodex.app',
  }],
  refused: [],
  counters: { seen: 1, accepted: 1, refused: 0, refusedBy: {} },
  publishers: [{ pubkey: 'e'.repeat(64), accepted: 1, refused: 0 }],
};

describe('MissionsPanel, a person\'s own missions', () => {
  it('heads them as theirs, and with none says where to start: the missions above, or a new one', async () => {
    received.current = ONE;
    render(<MissionsPanel teamMembers={[]} />);
    expect(screen.getByTestId('own-missions-heading').textContent).toBe('Your missions');
    expect(await screen.findByText('None of your own yet. See what to do on one above, or start one with New mission.')).toBeTruthy();
  });

  it('with nothing received, says no missions yet as before, under no heading', async () => {
    received.current = NONE;
    render(<MissionsPanel teamMembers={[]} />);
    expect(await screen.findByText('No missions yet. Build one from a case, or start one with New Mission.')).toBeTruthy();
    expect(screen.queryByTestId('own-missions-heading')).toBeNull();
  });
});
