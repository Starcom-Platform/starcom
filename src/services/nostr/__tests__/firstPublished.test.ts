/**
 * When a note was first published (Mecha Jono's key change, 2 Nov 2026): its published_at, else the carried tag's
 * old created_at, else when it was signed.
 */
import { describe, it, expect } from 'vitest';
import { firstPublishedAt } from '../firstPublished';

const OLD = 'c'.repeat(64);

describe('when a note was first published', () => {
  it('is its published_at, else the carried tag\'s old created_at, else when it was signed', () => {
    expect(firstPublishedAt({ created_at: 300, tags: [['published_at', '100'], ['carried', OLD, '200']] })).toBe(100);
    expect(firstPublishedAt({ created_at: 300, tags: [['carried', OLD, '200']] })).toBe(200);
    expect(firstPublishedAt({ created_at: 300, tags: [] })).toBe(300);
    expect(firstPublishedAt({ created_at: 300 })).toBe(300);
  });

  it('passes over a value that is not whole unix seconds', () => {
    expect(firstPublishedAt({ created_at: 300, tags: [['published_at', 'soon'], ['carried', OLD, '2.5']] })).toBe(300);
    expect(firstPublishedAt({ created_at: 300, tags: [['published_at', '-5'], ['carried', OLD]] })).toBe(300);
    expect(firstPublishedAt({ created_at: 300, tags: 'not tags' })).toBe(300);
  });
});
