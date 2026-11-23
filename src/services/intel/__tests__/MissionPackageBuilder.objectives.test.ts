/**
 * The ask crosses the boundary.
 *
 * ─── WHAT WAS WRONG ────────────────────────────────────────────────────────
 *
 * MissionPackageBuilder grew a careful objective block — the ask, what to hand
 * back, roughly how long, who it is for, what the doer must not do — and said
 * in its own header that this is "what does cross". It did not. The block was
 * rendered into a synthesized report's `content`, and PackageComposer reduces
 * every report to `{id, title, checksum}`, so all of it left as a 32-bit hash.
 * A peer received a title, a briefing and the NUMBER of objectives.
 *
 * That made a Mission Package unactionable by anyone outside this node, which
 * is the one thing it exists to be. Mecha Jono's board carries 85 asks across
 * 22 threads; nothing in our format could express even one of them.
 *
 * ─── WHAT STILL MUST NOT CROSS ─────────────────────────────────────────────
 *
 * `evidenceRef` is a Starcom-internal record id, and `claimedBy` is one of our
 * operators. Locked Decision #7 bars both, and they are absent by construction
 * rather than by filtering — the builder never reads them into the ask.
 */
import { describe, it, expect } from 'vitest';
import { buildMissionPackageManifest } from '../MissionPackageBuilder';
import type { MissionUI, MissionObjective } from '../../../types/intel/MissionUI';
import { MissionStatus } from '../../../types/intel/MissionUI';

const objective = (over: Partial<MissionObjective> = {}): MissionObjective => ({
  id: 'obj-1',
  description: 'Pull the Q3 disbursement log',
  completed: false,
  ...over,
});

const mission = (objectives: MissionObjective[]): MissionUI => ({
  id: 'mission-1',
  missionNumber: 'MSN-2026-0001',
  title: 'Grant review',
  briefing: 'A briefing.',
  status: MissionStatus.READY_FOR_PACKAGE,
  objectives,
  assignedTo: [],
  startDate: new Date().toISOString(),
  relatedReports: [],
  relatedCases: [],
  activityLog: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as MissionUI);

describe('a Mission Package carries its asks', () => {
  it('crosses the ask itself, not just how many there are', () => {
    const manifest = buildMissionPackageManifest(mission([objective()]));
    expect(manifest.objectives?.[0].ask).toBe('Pull the Q3 disbursement log');
  });

  it('carries what a stranger needs to decide whether they could do it', () => {
    const manifest = buildMissionPackageManifest(mission([objective({
      expectedArtifact: 'A CSV of line items',
      effortMinutes: 90,
      beneficiary: 'public',
      limits: ['no contact with named individuals'],
    })]));

    expect(manifest.objectives?.[0]).toMatchObject({
      handsBack: 'A CSV of line items',
      effortMinutes: 90,
      for: 'public',
      limits: ['no contact with named individuals'],
    });
  });

  it('gives each ask a stable name, so one of them can be answered', () => {
    // Their board asks whether a claim id should be per thread or per ask.
    // Neither is answerable while an ask has no identity on the wire.
    const manifest = buildMissionPackageManifest(mission([objective({ id: 'obj-7' })]));
    expect(manifest.objectives?.[0].id).toBe('obj-7');
  });

  it('says which asks are already done', () => {
    const manifest = buildMissionPackageManifest(mission([
      objective({ id: 'a', completed: true }),
      objective({ id: 'b', completed: false }),
    ]));
    expect(manifest.objectives?.map((o) => o.done)).toEqual([true, false]);
  });

  it('keeps objectiveCount agreeing with what it sent', () => {
    const manifest = buildMissionPackageManifest(mission([objective({ id: 'a' }), objective({ id: 'b' })]));
    expect(manifest.metadata.objectiveCount).toBe(2);
    expect(manifest.objectives).toHaveLength(2);
  });
});

describe('what an ask must never carry', () => {
  it('leaves out the internal record an objective rests on', () => {
    const manifest = buildMissionPackageManifest(mission([objective({ evidenceRef: 'rep-3f2a' })]));
    expect(JSON.stringify(manifest)).not.toContain('rep-3f2a');
  });

  it('leaves out who here is working on it', () => {
    const manifest = buildMissionPackageManifest(mission([objective({ claimedBy: 'analyst-9' })]));
    expect(JSON.stringify(manifest)).not.toContain('analyst-9');
  });
});

describe('an ask is redacted like the briefing, not like a title', () => {
  it('masks an email address', () => {
    const manifest = buildMissionPackageManifest(mission([
      objective({ description: 'Email analyst@earthalliance.example for the log' }),
    ]));
    expect(manifest.objectives?.[0].ask).not.toContain('analyst@earthalliance.example');
  });

  it('masks a long digit run', () => {
    const manifest = buildMissionPackageManifest(mission([
      objective({ description: 'Case reference 123456789 needs pulling' }),
    ]));
    expect(manifest.objectives?.[0].ask).not.toContain('123456789');
  });

  it('masks a coordinate pair', () => {
    const manifest = buildMissionPackageManifest(mission([
      objective({ description: 'Survey around 38.9072, -77.0369 on foot' }),
    ]));
    expect(manifest.objectives?.[0].ask).toContain('[redacted:position]');
  });

  it('redacts what a doer must not do, which is prose too', () => {
    const manifest = buildMissionPackageManifest(mission([
      objective({ limits: ['do not email analyst@earthalliance.example'] }),
    ]));
    expect(manifest.objectives?.[0].limits?.[0]).not.toContain('analyst@earthalliance.example');
  });

  it('redacts the expected artifact', () => {
    const manifest = buildMissionPackageManifest(mission([
      objective({ expectedArtifact: 'Send to analyst@earthalliance.example' }),
    ]));
    expect(manifest.objectives?.[0].handsBack).not.toContain('analyst@earthalliance.example');
  });
});

describe('a mission with no objectives', () => {
  it('sends no asks rather than an empty promise', () => {
    // Absent, not `[]`: "we published no asks" and "there are none" are the
    // same fact here, and the optional field says it without a shape to parse.
    const manifest = buildMissionPackageManifest(mission([]));
    expect(manifest.objectives).toBeUndefined();
  });
});
