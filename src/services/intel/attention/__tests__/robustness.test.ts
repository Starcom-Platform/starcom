import { describe, it, expect } from 'vitest';
import { AttentionQueue, MAX_SHOWN, MAX_RETAINED } from '../AttentionQueue';
import { MemoryAttentionStateStore } from '../AttentionStateStore';
import { myCases } from '../caseVisibility';
import type { AttentionItem } from '../AttentionItem';
import type { IntelCaseUI } from '../../../../types/intel/IntelCaseUI';

const item = (over: Partial<AttentionItem> = {}): AttentionItem => ({
  id: 'i1', subject: 's', subjectKind: 'unknown', reason: 'new-contradiction',
  producedBy: 'p1', caseId: 'c', firstSeen: '', lastSeen: '', severity: 0.5,
  state: 'new', explanation: 'because.', evidenceProvenance: 'real', ...over,
});
const AT = (s: string) => () => new Date(s);
const q = () => new AttentionQueue(new MemoryAttentionStateStore());

describe('volume and starvation', () => {
  it('caps what it shows but counts the whole backlog', () => {
    // A badge that stopped at the display cap would report the size of the
    // list rather than the size of the work.
    const queue = q();
    queue.register({ name: 'p', produce: () =>
      Array.from({ length: 400 }, (_, i) => item({ id: `x${i}`, severity: i / 400 })) });
    const snap = queue.refresh();
    expect(snap.items).toHaveLength(MAX_SHOWN);
    expect(snap.actionableCount).toBe(400);
    expect(snap.hiddenByBudget).toBe(300);
  });

  it('cuts the least severe, never the most', () => {
    const queue = q();
    queue.register({ name: 'p', produce: () =>
      Array.from({ length: 300 }, (_, i) => item({ id: `x${i}`, severity: i / 300 })) });
    const shown = queue.refresh().items;
    expect(Math.min(...shown.map((i) => i.severity)))
      .toBeGreaterThan(Math.max(...[0, 1, 2].map((i) => i / 300)));
  });

  it('never buries the one that matters under a thousand that do not', () => {
    // The literal I.B.4 requirement.
    const queue = q();
    queue.register({ name: 'noise', produce: () => [
      item({ id: 'THE-ONE', severity: 0.99 }),
      ...Array.from({ length: 1000 }, (_, i) => item({ id: `n${i}`, severity: 0.1 })),
    ] });
    expect(queue.refresh().items[0].id).toBe('THE-ONE');
  });

  it('cannot starve an old item under a sustained flood of equally severe new ones', () => {
    const queue = q();
    let batch = 0;
    queue.register({ name: 'old', produce: () => [item({ id: 'oldest', severity: 0.5 })] });
    queue.refresh(AT('2026-01-01T00:00:00Z'));
    queue.register({ name: 'flood', produce: () =>
      Array.from({ length: 500 }, (_, i) => item({ id: `f${batch}-${i}`, severity: 0.5, producedBy: 'flood' })) });
    for (batch = 0; batch < 6; batch++) queue.refresh(AT(`2026-0${batch + 2}-01T00:00:00Z`));
    expect(queue.current().items[0].id).toBe('oldest');
  });

  it('bounds what it retains, not merely what it shows', () => {
    // A producer with a bug can emit unboundedly; the queue used to keep every
    // item it had ever seen, plus a persisted decision for each.
    //
    // Emitted in ONE pass on purpose. My first version of this spread the load
    // across several refreshes, which never triggered eviction at all: items no
    // longer produced are dropped as stale before the cap is reached, so the
    // queue never grew past a single batch and the test passed while exercising
    // nothing. Verified by probe that this shape does reach the cap.
    const queue = q();
    queue.register({ name: 'leaky', produce: () =>
      Array.from({ length: MAX_RETAINED + 2000 }, (_, i) => item({ id: `leak-${i}`, severity: i / 7000 })) });
    queue.refresh();
    expect(queue.current().actionableCount).toBe(MAX_RETAINED);
  });

  it('evicts in the same order it displays, so eviction cannot drop a top item', () => {
    const queue = q();
    queue.register({ name: 'keep', produce: () => [item({ id: 'IMPORTANT', severity: 1 })] });
    queue.register({ name: 'flood', produce: () =>
      Array.from({ length: MAX_RETAINED + 2000 }, (_, i) =>
        item({ id: `f-${i}`, severity: 0.3, producedBy: 'flood' })) });
    queue.refresh();
    expect(queue.current().actionableCount).toBe(MAX_RETAINED);
    expect(queue.current().items[0].id).toBe('IMPORTANT');
  });

  it('drops the WEAKEST when it evicts, not an arbitrary slice', () => {
    const queue = q();
    queue.register({ name: 'huge', produce: () =>
      Array.from({ length: MAX_RETAINED + 1000 }, (_, i) => item({ id: `h${i}`, severity: i / 6000 })) });
    queue.refresh();
    const kept = queue.current();
    // The 1000 weakest are gone, so the weakest survivor is above their range.
    expect(Math.min(...kept.items.map((i) => i.severity))).toBeGreaterThan(0);
    expect(kept.actionableCount).toBe(MAX_RETAINED);
  });
});

const caseWith = (over: Partial<IntelCaseUI>): IntelCaseUI => ({
  id: 'case-1', caseNumber: 'C-1', title: 'T', description: '',
  status: 'OPEN', priority: 'MEDIUM', assignedTo: [], startDate: '',
  relatedEntities: [], relatedCases: [], tags: [], metadata: {},
  createdAt: '', updatedAt: '', createdBy: 'someone-else',
  collaborators: [], comments: [], activityLog: [],
  permissions: { isPublic: false },
  ...over,
} as unknown as IntelCaseUI);

describe('collaborator boundary', () => {
  const ME = 'pubkey-me';
  /** Exercised through the public entry point rather than the predicate. */
  const visible = (c: IntelCaseUI, actor: string | null) => myCases([c], actor).length === 1;

  it('raises attention on cases I created', () => {
    expect(visible(caseWith({ createdBy: ME }), ME)).toBe(true);
  });

  it('raises attention on cases I am assigned or collaborating on', () => {
    expect(visible(caseWith({ assignedTo: [ME] }), ME)).toBe(true);
    expect(visible(caseWith({ collaborators: [{ userId: ME, name: 'me', addedAt: '', addedBy: 'x' }] as never }), ME)).toBe(true);
  });

  it('stays silent about a colleague\'s case that merely lives in my workspace', () => {
    // The leak that matters is one of ATTENTION: a case shared so I could look
    // at one thing must not start generating work I owe, and my queue must not
    // disclose which entities it concerns by naming them.
    expect(visible(caseWith({ createdBy: 'someone-else' }), ME)).toBe(false);
  });

  it('treats a public case as everyone\'s business', () => {
    expect(visible(caseWith({ permissions: { isPublic: true } as never }), ME)).toBe(true);
  });

  it('does not count a permission list left on a record saved before they were removed', () => {
    // Those lists named who might comment or edit, and nothing enforced them.
    // A stored record can still carry one; it makes the case no more mine.
    expect(visible(caseWith({
      permissions: { isPublic: false, canComment: [ME], canEdit: [ME] } as never,
    }), ME)).toBe(false);
  });

  it('fails CLOSED when we do not yet know who we are', () => {
    // A quiet queue is recoverable; a queue that surfaced a colleague's
    // subjects before identity resolved is not.
    expect(visible(caseWith({ createdBy: ME }), null)).toBe(false);
    expect(visible(caseWith({ permissions: { isPublic: true } as never }), null)).toBe(true);
  });

  it('filters a mixed workspace down to mine', () => {
    const mine = myCases([
      caseWith({ id: 'a', createdBy: ME }),
      caseWith({ id: 'b', createdBy: 'other' }),
      caseWith({ id: 'c', permissions: { isPublic: true } as never }),
    ], ME);
    expect(mine.map((c) => c.id).sort()).toEqual(['a', 'c']);
  });
});
