/**
 * The one-time migration that turns stored tiers into stored axes.
 *
 * ─── THE REGRESSION THIS PREVENTS ──────────────────────────────────────────
 *
 * Stage 6a's bridge let a record carrying only `classification` behave
 * correctly without being rewritten. Stage 7c deletes that bridge.
 *
 * Deleting it with no migration would not corrupt anything immediately — a
 * CONFIDENTIAL case's description is already ciphertext, and decryption is
 * driven by the envelope marker, not by any label. The damage comes on the
 * next EDIT: with no `sensitivity` on the record, the retyped description is
 * stored as PLAINTEXT. A protected case silently becomes unprotected.
 *
 * So these tests write state the OLD way — a tier and no axes, exactly what is
 * sitting in a real user's localStorage today — and assert the axes are filled
 * in on load, with the same boundary the bridge used.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, beforeEach, vi } from 'vitest';

const KEY = 'intelWorkspace.v1';

/** State as an older build would have written it: version 1, tiers, no axes. */
function seedLegacyState(over: Record<string, unknown> = {}) {
  localStorage.setItem(KEY, JSON.stringify({
    version: 1,
    reports: [{
      id: 'r-conf', title: 'Confidential Report', type: 'INTEL_REPORT',
      summary: 's', content: 'body', conclusions: [], recommendations: [],
      analysisType: 'GENERAL', methodology: [], confidence: 0.5,
      priority: 'ROUTINE', sourceIntel: [], author: 'a', contributors: [],
      createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
      targetAudience: [], distributionRestrictions: [], relatedReports: [],
      metadata: { classification: 'CONFIDENTIAL' },
    }, {
      id: 'r-unclass', title: 'Open Report', type: 'INTEL_REPORT',
      summary: 's', content: 'body', conclusions: [], recommendations: [],
      analysisType: 'GENERAL', methodology: [], confidence: 0.5,
      priority: 'ROUTINE', sourceIntel: [], author: 'a', contributors: [],
      createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
      targetAudience: [], distributionRestrictions: [], relatedReports: [],
      metadata: { classification: 'UNCLASSIFIED' },
    }],
    intel: [],
    packages: [],
    cases: [{
      id: 'c-secret', caseNumber: 'CASE-1', title: 'Secret Case',
      description: 'desc', status: 'NEW', priority: 'MEDIUM',
      classification: 'SECRET', assignedTo: [], startDate: new Date().toISOString(),
      relatedEntities: [], relatedCases: [], tags: [], metadata: {},
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      createdBy: 'a', activityLog: [], collaborators: [],
      permissions: { canEdit: [], canView: [], canDelete: [] },
    }],
    missions: [{
      id: 'm-ts', missionNumber: 'MSN-1', title: 'TS Mission', briefing: 'brief',
      status: 'DRAFT', classification: 'TOP_SECRET', objectives: [], assignedTo: [],
      startDate: new Date().toISOString(), relatedReports: [], relatedCases: [],
      tags: [], metadata: {}, createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), createdBy: 'a', activityLog: [],
      collaborators: [], permissions: { canEdit: [], canView: [], canDelete: [] },
    }],
    metadata: { createdAt: new Date().toISOString() },
    ...over,
  }));
}

describe('the stored-tier backfill', () => {
  beforeEach(() => { vi.resetModules(); localStorage.clear(); });

  it("maps the rungs that fired encryption onto 'protected' / 'private'", async () => {
    seedLegacyState();
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const conf = intelWorkspaceManager.getReports().find(r => r.id === 'r-conf')!;
    expect((conf.metadata as Record<string, unknown>).sensitivity).toBe('protected');
    expect((conf.metadata as Record<string, unknown>).visibility).toBe('private');

    expect(intelWorkspaceManager.getCases().find(c => c.id === 'c-secret')!.sensitivity).toBe('protected');
    expect(intelWorkspaceManager.getMissions().find(m => m.id === 'm-ts')!.sensitivity).toBe('protected');
  });

  /*
   * Below that boundary a record is 'open' at rest, but where it may go was
   * never decided, and undecided goes nowhere (plan items 0.4, 0.5). This
   * migration used to fill it with Public (plan item 9.6).
   */
  it("maps everything below that boundary onto 'open', and leaves its distribution undecided", async () => {
    seedLegacyState();
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const open = intelWorkspaceManager.getReports().find(r => r.id === 'r-unclass')!;
    expect((open.metadata as Record<string, unknown>).sensitivity).toBe('open');
    expect((open.metadata as Record<string, unknown>).visibility).toBeUndefined();
  });

  it('leaves an older case or mission with no tier undecided, not Public', async () => {
    seedLegacyState();
    const raw = JSON.parse(localStorage.getItem(KEY)!);
    delete raw.cases[0].classification;
    delete raw.missions[0].classification;
    localStorage.setItem(KEY, JSON.stringify(raw));

    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const c = intelWorkspaceManager.getCases().find(x => x.id === 'c-secret')!;
    const m = intelWorkspaceManager.getMissions().find(x => x.id === 'm-ts')!;
    expect(c.visibility).toBeUndefined();
    expect(m.visibility).toBeUndefined();
    expect(c.sensitivity).toBe('open');
  });

  /**
   * The point of the whole migration: after it, the record itself says
   * 'protected', so the encryption gate fires on an edit without needing any
   * bridge to interpret a tier.
   */
  it('leaves the record able to protect itself with the bridge gone', async () => {
    seedLegacyState();
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    const { requiresProtection } = await import('../../../types/intel/IntelItemUI');
    await intelWorkspaceManager.ensureInitialized();

    const migrated = intelWorkspaceManager.getCases().find(c => c.id === 'c-secret')!;
    // Read the axis directly, with no reference to the legacy field.
    expect(requiresProtection(migrated.sensitivity)).toBe(true);
  });

  it('does not overwrite an axis the record already states', async () => {
    seedLegacyState();
    const raw = JSON.parse(localStorage.getItem(KEY)!);
    // A record deliberately released: legacy tier says SECRET, the author said open.
    raw.cases[0].visibility = 'public';
    raw.cases[0].sensitivity = 'open';
    localStorage.setItem(KEY, JSON.stringify(raw));

    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const c = intelWorkspaceManager.getCases().find(x => x.id === 'c-secret')!;
    expect(c.visibility).toBe('public');
    expect(c.sensitivity).toBe('open');
  });

  it('is idempotent — it bumps the version and does not run again', async () => {
    seedLegacyState();
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    expect(JSON.parse(localStorage.getItem(KEY)!).version).toBe(2);

    /*
     * Someone later RELEASES the case — legacy tier still says SECRET, the
     * operator has set it open. A second pass of the migration must not undo
     * that, or a deliberate release would be reverted on every reload.
     *
     * The change goes through the manager rather than by editing localStorage:
     * the first load also writes state to IndexedDB, which then wins on reload
     * (step 0 of doInitialize), so a localStorage-only edit is simply ignored.
     * A first version of this test did exactly that and failed for a reason
     * that had nothing to do with idempotency.
     */
    const released = {
      ...intelWorkspaceManager.getCases().find(c => c.id === 'c-secret')!,
      visibility: 'public' as const,
      sensitivity: 'open' as const,
    };
    await intelWorkspaceManager.updateCase(released);

    // Re-run the migration against the already-migrated state.
    await intelWorkspaceManager.ensureInitialized();
    const after = intelWorkspaceManager.getCases().find(c => c.id === 'c-secret')!;
    expect(after.sensitivity).toBe('open');
    expect(after.visibility).toBe('public');
  });

  it('leaves the legacy field in place, so a downgrade still finds it', async () => {
    seedLegacyState();
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const after = JSON.parse(localStorage.getItem(KEY)!);
    expect(after.cases[0].classification).toBe('SECRET');
  });
});
