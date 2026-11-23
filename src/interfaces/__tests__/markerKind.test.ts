/**
 * The kind accessors, and the default that makes them safe.
 *
 * `kind` is optional so producers could migrate one at a time, which means the
 * default carries real weight: ABSENT means 'intel', because that is what every
 * marker was before RLSH existed.
 *
 * Read through these rather than touching `.kind`. A bare `kind === 'rlsh'` is
 * correct; a bare `kind === 'intel'` silently misses every legacy marker — and
 * both spellings would end up in the same file within a week.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { markerKind, modelKind } from '../IntelReportOverlay';
import type { IntelReportOverlayMarker } from '../IntelReportOverlay';

const m = (over: Partial<IntelReportOverlayMarker> = {}) => ({
  pubkey: 'p', title: 't', content: '', tags: [],
  latitude: 0, longitude: 0, timestamp: 0, author: 'a', ...over,
} as IntelReportOverlayMarker);

describe('markerKind', () => {
  it('reads a stated kind', () => {
    expect(markerKind(m({ kind: 'rlsh' }))).toBe('rlsh');
    expect(markerKind(m({ kind: 'intel' }))).toBe('intel');
  });

  it('defaults an unstated kind to intel, not to unknown', () => {
    // The legacy corpus. Defaulting to anything else would route those markers
    // nowhere, which is the failure this accessor exists to prevent.
    expect(markerKind(m())).toBe('intel');
  });

  it('survives a missing marker rather than throwing inside a render', () => {
    // These are read during hover and raycast handling, where a null is normal.
    expect(markerKind(null)).toBe('intel');
    expect(markerKind(undefined)).toBe('intel');
  });
});

describe('modelKind', () => {
  it('answers for a rendered model via the marker it was built from', () => {
    expect(modelKind({ report: m({ kind: 'rlsh' }) })).toBe('rlsh');
    expect(modelKind({ report: m() })).toBe('intel');
  });

  it('survives a model with no report, which the raycaster can produce', () => {
    expect(modelKind({})).toBe('intel');
    expect(modelKind(null)).toBe('intel');
  });
});
