/**
 * The tag that stops a refutation from destroying the one before it.
 *
 * Kind 30083 is addressable, so relays keep one event per
 * (pubkey, kind, d-tag). Before this identifier existed the spec named no `d`
 * tag at all, which meant one refutation per author, forever.
 */
import { describe, it, expect } from 'vitest';
import { refutationIdentifier, REFUTATION_KIND } from '../refutation';

const base = {
  authorPubkey: 'b778a0d16f78f2371c9f8d6a4e2b0c1d',
  subjectRef: '549300FLBTQYHSGDN907',
  attribute: 'headquartersCountry',
  publishedAt: '2026-08-26T12:00:00.000Z',
};

describe('refutationIdentifier', () => {
  it('separates refutations of different attributes on the same claim', () => {
    // The reason keeping kind 30083 is not a compromise: two grounds on two
    // attributes coexist, because attribute is part of the address.
    expect(refutationIdentifier(base))
      .not.toBe(refutationIdentifier({ ...base, attribute: 'subjectKind' }));
  });

  it('separates refutations of different versions of one claim', () => {
    // A refutation is about a claim as it was made. Refuting the 12:00 version
    // must not silently also refute the 13:00 revision that fixed it.
    expect(refutationIdentifier(base))
      .not.toBe(refutationIdentifier({ ...base, publishedAt: '2026-08-26T13:00:00.000Z' }));
  });

  it('separates refutations of two publishers who claimed the same thing', () => {
    expect(refutationIdentifier(base))
      .not.toBe(refutationIdentifier({ ...base, authorPubkey: 'ffffffffffffffffffffffffffffffff' }));
  });

  it('collapses only a refuter re-stating the same point', () => {
    // Deliberate: the refuter's latest word on one point supersedes their own
    // earlier word on it, rather than accumulating superseded attempts.
    expect(refutationIdentifier(base)).toBe(refutationIdentifier({ ...base }));
  });

  it('stays decomposable into exactly four parts', () => {
    // The defect report's proposal left publishedAt raw, and ISO-8601 contains
    // colons — so the identifier split into six parts on its own separator.
    expect(refutationIdentifier(base).split(':')).toHaveLength(4);
  });

  it('keeps a subject containing a colon from spilling across the separator', () => {
    const colonic = { ...base, subjectRef: 'urn:lei:549300FLBTQYHSGDN907' };
    expect(refutationIdentifier(colonic).split(':')).toHaveLength(4);
    // …and does not collide with a subject that merely looks similar.
    expect(refutationIdentifier(colonic))
      .not.toBe(refutationIdentifier({ ...base, subjectRef: 'urn' }));
  });

  it('round-trips every component', () => {
    const parts = refutationIdentifier(base).split(':').map(decodeURIComponent);
    expect(parts).toEqual([base.authorPubkey, base.subjectRef, base.attribute, base.publishedAt]);
  });

  it('addresses a kind that is not the claim slot', () => {
    // Whatever this identifier is, it cannot overwrite a claim: the claim lives
    // at kind 30082 and addressability is per (pubkey, KIND, d-tag).
    expect(REFUTATION_KIND).toBe(30083);
    expect(REFUTATION_KIND).not.toBe(30082);
  });
});
