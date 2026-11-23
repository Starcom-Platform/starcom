import { describe, it, expect } from 'vitest';
import { computeLocationConflicts, computeCorroboratedFindings } from '../correlationUtils';
import { isPhysicallyExclusive, type SubjectKind } from '../../../../types/intel/SourceObservation';
import type { Event } from '../../adapters/eventsAdapter';

/**
 * "Can't be in two places at once" is a claim about PHYSICAL EXCLUSIVITY, and
 * it only means something for subjects that occupy one place at a time.
 *
 * Running it against UCDP — whose subject is an armed actor, very often a state
 * — produced 328 same-actor-same-day groups flagged as contradictions, enough
 * to paint the globe red. A government operating in twenty places on one day is
 * not a contradiction. It is Tuesday.
 */

const BASE = Date.parse('2026-08-20T00:00:00Z');

function pair(kind: SubjectKind | undefined, entity = 'Subject'): Event[] {
  const mk = (id: string, lat: number, lon: number, hours: number): Event => ({
    id, title: id, timestamp: new Date(BASE + hours * 3600e3).toISOString(),
    category: 'G', tags: [], lat, lon, confidence: 0.8,
    sourceType: 'OBSERVATION', sourceId: id, entityRefs: [entity],
    ...(kind ? { subjectKind: kind } : {}),
  } as Event);
  // Paris and Tokyo, one hour apart: far beyond 100km, well inside 24h.
  return [mk('a', 48.85, 2.35, 0), mk('b', 35.68, 139.69, 1)];
}

describe('isPhysicallyExclusive', () => {
  it('treats a person and a discrete object as exclusive', () => {
    expect(isPhysicallyExclusive('person')).toBe(true);
    expect(isPhysicallyExclusive('object')).toBe(true);
  });

  it('treats organisations, places and events as NOT exclusive', () => {
    expect(isPhysicallyExclusive('organization')).toBe(false);
    expect(isPhysicallyExclusive('place')).toBe(false);
    expect(isPhysicallyExclusive('event')).toBe(false);
  });

  it('treats unknown and undefined as exclusive', () => {
    // Deliberate: treating unknown as non-exclusive would silently disable
    // contradiction detection for every unclassified subject, including the
    // analyst-authored reports the rule was built for. Over-reporting on an
    // unclassified subject is visible; under-reporting is not.
    expect(isPhysicallyExclusive('unknown')).toBe(true);
    expect(isPhysicallyExclusive(undefined)).toBe(true);
  });
});

describe('contradiction detection respects subject kind', () => {
  it('flags a person in two places at once', () => {
    expect(computeLocationConflicts(pair('person'))).toHaveLength(1);
  });

  it('does NOT flag an organisation in two places at once', () => {
    // The UCDP case. A state acts in many places simultaneously.
    expect(computeLocationConflicts(pair('organization'))).toHaveLength(0);
  });

  it('does NOT flag a country', () => {
    expect(computeLocationConflicts(pair('place'))).toHaveLength(0);
  });

  it('does NOT flag two occurrences — an earthquake contradicts nothing', () => {
    expect(computeLocationConflicts(pair('event'))).toHaveLength(0);
  });

  it('still flags a subject of unknown kind, preserving prior behaviour', () => {
    expect(computeLocationConflicts(pair(undefined))).toHaveLength(1);
    expect(computeLocationConflicts(pair('unknown'))).toHaveLength(1);
  });

  it('skips the pair when only ONE side is non-exclusive', () => {
    const [a, b] = pair('person');
    const mixed = [a, { ...b, subjectKind: 'organization' as SubjectKind }];
    // We cannot assert an exclusivity violation when one participant is not
    // exclusive to begin with.
    expect(computeLocationConflicts(mixed)).toHaveLength(0);
  });
});

describe('corroboration is unaffected by subject kind', () => {
  it('still corroborates an organisation seen in the same place by two sources', () => {
    const mk = (id: string, lat: number, lon: number): Event => ({
      id, title: id, timestamp: new Date(BASE).toISOString(), category: 'G', tags: [],
      lat, lon, confidence: 0.8, sourceType: 'OBSERVATION', sourceId: id,
      entityRefs: ['Government of Somewhere'], subjectKind: 'organization',
    } as Event);

    // Agreement is meaningful for any subject — only DISagreement depends on
    // exclusivity.
    const findings = computeCorroboratedFindings([mk('x', 10, 10), mk('y', 10.1, 10.1)]);
    expect(findings).toHaveLength(1);
    expect(findings[0].sourceCount).toBe(2);
  });
});
