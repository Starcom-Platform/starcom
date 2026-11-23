/**
 * Case and mission numbers that two machines cannot both mint (plan item
 * 2.4, slice b). They were a random four-digit value, so two people's cases
 * collided one time in nine thousand, and a bundle carrying a case into a
 * workspace that already had its number would have made two "CASE-2026-4821".
 * A number is now read from the record's id, which is already unique.
 */
import { describe, it, expect } from 'vitest';
import { recordNumber } from '../recordNumbers';

const FORMAT = /^CASE-\d{4}-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}$/;

describe('record numbers', () => {
  it('read from the id: the same record has the same number on every machine', () => {
    const id = 'intelcase-1790380000000-ab12';
    expect(recordNumber('CASE', id, new Date('2026-09-27T00:00:00Z'))).toMatch(FORMAT);
    expect(recordNumber('CASE', id, new Date('2026-09-27T00:00:00Z'))).toBe(recordNumber('CASE', id, new Date('2026-09-27T00:00:00Z')));
  });

  it('carry the year the record was made, and the kind of record', () => {
    expect(recordNumber('CASE', 'x', new Date('2025-12-31T23:00:00Z'))).toMatch(/^CASE-2025-/);
    expect(recordNumber('MSN', 'x', new Date('2026-01-01T00:00:00Z'))).toMatch(/^MSN-2026-/);
  });

  it('do not collide across ten thousand records', () => {
    const numbers = new Set<string>();
    for (let i = 0; i < 10_000; i += 1) numbers.add(recordNumber('CASE', `intelcase-${1790380000000 + i}-${(i * 7919).toString(36)}`));
    expect(numbers.size).toBe(10_000);
  });

  it('use no letter that reads as a digit, or as another letter', () => {
    const all = Array.from({ length: 2_000 }, (_, i) => recordNumber('MSN', `mission-${i}`).split('-').slice(2).join('')).join('');
    expect(all).not.toMatch(/[ILOU]/);
  });
});
