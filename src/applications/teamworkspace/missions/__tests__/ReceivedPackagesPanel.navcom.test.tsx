/**
 * What a received package states to NavCom, and who has publicly taken it up
 * (D-MX: MX1, MX2): its signed profile or its tags, in words, and the public
 * claims NavCom's labels carry, beside the package and in it.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ReceivedPackagesPanel } from '../ReceivedPackagesPanel';
import type { ReceivedPackages } from '../../../../services/intel/useReceivedPackages';
import type { AcceptedPackage } from '../../../../services/intel/MissionPackageIngest';
import type { PackageManifest } from '../../../../services/exchange/types';

vi.mock('../../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));
vi.mock('../../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
vi.mock('../../../../services/reviews/reviewBroadcast', () => ({ fetchReviews: async () => [] }));
const labels = vi.hoisted(() => ({ claims: new Map<string, Array<{ pubkey: string; at: number; agent?: string }>>(), answered: true }));
vi.mock('../../../../services/intel/useMissionLabels', () => ({
  useMissionLabels: () => ({ claims: (c: string) => labels.claims.get(c) ?? [], answered: labels.answered }),
}));

const SIGNER = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const D = 'starcom_mission_package_field-heat_relief';
const COORD = `30079:${SIGNER}:${D}`;
const END = Date.parse('2026-11-30T23:59:59Z') / 1000;

const manifest = (over: Partial<PackageManifest> = {}): PackageManifest => ({
  id: 'field-heat_relief', name: 'Heat relief', version: '0.1.0', description: 'Cooling centres across the state.',
  visibility: 'public', createdAt: '2026-10-06T12:00:00.000Z', author: 'Mecha Jono', license: 'CC-BY' as PackageManifest['license'],
  reports: [], intel: [], assets: [], metadata: {}, ...over,
});

const accepted = (tags: string[][], over: Partial<PackageManifest> = {}): AcceptedPackage => ({
  event: { id: 'evt-1', pubkey: SIGNER, created_at: 1, kind: 30079, tags: [['d', D], ['t', 'starcom_mission_package'], ...tags], content: '', sig: '' } as AcceptedPackage['event'],
  check: { ok: true, manifest: manifest(over) },
  relay: 'wss://record.cosmiccodex.app',
});

const received = (pkg: AcceptedPackage): ReceivedPackages => ({
  accepted: [pkg], refused: [],
  counters: { seen: 1, accepted: 1, refused: 0, refusedBy: {} },
  publishers: [{ pubkey: SIGNER, accepted: 1, refused: 0 }],
});

const FIELD_TAGS = [['mission_state', 'open'], ['claims', 'many'], ['t', 'navcom_mission'], ['valid_until', String(END)], ['jurisdiction', 'us-ca'], ['agent', 'mecha_jono']];

describe('ReceivedPackagesPanel, for NavCom', () => {
  it('says what a package states to NavCom, from its tags, and its public claims, beside it and in it', () => {
    labels.claims.set(COORD, [{ pubkey: 'c'.repeat(64), at: 1 }]);
    render(<ReceivedPackagesPanel received={received(accepted(FIELD_TAGS))} />);
    expect(within(screen.getByTestId('received-package-row')).getByTestId('mission-card-claims').textContent).toBe('1 public claim');

    fireEvent.click(within(screen.getByTestId('received-package-row')).getByTestId('mission-card-open'));
    expect(screen.getByTestId('received-profile').textContent)
      .toBe('Open · anybody joins · field work in us-ca until 30 Nov 2026 23:59Z · posted by an agent, mecha_jono');
    expect(screen.getByTestId('received-claims').textContent).toMatch(/^1 public claim: /);
    labels.claims.clear();
  });

  it('reads the signed profile when the package carries one', () => {
    render(<ReceivedPackagesPanel received={received(accepted(FIELD_TAGS, { profile: { missionState: 'closed', claims: 'many' } }))} />);
    // Closed by its signed profile, so its card is behind the button that shows the closed.
    expect(screen.queryByTestId('received-package-row')).toBeNull();
    fireEvent.click(screen.getByTestId('mission-cards-closed'));
    fireEvent.click(within(screen.getByTestId('received-package-row')).getByTestId('mission-card-open'));
    expect(screen.getByTestId('received-profile').textContent).toBe('Closed · anybody joins');
  });

  it('states nothing for a package that states nothing, and says no claims were seen once relays answered', () => {
    render(<ReceivedPackagesPanel received={received(accepted([]))} />);
    expect(within(screen.getByTestId('received-package-row')).queryByTestId('mission-card-claims')).toBeNull();
    fireEvent.click(within(screen.getByTestId('received-package-row')).getByTestId('mission-card-open'));
    expect(screen.queryByTestId('received-profile')).toBeNull();
    expect(screen.getByTestId('received-claims').textContent).toBe('No public claims seen on the relays read.');
  });
});

// Keeps the JSX runtime import used under the project's lint rules.
void React;
