/**
 * Psi Watch's missions (D-PW, PW91–PW93): the kit's `psi_mission_package` read as the mission's card reads a received
 * package, with its window, the window's places, the engine and the registration; a live one only once it passes the
 * checks every received mission passes, its own family's tag in place of `starcom_mission_package`.
 */
import { describe, it, expect } from 'vitest';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import missionFixture from '../../kit-v0/fixtures/psi/psi_mission_package.json';
import windowFixture from '../../kit-v0/fixtures/psi/psi_window.json';
import { isPsiMissionPackage, KIT_RELAY, psiMissionsFrom, windowStateAt } from '../psiMissions';
import { verifyMissionPackageEvent } from '../../../intel/MissionPackageVerifier';
import type { KitFixture } from '../../kitFixtures';

const kit = (json: unknown, family: string, file: string) => ({ ...(json as object), family, file }) as KitFixture;
const MISSION = kit(missionFixture, 'psi_mission_package', 'psi_mission_package.json');
const WINDOW = kit(windowFixture, 'psi_window', 'psi_window.json');

describe('psiMissionsFrom', () => {
  it("reads the kit's sample with its window, the window's places, the engine and its asks as the card reads them", async () => {
    const [mission, ...rest] = await psiMissionsFrom([MISSION, WINDOW]);
    expect(rest).toHaveLength(0);
    expect(mission.sample).toBe(true);
    expect(mission.title).toBe('Psi Watch focus window (FIXTURE)');
    expect(mission.window).toEqual({ fromMs: 1793544872000, peakMs: 1793564907000, untilMs: 1793585037000 });
    expect(mission.curve?.profile?.kind).toBe('gauss_orb');
    expect(mission.windowNote?.zones.map((z) => z.name)).toEqual(['Sahel Zone']);
    expect(mission.engine).toBe('skyfield 1.54, de440s; catalogue kit-v0 (2026-10-26 to 2026-11-25)');
    expect(mission.registration).toBeNull();
    expect(mission.pkg.relay).toBe(KIT_RELAY);
    expect(mission.pkg.check.manifest?.objectives).toEqual([
      expect.objectContaining({ id: 'observe', ask: 'Note what you see in the window, and when', done: false }),
    ]);
    expect(isPsiMissionPackage(mission.pkg)).toBe(true);
  });

  it('shows no live package that fails the checks: one carrying no manifest signature is refused', async () => {
    const { tags, content, created_at } = missionFixture.event;
    const live = finalizeEvent({ kind: 30079, tags, content, created_at }, generateSecretKey());
    expect(await psiMissionsFrom([{ ...MISSION, event: live as unknown as KitFixture['event'] }])).toEqual([]);
  });

  it('names the registration it points to when Psi Watch holds it', async () => {
    const content = JSON.parse(missionFixture.event.content);
    content.metadata.mechaJono.psi.registration = 'PSI-0002';
    const registration = {
      family: 'psi_registration', file: 'psi_registration.json',
      event: { kind: 30023, pubkey: missionFixture.event.pubkey, created_at: 1, content: '', tags: [['d', 'psi-reg-PSI-0002'], ['title', 'PSI-0002: The null'], ['registration', 'PSI-0002', 'abc']] },
    } as KitFixture;
    const [mission] = await psiMissionsFrom([{ ...MISSION, event: { ...MISSION.event, content: JSON.stringify(content) } }, registration]);
    expect(mission.registration).toBe('PSI-0002');
    expect(mission.registrationNote?.title).toBe('PSI-0002: The null');
  });
});

describe('the check, by family', () => {
  it("asks a psi mission for its own family's tag, and every other package for starcom_mission_package", async () => {
    const { tags, content, created_at } = missionFixture.event;
    const live = finalizeEvent({ kind: 30079, tags, content, created_at }, generateSecretKey());
    expect((await verifyMissionPackageEvent(live)).code).toBe('missing-app-tag');
    // Past the tag, it is held to the rest: here, no manifest signature.
    expect((await verifyMissionPackageEvent(live, {}, { appTag: 'psi_mission_package' })).code).toBe('missing-manifest-signature');
  });
});

describe('windowStateAt', () => {
  const window = { fromMs: 1000, peakMs: 2000, untilMs: 3000 };
  it('says ahead, in its window, or passed', () => {
    expect(windowStateAt(window, 999)).toBe('ahead');
    expect(windowStateAt(window, 1000)).toBe('open');
    expect(windowStateAt(window, 3000)).toBe('open');
    expect(windowStateAt(window, 3001)).toBe('passed');
  });
});
