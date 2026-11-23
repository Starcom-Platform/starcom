/**
 * Mecha Jono's field missions in the Missions app (decision D-HW, HW7: read-only first). They arrive as
 * Mission Packages from The Record and were listed with the rest, each ask offering "Take this on" and
 * its safety limits printed as "not to: Work in pairs…", which says the opposite of a rule to keep.
 * The limits said once, as what they are. Since D-MF (MF7–MF10) it is taken whole, its safety limits agreed
 * first and kept at the head of its checklist, on this device only.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ReceivedPackagesPanel } from '../ReceivedPackagesPanel';
import { takenMissions } from '../../../../services/intel/received/takenMissions';

vi.mock('../../../../services/intel/useMissionLabels', () => ({
  useMissionLabels: () => ({ claims: () => [], answered: false }),
}));
vi.mock('../../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));
vi.mock('../../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
vi.mock('../../../../services/reviews/reviewBroadcast', () => ({ fetchReviews: async () => [] }));
import type { ReceivedPackages } from '../../../../services/intel/useReceivedPackages';
import type { AcceptedPackage } from '../../../../services/intel/MissionPackageIngest';
import type { PackageManifest } from '../../../../services/exchange/types';
import { takenAsks } from '../../../../services/intel/received/takenAsks';
import { resetAge, setAgeAnswer } from '../../../../services/identity/ageAnswer';
import { agreeToWarning, resetAdventures } from '../../../../services/roster/adventure';

const SIGNER = '6301c4d0b1f3a2e4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809192a9692';
const LIMITS = 'Work in pairs. Never confront anyone, enter private property or take anyone\'s personal details. Look after yourself first. '
  + 'If someone is unresponsive, call 911 first, then give naloxone and stay with them.';

const fieldMission = (over: Partial<PackageManifest> = {}, tags: string[][] = [['t', 'starcom_mission_package'], ['t', 'field_mission'], ['jurisdiction', 'us-nm']]): AcceptedPackage => ({
  event: { id: 'evt-fm', pubkey: SIGNER, created_at: 1, kind: 30079, tags: [['d', 'starcom_mission_package_field-naloxone-NM'], ...tags], content: '', sig: '' } as AcceptedPackage['event'],
  check: {
    ok: true,
    manifest: {
      id: 'field:naloxone:NM', name: 'Carry naloxone in New Mexico: overdose deaths up 28.1% in a year', version: '1.0.0',
      description: 'MISSION: Put naloxone in more pockets and first-aid kits in New Mexico.', visibility: 'public',
      createdAt: '2026-10-02T06:01:00.000Z', author: 'Mecha Jono', license: 'CC-BY-4.0' as PackageManifest['license'],
      reports: [], intel: [], assets: [],
      objectives: [
        { id: 'a', ask: 'Get naloxone: most pharmacies sell it without a prescription.', effortMinutes: 30, for: 'the people the mission serves', limits: [LIMITS], done: false },
        { id: 'b', ask: 'Learn to use it, then teach one friend.', effortMinutes: 10, limits: [LIMITS], done: false },
      ],
      metadata: { mechaJono: { family: 'naloxone', state: 'open', format: { limits: LIMITS } } },
      ...over,
    } as PackageManifest,
  },
  relay: 'wss://record.cosmiccodex.app',
});

const received = (pkg: AcceptedPackage): ReceivedPackages => ({
  accepted: [pkg], refused: [], counters: { seen: 1, accepted: 1, refused: 0, refusedBy: {} }, publishers: [{ pubkey: SIGNER, accepted: 1, refused: 0 }],
});

// Someone 18 or over who has agreed to the warning, unless a test says otherwise: the gate is tested below.
beforeEach(() => { takenAsks.reset(); takenMissions.reset(); resetAge(); resetAdventures(); setAgeAnswer('18_plus'); agreeToWarning(); });

describe('a field mission in the Missions app', () => {
  it('says its safety limits once, as limits, and every ask without "not to"', () => {
    render(<ReceivedPackagesPanel received={received(fieldMission())} />);
    fireEvent.click(within(screen.getAllByTestId('received-package-row')[0]).getByTestId('mission-card-open'));
    const detail = screen.getByTestId('received-package-detail');
    expect(within(detail).getByTestId('received-safety-limits').textContent).toBe(LIMITS);
    expect(detail.textContent!.split('Work in pairs')).toHaveLength(2);
    expect(detail.textContent).not.toContain('not to:');
    const asks = screen.getAllByTestId('received-ask');
    expect(asks[0].textContent).toContain('about 30 min');
  });

  it('is taken whole once its safety limits are agreed, and says its counts can be reported back', () => {
    const counted = fieldMission({ metadata: { mechaJono: { family: 'naloxone', state: 'open', format: { limits: LIMITS, effect: ['Naloxone kits carried or placed: a count.'] } } } } as Partial<PackageManifest>);
    render(<ReceivedPackagesPanel received={received(counted)} />);
    fireEvent.click(within(screen.getAllByTestId('received-package-row')[0]).getByTestId('mission-card-open'));
    const detail = screen.getByTestId('received-package-detail');
    expect(within(detail).queryByRole('button', { name: 'Take this on' })).toBeNull();
    expect(within(detail).getByTestId('mission-take').textContent).toContain('Kept on this device; nobody is told. The counts it asks for can be reported back, sealed to its publisher, through the publish review.');
    fireEvent.click(within(detail).getByTestId('mission-take-button'));
    const asked = screen.getByTestId('mission-take-limits-dialog');
    expect(asked.textContent).toContain('Its safety limits');
    expect(screen.getByTestId('mission-take-limits').textContent).toBe(LIMITS);
    fireEvent.click(screen.getByTestId('mission-take-agree'));
    expect(takenMissions.all()).toMatchObject([{ where: 'field', limits: LIMITS, counts: [{ id: 'naloxone-kits-carried-or-placed', label: 'Naloxone kits carried or placed' }] }]);
  });

  // A field mission passes the same gate as a field trial (D-RS, RS47; the legal review of 2026-10-17).
  it('asks how old, and the warning, before a field mission can be taken; a parent for 13 to 17', () => {
    resetAge();
    resetAdventures();
    render(<ReceivedPackagesPanel received={received(fieldMission())} />);
    fireEvent.click(within(screen.getAllByTestId('received-package-row')[0]).getByTestId('mission-card-open'));
    const detail = screen.getByTestId('received-package-detail');
    expect(within(detail).getByTestId('age-question')).toBeTruthy();
    expect(within(detail).queryByTestId('mission-take')).toBeNull();
    fireEvent.click(within(detail).getByLabelText('16 to 17'));
    fireEvent.click(within(detail).getByRole('button', { name: 'Keep my answer' }));
    fireEvent.click(within(detail).getByRole('checkbox', { name: 'I have read this. I go at my own risk, and I agree to the release above.' }));
    fireEvent.click(within(detail).getByRole('button', { name: 'Go on' }));
    expect(within(detail).queryByTestId('mission-take')).toBeNull();
    fireEvent.click(within(detail).getByRole('checkbox', { name: 'I am going with my parent or guardian, or an adult they have authorised, in daylight' }));
    expect(within(detail).getByTestId('mission-take')).toBeTruthy();
  });

  it('offers no reporting back when it names no counts', () => {
    render(<ReceivedPackagesPanel received={received(fieldMission())} />);
    fireEvent.click(within(screen.getAllByTestId('received-package-row')[0]).getByTestId('mission-card-open'));
    expect(screen.getByTestId('mission-take').textContent).toContain('Kept on this device; nobody is told.');
    expect(screen.getByTestId('mission-take').textContent).not.toContain('reported back');
  });

  it('gathers its limits from its asks when the package states none of its own', () => {
    const asksOnly = fieldMission({ metadata: { mechaJono: { family: 'naloxone', state: 'open' } } } as Partial<PackageManifest>);
    render(<ReceivedPackagesPanel received={received(asksOnly)} />);
    fireEvent.click(within(screen.getAllByTestId('received-package-row')[0]).getByTestId('mission-card-open'));
    expect(screen.getByTestId('received-safety-limits').textContent).toBe(LIMITS);
  });

  it('says the package\'s own limits before any ask\'s, where both are stated', () => {
    const own = fieldMission({ metadata: { mechaJono: { family: 'naloxone', state: 'open', format: { limits: 'Work in pairs. Stay in public places.' } } } } as Partial<PackageManifest>);
    render(<ReceivedPackagesPanel received={received(own)} />);
    fireEvent.click(within(screen.getAllByTestId('received-package-row')[0]).getByTestId('mission-card-open'));
    expect(screen.getByTestId('received-safety-limits').textContent).toBe('Work in pairs. Stay in public places.');
  });

  it('leaves another node\'s package as it was: taken on here, its limits as what not to do', () => {
    const other = fieldMission({ objectives: [{ id: 'o', ask: 'Photograph the cranes', limits: ['stay outside the fence'], done: false }] }, [['t', 'starcom_mission_package']]);
    render(<ReceivedPackagesPanel received={received(other)} />);
    fireEvent.click(within(screen.getAllByTestId('received-package-row')[0]).getByTestId('mission-card-open'));
    expect(screen.getByTestId('received-ask').textContent).toContain('not to: stay outside the fence');
    expect(screen.queryByRole('button', { name: 'Take this on' })).toBeNull();
    expect(screen.getByTestId('mission-take-button')).toBeTruthy();
    expect(screen.queryByTestId('received-field-mission')).toBeNull();
  });

  it('says an ask\'s limits that are whole sentences as limits, not as what not to do', () => {
    const sentences = fieldMission({ objectives: [{ id: 'o', ask: 'Check the list', limits: ['Work in pairs.', 'Never confront anyone.'], done: false }] }, [['t', 'starcom_mission_package']]);
    render(<ReceivedPackagesPanel received={received(sentences)} />);
    fireEvent.click(within(screen.getAllByTestId('received-package-row')[0]).getByTestId('mission-card-open'));
    expect(screen.getByTestId('received-ask').textContent).toContain('limits: Work in pairs. Never confront anyone.');
    expect(screen.getByTestId('received-ask').textContent).not.toContain('not to:');
  });
});
