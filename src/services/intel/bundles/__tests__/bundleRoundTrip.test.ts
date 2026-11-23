/**
 * A case handed from one machine to another as a bundle (plan item 2.4,
 * slice c; decision D1): collected with its reports and the intel they cite,
 * signed, carried as text, read, previewed and imported into a workspace that
 * has never seen any of it.
 *
 * The links hold because ids do; a protected field arrives readable and is
 * encrypted at rest again on the machine that receives it; "newer" decides
 * whether a copy already held is updated; and who sent it is recorded.
 *
 * Two machines, one process: each "machine" starts from empty storage, a
 * fresh set of modules and its own key.
 *
 * @vitest-environment node
 */
import 'fake-indexeddb/auto';
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

/** A machine: empty storage, fresh modules, its own key and name. */
async function machine(name: string) {
  freshStorage();
  await wipeIndexedDb();
  vi.resetModules();
  const nostrService = (await import('../../../nostrService')).default;
  const { intelWorkspaceManager } = await import('../../IntelWorkspaceManager');
  const names = await import('../../../identity/names');
  const pubkey = nostrService.ensureIdentity(`being ${name}`);
  names.setOwnName(name);
  await intelWorkspaceManager.ensureInitialized();
  return {
    pubkey, names, workspace: intelWorkspaceManager,
    bundles: await import('../../../exchange/bundle'),
    collect: await import('../collectBundle'),
    importing: await import('../importBundle'),
  };
}

const report = (id: string, title: string, overrides: Partial<IntelReportData> = {}): IntelReportData => ({
  id, title, type: 'INTEL_REPORT', summary: '', content: `${title}: what was seen.`, conclusions: [], recommendations: [],
  analysisType: 'OSINT', methodology: [], confidence: 0.6, priority: 'HIGH', sourceIntel: [], author: 'x', contributors: [],
  createdAt: '2026-09-26T11:00:00.000Z', modifiedAt: '2026-09-26T12:00:00.000Z', targetAudience: [], metadata: {}, ...overrides,
});

let sent: string;
let caseId: string;
let caseNumber: string;
let priya: string;

beforeAll(async () => {
  const a = await machine('Priya');
  priya = a.pubkey;
  const item = a.workspace.addIntelItem({ title: 'Port camera still', type: 'IMAGERY', source: 'OSINT', reliability: 'B', confidence: 0.7, tags: [], categories: [], content: 'A container ship at berth 4.' });
  await a.workspace.addReport(report('intel-berth4-cranes', 'Berth 4 cranes at night', { sourceIntel: [item.id] }));
  await a.workspace.addReport(report('intel-berth4-idle', 'Berth 4 idle at 03:00', { metadata: { sensitivity: 'protected' } }));
  await a.workspace.addReport(report('intel-berth4-shift', 'Berth 4 shift rota'));
  const created = await a.workspace.addCase({
    title: 'Night loading at berth 4', description: 'Informant says the loading is for Vessel K.', sensitivity: 'protected', visibility: 'limited',
    // The teams Priya picked for it (LW1): hers, never in what she sends.
    limitedTo: ['wss://relay.priyas-team.example'],
    relatedEntities: ['intel-berth4-cranes', 'intel-berth4-idle'],
  });
  caseId = created.id;
  caseNumber = created.caseNumber;
  const stored = a.workspace.getCase(caseId)!;
  await a.workspace.updateCase({
    ...stored, description: 'Informant says the loading is for Vessel K.', contradictedBy: ['intel-berth4-idle'], relatedCases: ['intelcase-not-sent'],
    // A report cited only as a requirement's answer travels too.
    requirements: [{ id: 'req-1', question: 'When do shifts change?', because: 'Loading tracks the shifts.', raisedBy: 'x', raisedAt: '2026-09-26T10:30:00.000Z', answeredBy: ['intel-berth4-shift'] }],
  });
  sent = JSON.stringify((await a.collect.makeBundleOf({ type: 'case', id: caseId })).file);
}, 60_000);

describe('a case handed to another machine', () => {
  it('carries the case, its reports and the intel they cite, readable, with nothing protected left as ciphertext', () => {
    const file = JSON.parse(sent);
    const records = file.envelopes.map((e: { type: string; id: string }) => `${e.type}:${e.id}`);
    expect(records).toEqual(expect.arrayContaining([`case:${caseId}`, 'report:intel-berth4-cranes', 'report:intel-berth4-idle', 'report:intel-berth4-shift']));
    expect(records.filter((r: string) => r.startsWith('item:'))).toHaveLength(1);
    expect(sent).toContain('Informant says the loading is for Vessel K.');
    expect(sent).toContain('Berth 4 idle at 03:00: what was seen.');
  });

  it('never names the teams its sender picked for it (LW1), and takes in none a record names', async () => {
    expect(sent).not.toContain('priyas-team');
    const b = await machine('Aisha');
    const opened = await b.bundles.readBundle(JSON.parse(sent));
    if (!('bundle' in opened)) throw new Error(opened.refused);
    const naming = { ...opened.bundle, envelopes: opened.bundle.envelopes.map((e) => (e.type === 'case' ? { ...e, record: { ...e.record, limitedTo: ['wss://relay.aishas-team.example'] } } : e)) };
    await b.importing.applyImport(naming);
    expect(b.workspace.getCase(caseId)).not.toHaveProperty('limitedTo');
  });

  it('shows the person receiving it what it holds, and who sent it, before anything is added', async () => {
    const b = await machine('Aisha');
    const opened = await b.bundles.readBundle(JSON.parse(sent));
    if (!('bundle' in opened)) throw new Error(opened.refused);
    const preview = b.importing.previewImport(opened.bundle);
    expect(preview.from).toBe(priya);
    expect(preview.fromName).toBe('Priya');
    expect(preview.rows.map((r) => r.action)).toEqual(['add', 'add', 'add', 'add', 'add']);
    expect(preview.absent).toEqual([expect.objectContaining({ to: 'intelcase-not-sent', rel: 'related-case' })]);
    expect(b.workspace.getCases()).toEqual([]);
  });

  it('imports with ids, links and numbers intact, re-encrypts what is protected, and records who it came from', async () => {
    const b = await machine('Aisha');
    const opened = await b.bundles.readBundle(JSON.parse(sent));
    if (!('bundle' in opened)) throw new Error(opened.refused);
    expect(await b.importing.applyImport(opened.bundle)).toEqual({ added: 5, updated: 0, kept: 0 });

    const imported = b.workspace.getCase(caseId)!;
    expect(imported.caseNumber).toBe(caseNumber);
    expect(imported.relatedEntities).toEqual(['intel-berth4-cranes', 'intel-berth4-idle']);
    expect(imported.contradictedBy).toEqual(['intel-berth4-idle']);
    for (const id of imported.relatedEntities) expect(b.workspace.getReports().some((r) => r.id === id)).toBe(true);
    const cranes = b.workspace.getReports().find((r) => r.id === 'intel-berth4-cranes')!;
    expect(b.workspace.getIntelItem(cranes.sourceIntel[0])).not.toBeNull();
    // The intel it cites says who it came from too: the store kept it and the
    // screen's shape dropped it, so a peer's item framed as yours (BD19).
    expect(b.workspace.getIntelItem(cranes.sourceIntel[0])?.receivedFrom).toEqual({ pubkey: priya, sentAt: opened.bundle.madeAt });

    expect(imported.description).not.toContain('Vessel K');
    expect(await b.workspace.decryptCaseDescription(caseId)).toBe('Informant says the loading is for Vessel K.');
    expect(b.workspace.getReports().find((r) => r.id === 'intel-berth4-idle')!.content).not.toContain('what was seen');
    expect(await b.workspace.decryptReportContent('intel-berth4-idle')).toBe('Berth 4 idle at 03:00: what was seen.');

    expect(imported.receivedFrom).toEqual({ pubkey: priya, sentAt: opened.bundle.madeAt });
    expect(b.names.nameOf(priya)).toMatchObject({ name: 'Priya', source: 'bundle' });

    // A received report says so on screen, and still does after it is edited here.
    const { intelReportService } = await import('../../IntelReportService');
    const shown = await intelReportService.getReport('intel-berth4-cranes');
    expect(shown?.receivedFrom).toEqual({ pubkey: priya, sentAt: opened.bundle.madeAt });
    await intelReportService.saveReport({ ...shown!, title: 'Berth 4 cranes, edited here' });
    expect((await intelReportService.getReport('intel-berth4-cranes'))?.receivedFrom).toEqual({ pubkey: priya, sentAt: opened.bundle.madeAt });
  });

  it('keeps the copy held when it is as new, updates it when the bundle is newer, and keeps it when it is newer here', async () => {
    const b = await machine('Aisha');
    const first = await b.bundles.readBundle(JSON.parse(sent));
    if (!('bundle' in first)) throw new Error(first.refused);
    await b.importing.applyImport(first.bundle);
    expect(b.importing.previewImport(first.bundle).rows.every((r) => r.action === 'keep')).toBe(true);

    const newer = JSON.parse(sent);
    const newerCase = newer.envelopes.find((e: { type: string }) => e.type === 'case');
    const stale = b.importing.previewImport({ ...first.bundle, envelopes: first.bundle.envelopes.map((e) => (e.type === 'case' ? { ...e, updatedAt: '2030-01-01T00:00:00.000Z', record: { ...e.record, title: 'Renamed later', updatedAt: '2030-01-01T00:00:00.000Z' } } : e)) });
    expect(stale.rows.find((r) => r.type === 'case')).toMatchObject({ action: 'update' });
    expect(newerCase).toBeTruthy();

    const held = b.workspace.getCase(caseId)!;
    await b.workspace.updateCase({ ...held, description: 'Aisha edited this since.' });
    expect(b.importing.previewImport(first.bundle).rows.find((r) => r.type === 'case')).toMatchObject({ action: 'keep', note: expect.stringMatching(/newer here/) });
  });

  it("says when a case here already has the incoming case's number", async () => {
    const b = await machine('Aisha');
    await b.workspace.addCase({ title: 'Some other case', description: 'Unrelated.', caseNumber });
    const opened = await b.bundles.readBundle(JSON.parse(sent));
    if (!('bundle' in opened)) throw new Error(opened.refused);
    expect(b.importing.previewImport(opened.bundle).rows.find((r) => r.type === 'case')).toMatchObject({
      action: 'add', note: expect.stringMatching(/Some other case.*same number/),
    });
  });
});
