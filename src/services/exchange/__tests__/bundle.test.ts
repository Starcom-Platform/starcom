/**
 * A signed bundle of a case or a mission (plan item 2.4, slice a; decision
 * D1): each record is an envelope with the hash of its canonical JSON, and a
 * manifest lists those hashes and the links between the records. The
 * manifest is signed with ML-DSA-65 and travels as the content of a Nostr
 * event signed by the sender, which ties the post-quantum key to a person.
 *
 * Anything altered after signing is refused, and says what.
 *
 * @vitest-environment node
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { finalizeEvent, generateSecretKey, nip19 } from 'nostr-tools';
import { envelopeOf, linksOf, makeBundle, readBundle, type BundleFile } from '../bundle';
import nostrService from '../../nostrService';
import { setOwnName, learnName } from '../../identity/names';

function installStorageShim(): void {
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

// Stored shapes, with the field types the workspace writes.
const item = {
  id: 'intel-item-1',
  frontmatter: { title: 'Port camera still', type: 'IMAGERY', source: 'OSINT', reliability: 'B', confidence: 0.7, timestamp: 1790380000000, collectedAt: '2026-09-26T10:00:00.000Z', tags: [], categories: [], verified: false },
  body: 'A container ship at berth 4.',
};
const reportA = {
  id: 'intel-1b7e', title: 'Berth 4 activity', type: 'INTEL_REPORT', summary: 'Night loading.', content: 'Three cranes working after 02:00.',
  conclusions: [], recommendations: [], analysisType: 'OSINT', methodology: [], confidence: 0.6, priority: 'HIGH',
  sourceIntel: ['intel-item-1'], author: 'a'.repeat(64), contributors: [], createdAt: '2026-09-26T11:00:00.000Z', modifiedAt: '2026-09-26T12:00:00.000Z',
  targetAudience: [], metadata: { history: [{ action: 'CREATED', timestamp: '2026-09-26T11:00:00.000Z', user: 'a'.repeat(64) }], version: 2 },
};
const reportB = { ...reportA, id: 'intel-9c2f', title: 'Berth 4 idle', content: 'No cranes moving at 03:00.', sourceIntel: [], modifiedAt: '2026-09-26T13:00:00.000Z' };
const theCase = {
  id: 'intelcase-1790380000000-ab12', caseNumber: 'CASE-2026-4821', title: 'Night loading at berth 4', description: 'Is berth 4 loading at night?',
  status: 'ACTIVE', priority: 'HIGH', assignedTo: [], startDate: '2026-09-26T10:00:00.000Z',
  relatedEntities: ['intel-1b7e', 'intel-9c2f'], contradictedBy: ['intel-9c2f'], relatedCases: ['intelcase-elsewhere'],
  requirements: [{ id: 'req-1', question: 'When do the cranes run?', answeredBy: ['intel-1b7e'], raisedBy: 'a'.repeat(64), raisedAt: '2026-09-26T10:30:00.000Z' }],
  tags: [], metadata: {}, createdAt: '2026-09-26T10:00:00.000Z', updatedAt: '2026-09-26T14:00:00.000Z', createdBy: 'a'.repeat(64),
  collaborators: [], comments: [], activityLog: [{ id: 'activity-1', action: 'CREATED', timestamp: '2026-09-26T10:00:00.000Z', userId: 'a'.repeat(64), details: {} }],
  permissions: { isPublic: false },
};
const subject = { type: 'case' as const, id: theCase.id };
const envelopes = () => [envelopeOf('case', theCase), envelopeOf('report', reportA), envelopeOf('report', reportB), envelopeOf('item', item)];
const overTheWire = (file: BundleFile): unknown => JSON.parse(JSON.stringify(file));

let sender: string;
beforeEach(() => {
  installStorageShim();
  nostrService.forgetIdentity();
  sender = nostrService.ensureIdentity('sending a bundle');
});

describe('a signed bundle', () => {
  it('reads back, over the wire, with every record and every link intact, from its sender', async () => {
    const opened = await readBundle(overTheWire(await makeBundle(subject, envelopes())));
    if (!('bundle' in opened)) throw new Error(opened.refused);
    const { bundle } = opened;
    expect(bundle.from).toBe(sender);
    expect(bundle.subject).toMatchObject({ type: 'case', id: theCase.id, title: 'Night loading at berth 4', number: 'CASE-2026-4821' });
    expect(bundle.envelopes.map((e) => e.record)).toEqual([theCase, reportA, reportB, item]);
    expect(bundle.links).toEqual(expect.arrayContaining([
      { from: theCase.id, to: 'intel-1b7e', rel: 'evidence' },
      { from: theCase.id, to: 'intel-9c2f', rel: 'contradicted-by' },
      { from: theCase.id, to: 'intel-1b7e', rel: 'answers' },
      { from: theCase.id, to: 'intelcase-elsewhere', rel: 'related-case' },
      { from: 'intel-1b7e', to: 'intel-item-1', rel: 'source' },
    ]));
    expect(bundle.absent).toEqual([{ from: theCase.id, to: 'intelcase-elsewhere', rel: 'related-case' }]);
  });

  it("finds a mission's links: reports cited, cases, objective evidence and what it follows up", () => {
    const mission = {
      id: 'mission-1', missionNumber: 'MSN-2026-1122', title: 'Watch berth 4', relatedReports: ['intel-1b7e'], relatedCases: [theCase.id],
      objectives: [{ id: 'objective-1', description: 'Photograph the cranes', completed: false, evidenceRef: 'intel-9c2f' }],
      metadata: { followUpOf: 'mission-0' }, updatedAt: '2026-09-26T15:00:00.000Z',
    };
    expect(linksOf([envelopeOf('mission', mission)])).toEqual([
      { from: 'mission-1', to: 'intel-1b7e', rel: 'cites' },
      { from: 'mission-1', to: theCase.id, rel: 'related-case' },
      { from: 'mission-1', to: 'intel-9c2f', rel: 'objective-evidence' },
      { from: 'mission-1', to: 'mission-0', rel: 'follow-up-of' },
    ]);
  });

  it('refuses a record changed after signing, and names it', async () => {
    const file = overTheWire(await makeBundle(subject, envelopes())) as BundleFile;
    (file.envelopes[1].record as { content: string }).content = 'No cranes at all.';
    expect(await readBundle(file)).toEqual({ refused: expect.stringMatching(/Berth 4 activity.*changed/) });
  });

  it('refuses a bundle with a record taken out, or one put in', async () => {
    const missing = overTheWire(await makeBundle(subject, envelopes())) as BundleFile;
    missing.envelopes.splice(2, 1);
    expect(await readBundle(missing)).toEqual({ refused: expect.stringMatching(/missing/) });

    const extra = overTheWire(await makeBundle(subject, envelopes())) as BundleFile;
    extra.envelopes.push(envelopeOf('report', { ...reportB, id: 'intel-planted', title: 'Planted' }));
    expect(await readBundle(extra)).toEqual({ refused: expect.stringMatching(/not listed/) });
  });

  it('refuses an envelope that claims to be a different record than its hash covers', async () => {
    const file = overTheWire(await makeBundle(subject, envelopes())) as BundleFile;
    file.envelopes[1].id = 'intel-9c2f';
    file.envelopes[2].id = 'intel-1b7e';
    expect(await readBundle(file)).toMatchObject({ refused: expect.any(String) });
  });

  it('refuses a manifest changed after the sender signed it', async () => {
    const file = overTheWire(await makeBundle(subject, envelopes())) as BundleFile;
    file.manifest.content = file.manifest.content.replace('"related-case"', '"evidence"');
    expect(await readBundle(file)).toEqual({ refused: expect.stringMatching(/signature does not match its manifest/) });
  });

  it('refuses an envelope made to look newer than it was signed, since import keeps the newer copy', async () => {
    const file = overTheWire(await makeBundle(subject, envelopes())) as BundleFile;
    file.envelopes[0].updatedAt = '2030-01-01T00:00:00.000Z';
    expect(await readBundle(file)).toEqual({ refused: expect.stringMatching(/Night loading at berth 4.*changed/) });
  });

  it("refuses a manifest whose post-quantum signature does not cover it, even with a valid Nostr signature", async () => {
    const file = overTheWire(await makeBundle(subject, envelopes())) as BundleFile;
    const manifest = JSON.parse(file.manifest.content);
    manifest.links = [];
    const { data: secret } = nip19.decode(nostrService.exportNsec()) as { data: Uint8Array };
    file.manifest = finalizeEvent({ kind: file.manifest.kind, created_at: file.manifest.created_at, tags: file.manifest.tags, content: JSON.stringify(manifest) }, secret);
    expect(await readBundle(file)).toEqual({ refused: expect.stringMatching(/post-quantum/i) });
  });

  it("refuses a manifest signed by someone other than the sender it names", async () => {
    const file = overTheWire(await makeBundle(subject, envelopes())) as BundleFile;
    file.manifest = finalizeEvent({ kind: file.manifest.kind, created_at: file.manifest.created_at, tags: file.manifest.tags, content: file.manifest.content }, generateSecretKey());
    expect(await readBundle(file)).toEqual({ refused: expect.stringMatching(/not signed by/i) });
  });

  it('refuses what is not a bundle at all', async () => {
    expect(await readBundle({ hello: 'world' })).toEqual({ refused: expect.stringMatching(/not a Starcom bundle/) });
    expect(await readBundle('nonsense')).toEqual({ refused: expect.stringMatching(/not a Starcom bundle/) });
  });

  it("carries its sender's own name, and no name learned for anyone else", async () => {
    setOwnName('Priya Raman ZX9Q');
    learnName('b'.repeat(64), 'Aisha Knight ZX9Q', 'team');
    const file = await makeBundle(subject, envelopes());
    expect(JSON.parse(file.manifest.content).name).toBe('Priya Raman ZX9Q');
    expect(JSON.stringify(file)).not.toContain('Aisha Knight');
    const opened = await readBundle(overTheWire(file));
    expect(opened).toMatchObject({ bundle: { fromName: 'Priya Raman ZX9Q' } });
  });

  it('carries no name when its sender has not set one', async () => {
    const file = await makeBundle(subject, envelopes());
    expect(JSON.parse(file.manifest.content).name).toBeUndefined();
  });
});
