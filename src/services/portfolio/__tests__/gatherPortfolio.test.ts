/**
 * What a portfolio holds (decision D-EX, EX12, EX20, EX26, EX28, EX30): the work under one key. What
 * its key published, read from the public relays as signed events, in full; evidence by fingerprint and
 * timestamp; and the cases, missions and reports in this browser, in full when marked Public, else
 * listed by kind and date only. Nothing someone else made, no sample material, and a published report
 * once, with its event.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import { gatherPortfolio, type PortfolioSources } from '../gatherPortfolio';

const secret = generateSecretKey();
const KEY = getPublicKey(secret);
const OTHER = getPublicKey(generateSecretKey());
const at = (day: number) => `2026-12-${String(day).padStart(2, '0')}T10:00:00.000Z`;

const report = (over: Record<string, unknown>) => ({
  id: 'r', title: 'A report', content: 'Body', author: KEY, status: 'DRAFT', visibility: 'public', sensitivity: 'open',
  createdAt: new Date(at(3)), updatedAt: new Date(at(3)), tags: [], category: 'GENERAL', ...over,
});
const caseOf = (over: Record<string, unknown>) => ({
  id: 'c', caseNumber: 'C-1', title: 'A case', description: 'What it is about', status: 'OPEN', createdBy: KEY,
  startDate: at(2), visibility: 'public', sensitivity: 'open', relatedEntities: [], ...over,
});
const published = (content: string, tags: string[][], kind = 30023) => finalizeEvent({ kind, created_at: Date.parse(at(5)) / 1000, tags, content }, secret);

function sources(over: Partial<PortfolioSources> = {}): PortfolioSources {
  return {
    key: KEY,
    reports: async () => [],
    cases: () => [],
    missions: () => [],
    evidence: async () => [],
    published: async () => ({ events: [], complete: true, relays: ['wss://record.cosmiccodex.app'] }),
    ...over,
  } as PortfolioSources;
}

describe('gatherPortfolio', () => {
  it('shows Public work in full, and lists the rest by kind and date only, saying why', async () => {
    const p = await gatherPortfolio(sources({
      reports: async () => [
        report({ id: 'r1', title: 'Flood levels', content: 'The river rose.' }),
        report({ id: 'r2', title: 'Secret thing', content: 'Do not show', visibility: 'private' }),
        report({ id: 'r3', title: 'Team only', visibility: 'limited' }),
        report({ id: 'r4', title: 'Careful one', sensitivity: 'careful' }),
        report({ id: 'r5', title: 'Unmarked', visibility: undefined }),
      ] as never,
    }));
    const shown = p.items.filter((i) => i.shown);
    expect(shown.map((i) => i.title)).toEqual(['Flood levels']);
    expect(shown[0].text).toBe('The river rose.');
    expect(p.items.filter((i) => !i.shown).map((i) => i.listedBecause)).toEqual(['Private', 'Limited', 'marked careful', 'not marked']);
    expect(JSON.stringify(p)).not.toContain('Do not show');
    expect(JSON.stringify(p)).not.toContain('Secret thing');
  });

  it('keeps only work under this key, and no sample or received material', async () => {
    const p = await gatherPortfolio(sources({
      reports: async () => [report({ id: 'mine' }), report({ id: 'theirs', author: OTHER }), report({ id: 'demo', sample: true }), report({ id: 'got', receivedFrom: { pubkey: OTHER } })] as never,
      cases: () => [caseOf({ id: 'mine-case' }), caseOf({ id: 'their-case', createdBy: OTHER })] as never,
    }));
    expect(p.items.map((i) => `${i.kind}`)).toEqual(['case', 'report']);
  });

  it('includes what the key published as signed events, once each, and says whether the read was whole', async () => {
    const note = published('Floodwater reached the old town.', [['t', 'starcom_intel'], ['title', 'Flood levels'], ['d', 'starcom_intel_bafybeigdyrzt5sf']]);
    const claim = published('{"claim":{}}', [['d', 'case-adjudication:C-1']], 30082);
    const p = await gatherPortfolio(sources({
      reports: async () => [report({ id: 'r1', title: 'Flood levels', ipfsHash: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi' })] as never,
      published: async () => ({ events: [note, claim, note], complete: false, relays: ['wss://record.cosmiccodex.app'], note: 'one relay did not finish' }),
    }));
    expect(p.events.map((e) => e.id).sort()).toEqual([note.id, claim.id].sort());
    const reportItem = p.items.find((i) => i.kind === 'report')!;
    expect(reportItem.eventIds).toEqual([note.id]);
    expect(p.items.filter((i) => i.kind === 'report')).toHaveLength(1);
    expect(p.items.find((i) => i.kind === 'claim')).toMatchObject({ shown: true, eventIds: [claim.id] });
    expect(p.read).toEqual({ relays: ['wss://record.cosmiccodex.app'], complete: false, note: 'one relay did not finish' });
  });

  it('keeps a report its author marked Private listed, even when its published event is on the relays', async () => {
    const note = published('Names of the people we spoke to.', [['t', 'starcom_intel'], ['title', 'Interviews'], ['d', 'starcom_intel_bafybeigdyrzt5sf']]);
    const p = await gatherPortfolio(sources({
      reports: async () => [report({ id: 'r1', title: 'Interviews', visibility: 'private', ipfsHash: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi' })] as never,
      published: async () => ({ events: [note], complete: true, relays: ['wss://record.cosmiccodex.app'] }),
    }));
    expect(p.items).toEqual([{ kind: 'report', at: at(3), shown: false, listedBecause: 'Private' }]);
    expect(p.events).toEqual([]);
    expect(JSON.stringify(p)).not.toMatch(/Interviews|people we spoke to/);
  });

  it('lists a report published from its panel once, with its note at the report\'s own id (D-RP)', async () => {
    const note = published('Berth 4\n\nThree cranes.', [['d', 'r1'], ['title', 'Berth 4'], ['t', 'starcom_intel']]);
    const p = await gatherPortfolio(sources({
      reports: async () => [report({ id: 'r1', title: 'Berth 4' })] as never,
      published: async () => ({ events: [note], complete: true, relays: ['wss://relay.example'] }),
    }));
    expect(p.items.filter((i) => i.kind === 'report')).toEqual([expect.objectContaining({ title: 'Berth 4', eventIds: [note.id] })]);
  });

  it('offers no withdrawn note as work: the report stays listed as it is here, with no event (RP7)', async () => {
    const withdrawal = published('Withdrawn by its author.', [['d', 'r1'], ['title', 'Withdrawn'], ['t', 'starcom_intel'], ['t', 'retracted']]);
    const stray = published('Withdrawn by its author.', [['d', 'gone'], ['title', 'Withdrawn'], ['t', 'starcom_intel'], ['t', 'retracted']]);
    const p = await gatherPortfolio(sources({
      reports: async () => [report({ id: 'r1', title: 'Berth 4' })] as never,
      published: async () => ({ events: [withdrawal, stray], complete: true, relays: ['wss://relay.example'] }),
    }));
    expect(p.items).toEqual([expect.objectContaining({ kind: 'report', title: 'Berth 4' })]);
    expect(p.items[0].eventIds).toBeUndefined();
    expect(p.events).toEqual([]);
  });

  it('lists evidence by fingerprint and timestamp, with its signed custody record, and never its files', async () => {
    const custody = finalizeEvent({ kind: 20097, created_at: Date.parse(at(4)) / 1000, tags: [['t', 'starcom-evidence-custody']], content: '{}' }, secret);
    const p = await gatherPortfolio(sources({
      evidence: async () => [{
        item: { id: 'ev1', title: 'Evidence: Flood page', tags: ['capture', 'evidence'], visibility: 'public', sensitivity: 'open', createdAt: new Date(at(4)) },
        custody: { captureId: 'c1', event: custody, capture: { id: 'c1', kind: 'evidence', at: at(4), page: { url: 'https://news.example.org/flood', title: 'Flood page' }, files: [{ name: 'text.txt', type: 'text/plain', size: 15, sha256: 'a'.repeat(64) }], timestamps: { calendars: ['https://alice.btc.calendar.opentimestamps.org'], at: at(4), proofs: {} } } },
      }] as never,
    }));
    expect(p.items[0]).toMatchObject({
      kind: 'evidence', shown: true, title: 'Evidence: Flood page', url: 'https://news.example.org/flood',
      fingerprints: ['a'.repeat(64)], timestampedBy: ['alice.btc.calendar.opentimestamps.org'], eventIds: [custody.id],
    });
    expect(p.events.map((e) => e.id)).toContain(custody.id);
  });

  it('lists evidence not marked Public by kind and date, without its custody record, which names the page', async () => {
    const record = { url: 'https://informant.example/contacts', title: 'Informant contacts' };
    const custody = finalizeEvent({ kind: 20097, created_at: Date.parse(at(4)) / 1000, tags: [['t', 'starcom-evidence-custody'], ['r', record.url]], content: JSON.stringify(record) }, secret);
    const p = await gatherPortfolio(sources({
      evidence: async () => [{
        item: { id: 'ev2', title: 'Evidence: Informant contacts', tags: ['capture', 'evidence'], visibility: 'private', sensitivity: 'open', createdAt: new Date(at(4)) },
        custody: { captureId: 'c2', event: custody, capture: { id: 'c2', kind: 'evidence', at: at(4), page: record, files: [{ name: 'text.txt', type: 'text/plain', size: 15, sha256: 'b'.repeat(64) }] } },
      }] as never,
    }));
    expect(p.items).toEqual([{ kind: 'evidence', at: at(4), shown: false, listedBecause: 'Private' }]);
    expect(p.events).toEqual([]);
    expect(JSON.stringify(p)).not.toMatch(/informant|b{64}/i);
  });

  it('leaves out evidence signed by another key or not signed, and counts what it left out', async () => {
    const theirs = finalizeEvent({ kind: 20097, created_at: 1, tags: [], content: '{}' }, generateSecretKey());
    const p = await gatherPortfolio(sources({
      evidence: async () => [
        { item: { id: 'a', title: 'x', tags: ['evidence'], createdAt: new Date(at(1)) }, custody: { captureId: 'a', event: theirs, capture: { id: 'a', kind: 'evidence', at: at(1), page: { url: 'https://a.example' } } } },
        { item: { id: 'b', title: 'y', tags: ['evidence'], createdAt: new Date(at(1)) }, custody: { captureId: 'b', unsigned: {}, capture: { id: 'b', kind: 'evidence', at: at(1), page: { url: 'https://b.example' } } } },
      ] as never,
    }));
    expect(p.items).toEqual([]);
    expect(p.leftOut).toEqual({ unsignedEvidence: 1 });
  });
});
