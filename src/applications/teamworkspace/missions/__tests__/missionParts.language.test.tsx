/**
 * The Missions sub-panels in the language chosen (decision D-ML, L3): a package received from another node,
 * counted and dated as the language does it; an objective's limits counted by its plural rules; and what a
 * package states to NavCom, said in the language's words.
 */
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ReceivedPackages } from '../../../../services/intel/useReceivedPackages';
import type { AcceptedPackage } from '../../../../services/intel/MissionPackageIngest';
import type { PackageManifest } from '../../../../services/exchange/types';
import { messagesNow, setLanguage } from '../../../../i18n/app/i18n';

vi.mock('../../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));
vi.mock('../../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
vi.mock('../../../../services/reviews/reviewBroadcast', () => ({ fetchReviews: async () => [] }));
vi.mock('../../../../services/intel/useMissionLabels', () => ({ useMissionLabels: () => ({ claims: () => [], answered: true }) }));

import { ReceivedPackagesPanel } from '../ReceivedPackagesPanel';
import { MissionObjectives } from '../MissionObjectives';
import { profileWords } from '../../../../services/intel/packageProfile';

afterEach(async () => { await setLanguage('en', false); });

const SIGNER = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const stated = Date.UTC(2026, 9, 6, 12);
const manifest: PackageManifest = {
  id: 'heat', name: 'Heat relief', version: '0.1.0', description: 'Cooling centres across the state.',
  visibility: 'public', createdAt: new Date(stated).toISOString(), author: 'Mecha Jono', license: 'CC-BY' as PackageManifest['license'],
  reports: [], intel: [], assets: [], metadata: {},
};
const received: ReceivedPackages = {
  accepted: [{
    event: { id: 'evt-1', pubkey: SIGNER, created_at: 1, kind: 30079, tags: [['d', 'starcom_mission_package_heat']], content: '', sig: '' } as AcceptedPackage['event'],
    check: { ok: true, manifest },
    relay: 'wss://record.cosmiccodex.app',
  }],
  refused: [],
  counters: { seen: 3, accepted: 1, refused: 2, refusedBy: { 'bad-signature': 2 } },
  publishers: [{ pubkey: SIGNER, accepted: 1, refused: 0 }],
};
const day = (lang: string, ms: number) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(ms);

describe('The Missions sub-panels, in another language', () => {
  it('says in German how many missions are open, where, what could not be verified, and when the sender says it was published', async () => {
    await setLanguage('de', false);
    render(<ReceivedPackagesPanel received={received} />);
    expect(screen.getByTestId('received-packages').textContent).toMatch(/^1 Mission jetzt offen · 0 am Schreibtisch · 0 im Feldeinsatz/);
    expect(screen.getByTestId('mission-cards-unverified').textContent).toBe('2 ließen sich nicht prüfen');
    expect(screen.getByTestId('received-package-row').textContent).toContain(`angegeben ${day('de', stated)} 12:00Z`);
    fireEvent.click(within(screen.getByTestId('received-package-row')).getByTestId('mission-card-open'));
    expect(screen.getByText('Ein Paket, das ein anderer Knoten veröffentlicht hat. Kein Eintrag in diesem Arbeitsbereich.')).toBeTruthy();
  });

  it("counts an objective's limits in Ukrainian by its own plural rules", async () => {
    await setLanguage('uk', false);
    render(<MissionObjectives busy={false} onToggle={() => {}} onRemove={() => {}} onPatch={() => {}}
      objectives={[{ id: 'o1', description: 'Оглянути міст', completed: false, limits: ['a', 'b', 'c', 'd', 'e'] }]} />);
    expect(screen.getByText('5 обмежень')).toBeTruthy();
    expect(screen.getByText('ніхто не взяв')).toBeTruthy();
  });

  it('says what a package states to NavCom in Portuguese, and in English as before', async () => {
    const profile = { missionState: 'open' as const, claims: 'one' as const };
    expect(profileWords(profile)).toBe('Open · one person takes it');
    await setLanguage('pt-BR', false);
    expect(profileWords(profile, 'pt-BR', messagesNow().missionParts.profile)).toBe('Aberta · uma pessoa a assume');
  });
});
