/**
 * The board's drafting form (D-PW, PW96; the kit's 2.10): a draft as the registry takes it, from the lab's
 * configuration, and what stops one.
 */
import { describe, it, expect } from 'vitest';
import { draftOf, type DraftFields } from '../hypothesisDraft';

const TODAY = Date.UTC(2026, 10, 11, 9);
const FIELDS: DraftFields = { title: 'Mars square Saturn and storms', hypothesis: 'Storms begin more often within three days of Mars square Saturn.', direction: 'upper', p: 0.05, rr: 1.2, sealedEnd: '2027-11-11' };

describe('draftOf', () => {
  it('drafts an aspect as the registry takes it', () => {
    const { draft, problems } = draftOf({ class: 'aspect', sub: 'harmonic', bodies: ['Mars', 'Saturn'], targetDeg: 90, frame: 'galactic' }, 'storms', { before: 0, after: 3, unit: 'day' }, FIELDS, TODAY);
    expect(problems).toEqual([]);
    expect(draft).toMatchObject({
      title: 'Mars square Saturn and storms',
      E: { adapter: 'kp_storm' },
      S: { class: 'aspect', where: { sub: 'harmonic', bodies: ['Mars', 'Saturn'], n: 4, k: 1 } },
      window: [0, 3],
      unit: 'utc_day',
      direction: 'upper',
      threshold: { p: 0.05, rr: 1.2 },
      place: { kind: 'globe' },
      split: { sealed: { start: '2026-11-12', end: '2027-11-11' } },
    });
    // Mars and Saturn square each other about every 367 days.
    expect(draft!.S.period_days).toBeGreaterThan(360);
    expect(draft!.S.period_days).toBeLessThan(375);
  });

  it('drafts an ingress with its frame and the sign it enters', () => {
    const { draft } = draftOf({ class: 'ingress', sub: 'sign', bodies: ['Mars'], sign: 4, frame: 'galactic' }, 'conflict', { before: 1, after: 1, unit: 'day' }, FIELDS, TODAY);
    expect(draft?.S.where).toEqual({ sub: 'sign', bodies: ['Mars'], frame: 'sidereal_gc', sign_to: 'Leo' });
    expect(draft?.E.adapter).toBe('ucdp_exact');
  });

  it('says what stops a draft rather than drafting another test', () => {
    const { draft, problems } = draftOf(
      { class: 'lunation', sub: 'full', bodies: ['Sun', 'Moon'], sign: 2, frame: 'tropical' }, 'storms', { before: 0, after: 0, unit: 'hour' },
      { ...FIELDS, title: ' ', p: 2, sealedEnd: '2026-11-12' }, TODAY,
    );
    expect(draft).toBeNull();
    expect(problems).toEqual(['title', 'signHasNoColumn', 'hourOnlyQuakes', 'window', 'threshold', 'sealedEnd']);
  });
});
