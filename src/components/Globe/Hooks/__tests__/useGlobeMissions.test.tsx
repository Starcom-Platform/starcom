/**
 * Missions on the globe (decision D-MF, step 5; MF16–MF17): each place with open missions outlined, a
 * clipboard at its middle whose click opens its missions in the Missions panel, a pill counting them; the
 * rest listed as done from anywhere; read only while the section is on, from the read the app shares.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import type { AcceptedPackage } from '../../../../services/intel/MissionPackageIngest';
import type { TerritoryIndex } from '../../../../services/intel/coverage/territoryIndex';

const received = vi.hoisted(() => ({ accepted: [] as AcceptedPackage[], asked: [] as boolean[], loaded: true }));
vi.mock('../../../../services/intel/useReceivedPackages', () => ({
  useReceivedPackages: (enabled = true) => {
    received.asked.push(enabled);
    return { accepted: enabled ? received.accepted : [], refused: [], counters: { seen: enabled ? received.accepted.length : 0, accepted: 0, refused: 0, refusedBy: {} }, publishers: [], loaded: enabled && received.loaded };
  },
}));
const square = (name: string, lon: number, lat: number) => ({ name, geometry: { type: 'Polygon' as const, coordinates: [[[lon, lat], [lon + 5, lat], [lon + 5, lat + 5], [lon, lat + 5], [lon, lat]]] } });
vi.mock('../../../../services/raverWatch/usStates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../services/raverWatch/usStates')>()),
  loadUsStates: () => Promise.resolve(new Map([['us-nm', square('New Mexico', -108, 32)]])),
}));
// jsdom has no 2D canvas to bake on: an atlas and pills that are there, as they are in a browser.
vi.mock('../../heroWatchSprites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../heroWatchSprites')>()),
  heroWatchAtlas: () => Promise.resolve(new THREE.Texture()),
  bakeHeroWatchPills: (labels: string[]) => Promise.resolve({
    texture: new THREE.Texture(),
    cells: new Map(labels.map((label) => [label, { u0: 0, v0: 0, u1: 1, v1: 1, widthPx: 90 }])),
  }),
}));

import { useGlobeMissions, missionsReadiness, MISSIONS_OUTLINE_TYPE, MISSIONS_PILL_TYPE } from '../useGlobeMissions';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';
import type { GlobeNoteSet } from '../../../../features/globe/noteDetail/globeNoteStore';

const NOW = Date.parse('2026-10-16T12:00:00Z');
const PUBKEY = 'b'.repeat(64);
function pkg(d: string, description: string, over: { profile?: Record<string, unknown>; metadata?: Record<string, unknown> } = {}): AcceptedPackage {
  return {
    event: { id: d, pubkey: PUBKEY, created_at: 1_790_000_000, kind: 30079, tags: [['d', d], ['t', 'starcom_mission_package']], content: '{}', sig: '' },
    check: {
      ok: true,
      manifest: {
        id: d, name: d, version: '1.0.0', description, author: 'Mecha Jono', createdAt: '2026-10-16T00:00:00Z', license: 'CC-BY-4.0',
        visibility: 'public', reports: [], intel: [], assets: [], objectives: [], metadata: over.metadata ?? {}, ...(over.profile ? { profile: over.profile } : {}),
      },
    } as AcceptedPackage['check'],
    relay: 'wss://record.example',
  };
}
const NALOXONE = pkg('starcom_mission_package_field-naloxone-NM', 'MISSION: Put naloxone in more pockets and first-aid kits in New Mexico.', {
  profile: { fieldWork: { jurisdiction: 'us-nm' } }, metadata: { mechaJono: { format: { limits: 'Work in pairs. Never confront anyone.' } } },
});
const GUAM = pkg('starcom_mission_package_field-disaster_volunteer-fema-a', 'MISSION: Share where to get disaster aid in Guam.', { metadata: { mechaJono: { area: { country: 'us', state: 'GU' } } } });
// Colorado's outline is not among the states loaded: listed, never placed where it does not say.
const COLORADO = pkg('starcom_mission_package_field-naloxone-CO', 'MISSION: Put naloxone in more pockets in Colorado.', { profile: { fieldWork: { jurisdiction: 'us-co' } } });
const ADVISORY = pkg('starcom_mission_package_ic-icsa-26-272-05', 'MISSION: Get owners of Anjvision YSSD-RTMP-H5 a fix they can use tonight.');
const TERRITORIES = { size: 1, at: () => null, byCode: (code: string) => (code === 'GU' ? square('Guam', 144, 13) : null), countries: () => [] } as unknown as TerritoryIndex;

const byType = (scene: THREE.Scene, type: string) => {
  let found: THREE.Object3D | null = null;
  scene.traverse((o) => { if (o.userData?.type === type) found = o; });
  return found as THREE.Object3D | null;
};
const opensIn = (scene: THREE.Scene): GlobeNoteSet[] => {
  const sets: GlobeNoteSet[] = [];
  scene.traverse((o) => { const opens = (o.userData as { opens?: Array<GlobeNoteSet | null> }).opens; if (Array.isArray(opens)) sets.push(...opens.filter((s): s is GlobeNoteSet => !!s)); });
  return sets;
};
function mount(active: boolean) {
  const scene = new THREE.Scene();
  const hook = renderHook((p: { active: boolean }) => useGlobeMissions({ scene, active: p.active, territories: TERRITORIES, now: NOW }), { initialProps: { active } });
  return { scene, ...hook };
}

beforeEach(() => {
  received.accepted = [NALOXONE, GUAM, COLORADO, ADVISORY];
  received.asked.length = 0;
  received.loaded = true;
  resetLegendsForTest();
});

describe('useGlobeMissions', () => {
  it('reads and draws nothing while its section is off', () => {
    const { scene, result } = mount(false);
    expect(received.asked.every((asked) => asked === false)).toBe(true);
    expect(result.current.places).toEqual([]);
    expect(byType(scene, MISSIONS_OUTLINE_TYPE)).toBeNull();
  });

  it("outlines each place with open missions, its state or a US territory's own outline, and lists the rest anywhere", async () => {
    const { scene, result } = mount(true);
    await waitFor(() => expect(result.current.places.map((p) => p.code)).toEqual(['GU', 'us-nm']));
    expect(result.current.anywhere.map((c) => c.pkg)).toEqual(expect.arrayContaining([COLORADO, ADVISORY]));
    expect(result.current.anywhere).toHaveLength(2);
    await waitFor(() => expect(byType(scene, MISSIONS_OUTLINE_TYPE)?.userData.places).toEqual(['GU', 'us-nm']));
  });

  it('puts a clipboard at each place whose click opens its missions in the Missions panel, and a pill counting them', async () => {
    const { scene } = mount(true);
    await waitFor(() => expect(opensIn(scene)).toHaveLength(2));
    const nm = opensIn(scene).find((set) => set.heading === 'New Mexico')!;
    expect(nm.panel).toBe('missions');
    expect(nm.notes).toEqual([expect.objectContaining({ kind: 'Mission', title: 'Put naloxone in more pockets and first-aid kits in New Mexico.', limits: 'Work in pairs. Never confront anyone.' })]);
    await waitFor(() => expect(byType(scene, MISSIONS_PILL_TYPE)).not.toBeNull());
  });

  it('keys what it draws', async () => {
    mount(true);
    await waitFor(() => expect(getLegends().find((l) => l.layerId === 'OpenMissions')).toBeTruthy());
    expect(getLegends().find((l) => l.layerId === 'OpenMissions')!.badgeMeans).toBe('its pill: the place · its open missions');
  });

  it('takes it all off when its section is turned off', async () => {
    const { scene, rerender } = mount(true);
    await waitFor(() => expect(byType(scene, MISSIONS_OUTLINE_TYPE)).not.toBeNull());
    rerender({ active: false });
    await waitFor(() => expect(byType(scene, MISSIONS_OUTLINE_TYPE)).toBeNull());
    expect(opensIn(scene)).toEqual([]);
    expect(getLegends().find((l) => l.layerId === 'OpenMissions')).toBeUndefined();
  });

  it("says on a card what it draws and what it lists, and gives no line while it is off", async () => {
    const { result, rerender } = mount(true);
    await waitFor(() => expect(result.current.places).toHaveLength(2));
    expect(result.current.feeds).toEqual([expect.objectContaining({
      shortName: 'Missions',
      layer: 'OpenMissions',
      note: 'Missions: 2 open missions in 2 places, as their publishers post them, each place outlined, with a pill counting its missions. '
        + 'Every mission carries its safety limits, which a hover gives. 2 name no place drawn here: listed in the Missions panel, not drawn. '
        + 'Closed missions and grant notices are not drawn.',
    })]);
    rerender({ active: false });
    expect(result.current.feeds).toEqual([]);
  });

  it('holds a card until the read is whole, though some have arrived, and lets it go once the places are outlined and counted', async () => {
    received.accepted = [NALOXONE];
    received.loaded = false;
    const { rerender } = mount(true);
    await waitFor(() => expect(missionsReadiness()).toEqual({ ready: false, why: 'Missions were still being read' }));
    received.accepted = [NALOXONE, GUAM, COLORADO, ADVISORY];
    received.loaded = true;
    rerender({ active: true });
    await waitFor(() => expect(missionsReadiness()).toEqual({ ready: true }));
  });
});
