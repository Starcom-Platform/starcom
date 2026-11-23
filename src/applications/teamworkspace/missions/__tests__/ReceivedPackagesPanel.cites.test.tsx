/**
 * What a received package rests on (D-MX: MX3, MX23): the observations its
 * event cites, each as read here.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ReceivedPackages } from '../../../../services/intel/useReceivedPackages';
import type { AcceptedPackage } from '../../../../services/intel/MissionPackageIngest';
import type { PackageManifest } from '../../../../services/exchange/types';

vi.mock('../../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));
vi.mock('../../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
vi.mock('../../../../services/reviews/reviewBroadcast', () => ({ fetchReviews: async () => [] }));
vi.mock('../../../../services/intel/useMissionLabels', () => ({ useMissionLabels: () => ({ claims: () => [], answered: true }) }));
const lookUpCited = vi.hoisted(() => vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, null]))));
vi.mock('../../../../services/intel/observations/citedObservations', () => ({ lookUpCited }));

import { ReceivedPackagesPanel } from '../ReceivedPackagesPanel';

const SIGNER = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const A = 'a'.repeat(64);
const manifest: PackageManifest = {
  id: 'field-heat_relief', name: 'Heat relief', version: '0.1.0', description: 'Cooling centres across the state.',
  visibility: 'public', createdAt: '2026-10-06T12:00:00.000Z', author: 'Mecha Jono', license: 'CC-BY' as PackageManifest['license'],
  reports: [], intel: [], assets: [], metadata: {},
};
const received = (tags: string[][]): ReceivedPackages => ({
  accepted: [{
    event: { id: 'evt-1', pubkey: SIGNER, created_at: 1, kind: 30079, tags: [['d', 'starcom_mission_package_field-heat_relief'], ...tags], content: '', sig: '' } as AcceptedPackage['event'],
    check: { ok: true, manifest },
    relay: 'wss://record.cosmiccodex.app',
  }],
  refused: [],
  counters: { seen: 1, accepted: 1, refused: 0, refusedBy: {} },
  publishers: [{ pubkey: SIGNER, accepted: 1, refused: 0 }],
});

describe('ReceivedPackagesPanel: what a package rests on', () => {
  it('lists the observations its event cites', async () => {
    render(<ReceivedPackagesPanel received={received([['e', A, 'wss://somewhere-a-stranger-chose.example', 'cites']])} />);
    fireEvent.click(within(screen.getByTestId('received-package-row')).getByTestId('mission-card-open'));
    expect(screen.getByTestId('received-rests-on')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('cited-observation').textContent).toMatch(/^No relay Starcom reads holds this observation/));
    expect(lookUpCited).toHaveBeenCalledWith([A]);
  });

  it('says nothing of it for a package that cites nothing', () => {
    render(<ReceivedPackagesPanel received={received([['e', A, '', 'reply']])} />);
    fireEvent.click(within(screen.getByTestId('received-package-row')).getByTestId('mission-card-open'));
    expect(screen.queryByTestId('received-rests-on')).toBeNull();
  });
});

void React;
