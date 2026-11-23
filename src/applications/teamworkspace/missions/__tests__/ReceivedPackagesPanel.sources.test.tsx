/**
 * Where a received package's information was published (D-CT, CT2; Interchange 3.19): its event's
 * `r` tags in order, the first the original; for a package sent before 3.19, the source its
 * manifest names at `metadata.mechaJono.source.link`.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ReceivedPackages } from '../../../../services/intel/useReceivedPackages';
import type { AcceptedPackage } from '../../../../services/intel/MissionPackageIngest';
import type { PackageManifest } from '../../../../services/exchange/types';

vi.mock('../../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));
vi.mock('../../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
vi.mock('../../../../services/reviews/reviewBroadcast', () => ({ fetchReviews: async () => [] }));
vi.mock('../../../../services/intel/useMissionLabels', () => ({ useMissionLabels: () => ({ claims: () => [], answered: true }) }));

import { ReceivedPackagesPanel } from '../ReceivedPackagesPanel';

const SIGNER = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const manifestWith = (metadata: Record<string, unknown>): PackageManifest => ({
  id: 'field-recall', name: 'Check the recalled heaters', version: '0.1.0', description: 'A recall names a heater.',
  visibility: 'public', createdAt: '2026-10-16T12:00:00.000Z', author: 'publisher', license: 'CC-BY' as PackageManifest['license'],
  reports: [], intel: [], assets: [], metadata,
});
const received = (tags: string[][], metadata: Record<string, unknown> = {}): ReceivedPackages => ({
  accepted: [{
    event: { id: 'evt-1', pubkey: SIGNER, created_at: 1, kind: 30079, tags: [['d', 'starcom_mission_package_field-recall'], ...tags], content: '', sig: '' } as AcceptedPackage['event'],
    check: { ok: true, manifest: manifestWith(metadata) },
    relay: 'wss://record.cosmiccodex.app',
  }],
  refused: [],
  counters: { seen: 1, accepted: 1, refused: 0, refusedBy: {} },
  publishers: [{ pubkey: SIGNER, accepted: 1, refused: 0 }],
});
const openIt = (packages: ReceivedPackages) => {
  render(<ReceivedPackagesPanel received={packages} />);
  fireEvent.click(within(screen.getByTestId('received-package-row')).getByTestId('mission-card-open'));
};

describe('ReceivedPackagesPanel: its sources', () => {
  it("lists its event's r tags in order, the first the original", () => {
    openIt(received([['r', 'https://www.cpsc.gov/Recalls/2026/x'], ['r', 'https://www.saferproducts.gov/y'], ['r', 'javascript:alert(1)']]));
    const links = within(screen.getByTestId('received-sources')).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://www.cpsc.gov/Recalls/2026/x', 'https://www.saferproducts.gov/y']);
    expect(links.map((a) => a.getAttribute('rel'))).toEqual(['noopener noreferrer', 'noopener noreferrer']);
    expect(within(links[0].closest('li')!).getByText('Original source')).toBeTruthy();
  });

  it("falls back to the source its manifest names, when its event carries none", () => {
    openIt(received([], { mechaJono: { source: { name: 'rave_events', link: 'https://19hz.info' } } }));
    expect(within(screen.getByTestId('received-sources')).getByRole('link').getAttribute('href')).toBe('https://19hz.info/');
  });

  it('shows no sources for a package that names none', () => {
    openIt(received([], { mechaJono: { source: { link: 'javascript:alert(1)' } } }));
    expect(screen.queryByTestId('received-sources')).toBeNull();
  });
});

void React;
