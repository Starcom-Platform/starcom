/**
 * Export all my work (plan item 9.13b, decision G8d): every case, mission,
 * report and intel item kept here, Private included, in one file only the
 * person's own key can open. Other people's reports, which the relay feed
 * stores, stay on their relays; sample material stays out; and a protected
 * record whose key is gone is named rather than copied unreadable.
 *
 * Two machines, one process: the second holds the same key, brought as its
 * nsec, or another key.
 *
 * @vitest-environment node
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IntelReportData } from '../../../../types/IntelWorkspace';

function freshStorage(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}

async function wipeIndexedDb(): Promise<void> {
  for (const db of await indexedDB.databases()) {
    if (db.name) await new Promise((resolve) => { const req = indexedDB.deleteDatabase(db.name!); req.onsuccess = req.onerror = req.onblocked = () => resolve(null); });
  }
}

/** A machine with empty storage and fresh modules: its own new key, or the one given. */
async function machine(nsec?: string) {
  freshStorage();
  await wipeIndexedDb();
  vi.resetModules();
  const nostrService = (await import('../../../nostrService')).default;
  const { nostrIdentityService } = await import('../../../identity/NostrIdentityService');
  const pubkey = nsec ? nostrIdentityService.importNsec(nsec) : nostrService.ensureIdentity('writing a report');
  const { intelWorkspaceManager } = await import('../../IntelWorkspaceManager');
  await intelWorkspaceManager.ensureInitialized();
  return {
    pubkey, identity: nostrIdentityService, workspace: intelWorkspaceManager,
    copy: await import('../workCopy'),
    importing: await import('../../bundles/importBundle'),
  };
}

const report = (id: string, title: string, overrides: Partial<IntelReportData> = {}): IntelReportData => ({
  id, title, type: 'INTEL_REPORT', summary: '', content: `${title}: what was seen.`, conclusions: [], recommendations: [],
  analysisType: 'OSINT', methodology: [], confidence: 0.6, priority: 'HIGH', sourceIntel: [], author: 'x', contributors: [],
  createdAt: '2026-09-26T11:00:00.000Z', modifiedAt: '2026-09-26T12:00:00.000Z', targetAudience: [], metadata: {}, ...overrides,
});

let a: Awaited<ReturnType<typeof machine>>;
let nsec: string;
let made: Awaited<ReturnType<Awaited<ReturnType<typeof machine>>['copy']['makeWorkCopy']>>;
let caseId: string;
let missionId: string;
let itemId: string;

beforeAll(async () => {
  a = await machine();
  nsec = a.identity.exportNsec();
  itemId = a.workspace.addIntelItem({ title: 'Informant photo', type: 'IMAGERY', source: 'HUMINT', reliability: 'B', confidence: 0.7, tags: [], categories: [], content: 'A face.', visibility: 'private' }).id;
  await a.workspace.addReport(report('intel-ledger', 'Harbour master ledger', { metadata: { visibility: 'private', sensitivity: 'protected' } }));
  await a.workspace.addReport(report('intel-rota', 'Berth 4 shift rota'));
  // Someone else's, as the relay feed stores it.
  await a.workspace.addReport(report('30023:abc:starcom-intel-1', 'Their public report', { metadata: { history: [{ action: 'IMPORTED', timestamp: '2026-09-28T00:00:00.000Z', user: 'nostr' }] } }));
  await a.workspace.addReport(report('intel-sample', 'Sample report', { metadata: { sample: true } }));
  caseId = (await a.workspace.addCase({ title: 'Informant list', description: 'Names we hold.', visibility: 'private', sensitivity: 'protected', relatedEntities: ['intel-ledger'] })).id;
  missionId = (await a.workspace.addMission({ title: 'Watch berth 4', briefing: 'Rests on direct observation.' })).id;
  await a.workspace.addCase({ title: 'Demo case', description: 'Seeded.', sample: true });
  made = await a.copy.makeWorkCopy();
}, 60_000);

describe('Export all my work', () => {
  it('holds every case, mission, report and intel item made here, Private and undecided included', () => {
    expect(made.holds).toEqual({ case: 1, mission: 1, report: 2, item: 1 });
    expect(made.file).toMatchObject({ format: 'starcom.copy', version: 1, owner: a.pubkey });
  });

  it('leaves out what others published, which stays on their relays, and sample material, and says so', () => {
    expect(made.leftOut).toEqual({ fromRelays: 1, sample: 2, unreadable: [] });
  });

  it('shows nothing it holds to whoever has the file without the key', () => {
    // Decoded too: base64 alone would hide the words from this check and from nobody else.
    const text = [JSON.stringify(made.file), Buffer.from(made.file.data, 'base64').toString('latin1'), Buffer.from(made.file.key, 'base64').toString('latin1')].join('\n');
    for (const secret of ['Informant list', 'Names we hold', 'Harbour master ledger', 'Informant photo', 'Watch berth 4', caseId, itemId]) {
      expect(text).not.toContain(secret);
    }
  });

  it('names a protected record whose key this browser no longer holds, and leaves it out', async () => {
    // Its own machine: the test setup gives every test a fresh IndexedDB, where these keys live.
    const m = await machine();
    await m.workspace.addCase({ title: 'Informant list', description: 'Names we hold.', visibility: 'private', sensitivity: 'protected' });
    await m.workspace.addReport(report('intel-ledger', 'Harbour master ledger', { metadata: { visibility: 'private', sensitivity: 'protected' } }));
    await m.workspace.addReport(report('intel-rota', 'Berth 4 shift rota'));
    // The keys gone, as when this browser's site data was partly cleared.
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = new IDBFactory();
    const again = await m.copy.makeWorkCopy();
    expect(again.leftOut.unreadable).toEqual(['Informant list', 'Harbour master ledger']);
    expect(again.holds).toEqual({ case: 0, mission: 0, report: 1, item: 0 });
  });
});

describe('Opening a copy', () => {
  it('opens on another device holding the same key, and imports it as it was: ids, links and Private kept', async () => {
    const file = JSON.parse(JSON.stringify(made.file));
    const b = await machine(nsec);
    const opened = await b.copy.openWorkCopy(file);
    if (!('copy' in opened)) throw new Error(opened.refused);
    expect(opened.copy.owner).toBe(a.pubkey);
    const preview = b.importing.previewCopy(opened.copy);
    expect(preview.rows.map((r) => r.action)).toEqual(['add', 'add', 'add', 'add', 'add']);

    expect(await b.importing.applyCopy(opened.copy)).toEqual({ added: 5, updated: 0, kept: 0 });
    const imported = b.workspace.getCase(caseId)!;
    expect(imported.visibility).toBe('private');
    expect(imported.relatedEntities).toEqual(['intel-ledger']);
    // Protected at rest again here, and readable with this device's key.
    expect(imported.description).not.toContain('Names we hold');
    expect(await b.workspace.decryptCaseDescription(caseId)).toBe('Names we hold.');
    // Your own work, not something received.
    expect(imported.receivedFrom).toBeUndefined();
    expect(b.workspace.getMission(missionId)!.visibility).toBeUndefined();
    expect(b.workspace.getStoredIntelItem(itemId)).not.toBeNull();
  });

  it('refuses on another key, and names the key it is sealed to', async () => {
    const file = JSON.parse(JSON.stringify(made.file));
    const c = await machine();
    const opened = await c.copy.openWorkCopy(file);
    expect(opened).toEqual({ refused: expect.stringMatching(/^This copy is sealed to another key, npub1\S{9}…\S{6}\. Open it where that key is, or bring that key here under Your key\.$/) });
  });

  it('refuses a copy changed after it was made', async () => {
    const file = JSON.parse(JSON.stringify(made.file));
    const bytes = Buffer.from(file.data, 'base64');
    bytes[bytes.length - 1] ^= 1;
    file.data = bytes.toString('base64');
    const b = await machine(nsec);
    expect(await b.copy.openWorkCopy(file)).toEqual({ refused: 'This copy was changed after it was made, so it cannot be opened.' });
  });

  it('says a file that is not a copy is not one', async () => {
    const b = await machine(nsec);
    expect(await b.copy.openWorkCopy({ format: 'starcom.bundle', version: 1 })).toEqual({ refused: 'This is not a copy of Starcom work.' });
  });
});
