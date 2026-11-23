/**
 * Bundles honour distribution (plan item 9.13; decision G8 and the three
 * refinements the owner chose on 2026-09-29).
 *
 *   A Private case or mission stays put: never sent, never exported.
 *   One nobody has decided on is asked about first, and goes nowhere until then.
 *   Limited and Public go, to the people named.
 *   A Private record it cites is left out, and so is what only that record
 *   cites. The signed manifest names what was left out by id alone, so the
 *   people receiving it learn a record was kept back, never what it holds.
 *   An undecided record it cites goes with it, and stays undecided.
 *
 * Export as a file follows the same rule as sending: both are makeBundleOf.
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
    pubkey, workspace: intelWorkspaceManager,
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

const item = (title: string, visibility?: 'private' | 'limited') => ({
  title, type: 'IMAGERY', source: 'OSINT', reliability: 'B' as const, confidence: 0.7, tags: [], categories: [], content: `${title}, as captured.`,
  ...(visibility ? { visibility } : {}),
});

describe('a case or mission that is Private, or undecided', () => {
  it('a Private case is never bundled, to send or to save as a file, and says why', async () => {
    const a = await machine('Priya');
    const created = await a.workspace.addCase({ title: 'Informant list', description: 'Names.', visibility: 'private' });
    await expect(a.collect.collectBundle({ type: 'case', id: created.id })).rejects.toThrow(
      'This case is Private: it stays in this workspace, and is never sent or exported to anyone else. To hand it on, change who may receive it first.',
    );
    await expect(a.collect.makeBundleOf({ type: 'case', id: created.id })).rejects.toThrow(/Private: it stays in this workspace/);
  });

  it('an undecided mission is asked about first', async () => {
    const a = await machine('Priya');
    const mission = await a.workspace.addMission({ title: 'Watch berth 4', briefing: 'Rests on direct observation.' });
    await expect(a.collect.makeBundleOf({ type: 'mission', id: mission.id })).rejects.toThrow(
      'Nobody has chosen who may receive this mission yet. Choose first: Private stays here, and Limited and Public can go to the people you name.',
    );
  });

  it('a Limited case and a Public mission go', async () => {
    const a = await machine('Priya');
    const created = await a.workspace.addCase({ title: 'Night loading', description: 'Body.', visibility: 'limited' });
    const mission = await a.workspace.addMission({ title: 'Watch berth 4', briefing: 'Rests on direct observation.', visibility: 'public' });
    expect((await a.collect.makeBundleOf({ type: 'case', id: created.id })).file.envelopes[0]).toMatchObject({ type: 'case', id: created.id });
    expect((await a.collect.makeBundleOf({ type: 'mission', id: mission.id })).file.envelopes[0]).toMatchObject({ type: 'mission', id: mission.id });
  });
});

describe('what a Limited case carries', () => {
  let a: Awaited<ReturnType<typeof machine>>;
  let caseId: string;
  let camera: string;
  let informant: string;
  let ledgerScan: string;
  let made: Awaited<ReturnType<Awaited<ReturnType<typeof machine>>['collect']['makeBundleOf']>>;
  let decrypted: string[];

  beforeAll(async () => {
    a = await machine('Priya');
    camera = a.workspace.addIntelItem(item('Port camera still')).id;
    informant = a.workspace.addIntelItem(item('Informant photo', 'private')).id;
    ledgerScan = a.workspace.addIntelItem(item('Ledger scan')).id;
    await a.workspace.addReport(report('intel-cranes', 'Berth 4 cranes at night', { sourceIntel: [camera, informant], metadata: { visibility: 'limited' } }));
    // Private, and protected: its content is ciphertext at rest, and must not be read to be left out.
    await a.workspace.addReport(report('intel-ledger', 'Harbour master ledger', { sourceIntel: [ledgerScan], metadata: { visibility: 'private', sensitivity: 'protected' } }));
    await a.workspace.addReport(report('intel-rota', 'Berth 4 shift rota'));
    const created = await a.workspace.addCase({
      title: 'Night loading at berth 4', description: 'Is berth 4 loading at night?', visibility: 'limited',
      relatedEntities: ['intel-cranes', 'intel-ledger'],
    });
    caseId = created.id;
    await a.workspace.updateCase({
      ...a.workspace.getCase(caseId)!, relatedCases: ['intelcase-elsewhere'],
      requirements: [{ id: 'req-1', question: 'When do shifts change?', because: 'Loading tracks the shifts.', raisedBy: 'x', raisedAt: '2026-09-26T10:30:00.000Z', answeredBy: ['intel-rota'] }],
    });
    decrypted = [];
    const read = a.workspace.decryptReportContent.bind(a.workspace);
    vi.spyOn(a.workspace, 'decryptReportContent').mockImplementation(async (id: string) => { decrypted.push(id); return read(id); });
    made = await a.collect.makeBundleOf({ type: 'case', id: caseId });
  }, 60_000);

  it('leaves out a Private report it cites, and the intel only that report cites, without reading them', () => {
    const records = made.file.envelopes.map((e) => `${e.type}:${e.id}`);
    expect(records).toEqual([`case:${caseId}`, 'report:intel-cranes', 'report:intel-rota', `item:${camera}`]);
    expect(decrypted).not.toContain('intel-ledger');
  });

  it('leaves out a Private intel item a report it carries cites', () => {
    expect(made.file.envelopes.some((e) => e.id === informant)).toBe(false);
  });

  it('tells the person sending it what stayed here, by title', () => {
    expect(made.withheld).toEqual([
      { type: 'report', id: 'intel-ledger', title: 'Harbour master ledger' },
      { type: 'item', id: informant, title: 'Informant photo' },
    ]);
  });

  it('carries an undecided record, still undecided', () => {
    const rota = made.file.envelopes.find((e) => e.id === 'intel-rota')!;
    expect((rota.record.metadata as Record<string, unknown>).visibility).toBeUndefined();
    const still = made.file.envelopes.find((e) => e.id === camera)!;
    expect((still.record.frontmatter as Record<string, unknown>).visibility).toBeUndefined();
  });

  it('names what was kept back in the signed manifest, by id alone: nothing it holds goes anywhere', () => {
    const manifest = JSON.parse(made.file.manifest.content);
    expect(manifest.withheld).toEqual([{ type: 'report', id: 'intel-ledger' }, { type: 'item', id: informant }]);
    const sent = JSON.stringify(made.file);
    for (const secret of ['Harbour master ledger', 'Informant photo', 'Ledger scan', ledgerScan]) expect(sent).not.toContain(secret);
  });

  it('tells the person receiving it which records were kept back, apart from those still to arrive', async () => {
    const file = JSON.parse(JSON.stringify(made.file));
    const b = await machine('Aisha');
    const opened = await b.bundles.readBundle(file);
    if (!('bundle' in opened)) throw new Error(opened.refused);
    expect(opened.bundle.withheld).toEqual([{ type: 'report', id: 'intel-ledger' }, { type: 'item', id: informant }]);
    expect(opened.bundle.absent).toEqual([expect.objectContaining({ to: 'intelcase-elsewhere', rel: 'related-case' })]);
    const preview = b.importing.previewImport(opened.bundle);
    expect(preview.withheld).toEqual(opened.bundle.withheld);
    expect(preview.absent).toEqual(opened.bundle.absent);

    await b.importing.applyImport(opened.bundle);
    expect(b.workspace.getCase(caseId)!.receivedFrom).toEqual({ pubkey: a.pubkey, sentAt: opened.bundle.madeAt, withheld: ['intel-ledger', informant] });
    // Said once, on the case: the records under it only say who they came from.
    const cranes = b.workspace.getReports().find((r) => r.id === 'intel-cranes')!;
    expect((cranes.metadata as Record<string, unknown>).receivedFrom).toEqual({ pubkey: a.pubkey, sentAt: opened.bundle.madeAt });
    expect(b.workspace.getStoredIntelItem(camera)!.receivedFrom).toEqual({ pubkey: a.pubkey, sentAt: opened.bundle.madeAt });
    expect(b.workspace.getReports().some((r) => r.id === 'intel-ledger')).toBe(false);
  });

  it('refuses a bundle whose list of what was kept back was changed after signing', async () => {
    const file = JSON.parse(JSON.stringify(made.file));
    const manifest = JSON.parse(file.manifest.content);
    file.manifest.content = JSON.stringify({ ...manifest, withheld: [] });
    const b = await machine('Aisha');
    expect(await b.bundles.readBundle(file)).toEqual({ refused: expect.stringMatching(/something in it was changed/) });
  });
});

describe('the list of what was kept back', () => {
  it('is fingerprinted for the review by type and id, as the manifest will list it', async () => {
    const { stableSubject } = await import('../../../exchange/bundle');
    const subject = { type: 'case' as const, id: 'intelcase-1' };
    expect(stableSubject(subject, [])).toEqual({ subject, records: [] });
    expect(stableSubject(subject, [], [{ type: 'report', id: 'intel-ledger', title: 'Harbour master ledger' } as never]))
      .toEqual({ subject, records: [], withheld: [{ type: 'report', id: 'intel-ledger' }] });
  });

  it('is read only as far as it is well formed', async () => {
    const a = await machine('Priya');
    const created = await a.workspace.addCase({ title: 'Night loading', description: 'Body.', visibility: 'limited' });
    const { envelopes } = await a.collect.collectBundle({ type: 'case', id: created.id });
    const file = await a.bundles.makeBundle({ type: 'case', id: created.id }, envelopes, [
      { type: 'report', id: 'intel-ledger' }, { type: 'nonsense', id: 'x' } as never, { type: 'item', id: '' },
    ]);
    const opened = await a.bundles.readBundle(JSON.parse(JSON.stringify(file)));
    if (!('bundle' in opened)) throw new Error(opened.refused);
    expect(opened.bundle.withheld).toEqual([{ type: 'report', id: 'intel-ledger' }]);
  });
});

describe('what a mission carries', () => {
  it('leaves out a Private report an objective rests on, as a case does', async () => {
    const a = await machine('Priya');
    await a.workspace.addReport(report('intel-source', 'Who the source is', { metadata: { visibility: 'private' } }));
    await a.workspace.addReport(report('intel-cranes', 'Berth 4 cranes at night', { metadata: { visibility: 'public' } }));
    const mission = await a.workspace.addMission({ title: 'Watch berth 4', briefing: 'Rests on the cranes.', visibility: 'limited', relatedReports: ['intel-cranes'] });
    await a.workspace.updateMission({
      ...a.workspace.getMission(mission.id)!,
      objectives: [{ id: 'o1', description: 'Confirm with the source', completed: false, evidenceRef: 'intel-source' }],
    });
    const made = await a.collect.makeBundleOf({ type: 'mission', id: mission.id });
    expect(made.file.envelopes.map((e) => e.id)).toEqual([mission.id, 'intel-cranes']);
    expect(made.withheld).toEqual([{ type: 'report', id: 'intel-source', title: 'Who the source is' }]);
  });
});
