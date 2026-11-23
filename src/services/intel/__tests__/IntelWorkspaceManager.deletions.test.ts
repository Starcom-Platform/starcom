/**
 * Deletes you can take back, in the workspace (plan item 0.6).
 *
 * All three remove* methods deleted a protected record's key at once, so a
 * record brought back after that would have been ciphertext nothing can read.
 * The key now goes only when the deletion is final. A restore is the same
 * record in the same place, and every delete is logged with a snapshot.
 *
 * Same jsdom + crypto.subtle + fake-indexeddb setup as the encryption suites.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { classifiedDataKeyStore } from '../../crypto/ClassifiedDataKeyStore';

const SECRET = 'Sensitive case description: names and places.';

/**
 * The workspace a test used, so its waiting save can be cancelled when the
 * test ends. Left running, it wrote the finished test's state into both saved
 * copies after the next test had started, and that test loaded it: a delete
 * from an earlier test's workspace appeared in a fresh one, under load.
 */
let current: { cancelPendingSave(): void } | null = null;

async function wipeIndexedDb(): Promise<void> {
  for (const db of await indexedDB.databases()) {
    if (db.name) await new Promise((resolve) => { const req = indexedDB.deleteDatabase(db.name!); req.onsuccess = req.onerror = req.onblocked = () => resolve(null); });
  }
}

async function freshWorkspace() {
  const { intelWorkspaceManager } = await import('../IntelWorkspaceManager');
  current = intelWorkspaceManager;
  await intelWorkspaceManager.ensureInitialized();
  const a = await intelWorkspaceManager.addCase({ title: 'A', description: 'a' });
  const b = await intelWorkspaceManager.addCase({ title: 'B', description: SECRET, sensitivity: 'protected' });
  const c = await intelWorkspaceManager.addCase({ title: 'C', description: 'c' });
  return { intelWorkspaceManager, a, b, c };
}

describe('deleting from the workspace', () => {
  beforeEach(async () => { vi.resetModules(); localStorage.clear(); await wipeIndexedDb(); });
  afterEach(() => { current?.cancelPendingSave(); current = null; });

  it('puts a restored record back as the same record, in the same place, still readable', async () => {
    const { intelWorkspaceManager, b } = await freshWorkspace();
    const order = intelWorkspaceManager.getCases().map((x) => x.id);

    intelWorkspaceManager.removeCase(b.id);
    expect(intelWorkspaceManager.getCases().map((x) => x.id)).not.toContain(b.id);

    expect(intelWorkspaceManager.restoreDeleted('case', b.id)?.id).toBe(b.id);
    expect(intelWorkspaceManager.getCases().map((x) => x.id)).toEqual(order);
    expect(await intelWorkspaceManager.decryptCaseDescription(b.id)).toBe(SECRET);
  });

  it('logs each delete with a snapshot of the record', async () => {
    const { intelWorkspaceManager, b } = await freshWorkspace();
    intelWorkspaceManager.removeCase(b.id);

    const [entry] = intelWorkspaceManager.deletions();
    expect(entry).toMatchObject({ kind: 'case', id: b.id, title: 'B' });
    expect((entry.snapshot as { id: string }).id).toBe(b.id);
    expect(typeof entry.deletedAt).toBe('string');
  });

  it("deletes a protected record's key only when the deletion is final", async () => {
    const { intelWorkspaceManager, b } = await freshWorkspace();
    intelWorkspaceManager.removeCase(b.id);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await classifiedDataKeyStore.get(b.id)).toBeDefined();

    await intelWorkspaceManager.finalizeDeletion('case', b.id);
    expect(await classifiedDataKeyStore.get(b.id)).toBeUndefined();
    expect(intelWorkspaceManager.restoreDeleted('case', b.id)).toBeNull();
  });

  it('finishes a deletion a closed page left unfinished, and leaves restored records alone', async () => {
    const { intelWorkspaceManager, a, b } = await freshWorkspace();
    intelWorkspaceManager.removeCase(b.id);
    intelWorkspaceManager.removeCase(a.id);
    intelWorkspaceManager.restoreDeleted('case', a.id);

    await intelWorkspaceManager.finalizeOverdueDeletions(Date.now() + 11_000);
    expect(await classifiedDataKeyStore.get(b.id)).toBeUndefined();
    expect(intelWorkspaceManager.getCases().map((x) => x.id)).toContain(a.id);
  });
});
