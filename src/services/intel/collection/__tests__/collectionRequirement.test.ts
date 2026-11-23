/**
 * Collection requirements — what a case still needs to know.
 *
 * The property under test throughout is that satisfaction is DERIVED. Nothing
 * a requirement's author writes can make it answered; only evidence can.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  requirementStatus, collectionQueue,
  requirementPlace, fieldDispatchable, REQUIREMENT_PLACE_CHARS,
} from '../collectionRequirement';
import { ACCEPTED_GEOHASH_LENGTHS } from '../../observations/adapters/navcomAdapter';
import { FIELD_METHODS } from '../../../../types/intel/SourceObservation';
import type { CollectionRequirement } from '../collectionRequirement';

const NOW = new Date('2026-09-01T00:00:00.000Z');

function req(over: Partial<CollectionRequirement> = {}): CollectionRequirement {
  return {
    id: 'req-1',
    question: "Who are Acme's registered directors as of 2026?",
    because: 'The mission cannot name a responsible party without it.',
    raisedBy: 'analyst',
    raisedAt: '2026-08-01T00:00:00.000Z',
    answeredBy: [],
    ...over,
  };
}

/** A report lifecycle lookup, as the workspace would provide. */
const stages = (map: Record<string, string>) => (id: string) => map[id];

describe('requirementStatus', () => {
  it('is open when nothing has been offered', () => {
    expect(requirementStatus(req(), stages({}), NOW).state).toBe('open');
  });

  it('is pending while linked evidence is still a draft', () => {
    const s = requirementStatus(req({ answeredBy: ['r1'] }), stages({ r1: 'DRAFT' }), NOW);
    // A draft is not evidence. Counting it would let a question be closed by
    // something its author has not finished writing.
    expect(s.state).toBe('pending-evidence');
    expect(s.offered).toBe(1);
    expect(s.evidential).toBe(0);
  });

  it('is answered once one linked report actually counts as evidence', () => {
    const s = requirementStatus(req({ answeredBy: ['r1', 'r2'] }),
      stages({ r1: 'DRAFT', r2: 'REVIEWED' }), NOW);
    expect(s.state).toBe('answered');
    expect(s.evidential).toBe(1);
  });

  it('does not treat a link to an unknown report as an answer', () => {
    // A deleted or unreadable report must not keep a question closed.
    const s = requirementStatus(req({ answeredBy: ['gone'] }), stages({}), NOW);
    expect(s.state).toBe('pending-evidence');
    expect(s.evidential).toBe(0);
  });

  it('goes stale when its usefulness has passed with no answer', () => {
    const s = requirementStatus(req({ staleAfter: '2026-08-15T00:00:00.000Z' }), stages({}), NOW);
    expect(s.state).toBe('stale');
    expect(s.hoursRemaining).toBeLessThan(0);
  });

  it('is answered rather than stale when evidence arrived, however late', () => {
    const s = requirementStatus(
      req({ staleAfter: '2026-08-15T00:00:00.000Z', answeredBy: ['r1'] }),
      stages({ r1: 'APPROVED' }), NOW);
    expect(s.state).toBe('answered');
  });

  it('stays closed whatever else becomes true of it', () => {
    // A withdrawal is a human decision; reporting it as answered would
    // overwrite that with a computed one.
    const s = requirementStatus(
      req({ answeredBy: ['r1'], closed: { reason: 'answered elsewhere', by: 'a', at: NOW.toISOString() } }),
      stages({ r1: 'APPROVED' }), NOW);
    expect(s.state).toBe('closed');
  });

  it('reports no deadline as null, never as a number', () => {
    // Null so a caller cannot read "undated" as "plenty of time" by arithmetic.
    expect(requirementStatus(req(), stages({}), NOW).hoursRemaining).toBeNull();
  });
});

describe('collectionQueue', () => {
  it('leaves out what is already settled', () => {
    const queue = collectionQueue([
      req({ id: 'a', answeredBy: ['r1'] }),
      req({ id: 'b' }),
      req({ id: 'c', closed: { reason: 'duplicate', by: 'x', at: NOW.toISOString() } }),
    ], stages({ r1: 'REVIEWED' }), NOW);
    expect(queue.map((q) => q.requirement.id)).toEqual(['b']);
  });

  it('puts what expires soonest first', () => {
    const queue = collectionQueue([
      req({ id: 'later', staleAfter: '2026-09-10T00:00:00.000Z' }),
      req({ id: 'sooner', staleAfter: '2026-09-02T00:00:00.000Z' }),
    ], stages({}), NOW);
    expect(queue.map((q) => q.requirement.id)).toEqual(['sooner', 'later']);
  });

  it('puts undated requirements LAST, not first', () => {
    // Absence of a date is not urgency. Sorting null as 0 would float every
    // undated requirement to the top and the queue would stop meaning anything.
    const queue = collectionQueue([
      req({ id: 'undated' }),
      req({ id: 'dated', staleAfter: '2026-09-30T00:00:00.000Z' }),
    ], stages({}), NOW);
    expect(queue.map((q) => q.requirement.id)).toEqual(['dated', 'undated']);
  });

  it('orders undated requirements among themselves by when they were raised', () => {
    const queue = collectionQueue([
      req({ id: 'newer', raisedAt: '2026-08-20T00:00:00.000Z' }),
      req({ id: 'older', raisedAt: '2026-08-01T00:00:00.000Z' }),
    ], stages({}), NOW);
    expect(queue.map((q) => q.requirement.id)).toEqual(['older', 'newer']);
  });

  it('keeps a stale requirement in the queue rather than hiding it', () => {
    // Something needed and not gathered in time is exactly what a collector
    // should see; dropping it would make the queue look healthier than it is.
    const queue = collectionQueue([req({ id: 'missed', staleAfter: '2026-08-01T00:00:00.000Z' })],
      stages({}), NOW);
    expect(queue).toHaveLength(1);
    expect(queue[0].status.state).toBe('stale');
  });
});

/**
 * Whether a question can be answered by someone walking to a place.
 *
 * Starcom processes intelligence; Navcom walks to places. A requirement only
 * crosses that boundary usefully if it says which kind of field work would
 * settle it AND where — and most requirements say neither, because most are
 * answered from a register.
 */
describe('field dispatchability', () => {
  it('keeps the ask at the precision the ingest side accepts', () => {
    /*
     * The coupling this asserts is the reason the number exists, not a tidiness
     * check. Asking more finely than Starcom can ingest would invite an
     * operator to travel, observe, file — and have it dropped at our door for
     * being too precise, with the trip taken and the risk already carried.
     *
     * Enforced here rather than by importing the constant, which would pull an
     * entire Nostr adapter into a type module for one integer.
     */
    expect(ACCEPTED_GEOHASH_LENGTHS.has(REQUIREMENT_PLACE_CHARS)).toBe(true);
    expect(ACCEPTED_GEOHASH_LENGTHS.size).toBe(1);
  });

  it('refuses a place it cannot use rather than repairing it', () => {
    // Null, never a corrected value: a requirement carrying a cell nobody meant
    // is worse than one carrying none, because a queue shows it as a place to go.
    expect(requirementPlace('u4pr')).toEqual({ geohash: 'u4pr' });
    expect(requirementPlace('U4PR')).toEqual({ geohash: 'u4pr' });
    expect(requirementPlace('u4pruy')).toBeNull();   // finer than we accept
    expect(requirementPlace('u4p')).toBeNull();      // coarser
    expect(requirementPlace('aiox')).toBeNull();     // a, i, l, o are not base32
    expect(requirementPlace('')).toBeNull();
    expect(requirementPlace(undefined)).toBeNull();
  });

  it('needs both halves, because either alone reads as actionable and is not', () => {
    expect(fieldDispatchable(req())).toBe(false);
    expect(fieldDispatchable(req({ modality: ['saw'] }))).toBe(false);
    expect(fieldDispatchable(req({ place: { geohash: 'u4pr' } }))).toBe(false);
    expect(fieldDispatchable(req({ modality: [], place: { geohash: 'u4pr' } }))).toBe(false);
    expect(fieldDispatchable(req({ modality: ['saw'], place: { geohash: 'u4pr' } }))).toBe(true);
  });

  it('never infers dispatchability from silence', () => {
    // A desk question is the default. Treating an unstated modality as "anyone
    // could go and look" is how a queue fills with trips nobody needs to make.
    const desk = req();
    expect(desk.modality).toBeUndefined();
    expect(fieldDispatchable(desk)).toBe(false);
  });

  it('asks for exactly what a field operator can file back', () => {
    // The vocabulary is shared with the ingest side on purpose: a requirement
    // asking for `saw` is asking for what a kind-1911 event carrying `m: saw`
    // returns. A modality outside it would describe collection nobody can file.
    for (const m of FIELD_METHODS) {
      expect(fieldDispatchable(req({ modality: [m], place: { geohash: 'u4pr' } }))).toBe(true);
    }
    expect([...FIELD_METHODS]).toEqual(['saw', 'told', 'inferred']);
  });
});
