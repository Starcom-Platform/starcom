/**
 * Encryption at rest, keyed on `sensitivity` instead of the clearance ladder.
 *
 * The sibling file (IntelWorkspaceManager.classifiedEncryption.test.ts) covers
 * the LEGACY path and must keep passing unchanged — that is the evidence that
 * records written before Stage 6 still encrypt and decrypt exactly as they did.
 * This file covers what the new axis buys:
 *
 *   sensitivity 'protected' -> ciphertext at rest
 *   sensitivity 'careful'   -> plaintext at rest (redaction is a separate axis)
 *   sensitivity 'open'      -> plaintext at rest
 *
 * The middle row is the whole point. Under the ladder, the only way to ask for
 * redaction was CONFIDENTIAL, which also forced encryption at rest — so
 * "strip sources before this leaves the app, but it does not need protecting on
 * my own device" was not expressible. If this test ever starts passing because
 * 'careful' encrypts too, the axes have collapsed back into a ladder.
 *
 * Same jsdom caveats as the sibling: crypto.subtle polyfilled from Node's real
 * webcrypto (jsdom has none), fake-indexeddb for ClassifiedDataKeyStore.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IntelReportData } from '../../../types/IntelWorkspace';
import type { ContentSensitivity } from '../../../types/intel/IntelItemUI';

const BODY = 'Sensitive report body — asset location and contact details.';

function makeReportData(overrides: Partial<IntelReportData> = {}): IntelReportData {
  const now = new Date().toISOString();
  return {
    id: `report-${Math.random().toString(36).slice(2)}`,
    title: 'Test Report',
    type: 'INTEL_REPORT',
    summary: 'summary',
    content: BODY,
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

/**
 * What is actually held at rest for this record.
 *
 * getReports() deliberately returns the STORED form — decryption is explicit
 * and on-demand (decryptReportContent), because making the 20+ synchronous
 * bulk-read call sites async is a separate refactor. So this is the stored
 * bytes, which is exactly what these assertions are about.
 *
 * A first version of this helper read localStorage directly on an assumed
 * shape and returned undefined for every record, failing all seven tests for a
 * reason that had nothing to do with the code under test.
 */
type ManagerLike = { getReports(): Array<{ id: string; content: string }> };
function storedContent(manager: ManagerLike, id: string): string | undefined {
  return manager.getReports().find(r => r.id === id)?.content;
}

describe('encryption at rest is keyed on sensitivity', () => {
  beforeEach(() => { vi.resetModules(); localStorage.clear(); });

  it("stores a 'protected' report as real ciphertext", async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    await intelWorkspaceManager.addReport(makeReportData({
      id: 'report-protected',
      metadata: { sensitivity: 'protected' satisfies ContentSensitivity }
    }));

    const stored = storedContent(intelWorkspaceManager, 'report-protected');
    expect(stored).toBeDefined();
    expect(stored).not.toContain('asset location');
    expect(JSON.parse(stored!).__classifiedEncrypted).toBe(true);

    // and it comes back
    expect(await intelWorkspaceManager.decryptReportContent('report-protected')).toBe(BODY);
  });

  /**
   * The combination the ladder could not express. 'careful' means redact on the
   * way out; it says nothing about this device's storage.
   */
  it("leaves a 'careful' report as plaintext at rest — redaction is the other axis", async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    await intelWorkspaceManager.addReport(makeReportData({
      id: 'report-careful',
      metadata: { sensitivity: 'careful' satisfies ContentSensitivity }
    }));

    expect(storedContent(intelWorkspaceManager, 'report-careful')).toBe(BODY);
  });

  it("leaves an 'open' report as plaintext at rest", async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    await intelWorkspaceManager.addReport(makeReportData({
      id: 'report-open',
      metadata: { sensitivity: 'open' satisfies ContentSensitivity }
    }));

    expect(storedContent(intelWorkspaceManager, 'report-open')).toBe(BODY);
  });

  /**
   * An explicit axis wins over the legacy ladder. This is what lets a record be
   * downgraded out of encryption deliberately, rather than by deleting a field
   * and hoping the bridge reads the absence the way you meant.
   */
  it('prefers an explicit sensitivity over a legacy classification', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    await intelWorkspaceManager.addReport(makeReportData({
      id: 'report-override',
      metadata: { sensitivity: 'open' satisfies ContentSensitivity }
    }));

    expect(storedContent(intelWorkspaceManager, 'report-override')).toBe(BODY);
  });

  /**
   * metadata is Record<string, unknown>, so anything can be in there. A junk
   * value must not reach a predicate as a ContentSensitivity it is not — it is
   * narrowed away, and the record reads as unmarked.
   *
   * (This used to assert that a junk value "falls through to the bridge",
   * which then read a legacy tier and encrypted. The bridge is gone: a record
   * with a junk axis and no valid one is simply unmarked, and unmarked is the
   * open case.)
   */
  it('ignores a junk sensitivity rather than acting on it', async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    await intelWorkspaceManager.addReport(makeReportData({
      id: 'report-junk',
      metadata: { sensitivity: 42 }
    }));

    expect(storedContent(intelWorkspaceManager, 'report-junk')).toBe(BODY);
  });
});

describe('cases and missions read the axis off the record itself', () => {
  beforeEach(() => { vi.resetModules(); localStorage.clear(); });

  it("encrypts a 'protected' case description and decrypts it back", async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const description = 'Sensitive case description — real names and locations.';
    const created = await intelWorkspaceManager.addCase({
      title: 'Protected Case',
      description,
      sensitivity: 'protected'
    });

    const stored = intelWorkspaceManager.getCases().find(c => c.id === created.id)?.description;
    expect(stored).not.toContain('real names');
    expect(JSON.parse(stored!).__classifiedEncrypted).toBe(true);

    expect(await intelWorkspaceManager.decryptCaseDescription(created.id)).toBe(description);
  });

  it("leaves a 'careful' case description readable at rest", async () => {
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const description = 'Sensitive case description — real names and locations.';
    const created = await intelWorkspaceManager.addCase({
      title: 'Careful Case',
      description,
      sensitivity: 'careful'
    });

    expect(intelWorkspaceManager.getCases().find(c => c.id === created.id)?.description)
      .toBe(description);
  });
});
