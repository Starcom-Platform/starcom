/**
 * Reviews after publishing (plan item 5.1): a comment (NIP-22, kind 1111) and
 * a verdict (NIP-32, kind 1985) on a published item, read back only when they
 * are about that item, and summed up as who said what, never as a score.
 */
import { describe, it, expect } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent, type Event } from 'nostr-tools';
import {
  commentTemplate, verdictTemplate, readReview, reviewFilters, summarizeReviews,
  REVIEW_NAMESPACE, type ReviewTarget,
} from '../reviewEvents';

const itemKey = generateSecretKey();
const author = getPublicKey(itemKey);
const target: ReviewTarget = {
  kind: 30079, author, coordinate: `30079:${author}:starcom_mission_package_m1`, eventId: 'a'.repeat(64),
};
const reviewer = generateSecretKey();
const other = generateSecretKey();
const sign = (key: Uint8Array, t: ReturnType<typeof commentTemplate>, at = 1000): Event => finalizeEvent({ ...t, created_at: at }, key);
const tag = (e: { tags: string[][] }, name: string) => e.tags.find((t) => t[0] === name);

describe('a comment on a published item', () => {
  it('is a NIP-22 comment scoped to the item and its exact version', () => {
    const t = commentTemplate(target, 'Two of the five sites look closed.');
    expect(t.kind).toBe(1111);
    expect(t.content).toBe('Two of the five sites look closed.');
    expect(tag(t, 'A')?.[1]).toBe(target.coordinate);
    expect(tag(t, 'E')?.[1]).toBe(target.eventId);
    expect(tag(t, 'K')?.[1]).toBe('30079');
    expect(tag(t, 'P')?.[1]).toBe(author);
    // A top-level comment's parent is the item itself.
    expect(tag(t, 'a')?.[1]).toBe(target.coordinate);
    expect(tag(t, 'e')?.[1]).toBe(target.eventId);
    expect(tag(t, 'k')?.[1]).toBe('30079');
    expect(tag(t, 'p')?.[1]).toBe(author);
  });

  it('refuses an empty comment', () => {
    expect(() => commentTemplate(target, '   ')).toThrow(/empty/i);
  });
});

describe('a verdict on a published item', () => {
  it('is a NIP-32 label in the starcom.review namespace, pinned to the exact version', () => {
    const t = verdictTemplate(target, 'disputed', 'Checked the berth camera: no cranes after 02:00.');
    expect(t.kind).toBe(1985);
    expect(tag(t, 'L')?.[1]).toBe(REVIEW_NAMESPACE);
    expect(tag(t, 'l')?.slice(1)).toEqual(['disputed', REVIEW_NAMESPACE]);
    expect(tag(t, 'a')?.[1]).toBe(target.coordinate);
    expect(tag(t, 'e')?.[1]).toBe(target.eventId);
    expect(tag(t, 'p')?.[1]).toBe(author);
    expect(t.content).toBe('Checked the berth camera: no cranes after 02:00.');
  });

  it('knows only its three verdicts', () => {
    expect(() => verdictTemplate(target, 'approved' as never, '')).toThrow(/verdict/i);
  });
});

describe('reading reviews back', () => {
  it('reads a comment and a verdict about this item, with who wrote them', () => {
    const c = readReview(sign(reviewer, commentTemplate(target, 'Seen it.')), target);
    expect(c).toMatchObject({ type: 'comment', author: getPublicKey(reviewer), text: 'Seen it.' });
    const v = readReview(sign(reviewer, verdictTemplate(target, 'confirmed', 'Called the harbour office.')), target);
    expect(v).toMatchObject({ type: 'verdict', verdict: 'confirmed', reasoning: 'Called the harbour office.', version: target.eventId });
  });

  it('ignores one about another item, a label from another namespace, and a verdict pinned to no version', () => {
    const elsewhere = { ...target, coordinate: `30079:${author}:another`, eventId: 'b'.repeat(64) };
    expect(readReview(sign(reviewer, commentTemplate(elsewhere, 'Elsewhere.')), target)).toBeNull();
    const foreign = verdictTemplate(target, 'confirmed', '');
    foreign.tags = foreign.tags.map((t) => (t[0] === 'L' ? ['L', 'someone.else'] : t[0] === 'l' ? ['l', 'confirmed', 'someone.else'] : t));
    expect(readReview(sign(reviewer, foreign), target)).toBeNull();
    const invented = verdictTemplate(target, 'confirmed', '');
    invented.tags = invented.tags.map((t) => (t[0] === 'l' ? ['l', 'approved', REVIEW_NAMESPACE] : t));
    expect(readReview(sign(reviewer, invented), target)).toBeNull();
    const unpinned = verdictTemplate(target, 'confirmed', '');
    unpinned.tags = unpinned.tags.filter((t) => t[0] !== 'e');
    expect(readReview(sign(reviewer, unpinned), target)).toBeNull();
  });

  it('asks the relays for comments and verdicts by the item\'s address and its version', () => {
    const filters = reviewFilters(target);
    expect(filters).toEqual(expect.arrayContaining([
      expect.objectContaining({ kinds: [1111], '#A': [target.coordinate] }),
      expect.objectContaining({ kinds: [1111], '#E': [target.eventId] }),
      expect.objectContaining({ kinds: [1985], '#a': [target.coordinate] }),
      expect.objectContaining({ kinds: [1985], '#e': [target.eventId] }),
    ]));
  });
});

describe('summing reviews up', () => {
  const provenanceOf = (pubkey: string) => (pubkey === getPublicKey(reviewer) ? 'teammate' as const : 'unknown' as const);

  it('keeps each reviewer\'s latest verdict, says who they are and whether they said what they checked, and scores nobody', () => {
    const reviews = [
      readReview(sign(reviewer, verdictTemplate(target, 'confirmed', ''), 1000), target)!,
      readReview(sign(reviewer, verdictTemplate(target, 'disputed', 'Checked the berth camera.'), 2000), target)!,
      readReview(sign(other, verdictTemplate(target, 'disputed', ''), 1500), target)!,
      readReview(sign(other, commentTemplate(target, 'Odd.'), 1600), target)!,
    ];
    const summary = summarizeReviews(target, reviews, provenanceOf);
    expect(summary.verdicts.confirmed).toEqual([]);
    expect(summary.verdicts.disputed.map((v) => [v.provenance, v.methodStated])).toEqual([['teammate', true], ['unknown', false]]);
    expect(summary.comments.map((c) => [c.text, c.provenance])).toEqual([['Odd.', 'unknown']]);
    expect(JSON.stringify(summary)).not.toMatch(/score|weight|trust/i);
  });

  it('says when a verdict was given on an earlier version, which does not carry over to this one', () => {
    const earlier = { ...target, eventId: 'c'.repeat(64) };
    const v = readReview(sign(reviewer, verdictTemplate(earlier, 'confirmed', 'Checked.')), { ...target, eventId: earlier.eventId })!;
    const summary = summarizeReviews(target, [v], provenanceOf);
    expect(summary.verdicts.confirmed[0].onThisVersion).toBe(false);
  });
});
