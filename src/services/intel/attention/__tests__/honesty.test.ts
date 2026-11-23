import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AttentionQueue } from '../AttentionQueue';
import { MemoryAttentionStateStore } from '../AttentionStateStore';
import { produceContradictionItems } from '../contradictionProducer';
import { produceForeignClaimItems } from '../foreignClaimProducer';
import { produceDecayedFindingItems } from '../decayedFindingProducer';
import type { AttentionItem } from '../AttentionItem';
import type { LocationConflict } from '../../../../applications/intelanalyzer/state/correlationUtils';

/**
 * I.B.3 — "Never manufacture urgency", and the guard test it asks for:
 * "no attention item may originate from mock-flagged data without carrying
 * that flag."
 *
 * These are written against EVERY producer at once rather than one at a time.
 * A per-producer test proves the producers written so far behave; the point of
 * a guard is to fail when the next one does not.
 */

const conflict = (over: Partial<LocationConflict> = {}): LocationConflict => ({
  entity: 'MV Northwind', sourceIdA: 'src-a', sourceIdB: 'src-b',
  distanceKm: 800, hoursApart: 3, strength: 0.7,
  observedFrom: '2026-01-01T00:00:00Z', observedTo: '2026-01-01T03:00:00Z', ...over,
});
const openCase = { id: 'case-1', title: 'Case', linkedSourceIds: ['src-a', 'rep-1'] };

/** One item from every producer, so the assertions below cover all of them. */
function everyProducersItems(): AttentionItem[] {
  return [
    ...produceContradictionItems({ conflicts: [conflict({ isMock: true })], openCases: [openCase] }),
    ...produceContradictionItems({ conflicts: [conflict({ isMock: undefined })], openCases: [openCase] }),
    ...produceForeignClaimItems({
      claims: [{ entityRef: 'MV Northwind', authorPubkey: 'abc123', weight: 0.8, independence: 'independent', corroborationValue: 0.7 }],
      openCases: [openCase],
      entitiesForSource: (id) => (id === 'rep-1' ? ['MV Northwind'] : []),
    }),
    ...produceDecayedFindingItems({
      published: [{
        slot: 'starcom_finding_x_location',
        publishedAt: '2020-01-01T00:00:00Z', confirmedAt: '2020-01-01T00:00:00Z',
        content: {
          schemaVersion: 2,
          claim: { subjectRef: 'X', subjectKind: 'object', attribute: 'location', value: {} },
          publishedAt: '2020-01-01T00:00:00Z',
          method: {
            algorithm: 'location-corroboration', algorithmVersion: 1, criteria: 'c', sourceCount: 2,
            observedFrom: '2020-01-01T00:00:00Z', observedTo: '2020-01-01T00:00:00Z',
            timePrecisionMs: 3_600_000, parameters: { windowHours: 24, distanceThresholdKm: 5 },
          },
        } as never,
      }],
    }),
  ];
}

describe('every attention item, from every producer', () => {
  const items = everyProducersItems();

  it('produces at least one item from each producer, or these assertions prove nothing', () => {
    expect(new Set(items.map((i) => i.producedBy)).size).toBe(3);
  });

  it('states its evidence provenance explicitly, never leaving it undefined', () => {
    for (const i of items) {
      expect(['real', 'mock', 'unknown']).toContain(i.evidenceProvenance);
    }
  });

  it('never claims evidence is real when the source said it was fabricated', () => {
    const fromMock = produceContradictionItems({ conflicts: [conflict({ isMock: true })], openCases: [openCase] });
    expect(fromMock.length).toBeGreaterThan(0);
    for (const i of fromMock) expect(i.evidenceProvenance).toBe('mock');
  });

  it('never claims evidence is real when nobody measured it', () => {
    const unmeasured = produceContradictionItems({ conflicts: [conflict({ isMock: undefined })], openCases: [openCase] });
    expect(unmeasured.length).toBeGreaterThan(0);
    for (const i of unmeasured) expect(i.evidenceProvenance).not.toBe('real');
  });

  it('can explain itself in a sentence that names something concrete', () => {
    for (const i of items) {
      expect(i.explanation.length).toBeGreaterThan(20);
      expect(i.explanation).toMatch(/[.!]$/);
    }
  });

  it('derives severity into the valid range rather than asserting importance', () => {
    for (const i of items) {
      expect(i.severity).toBeGreaterThanOrEqual(0);
      expect(i.severity).toBeLessThanOrEqual(1);
    }
  });

  it('uses an enum reason, so the queue can be audited for why it ranks', () => {
    for (const i of items) {
      expect(['new-contradiction', 'foreign-claim-intersects-case', 'published-finding-decayed'])
        .toContain(i.reason);
    }
  });

  it('attributes itself to a named producer, so a failure is traceable', () => {
    for (const i of items) expect(i.producedBy).toBeTruthy();
  });
});

describe('never manufacture urgency', () => {
  const item = (over: Partial<AttentionItem> = {}): AttentionItem => ({
    id: 'i1', subject: 's', subjectKind: 'unknown', reason: 'new-contradiction',
    producedBy: 'p1', caseId: 'c', firstSeen: '', lastSeen: '', severity: 0.5,
    state: 'new', explanation: 'because.', evidenceProvenance: 'real', ...over,
  });

  it('counts only what the analyst can still act on', () => {
    const q = new AttentionQueue(new MemoryAttentionStateStore());
    q.register({ name: 'p1', produce: () => [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })] });
    q.refresh();
    q.setState('b', 'dismissed');
    q.setState('c', 'resolved');
    expect(q.current().actionableCount).toBe(1);
  });

  it('shows no badge at all when nothing is actionable', () => {
    const q = new AttentionQueue(new MemoryAttentionStateStore());
    q.register({ name: 'p1', produce: () => [] });
    expect(q.refresh().actionableCount).toBe(0);
  });

  it('will not call a broken queue quiet', () => {
    const q = new AttentionQueue(new MemoryAttentionStateStore());
    q.register({ name: 'bad', produce: () => { throw new Error('down'); } });
    const snap = q.refresh();
    expect(snap.actionableCount).toBe(0);
    expect(snap.quiet).toBe(false);
    expect(snap.failures).toHaveLength(1);
  });
});

describe('the reason enum stays an enum', () => {
  it('has no free-text reason field anywhere in the producers', () => {
    // Free-text reasons cannot be audited, counted, filtered or argued with.
    // Asserted against the source because the type alone cannot stop someone
    // adding `reasonText` next to it.
    const dir = path.join(process.cwd(), 'src/services/intel/attention');
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('Producer.ts'))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(src).not.toMatch(/reasonText|customReason|reasonFreeText/);
    }
  });
});
