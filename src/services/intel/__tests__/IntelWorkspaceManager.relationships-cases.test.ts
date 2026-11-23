/**
 * Coverage for the relationships/cases collections added to
 * IntelWorkspaceManager as part of unifying the Intel substrate — the one
 * genuinely new concept (relationships) System B never had, and cases
 * getting real persistence for the first time (ported from core/intel's
 * CaseRecord, which had none).
 *
 * Each test uses vi.resetModules() + a fresh dynamic import so the module
 * singleton starts genuinely empty, matching the convention already
 * established in IntelWorkspaceManager.concurrency.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CreateIntelRelationshipInput } from '../../../types/intel/IntelRelationship';
import type { CreateIntelCaseInput } from '../../../types/intel/IntelCaseUI';
import { CaseStatus, CasePriority } from '../../../types/intel/IntelCaseUI';
import type { CreateMissionInput } from '../../../types/intel/MissionUI';
import { MissionStatus, MissionActivityAction } from '../../../types/intel/MissionUI';

function makeRelationshipInput(overrides: Partial<CreateIntelRelationshipInput> = {}): CreateIntelRelationshipInput {
  return {
    type: 'communicates_with',
    sourceId: 'item-1',
    targetId: 'item-2',
    ...overrides
  };
}

function makeCaseInput(overrides: Partial<CreateIntelCaseInput> = {}): CreateIntelCaseInput {
  return {
    title: 'Test Case',
    description: 'A test investigation',
    ...overrides
  };
}

/**
 * Cancel the outgoing test's pending write before the next test resets modules.
 *
 * Writes are debounced by 300ms, and `vi.resetModules()` orphans the previous
 * singleton WITHOUT cancelling its timer. So test A's timer fired after test
 * B had started, wrote A's workspace back, and B's fresh instance loaded it
 * on ensureInitialized — B then read a relationship it never created and got
 * confidence 50 where it had just written 90.
 *
 * This is D6's mechanism inside one file rather than across two, and
 * resetForTests() is deliberately called at the file boundary, so nothing
 * was cancelling it here. It runs in afterEach because that is the last
 * moment `import` still resolves to the instance the test actually used —
 * in beforeEach, resetModules has already handed back a different one whose
 * timer was never the problem.
 */
afterEach(async () => {
  const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
  intelWorkspaceManager.resetForTests();
});

describe('IntelWorkspaceManager — relationships', () => {
  beforeEach(() => { vi.resetModules(); localStorage.clear(); });



  it('addRelationship persists a real relationship with a default confidence and empty tags/metadata', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const rel = intelWorkspaceManager.addRelationship(makeRelationshipInput());

    expect(rel.id).toBeTruthy();
    expect(rel.type).toBe('communicates_with');
    expect(rel.sourceId).toBe('item-1');
    expect(rel.targetId).toBe('item-2');
    expect(rel.confidence).toBe(50);
    expect(rel.tags).toEqual([]);
    expect(intelWorkspaceManager.getRelationships()).toHaveLength(1);
  });

  it('credits a relationship to the author its caller states, and creates no signing identity doing it', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    const { default: nostrService } = await import('../../nostrService');
    await intelWorkspaceManager.ensureInitialized();
    nostrService.forgetIdentity();

    const rel = intelWorkspaceManager.addRelationship(makeRelationshipInput({ createdBy: 'intel-analyst' }));

    expect(rel.createdBy).toBe('intel-analyst');
    expect(nostrService.hasIdentity()).toBe(false);
    expect(localStorage.getItem('nostr_secret_key')).toBeNull();
  });

  it('credits an unattributed relationship to the current identity, creating it when there is none', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    const { nostrIdentityService } = await import('../../identity/NostrIdentityService');
    await intelWorkspaceManager.ensureInitialized();

    const rel = intelWorkspaceManager.addRelationship(makeRelationshipInput());

    expect(nostrIdentityService.getPubkey()).toBeTruthy();
    expect(rel.createdBy).toBe(nostrIdentityService.getPubkey());
  });

  it('credits a case to the author its caller states, and creates no signing identity doing it', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    const { default: nostrService } = await import('../../nostrService');
    await intelWorkspaceManager.ensureInitialized();
    nostrService.forgetIdentity();

    const created = await intelWorkspaceManager.addCase({ title: 'Seeded', description: 'From the scenario', createdBy: 'intel-analyst' });

    expect(created.createdBy).toBe('intel-analyst');
    expect(nostrService.hasIdentity()).toBe(false);
  });

  it('getRelationshipsForEntity finds relationships where the entity is either source or target', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    intelWorkspaceManager.addRelationship(makeRelationshipInput({ sourceId: 'a', targetId: 'b' }));
    intelWorkspaceManager.addRelationship(makeRelationshipInput({ sourceId: 'c', targetId: 'a' }));
    intelWorkspaceManager.addRelationship(makeRelationshipInput({ sourceId: 'x', targetId: 'y' }));

    const found = intelWorkspaceManager.getRelationshipsForEntity('a');
    expect(found).toHaveLength(2);
  });

  it('updateRelationship replaces the record and bumps updatedAt', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const rel = intelWorkspaceManager.addRelationship(makeRelationshipInput());
    const originalUpdatedAt = rel.updatedAt;

    await new Promise(resolve => setTimeout(resolve, 2));
    intelWorkspaceManager.updateRelationship({ ...rel, confidence: 90 });

    // Found by id, not by index: `[0]` asserts "whatever happens to be first",
    // which is a different claim and the one that failed.
    const reloaded = intelWorkspaceManager.getRelationships().find(r => r.id === rel.id);
    expect(reloaded?.confidence).toBe(90);
    expect(reloaded?.updatedAt).not.toBe(originalUpdatedAt);
  });

  it('removeRelationship deletes it, and is a no-op for an id that never existed', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const rel = intelWorkspaceManager.addRelationship(makeRelationshipInput());
    intelWorkspaceManager.removeRelationship(rel.id);
    expect(intelWorkspaceManager.getRelationships().find(r => r.id === rel.id)).toBeUndefined();

    expect(() => intelWorkspaceManager.removeRelationship('never-existed')).not.toThrow();
  });

  it('state persisted before relationships existed is backfilled with an empty array, not a crash', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();
    // Simulate old persisted state missing the field entirely.
    delete (intelWorkspaceManager as unknown as { state: { relationships?: unknown } }).state?.relationships;

    expect(intelWorkspaceManager.getRelationships()).toEqual([]);
    expect(() => intelWorkspaceManager.addRelationship(makeRelationshipInput())).not.toThrow();
  });
});

describe('IntelWorkspaceManager — cases', () => {
  beforeEach(() => { vi.resetModules(); localStorage.clear(); });

  it('addCase creates a real case with a generated case number, NEW status, and a CREATED activity-log entry', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const created = await intelWorkspaceManager.addCase(makeCaseInput());

    expect(created.id).toBeTruthy();
    // Read from the id, so no other machine mints it (plan item 2.4).
    const { recordNumber } = await import('../recordNumbers');
    expect(created.caseNumber).toBe(recordNumber('CASE', created.id, new Date(created.createdAt)));
    expect(created.status).toBe(CaseStatus.NEW);
    expect(created.priority).toBe(CasePriority.MEDIUM);
    expect(created.activityLog).toHaveLength(1);
    expect(created.activityLog[0].action).toBe('CREATED');
    expect(created.collaborators).toEqual([]);
    expect(created.comments).toEqual([]);
    expect(intelWorkspaceManager.getCases()).toHaveLength(1);
  });

  it('attributes createdBy and the CREATED activity entry to the real Nostr identity, not the old hardcoded placeholder', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    const { nostrIdentityService } = await import('../../identity/NostrIdentityService');
    await intelWorkspaceManager.ensureInitialized();

    const created = await intelWorkspaceManager.addCase(makeCaseInput());
    const realPubkey = nostrIdentityService.getPubkey();

    expect(realPubkey).toBeTruthy();
    expect(created.createdBy).toBe(realPubkey);
    expect(created.createdBy).not.toBe('operative');
    expect(created.activityLog[0].userId).toBe(realPubkey);
  });

  it('survives a reload — this is the actual bug being fixed (CaseRecord had zero persistence before)', async () => {
    const mod1 = await import('../IntelWorkspaceManager');
    await mod1.intelWorkspaceManager.ensureInitialized();
    const created = await mod1.intelWorkspaceManager.addCase(makeCaseInput({ title: 'Persisted Investigation' }));

    // addCase's save is debounced (300ms), matching every other write in
    // this manager (addReport/addIntelItem included) — wait past it so this
    // test reflects a real reload, not an artificial race with the flush.
    await new Promise(resolve => setTimeout(resolve, 350));

    // Fresh module import simulates a page reload — a new instance reading
    // from the same persisted storage, not the same in-memory object.
    vi.resetModules();
    const mod2 = await import('../IntelWorkspaceManager');
    await mod2.intelWorkspaceManager.ensureInitialized();

    const reloaded = mod2.intelWorkspaceManager.getCase(created.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.title).toBe('Persisted Investigation');
  });

  it('updateCase full-replaces the record and bumps updatedAt', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const created = await intelWorkspaceManager.addCase(makeCaseInput());
    const originalUpdatedAt = created.updatedAt;

    await new Promise(resolve => setTimeout(resolve, 2));
    await intelWorkspaceManager.updateCase({ ...created, status: CaseStatus.OPEN });

    const reloaded = intelWorkspaceManager.getCase(created.id);
    expect(reloaded?.status).toBe(CaseStatus.OPEN);
    expect(reloaded?.updatedAt).not.toBe(originalUpdatedAt);
  });

  it('removeCase deletes it, and is a no-op for an id that never existed', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const created = await intelWorkspaceManager.addCase(makeCaseInput());
    intelWorkspaceManager.removeCase(created.id);
    expect(intelWorkspaceManager.getCases().find(c => c.id === created.id)).toBeUndefined();

    expect(() => intelWorkspaceManager.removeCase('never-existed')).not.toThrow();
  });
});

describe('IntelWorkspaceManager — missions (Cycle 3)', () => {
  beforeEach(() => { vi.resetModules(); localStorage.clear(); });

  function makeMissionInput(overrides: Partial<CreateMissionInput> = {}): CreateMissionInput {
    return {
      title: 'Test Mission',
      briefing: 'A test mission briefing',
      ...overrides
    };
  }

  it('addMission creates a real mission with a generated mission number, DRAFT status, and a CREATED activity-log entry', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const created = await intelWorkspaceManager.addMission(makeMissionInput());

    expect(created.id).toBeTruthy();
    const { recordNumber } = await import('../recordNumbers');
    expect(created.missionNumber).toBe(recordNumber('MSN', created.id, new Date(created.createdAt)));
    expect(created.status).toBe(MissionStatus.DRAFT);
    expect(created.activityLog).toHaveLength(1);
    expect(created.activityLog[0].action).toBe(MissionActivityAction.CREATED);
    expect(created.collaborators).toEqual([]);
    expect(created.comments).toEqual([]);
    expect(intelWorkspaceManager.getMissions()).toHaveLength(1);
  });

  it('attributes createdBy and the CREATED activity entry to the real Nostr identity, not the old hardcoded placeholder', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    const { nostrIdentityService } = await import('../../identity/NostrIdentityService');
    await intelWorkspaceManager.ensureInitialized();

    const created = await intelWorkspaceManager.addMission(makeMissionInput());
    const realPubkey = nostrIdentityService.getPubkey();

    expect(realPubkey).toBeTruthy();
    expect(created.createdBy).toBe(realPubkey);
    expect(created.createdBy).not.toBe('operative');
    expect(created.activityLog[0].userId).toBe(realPubkey);
  });

  it('survives a reload, same persistence guarantee as cases', async () => {
    const mod1 = await import('../IntelWorkspaceManager');
    await mod1.intelWorkspaceManager.ensureInitialized();
    const created = await mod1.intelWorkspaceManager.addMission(makeMissionInput({ title: 'Persisted Mission' }));

    // addMission's save is debounced (300ms), matching every other write in
    // this manager — wait past it so this reflects a real reload.
    await new Promise(resolve => setTimeout(resolve, 350));

    vi.resetModules();
    const mod2 = await import('../IntelWorkspaceManager');
    await mod2.intelWorkspaceManager.ensureInitialized();

    const reloaded = mod2.intelWorkspaceManager.getMission(created.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.title).toBe('Persisted Mission');
  });

  it('updateMission full-replaces the record and bumps updatedAt', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const created = await intelWorkspaceManager.addMission(makeMissionInput());
    const originalUpdatedAt = created.updatedAt;

    await new Promise(resolve => setTimeout(resolve, 2));
    await intelWorkspaceManager.updateMission({ ...created, status: MissionStatus.PLANNING });

    const reloaded = intelWorkspaceManager.getMission(created.id);
    expect(reloaded?.status).toBe(MissionStatus.PLANNING);
    expect(reloaded?.updatedAt).not.toBe(originalUpdatedAt);
  });

  it('removeMission deletes it, and is a no-op for an id that never existed', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const created = await intelWorkspaceManager.addMission(makeMissionInput());
    intelWorkspaceManager.removeMission(created.id);
    expect(intelWorkspaceManager.getMissions().find(m => m.id === created.id)).toBeUndefined();

    expect(() => intelWorkspaceManager.removeMission('never-existed')).not.toThrow();
  });
});
