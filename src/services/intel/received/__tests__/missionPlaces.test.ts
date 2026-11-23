/**
 * Missions on the globe, by place (decision D-MF, step 5; MF16–MF17). The fixtures keep the places Mecha Jono's
 * open packages named on The Record on 2026-10-16: a US state (naloxone in New Mexico), a US territory (disaster
 * volunteering in Guam), the US as a whole (scam shield), a state with areas inside it (heat relief in
 * California's forecast zones), and none (52 desk asks).
 */
import { describe, it, expect } from 'vitest';
import type { AcceptedPackage } from '../../MissionPackageIngest';
import { describeMissionsAt, missionsByPlace, missionsPillText, openMissionCards, placeCodeOf } from '../missionPlaces';

const PUBKEY = 'b'.repeat(64);
const NOW = Date.parse('2026-10-16T12:00:00Z');

function pkg(d: string, over: { metadata?: Record<string, unknown>; profile?: Record<string, unknown>; tags?: string[][]; visibility?: string; description?: string } = {}): AcceptedPackage {
  return {
    event: { id: d, pubkey: PUBKEY, created_at: 1_790_000_000, kind: 30079, tags: [['d', d], ['t', 'starcom_mission_package'], ...(over.tags ?? [['mission_state', 'open']])], content: '{}', sig: '' },
    check: {
      ok: true,
      manifest: {
        id: d, name: d, version: '1.0.0', description: over.description ?? `MISSION: ${d}.`, author: 'Mecha Jono', createdAt: '2026-10-16T00:00:00Z',
        license: 'CC-BY-4.0', visibility: over.visibility ?? 'public', reports: [], intel: [], assets: [], objectives: [],
        metadata: over.metadata ?? {}, ...(over.profile ? { profile: over.profile } : {}),
      },
    } as AcceptedPackage['check'],
    relay: 'wss://record.example',
  };
}

const naloxone = pkg('starcom_mission_package_field-naloxone-NM', {
  description: 'MISSION: Put naloxone in more pockets and first-aid kits in New Mexico.',
  profile: { fieldWork: { jurisdiction: 'us-nm' } },
  metadata: { mechaJono: { area: { country: 'us-nm', state: 'NM' }, format: { limits: 'Work in pairs. Never confront anyone.' } } },
});
const guam = pkg('starcom_mission_package_field-disaster_volunteer-fema-a', { metadata: { mechaJono: { area: { country: 'us', state: 'GU' } } } });
const scamShield = pkg('starcom_mission_package_field-scam_shield-2026-W42', { profile: { fieldWork: { jurisdiction: 'us' } } });
const heat = pkg('starcom_mission_package_field-heat_relief-CA-2026-10-15', {
  profile: { fieldWork: { jurisdiction: 'us-ca' } }, metadata: { mechaJono: { area: { country: 'us-ca', state: 'CA', areas: ['Malibu Coast', 'Orange County Coastal'] } } },
});
const advisory = pkg('starcom_mission_package_ic-icsa-26-272-05');
const grant = pkg('starcom_mission_package_grant-1', { tags: [['mission_state', 'open'], ['mission_family', 'grant']], profile: { fieldWork: { jurisdiction: 'us' } } });
const internal = pkg('starcom_mission_package_internal-1', { visibility: 'limited', profile: { fieldWork: { jurisdiction: 'us-nm' } } });
const closed = pkg('starcom_mission_package_field-naloxone-CO', { tags: [['mission_state', 'closed']], profile: { missionState: 'closed', fieldWork: { jurisdiction: 'us-co' } } });

const OUTLINES: Record<string, string> = { 'us-nm': 'New Mexico', 'us-ca': 'California', GU: 'Guam', US: 'United States' };
const outlineOf = (code: string) => (OUTLINES[code] ? { name: OUTLINES[code] } : null);

describe('openMissionCards', () => {
  it('shows what the Missions app shows open: public, no grant notice, not closed', () => {
    const keys = openMissionCards([naloxone, guam, scamShield, heat, advisory, grant, internal, closed], NOW).map((c) => c.pkg);
    expect(keys).toHaveLength(5);
    expect(keys).not.toContain(grant);
    expect(keys).not.toContain(internal);
    expect(keys).not.toContain(closed);
  });
});

describe('placeCodeOf', () => {
  it('draws a state as itself, a US territory as its own outline, and the US as the country', () => {
    const [n, g, s, h, a] = openMissionCards([naloxone, guam, scamShield, heat, advisory], NOW);
    expect([n, g, s, h, a].map(placeCodeOf)).toEqual(['us-nm', 'GU', 'US', 'us-ca', null]);
  });
});

describe('missionsByPlace', () => {
  it('outlines each place with its missions, and lists the rest anywhere, never placed where they do not say', () => {
    const cards = openMissionCards([naloxone, guam, scamShield, heat, advisory], NOW);
    const { places, anywhere } = missionsByPlace(cards, outlineOf);
    expect(places.map((p) => [p.name, p.cards.length])).toEqual([['California', 1], ['Guam', 1], ['New Mexico', 1], ['United States', 1]]);
    expect(anywhere.map((c) => c.pkg)).toEqual([advisory]);
  });

  it('lists a mission anywhere when its place has no outline drawn here', () => {
    const { places, anywhere } = missionsByPlace(openMissionCards([naloxone], NOW), () => null);
    expect(places).toEqual([]);
    expect(anywhere).toHaveLength(1);
  });

  it('says a place and its count in its pill, and names each mission with its limits in its hover', () => {
    const { places } = missionsByPlace(openMissionCards([naloxone], NOW), outlineOf);
    expect(missionsPillText(places[0])).toBe('New Mexico · 1 mission');
    expect(describeMissionsAt(places[0])).toBe('New Mexico: 1 open mission.\n• Put naloxone in more pockets and first-aid kits in New Mexico.\n  Its limits: Work in pairs. Never confront anyone.');
  });

  it('names three in a hover and counts the rest', () => {
    const four = ['a', 'b', 'c', 'd'].map((x) => pkg(`starcom_mission_package_field-x-${x}`, { profile: { fieldWork: { jurisdiction: 'us-nm' } } }));
    const { places } = missionsByPlace(openMissionCards(four, NOW), outlineOf);
    expect(missionsPillText(places[0])).toBe('New Mexico · 4 missions');
    expect(describeMissionsAt(places[0]).split('\n')).toHaveLength(5);
    expect(describeMissionsAt(places[0])).toMatch(/and 1 more\.$/);
  });
});
