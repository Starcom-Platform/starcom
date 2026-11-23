/**
 * The handling axes must survive the path the APP uses, not just the one a
 * test can reach.
 *
 * ─── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 *
 * Stage 6b wired IntelWorkspaceManager's encryption gate to read `sensitivity`
 * out of report metadata, and tested it by calling addReport() with a
 * hand-built `metadata: { sensitivity: 'protected' }`. That is the low-level
 * API. The app creates reports through IntelReportService, which maps a
 * IntelReportUI into IntelReportData via uiToWorkspaceReportData — and that
 * mapper wrote `classification` into metadata and neither axis.
 *
 * So `sensitivity: 'protected'` did nothing on the real path: no axis in
 * metadata, no legacy tier for the bridge to read, content stored as
 * plaintext. The 6b test could not see it, because it constructed the
 * intermediate state the mapper was supposed to produce.
 *
 * These go through the service.
 *
 * jsdom has no crypto.subtle (polyfilled here from Node's real webcrypto, as
 * the sibling encryption suites do) and no IndexedDB for the key store.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, beforeEach, vi } from 'vitest';

const BODY = 'Report body naming a source and a meeting point.';

const input = (over: Record<string, unknown> = {}) => ({
  title: 'T', content: BODY, category: 'GENERAL', tags: [], ...over,
});

describe('a report created through the service', () => {
  beforeEach(() => { vi.resetModules(); localStorage.clear(); });

  it("is ciphertext at rest when created with sensitivity 'protected'", async () => {
    const { intelReportService } = await import('../IntelReportService');
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const created = await intelReportService.createReport(input({ sensitivity: 'protected' }) as never, 'tester');

    const stored = intelWorkspaceManager.getReports().find(r => r.id === created.id);
    expect(stored).toBeDefined();
    expect(stored!.content).not.toContain('meeting point');
    expect(JSON.parse(stored!.content).__classifiedEncrypted).toBe(true);
  });

  it("is plaintext at rest when created with sensitivity 'careful'", async () => {
    const { intelReportService } = await import('../IntelReportService');
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const created = await intelReportService.createReport(input({ sensitivity: 'careful' }) as never, 'tester');

    expect(intelWorkspaceManager.getReports().find(r => r.id === created.id)!.content).toBe(BODY);
  });

  it('round-trips both axes back out through the mapper', async () => {
    const { intelReportService } = await import('../IntelReportService');
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const created = await intelReportService.createReport(
      input({ visibility: 'limited', sensitivity: 'careful' }) as never, 'tester');

    const read = await intelReportService.getReport(created.id);
    expect(read?.visibility).toBe('limited');
    expect(read?.sensitivity).toBe('careful');
  });

  /**
   * The invented default. `classification: input.classification ||
   * 'UNCLASSIFIED'` asserted that somebody reviewed the report and decided it
   * was releasable. Nobody did — the author simply did not fill in a field.
   */
  it('does not invent a marking for a report that declared none', async () => {
    const { intelReportService } = await import('../IntelReportService');
    const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
    await intelWorkspaceManager.ensureInitialized();

    const created = await intelReportService.createReport(input() as never, 'tester');

    const read = await intelReportService.getReport(created.id);
    expect(read?.classification).toBeUndefined();
    expect(read?.visibility).toBeUndefined();
    expect(read?.sensitivity).toBeUndefined();
  });
});
