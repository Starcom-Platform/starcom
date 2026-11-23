/**
 * IntelWeb's Timeline (decision D-IW, IW2, step 5): across, when each note happened as D-E reads its
 * time; one row per group, the largest first; a note stating no time in a column of its own.
 */
import { describe, expect, it } from 'vitest';
import { timelineLayout, TIMELINE_ROW_LABELS_WIDTH } from '../timelineLayout';
import type { IntelNode } from '../IntelGraph';

const note = (id: string, at?: string): IntelNode =>
  ({ id, type: 'report', confidence: 0.8, title: id, tags: [], metadata: {}, ...(at ? { timestamp: new Date(at), timeBasis: 'event' as const } : {}) });
const rowOf = new Map([['a', 'ye'], ['b', 'ye'], ['c', 'sa'], ['d', 'ye'], ['e', '']]);

describe('the Timeline', () => {
  const nodes = [note('a', '2026-10-01T00:00:00Z'), note('b', '2026-10-12T00:00:00Z'), note('c', '2026-10-06T00:00:00Z'), note('d'), note('e', '2026-10-03T00:00:00Z')];
  const out = timelineLayout(nodes, rowOf, 1000, 600);

  it('places a note across by when it happened, earlier to the left', () => {
    const x = (id: string) => out.places.get(id)!.x;
    expect(x('a')).toBeLessThan(x('e'));
    expect(x('e')).toBeLessThan(x('c'));
    expect(x('c')).toBeLessThan(x('b'));
    expect(x('a')).toBeGreaterThan(TIMELINE_ROW_LABELS_WIDTH);
  });

  it('gives each group a row, the largest first, the notes in no group last', () => {
    expect(out.rows.map((r) => r.key)).toEqual(['ye', 'sa', '']);
    const y = (id: string) => out.places.get(id)!.y;
    expect(y('a')).toBe(y('b'));
    expect(y('a')).toBeLessThan(y('c'));
    expect(y('c')).toBeLessThan(y('e'));
  });

  it('puts a note stating no time in a column of its own, left of every timed one, in its row', () => {
    const d = out.places.get('d')!;
    expect(d.x).toBeLessThan(out.places.get('a')!.x);
    expect(d.x).toBe(out.untimedX);
    expect(d.y).toBe(out.places.get('a')!.y);
  });

  it('says the span it shows, for the axis', () => {
    expect(out.span).toEqual({ from: Date.parse('2026-10-01T00:00:00Z'), until: Date.parse('2026-10-12T00:00:00Z') });
  });

  it('places only notes', () => {
    const withHub = [...nodes, { ...note('hub'), type: 'country' as const }];
    expect(timelineLayout(withHub, rowOf, 1000, 600).places.has('hub')).toBe(false);
  });

  it('centres notes that all happened at once', () => {
    const same = timelineLayout([note('a', '2026-10-01T00:00:00Z'), note('b', '2026-10-01T00:00:00Z')], rowOf, 1000, 600);
    expect(same.places.get('a')!.x).toBe(same.places.get('b')!.x);
  });
});

/*
 * On the build one note from March stretched the axis to seven months, and October's notes crowded its
 * last few pixels. A few notes far before the rest stand in a column of their own, named, and the axis
 * spans where the notes are.
 */
describe('notes far earlier than the rest', () => {
  const october = Array.from({ length: 9 }, (_, i) => note(`oct${i}`, `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00Z`));
  const rows = new Map([...october, note('march')].map((n) => [n.id, 'ye']));

  it('stand in a column of their own, and the axis spans the rest', () => {
    const out = timelineLayout([note('march', '2026-03-01T00:00:00Z'), ...october], rows, 1000, 600);
    expect(out.earlier).toEqual({ count: 1, until: Date.parse('2026-03-01T00:00:00Z'), x: expect.any(Number) });
    expect(out.span).toEqual({ from: Date.parse('2026-10-01T00:00:00Z'), until: Date.parse('2026-10-09T00:00:00Z') });
    expect(out.places.get('march')!.x).toBe(out.earlier!.x);
    expect(out.places.get('march')!.x).toBeLessThan(out.places.get('oct0')!.x);
    expect(out.places.get('oct8')!.x - out.places.get('oct0')!.x).toBeGreaterThan(400);
  });

  it('are not split off where the notes are spread evenly', () => {
    const spread = Array.from({ length: 10 }, (_, i) => note(`n${i}`, `2026-0${1 + Math.floor(i / 2)}-0${1 + (i % 2) * 5}T00:00:00Z`));
    expect(timelineLayout(spread, new Map(spread.map((n) => [n.id, 'ye'])), 1000, 600).earlier).toBeNull();
  });

  it('are not split off by a gap narrower than half the span', () => {
    // The first gap is the widest, 19 days, but the span is 40.
    const days = [1, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 41];
    const notes = days.map((d, i) => note(`d${i}`, new Date(Date.UTC(2026, 0, d)).toISOString()));
    expect(timelineLayout(notes, new Map(notes.map((n) => [n.id, 'ye'])), 1000, 600).earlier).toBeNull();
  });

  it('are not split off when they are many', () => {
    const half = [...Array.from({ length: 5 }, (_, i) => note(`m${i}`, `2026-03-0${i + 1}T00:00:00Z`)), ...october.slice(0, 5)];
    expect(timelineLayout(half, new Map(half.map((n) => [n.id, 'ye'])), 1000, 600).earlier).toBeNull();
  });
});

