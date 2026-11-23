/**
 * How IntelWeb colours its notes (decision D-IW, IW12): by assessment as the globe does, or by
 * category, country, publisher or age. Only notes take the colour chosen; a hub, a stub, a mission
 * package or a cluster keeps its kind's, so what it is stays readable.
 */
import { describe, expect, it } from 'vitest';
import { noteColours } from '../noteColours';
import { spriteGlyphFill } from '../../../../../components/Globe/intelReportSprites';
import type { IntelNode } from '../IntelGraph';

const note = (id: string, metadata: Record<string, unknown>, timestamp?: string): IntelNode =>
  ({ id, type: 'report', confidence: 0.8, title: id, tags: [], metadata, ...(timestamp ? { timestamp: new Date(timestamp) } : {}) });
const hub = (id: string): IntelNode => ({ id, type: 'country', confidence: 1, title: id, tags: [], metadata: {} });

describe('colouring notes', () => {
  const nodes = [
    note('a', { assessment: 'critical', intelCategory: 'conflict', jurisdictions: ['ye'], author: 'mj' }, '2026-10-12T00:00:00Z'),
    note('b', { assessment: 'raw', intelCategory: 'health', jurisdictions: ['ye', 'sa'], author: 'mj' }, '2026-10-01T00:00:00Z'),
    note('c', { intelCategory: 'conflict', jurisdictions: ['us-tx'], author: 'other' }, '2026-10-06T00:00:00Z'),
    hub('countries/ye.md'),
  ];

  it('by assessment, in the globe\'s own colours, a note stating none as raw', () => {
    const { of, key } = noteColours(nodes, 'assessment');
    expect([of.get('a'), of.get('b'), of.get('c')]).toEqual([spriteGlyphFill('critical'), spriteGlyphFill('raw'), spriteGlyphFill('raw')]);
    expect(key.map((k) => k.value)).toEqual(['critical', 'raw']);
  });

  it('never a hub: it keeps its kind\'s colour', () => {
    for (const by of ['assessment', 'category', 'country', 'publisher', 'age'] as const) expect(noteColours(nodes, by).of.has('countries/ye.md')).toBe(false);
  });

  it('by category, one colour each, the same for the same category', () => {
    const { of, key } = noteColours(nodes, 'category');
    expect(of.get('a')).toBe(of.get('c'));
    expect(of.get('a')).not.toBe(of.get('b'));
    expect(key.map((k) => k.value)).toEqual(['conflict', 'health']);
  });

  it('by country, the first it states, a region as its country', () => {
    const { of, key } = noteColours(nodes, 'country');
    expect(of.get('a')).toBe(of.get('b'));
    expect(key.map((k) => k.value)).toEqual(['ye', 'us']);
  });

  it('by publisher, the most frequent first', () => {
    const { of, key } = noteColours(nodes, 'publisher');
    expect(of.get('a')).toBe(of.get('b'));
    expect(of.get('a')).not.toBe(of.get('c'));
    expect(key.map((k) => k.value)).toEqual(['mj', 'other']);
  });

  it('by age, oldest to newest, each a different shade', () => {
    const { of, key } = noteColours(nodes, 'age');
    expect(new Set([of.get('a'), of.get('b'), of.get('c')]).size).toBe(3);
    expect(key.map((k) => k.value)).toEqual(['2026-10-01T00:00:00.000Z', '2026-10-12T00:00:00.000Z']);
  });

  it('a note stating nothing of the kind is said so in the key, in one muted colour', () => {
    const { of, key } = noteColours([note('x', {}), note('y', { jurisdictions: ['ye'] })], 'country');
    expect(key.map((k) => k.value)).toEqual(['ye', '']);
    expect(of.get('x')).toBe(key[1].colour);
  });
});
