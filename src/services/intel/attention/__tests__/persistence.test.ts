import { describe, it, expect, beforeEach } from 'vitest';
import { AttentionQueue } from '../AttentionQueue';
import { MemoryAttentionStateStore, pruneDecisions, DECISION_TTL_MS } from '../AttentionStateStore';
import type { AttentionItem } from '../AttentionItem';

const item = (over: Partial<AttentionItem> = {}): AttentionItem => ({
  id: 'i1', subject: 'MV Northwind', subjectKind: 'unknown', reason: 'new-contradiction',
  producedBy: 'p1', caseId: 'case-1', firstSeen: '', lastSeen: '', severity: 0.5,
  state: 'new', explanation: 'because', evidenceProvenance: 'real', ...over,
});
const AT = (s: string) => () => new Date(s);

let store: MemoryAttentionStateStore;
beforeEach(() => { store = new MemoryAttentionStateStore(); });

describe('decisions survive the session', () => {
  it('remembers an acknowledgement in a brand-new queue', () => {
    // The analyzer is one of two mutually exclusive applications, so it is
    // unmounted routinely and abruptly. A decision that only survives a clean
    // teardown is not persisted, it is lucky.
    const first = new AttentionQueue(store);
    first.register({ name: 'p1', produce: () => [item()] });
    first.refresh(AT('2026-03-01T00:00:00Z'));
    first.setState('i1', 'acknowledged');

    const second = new AttentionQueue(store);
    second.register({ name: 'p1', produce: () => [item()] });
    const snap = second.refresh(AT('2026-03-02T00:00:00Z'));

    expect(snap.items[0].state).toBe('acknowledged');
    expect(snap.items[0].firstSeen).toBe('2026-03-01T00:00:00.000Z');
  });

  it('keeps a dismissal out of the badge in a later session', () => {
    const first = new AttentionQueue(store);
    first.register({ name: 'p1', produce: () => [item()] });
    first.refresh();
    first.setState('i1', 'dismissed');

    const second = new AttentionQueue(store);
    second.register({ name: 'p1', produce: () => [item()] });
    expect(second.refresh().actionableCount).toBe(0);
  });

  it('does not nag about a settled question when the concern reappears', () => {
    // Evidence changes, the item vanishes, then it comes back. Without
    // persisted decisions for absent items it returns as new.
    const q = new AttentionQueue(store);
    let live = [item()];
    q.register({ name: 'p1', produce: () => live });
    q.refresh(AT('2026-03-01T00:00:00Z'));
    q.setState('i1', 'dismissed');

    live = [];
    q.refresh(AT('2026-03-02T00:00:00Z'));   // gone
    live = [item()];
    const snap = q.refresh(AT('2026-03-03T00:00:00Z')); // back

    expect(snap.actionableCount).toBe(0);
    expect(snap.items).toEqual([]);
  });

  it('records firstSeen once, however many times the producer reruns', () => {
    const q = new AttentionQueue(store);
    q.register({ name: 'p1', produce: () => [item()] });
    q.refresh(AT('2026-03-01T00:00:00Z'));
    q.refresh(AT('2026-03-05T00:00:00Z'));
    const snap = q.refresh(AT('2026-03-09T00:00:00Z'));
    expect(snap.items[0].firstSeen).toBe('2026-03-01T00:00:00.000Z');
    expect(snap.items[0].lastSeen).toBe('2026-03-09T00:00:00.000Z');
  });
});

describe('pruning', () => {
  const now = Date.parse('2026-06-01T00:00:00Z');
  const decision = (id: string, lastSeen: string) => ({ id, state: 'dismissed' as const, firstSeen: lastSeen, lastSeen });

  it('keeps a decision whose concern was seen recently', () => {
    expect(pruneDecisions([decision('a', '2026-05-30T00:00:00Z')], now)).toHaveLength(1);
  });

  it('drops one whose concern has been gone longer than the TTL', () => {
    const old = new Date(now - DECISION_TTL_MS - 1000).toISOString();
    expect(pruneDecisions([decision('a', old)], now)).toEqual([]);
  });

  it('keeps a decision with an unparseable date rather than silently discarding it', () => {
    // Losing a decision is a small harm; losing it because a date failed to
    // parse is an invisible one. Kept, so the failure is at least inert.
    expect(pruneDecisions([decision('a', 'not-a-date')], now)).toHaveLength(1);
  });

  it('bounds growth: decisions do not accumulate forever', () => {
    const stale = Array.from({ length: 1000 }, (_, i) =>
      decision(`old-${i}`, new Date(now - DECISION_TTL_MS - 1).toISOString()));
    const fresh = [decision('live', '2026-05-31T00:00:00Z')];
    expect(pruneDecisions([...stale, ...fresh], now)).toEqual(fresh);
  });
});

describe('ordering', () => {
  it('puts severity first and the longest-waiting item ahead among equals', () => {
    // Deliberately differs from the plan's "recency as tiebreak": newest-first
    // starves old items permanently under a steady arrival rate, which is the
    // exact failure I.B.4 names.
    const q = new AttentionQueue(store);
    q.register({ name: 'p1', produce: () => [item({ id: 'old', severity: 0.5 })] });
    q.refresh(AT('2026-01-01T00:00:00Z'));
    q.register({ name: 'p2', produce: () => [
      item({ id: 'new', severity: 0.5, producedBy: 'p2' }),
      item({ id: 'urgent', severity: 0.9, producedBy: 'p2' }),
    ] });
    expect(q.refresh(AT('2026-06-01T00:00:00Z')).items.map((i) => i.id))
      .toEqual(['urgent', 'old', 'new']);
  });

  it('cannot starve an old item under a steady arrival of new ones', () => {
    const q = new AttentionQueue(store);
    let batch = 0;
    q.register({ name: 'p1', produce: () => [item({ id: 'oldest', severity: 0.5 })] });
    q.refresh(AT('2026-01-01T00:00:00Z'));
    q.register({ name: 'flood', produce: () =>
      Array.from({ length: 200 }, (_, i) => item({ id: `f-${batch}-${i}`, severity: 0.5, producedBy: 'flood' })) });

    for (batch = 0; batch < 5; batch++) q.refresh(AT(`2026-0${batch + 2}-01T00:00:00Z`));
    expect(q.current().items[0].id).toBe('oldest');
  });
});
