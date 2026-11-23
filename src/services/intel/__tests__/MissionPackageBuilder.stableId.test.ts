/**
 * A Mission Package keeps the same address when it is published again.
 *
 * ─── WHY THIS IS NOT COSMETIC ──────────────────────────────────────────────
 *
 * Kind 30079 is parameterized-replaceable: relays keep ONE event per
 * (kind, pubkey, `d`), and a later event with the same three replaces the
 * earlier one. The `d` tag is `starcom_mission_package_<manifest.id>`, and
 * `manifest.id` was `pkg-${Date.now().toString(36)}` — minted fresh inside
 * PackageComposer.compose on every call.
 *
 * So nothing was ever replaced. Publishing an updated mission left the old
 * package standing beside the new one, and a consumer reading the relay saw
 * two packages for one mission with no way to tell which superseded which.
 * Every republish added another.
 *
 * It also broke the return path before anything was built on it. A peer
 * replying to a package addresses it by coordinate —
 * `30079:<pubkey>:starcom_mission_package_<id>` — and that coordinate pointed
 * at a slot this node would never publish into again. Mecha Jono's board
 * report of 2026-09-20 names the reply path as the thing that blocks them, and
 * it would have been built against an address that moved.
 *
 * The identity is the MISSION's, which already crosses the boundary in
 * `reports[].id`, so this exposes nothing new — it only stops inventing a
 * second identity for something that already had one.
 */
import { describe, it, expect } from 'vitest';
import { buildMissionPackageManifest } from '../MissionPackageBuilder';
import { PackageComposer } from '../../exchange/PackageComposer';
import type { MissionUI } from '../../../types/intel/MissionUI';
import { MissionStatus } from '../../../types/intel/MissionUI';

const mission = (over: Partial<MissionUI> = {}): MissionUI => ({
  id: 'mission-1',
  missionNumber: 'MSN-2026-0001',
  title: 'Recon Mission',
  briefing: 'A briefing.',
  status: MissionStatus.READY_FOR_PACKAGE,
  objectives: [{ id: 'obj-1', description: 'Recon target', completed: false }],
  assignedTo: [],
  startDate: new Date().toISOString(),
  relatedReports: [],
  relatedCases: [],
  activityLog: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
} as unknown as MissionUI);

describe('a Mission Package published twice', () => {
  it('keeps one identity, so the replaceable slot is actually replaced', () => {
    const first = buildMissionPackageManifest(mission());
    const second = buildMissionPackageManifest(mission({ title: 'Recon Mission (revised)' }));

    expect(second.id).toBe(first.id);
  });

  it('carries the mission it came from, rather than the moment it was built', () => {
    // Date.now() was the identity. Two builds a millisecond apart were two
    // different packages; the same mission a day later was a third.
    expect(buildMissionPackageManifest(mission({ id: 'mission-42' })).id).toContain('mission-42');
  });

  it('gives two different missions two different addresses', () => {
    const a = buildMissionPackageManifest(mission({ id: 'mission-a' }));
    const b = buildMissionPackageManifest(mission({ id: 'mission-b' }));

    expect(a.id).not.toBe(b.id);
  });
});

describe('a package composed without a stable identity', () => {
  const input = {
    name: 'Ad hoc bundle',
    description: 'Composed by something with no record behind it.',
    license: 'OPEN' as const,
    author: 'Starcom',
    reports: [],
    intel: [],
  };

  it('still gets one, rather than being refused', () => {
    // Not every composer has a record to name. The minted form stays for them,
    // and only the callers that HAVE an identity are made to pass it.
    expect(PackageComposer.compose(input).manifest.id).toMatch(/^pkg-/);
  });
});
