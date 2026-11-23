import { describe, it, expect } from 'vitest';
import { produceContradictionItems, CONTRADICTION_PRODUCER, type OpenCase } from '../contradictionProducer';
import { AttentionQueue } from '../AttentionQueue';
import { produceForeignClaimItems, type ForeignClaim } from '../foreignClaimProducer';
import type { AttentionItem } from '../AttentionItem';
import type { LocationConflict } from '../../../../applications/intelanalyzer/state/correlationUtils';

const conflict = (over: Partial<LocationConflict> = {}): LocationConflict => ({
  entity: 'MV Northwind', sourceIdA: 'src-b', sourceIdB: 'src-a',
  distanceKm: 812.4, hoursApart: 3.2, strength: 0.7,
  observedFrom: '2026-01-01T00:00:00Z', observedTo: '2026-01-01T03:12:00Z',
  ...over,
});
const openCase = (over: Partial<OpenCase> = {}): OpenCase =>
  ({ id: 'case-1', title: 'Northwind movements', linkedSourceIds: ['src-a'], ...over });

const AT = (s: string) => () => new Date(s);

describe('contradiction producer', () => {
  it('surfaces a contradiction that touches an open case', () => {
    const items = produceContradictionItems({ conflicts: [conflict()], openCases: [openCase()] }, AT('2026-03-01T00:00:00Z'));
    expect(items).toHaveLength(1);
    expect(items[0].reason).toBe('new-contradiction');
    expect(items[0].producedBy).toBe(CONTRADICTION_PRODUCER);
    expect(items[0].caseId).toBe('case-1');
  });

  it('ignores contradictions nobody is investigating', () => {
    // The filter IS the feature. Without it this is the conflicts panel with a
    // more urgent name, and it gets muted.
    const items = produceContradictionItems({
      conflicts: [conflict({ sourceIdA: 'other-1', sourceIdB: 'other-2' })],
      openCases: [openCase()],
    });
    expect(items).toEqual([]);
  });

  it('joins on record ids, which is what a case actually links', () => {
    // The bug this pins: matching the conflict's ENTITY NAME against a case's
    // link list. IntelCaseUI.relatedEntities holds report/item ids despite its
    // name, so a name-based join typechecks, passes fixture-shaped tests, and
    // never once fires against real data.
    const byName = produceContradictionItems({
      conflicts: [conflict({ entity: 'MV Northwind', sourceIdA: 'rep-9', sourceIdB: 'rep-8' })],
      openCases: [openCase({ linkedSourceIds: ['MV Northwind'] })],
    });
    expect(byName).toEqual([]);

    const byId = produceContradictionItems({
      conflicts: [conflict({ entity: 'MV Northwind', sourceIdA: 'rep-9', sourceIdB: 'rep-8' })],
      openCases: [openCase({ linkedSourceIds: ['rep-8'] })],
    });
    expect(byId).toHaveLength(1);
  });

  it('fires when EITHER side of the contradiction is linked to the case', () => {
    // The most valuable shape: a record already in your case contradicted by
    // one you have never seen. Requiring both sides would miss it entirely.
    const items = produceContradictionItems({
      conflicts: [conflict({ sourceIdA: 'unknown-report', sourceIdB: 'src-a' })],
      openCases: [openCase({ linkedSourceIds: ['src-a'] })],
    });
    expect(items).toHaveLength(1);
  });

  it('raises ONE item when a case links both sides of the same contradiction', () => {
    const items = produceContradictionItems({
      conflicts: [conflict({ sourceIdA: 'src-a', sourceIdB: 'src-b' })],
      openCases: [openCase({ linkedSourceIds: ['src-a', 'src-b'] })],
    });
    expect(items).toHaveLength(1);
  });



  it('derives severity from the conflict, and never lets a producer assert it', () => {
    const items = produceContradictionItems({ conflicts: [conflict({ strength: 0.31 })], openCases: [openCase()] });
    expect(items[0].severity).toBe(0.31);
  });

  it('explains itself in one sentence naming the rule', () => {
    const items = produceContradictionItems({ conflicts: [conflict()], openCases: [openCase()] });
    expect(items[0].explanation).toMatch(/812 km apart within 3.2 h/);
    expect(items[0].explanation).toMatch(/Northwind movements/);
  });

  it('carries fabricated provenance through rather than laundering it', () => {
    const items = produceContradictionItems({
      conflicts: [conflict({ isMock: true })], openCases: [openCase()],
    });
    expect(items[0].evidenceProvenance).toBe('mock');
  });

  it('reports unmeasured provenance as unknown, never as real', () => {
    // The bug this pins: `isMock: boolean` defaulted to false everywhere, so
    // every item asserted "this evidence is genuine" about data nobody had
    // checked. A safety property that is structurally always satisfied is a
    // decoration.
    const items = produceContradictionItems({
      conflicts: [conflict({ isMock: undefined })], openCases: [openCase()],
    });
    expect(items[0].evidenceProvenance).toBe('unknown');
  });

  it('reports known-real evidence as real', () => {
    const items = produceContradictionItems({
      conflicts: [conflict({ isMock: false })], openCases: [openCase()],
    });
    expect(items[0].evidenceProvenance).toBe('real');
  });

  it('treats a contradiction with its sides swapped as ONE concern', () => {
    const linked = openCase({ linkedSourceIds: ['x'] });
    const a = produceContradictionItems({ conflicts: [conflict({ sourceIdA: 'x', sourceIdB: 'y' })], openCases: [linked] });
    const b = produceContradictionItems({ conflicts: [conflict({ sourceIdA: 'y', sourceIdB: 'x' })], openCases: [linked] });
    expect(a[0].id).toBe(b[0].id);
  });

  it('raises one item per case when several cases link the same record', () => {
    const items = produceContradictionItems({
      conflicts: [conflict()],
      openCases: [openCase(), openCase({ id: 'case-2', title: 'Port audit' })],
    });
    expect(items.map((i) => i.caseId).sort()).toEqual(['case-1', 'case-2']);
    expect(new Set(items.map((i) => i.id)).size).toBe(2);
  });
});

const producer = (name: string, items: AttentionItem[] | (() => never)) => ({
  name,
  produce: typeof items === 'function' ? items : () => items,
});

describe('AttentionQueue', () => {
  const item = (over: Partial<AttentionItem> = {}): AttentionItem => ({
    id: 'i1', subject: 'MV Northwind', subjectKind: 'unknown', reason: 'new-contradiction',
    producedBy: 'p1', caseId: 'case-1', firstSeen: '', lastSeen: '', severity: 0.5,
    state: 'new', explanation: 'because', evidenceProvenance: 'real', ...over,
  });

  it('keeps firstSeen and acknowledgement across recomputes', () => {
    // The failure this prevents: correlation reruns every few seconds, so a
    // naive queue replaces its contents and discards every acknowledgement.
    const q = new AttentionQueue();
    q.register(producer('p1', [item()]));
    q.refresh(AT('2026-03-01T00:00:00Z'));
    q.setState('i1', 'acknowledged');
    const snap = q.refresh(AT('2026-03-04T00:00:00Z'));

    expect(snap.items[0].firstSeen).toBe('2026-03-01T00:00:00.000Z');
    expect(snap.items[0].lastSeen).toBe('2026-03-04T00:00:00.000Z');
    expect(snap.items[0].state).toBe('acknowledged');
  });

  it('drops an item once its evidence is gone', () => {
    const q = new AttentionQueue();
    let live = [item()];
    q.register({ name: 'p1', produce: () => live });
    q.refresh();
    live = [];
    expect(q.refresh().items).toEqual([]);
  });

  it('does not count dismissed items in the badge', () => {
    const q = new AttentionQueue();
    q.register(producer('p1', [item(), item({ id: 'i2' })]));
    q.refresh();
    q.setState('i2', 'dismissed');
    const snap = q.refresh();
    expect(snap.actionableCount).toBe(1);
    expect(snap.items.map((i) => i.id)).toEqual(['i1']);
  });

  it('orders by severity, then by who has waited longest', () => {
    const q = new AttentionQueue();
    q.register(producer('p1', [item({ id: 'old', severity: 0.5 })]));
    q.refresh(AT('2026-01-01T00:00:00Z'));
    q.register(producer('p2', [item({ id: 'new', severity: 0.5, producedBy: 'p2' }), item({ id: 'worse', severity: 0.9, producedBy: 'p2' })]));
    const snap = q.refresh(AT('2026-06-01T00:00:00Z'));
    expect(snap.items.map((i) => i.id)).toEqual(['worse', 'old', 'new']);
  });

  it('degrades to fewer items when a producer throws, never to a broken queue', () => {
    const q = new AttentionQueue();
    q.register(producer('good', [item()]));
    q.register(producer('bad', () => { throw new Error('producer exploded'); }));
    const snap = q.refresh();
    expect(snap.items).toHaveLength(1);
    expect(snap.failures).toEqual([expect.objectContaining({ producer: 'bad', message: 'producer exploded' })]);
  });

  it('does not retire a failed producer\'s items as though they were resolved', () => {
    // Absence caused by a broken producer is a fact about the producer. Letting
    // it delete items would make a regression look like progress.
    const q = new AttentionQueue();
    let broken = false;
    q.register({ name: 'p1', produce: () => { if (broken) throw new Error('down'); return [item()]; } });
    q.refresh();
    broken = true;
    const snap = q.refresh();
    expect(snap.items.map((i) => i.id)).toEqual(['i1']);
    expect(snap.failures).toHaveLength(1);
  });

  it('is only "quiet" when producers actually ran and found nothing', () => {
    const q = new AttentionQueue();
    q.register(producer('p1', []));
    expect(q.refresh().quiet).toBe(true);

    const broken = new AttentionQueue();
    broken.register(producer('bad', () => { throw new Error('down'); }));
    const snap = broken.refresh();
    expect(snap.items).toEqual([]);
    expect(snap.quiet).toBe(false); // empty because it failed, NOT because the world is calm
  });

  it('reports nothing as quiet when there are no producers at all', () => {
    expect(new AttentionQueue().refresh().quiet).toBe(false);
  });
});

describe('foreign claim producer', () => {
  const claim = (over: Partial<ForeignClaim> = {}): ForeignClaim => ({
    entityRef: 'MV Northwind', authorPubkey: 'abcdef0123456789beef',
    weight: 0.9, independence: 'independent', corroborationValue: 0.8, ...over,
  });
  const entitiesFor = (map: Record<string, string[]>) => (id: string) => map[id] ?? [];

  it('surfaces a foreign claim about an entity named in an open case', () => {
    const items = produceForeignClaimItems({
      claims: [claim()],
      openCases: [{ id: 'case-1', title: 'Northwind movements', linkedSourceIds: ['rep-1'] }],
      entitiesForSource: entitiesFor({ 'rep-1': ['MV Northwind'] }),
    });
    expect(items).toHaveLength(1);
    expect(items[0].reason).toBe('foreign-claim-intersects-case');
  });

  it('ignores foreign claims about entities no open case mentions', () => {
    const items = produceForeignClaimItems({
      claims: [claim({ entityRef: 'Unrelated Ltd' })],
      openCases: [{ id: 'case-1', title: 'C', linkedSourceIds: ['rep-1'] }],
      entitiesForSource: entitiesFor({ 'rep-1': ['MV Northwind'] }),
    });
    expect(items).toEqual([]);
  });

  it('ranks by independence, not by how strong the claim sounds', () => {
    // A strong claim resting on evidence we already hold is our own conclusion
    // arriving back with a stranger's name on it. Weight-ranking would put it
    // top; corroboration value puts it where it belongs.
    const echo = produceForeignClaimItems({
      claims: [claim({ weight: 0.99, corroborationValue: 0.05, independence: 'echo' })],
      openCases: [{ id: 'case-1', title: 'C', linkedSourceIds: ['rep-1'] }],
      entitiesForSource: entitiesFor({ 'rep-1': ['MV Northwind'] }),
    });
    expect(echo[0].severity).toBe(0.05);
  });

  it('keeps two instances claiming the same thing as two separate items', () => {
    const items = produceForeignClaimItems({
      claims: [claim({ authorPubkey: 'aaa1' }), claim({ authorPubkey: 'bbb2' })],
      openCases: [{ id: 'case-1', title: 'C', linkedSourceIds: ['rep-1'] }],
      entitiesForSource: entitiesFor({ 'rep-1': ['MV Northwind'] }),
    });
    expect(new Set(items.map((i) => i.id)).size).toBe(2);
  });

  it('joins through the events, since a case links ids and a claim names an entity', () => {
    // With no event linking rep-1 to the entity there is no join, and the
    // producer must find nothing rather than guess.
    const items = produceForeignClaimItems({
      claims: [claim()],
      openCases: [{ id: 'case-1', title: 'C', linkedSourceIds: ['rep-1'] }],
      entitiesForSource: () => [],
    });
    expect(items).toEqual([]);
  });
});
