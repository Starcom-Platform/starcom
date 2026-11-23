/**
 * A received package on the globe (plan item 9.14, decision G6): the reports
 * it cites, and, beside it, everything its signer published, labelled as that.
 * Starcom's own packages cite nothing (D1), so the first is offered only for a
 * package that cites something.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ReceivedPackagesPanel } from '../ReceivedPackagesPanel';
import type { ReceivedPackages } from '../../../../services/intel/useReceivedPackages';
import type { AcceptedPackage } from '../../../../services/intel/MissionPackageIngest';
import type { PackageManifest } from '../../../../services/exchange/types';

// NavCom's labels are read from relays; none are reached from here.
vi.mock('../../../../services/intel/useMissionLabels', () => ({
  useMissionLabels: () => ({ claims: () => [], answered: false }),
}));
vi.mock('../../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));
vi.mock('../../../../services/reviews/reviewBroadcast', () => ({ fetchReviews: async () => [] }));
const showOnGlobe = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => showOnGlobe }));

const SIGNER = 'a'.repeat(64);
const manifest = (over: Partial<PackageManifest> = {}): PackageManifest => ({
  id: 'pkg-1', name: 'Harm reduction at Nova', version: '1.0.0', description: 'Two alerts.', visibility: 'public',
  createdAt: '2026-09-28T21:24:00.000Z', author: 'Mecha Jono', license: 'CC-BY' as PackageManifest['license'],
  reports: [{ id: 'ic-ein-1', title: 'Vienna alert', checksum: 'abc' }, { id: 'ic-ein-2', title: 'Lisbon alert', checksum: 'def' }],
  intel: [], assets: [], metadata: {}, ...over,
});
const received = (m: PackageManifest): ReceivedPackages => ({
  accepted: [{
    event: { id: 'evt-1', pubkey: SIGNER, created_at: 1, kind: 30079, tags: [], content: '', sig: '' } as AcceptedPackage['event'],
    check: { ok: true, manifest: m },
    relay: 'wss://record.cosmiccodex.app',
  }],
  refused: [], counters: { seen: 1, accepted: 1, refused: 0, refusedBy: {} }, publishers: [],
});

const open = (m: PackageManifest) => {
  render(<ReceivedPackagesPanel received={received(m)} />);
  fireEvent.click(within(screen.getByTestId('received-package-row')).getByTestId('mission-card-open'));
  return screen.getByTestId('received-package-detail');
};

beforeEach(() => { showOnGlobe.mockClear(); });

describe('a received package, on the globe', () => {
  it('shows the reports it cites, as its signer names them', () => {
    const detail = open(manifest());
    fireEvent.click(within(detail).getByRole('button', { name: 'Show what it cites on the globe' }));
    expect(showOnGlobe).toHaveBeenCalledWith({
      kind: 'package', id: 'evt-1', signer: SIGNER, name: 'Harm reduction at Nova', cites: ['ic-ein-1', 'ic-ein-2'],
    });
  });

  it('offers what its signer published, labelled as that', () => {
    const detail = open(manifest());
    fireEvent.click(within(detail).getByRole('button', { name: 'Show what this key published' }));
    expect(showOnGlobe).toHaveBeenCalledWith({ kind: 'publisher', id: SIGNER });
  });

  it('offers no citations to show for a package that cites nothing, and still what its key published', () => {
    const detail = open(manifest({ reports: [] }));
    expect(within(detail).queryByRole('button', { name: 'Show what it cites on the globe' })).toBeNull();
    expect(within(detail).getByRole('button', { name: 'Show what this key published' })).toBeTruthy();
  });
});
