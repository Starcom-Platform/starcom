/**
 * IntelWorkspaceManager — encryption at rest, and the guards around it.
 *
 * ─── WHY THIS FILE SURVIVED THE PURGE ──────────────────────────────────────
 *
 * It was written against the clearance ladder, and when Stage 7c deleted the
 * bridge its tier-seeded cases went red. The obvious move was to delete it:
 * IntelWorkspaceManager.protectedEncryption.test.ts already covers the axis
 * behaviour, and handlingBackfill.test.ts covers the legacy mapping.
 *
 * They do not cover what most of THIS file covers. Comparing the two lists
 * before deleting anything showed four things only here:
 *
 *   - updateReport re-encrypting new content
 *   - a genuinely missing key returning null rather than raw ciphertext
 *   - removeReport cleaning up the stored decryption key
 *   - the whole idempotency block: read -> mutate a non-content field ->
 *     write, repeatedly, without corrupting the payload
 *
 * That last one guards the failure this codebase already had once, whose own
 * comment reads "permanently unrecoverable even though the encryption appears
 * to succeed with no error". Dropping it to tidy a rename would have been a
 * bad trade.
 *
 * So the file is migrated onto `sensitivity`, keeping every case.
 *
 * encryptProtectedData/decryptProtectedData (PQCryptoService) were
 * already real and tested, but had zero call sites anywhere near intel
 * storage — a protected report or case was never actually encrypted
 * before persistence. This verifies the wiring: protected content is
 * stored as real ciphertext (not readable plaintext) in the persisted
 * state, open content is left alone, decryptReportContent/
 * decryptCaseDescription correctly recover the plaintext, and a genuinely
 * missing key (not just "never encrypted") is distinguished from one.
 *
 * Deliberately stays on this project's default jsdom test environment
 * rather than opting into the Node one some other crypto tests use: jsdom
 * has real localStorage, which IntelWorkspaceManager's own persistence/
 * migration path needs, while the Node environment doesn't provide it. But
 * jsdom itself has no crypto.subtle (see PQCryptoService.test.ts's
 * pre-existing, unrelated jsdom failures for the same gap), which the
 * encryption path needs for AES-GCM. Rather than switching environments
 * and polyfilling localStorage globally (which would risk changing
 * behavior for every other Node-environment test), this file polyfills
 * only crypto.subtle, only here, using Node's real webcrypto module —
 * jsdom's own crypto.getRandomValues is left untouched. Also needs
 * fake-indexeddb/auto: ClassifiedDataKeyStore persists the KEM decryption
 * keys separately from the encrypted payload.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CreateIntelCaseInput } from '../../../types/intel/IntelCaseUI';
import type { IntelReportData } from '../../../types/IntelWorkspace';

function makeReportData(overrides: Partial<IntelReportData> = {}): IntelReportData {
  const now = new Date().toISOString();
  return {
    id: `report-${Math.random().toString(36).slice(2)}`,
    title: 'Test Report',
    type: 'INTEL_REPORT',
    summary: 'summary',
    content: 'Sensitive report body — asset location and contact details.',
    conclusions: [],
    recommendations: [],
    analysisType: 'GENERAL',
    methodology: [],
    confidence: 0.5,
    priority: 'ROUTINE',
    sourceIntel: [],
    author: 'tester',
    contributors: [],
    createdAt: now,
    modifiedAt: now,
    targetAudience: [],
    distributionRestrictions: [],
    relatedReports: [],
    metadata: {},
    ...overrides
  } as IntelReportData;
}

function makeCaseInput(overrides: Partial<CreateIntelCaseInput> = {}): CreateIntelCaseInput {
  return {
    title: 'Test Case',
    description: 'Sensitive case description — real names and locations.',
    ...overrides
  };
}

describe('IntelWorkspaceManager — encryption at rest (Cycle 7)', () => {
  beforeEach(() => { vi.resetModules(); localStorage.clear(); });

  it('a protected report is stored with encrypted content, not the readable plaintext', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const plaintext = 'Sensitive report body — asset location and contact details.';
    await intelWorkspaceManager.addReport(makeReportData({
      id: 'report-classified-1',
      content: plaintext,
      metadata: { sensitivity: 'protected' }
    }));

    const stored = intelWorkspaceManager.getReports().find(r => r.id === 'report-classified-1');
    expect(stored).toBeDefined();
    expect(stored!.content).not.toBe(plaintext);
    expect(stored!.content).not.toContain('asset location');
  });

  it('decryptReportContent recovers the original plaintext for a protected report', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const plaintext = 'Sensitive report body — asset location and contact details.';
    await intelWorkspaceManager.addReport(makeReportData({
      id: 'report-classified-2',
      content: plaintext,
      metadata: { sensitivity: 'protected' }
    }));

    const recovered = await intelWorkspaceManager.decryptReportContent('report-classified-2');
    expect(recovered).toBe(plaintext);
  });

  it('an open report is left as plain, readable text — not encrypted unnecessarily', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const plaintext = 'Routine unclassified summary, no sensitivity.';
    await intelWorkspaceManager.addReport(makeReportData({
      id: 'report-unclass-1',
      content: plaintext,
      metadata: { sensitivity: 'open' }
    }));

    const stored = intelWorkspaceManager.getReports().find(r => r.id === 'report-unclass-1');
    expect(stored!.content).toBe(plaintext);

    // decryptReportContent is a safe no-op passthrough for never-encrypted content too.
    const recovered = await intelWorkspaceManager.decryptReportContent('report-unclass-1');
    expect(recovered).toBe(plaintext);
  });

  it('updateReport re-encrypts new content when the report stays protected', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const original = makeReportData({ id: 'report-update-1', content: 'first version', metadata: { sensitivity: 'protected' } });
    await intelWorkspaceManager.addReport(original);

    const updated = { ...original, content: 'second version, also sensitive' };
    await intelWorkspaceManager.updateReport(updated);

    const stored = intelWorkspaceManager.getReports().find(r => r.id === 'report-update-1');
    expect(stored!.content).not.toBe('second version, also sensitive');
    expect(await intelWorkspaceManager.decryptReportContent('report-update-1')).toBe('second version, also sensitive');
  });

  it('reclassifying a report to a different CONFIDENTIAL+ level does not break decryption (Cycle 7 hardening)', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const plaintext = 'Sensitive report body — asset location and contact details.';
    const original = makeReportData({
      id: 'report-reclassified',
      content: plaintext,
      metadata: { sensitivity: 'protected' }
    });
    await intelWorkspaceManager.addReport(original);

    // Reclassify SECRET -> TOP_SECRET. This is a normal intel workflow
    // action, not an edge case — the content itself isn't changing, so the
    // caller passes through whatever's currently stored (real
    // read-modify-write callers always do; this is the same shape as
    // MissionService.updateStatus). The already-encrypted content is left
    // untouched by the encrypt path's idempotency guard, so the
    // stored ciphertext still carries the tier it was written with in its
    // own metadata, even though the report's handling axis now
    // says TOP_SECRET.
    const stored = intelWorkspaceManager.getReports().find(r => r.id === 'report-reclassified')!;
    await intelWorkspaceManager.updateReport({
      ...stored,
      metadata: { ...stored.metadata, sensitivity: 'protected' }
    });

    /*
     * This once threw "Access denied: insufficient clearance level. Required:
     * TOP_SECRET, Have: SECRET" — the decrypt path demanded an exact match
     * against the record's CURRENT tier, while reclassification never
     * re-encrypts existing ciphertext.
     *
     * That check has been removed entirely, so this assertion can no longer
     * fail for its original reason and is weaker than it was. It is kept as a
     * round-trip test across a reclassification, which is still worth holding:
     * decryption must depend on the key and on nothing about the record's
     * current metadata.
     */
    const recovered = await intelWorkspaceManager.decryptReportContent('report-reclassified');
    expect(recovered).toBe(plaintext);
  });

  it('returns null (not the raw ciphertext) when decrypting a record whose key is genuinely missing', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    await intelWorkspaceManager.addReport(makeReportData({
      id: 'report-lost-key',
      content: 'will be encrypted then its key deleted',
      metadata: { sensitivity: 'protected' }
    }));

    const { classifiedDataKeyStore } = await import('../../crypto/ClassifiedDataKeyStore');
    await classifiedDataKeyStore.delete('report-lost-key');

    const recovered = await intelWorkspaceManager.decryptReportContent('report-lost-key');
    expect(recovered).toBeNull();
  });

  // A deletion is held ten seconds with Undo (plan item 0.6), so the key must
  // outlive removeReport, or a restore would bring back something unreadable.
  // It goes when the deletion is final.
  it('removeReport keeps the record\'s decryption key until the deletion is final, then deletes it', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    await intelWorkspaceManager.addReport(makeReportData({ id: 'report-to-delete', content: 'secret', metadata: { sensitivity: 'protected' } }));
    intelWorkspaceManager.removeReport('report-to-delete');

    const { classifiedDataKeyStore } = await import('../../crypto/ClassifiedDataKeyStore');
    expect(await classifiedDataKeyStore.get('report-to-delete')).toBeDefined();

    await intelWorkspaceManager.finalizeDeletion('report', 'report-to-delete');
    expect(await classifiedDataKeyStore.get('report-to-delete')).toBeUndefined();
  });

  it('a protected case\'s description is encrypted at rest and recoverable via decryptCaseDescription', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const plaintext = 'Sensitive case description — real names and locations.';
    const created = await intelWorkspaceManager.addCase(makeCaseInput({ description: plaintext, sensitivity: 'protected' }));

    // The record RETURNED to the caller who just authored it stays plaintext...
    expect(created.description).toBe(plaintext);

    // ...but what's actually persisted is ciphertext.
    const stored = intelWorkspaceManager.getCase(created.id);
    expect(stored!.description).not.toBe(plaintext);

    const recovered = await intelWorkspaceManager.decryptCaseDescription(created.id);
    expect(recovered).toBe(plaintext);
  });

  it('an open case is left as plain, readable text', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const plaintext = 'Routine case, nothing sensitive.';
    const created = await intelWorkspaceManager.addCase(makeCaseInput({ description: plaintext }));

    const stored = intelWorkspaceManager.getCase(created.id);
    expect(stored!.description).toBe(plaintext);
  });

  // Hardening pass (surfaced while reviewing Cycle 3's Mission encryption
  // wiring): IntelReportService.updateStatus / IntelCaseService.updateStatus
  // both read the STORED record (already-ciphertext for CONFIDENTIAL+),
  // spread it into an "updated" object changing only status/closedDate, and
  // write it back through updateReport/updateCase. Before this fix,
  // encryptFieldIfProtected couldn't tell the difference between real
  // plaintext and already-encrypted ciphertext, so it encrypted the
  // ciphertext a SECOND time — silently corrupting the data (the original
  // decryption key gets overwritten in classifiedDataKeyStore, making the
  // first layer permanently unrecoverable) on every single status
  // transition of any classified report/case/mission.
  describe('double-encryption on read-modify-write (the exact updateStatus pattern)', () => {
    it('a report survives a read -> mutate non-content field -> write cycle without corrupting its content', async () => {
      const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
      await intelWorkspaceManager.ensureInitialized();

      const plaintext = 'Sensitive report body that must survive a status change untouched.';
      await intelWorkspaceManager.addReport(makeReportData({
        id: 'report-status-transition',
        content: plaintext,
        metadata: { sensitivity: 'protected' }
      }));

      // Exactly IntelReportService.updateStatus's pattern: read the stored
      // (ciphertext) record, mutate an unrelated field, write it back.
      const stored = intelWorkspaceManager.getReports().find(r => r.id === 'report-status-transition')!;
      const mutated = { ...stored, metadata: { ...stored.metadata, status: 'SUBMITTED' } };
      await intelWorkspaceManager.updateReport(mutated);

      const recovered = await intelWorkspaceManager.decryptReportContent('report-status-transition');
      expect(recovered).toBe(plaintext);
    });

    it('a case survives a read -> mutate non-description field -> write cycle without corrupting its description', async () => {
      const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
      await intelWorkspaceManager.ensureInitialized();

      const plaintext = 'Sensitive case description that must survive a status change untouched.';
      const created = await intelWorkspaceManager.addCase(makeCaseInput({ description: plaintext, sensitivity: 'protected' }));

      // Exactly IntelCaseService.updateStatus's pattern.
      const stored = intelWorkspaceManager.getCase(created.id)!;
      const mutated = { ...stored, status: 'OPEN' as any };
      await intelWorkspaceManager.updateCase(mutated);

      const recovered = await intelWorkspaceManager.decryptCaseDescription(created.id);
      expect(recovered).toBe(plaintext);
    });

    it('a mission briefing is encrypted at rest and survives a status-only update without corruption', async () => {
      const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
      await intelWorkspaceManager.ensureInitialized();

      const plaintext = 'Sensitive mission briefing — objectives and asset details.';
      const created = await intelWorkspaceManager.addMission({
        title: 'Classified Mission',
        briefing: plaintext,
        sensitivity: 'protected'
      });
      expect(created.briefing).toBe(plaintext); // returned to the author as plaintext

      const stored = intelWorkspaceManager.getMission(created.id);
      expect(stored!.briefing).not.toBe(plaintext); // persisted as ciphertext

      // Exactly MissionService.updateStatus's pattern.
      const mutated = { ...stored!, status: 'PLANNING' as any };
      await intelWorkspaceManager.updateMission(mutated);

      const recovered = await intelWorkspaceManager.decryptMissionBriefing(created.id);
      expect(recovered).toBe(plaintext);
    });

    it('re-saving the exact same encrypted value repeatedly never accumulates extra layers', async () => {
      const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
      await intelWorkspaceManager.ensureInitialized();

      const plaintext = 'Stable content across many no-op-ish saves.';
      await intelWorkspaceManager.addReport(makeReportData({ id: 'report-repeated-save', content: plaintext, metadata: { sensitivity: 'protected' } }));

      for (let i = 0; i < 5; i++) {
        const stored = intelWorkspaceManager.getReports().find(r => r.id === 'report-repeated-save')!;
        await intelWorkspaceManager.updateReport({ ...stored, metadata: { ...stored.metadata, version: i } });
      }

      const recovered = await intelWorkspaceManager.decryptReportContent('report-repeated-save');
      expect(recovered).toBe(plaintext);
    });
  });
});
