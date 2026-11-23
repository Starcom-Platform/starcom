/**
 * Psi Watch's lists (D-PW, PW89, PW90): every daily note, newest first, a week at a time, one an address; and the
 * Intel Reports whose own time (their event, else when written) overlaps the window, nearest its exact moment first.
 */
import { describe, expect, it } from 'vitest';
import { briefWeeks, intelInWindow, mondayOf, pointedItems } from '../psiLists';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';

const brief = (d: string, publishedS: number, createdS = publishedS) => ({
  kind: 30023, pubkey: 'p'.repeat(64), created_at: createdS, content: 'Sky, next 72 h\nMoon and Mars square.',
  tags: [['d', d], ['title', `Psi Watch, ${d}`], ['published_at', String(publishedS)]],
});
const MON_26_OCT = Date.UTC(2026, 9, 26, 6) / 1000;
const DAY = 86_400;

describe('briefWeeks', () => {
  it('lists every note newest first, a week at a time, one an address, its newest', () => {
    const weeks = briefWeeks([
      brief('psi-brief-2026-10-26', MON_26_OCT),
      brief('psi-brief-2026-11-02', MON_26_OCT + 7 * DAY),
      brief('psi-brief-2026-10-28', MON_26_OCT + 2 * DAY),
      brief('psi-brief-2026-10-26', MON_26_OCT + 600),
    ]);
    expect(weeks.map((w) => w.monday)).toEqual(['2026-11-02', '2026-10-26']);
    expect(weeks[1].notes.map((n) => n.title)).toEqual(['Psi Watch, psi-brief-2026-10-28', 'Psi Watch, psi-brief-2026-10-26']);
    expect(weeks[1].notes[1].publishedS).toBe(MON_26_OCT + 600);
    expect(weeks[1].notes[1].sections[0]).toEqual({ heading: 'Sky, next 72 h', lines: ['Moon and Mars square.'] });
  });

  it('takes a Sunday into the week before', () => {
    expect(mondayOf(Date.UTC(2026, 10, 1, 23) / 1000)).toBe('2026-10-26');
    expect(mondayOf(Date.UTC(2026, 10, 2, 0) / 1000)).toBe('2026-11-02');
  });
});

const report = (id: string, over: Partial<IntelReportUI>): IntelReportUI =>
  ({ id, title: id, createdAt: new Date(Date.UTC(2026, 10, 1)), updatedAt: new Date(Date.UTC(2026, 10, 1)), ...over } as unknown as IntelReportUI);

describe('intelInWindow', () => {
  const window = { from: Date.UTC(2026, 9, 26, 21) / 1000, until: Date.UTC(2026, 9, 27, 7) / 1000, exact: Date.UTC(2026, 9, 27, 2) / 1000 };

  it('keeps the reports whose own time overlaps the window, nearest the exact moment first', () => {
    const found = intelInWindow([
      report('event-inside-late', { startDate: new Date(Date.UTC(2026, 9, 27, 6)) }),
      report('written-inside', { createdAt: new Date(Date.UTC(2026, 9, 27, 1)), updatedAt: new Date(Date.UTC(2026, 9, 27, 1)) }),
      report('event-outside', { startDate: new Date(Date.UTC(2026, 9, 28, 6)), createdAt: new Date(Date.UTC(2026, 9, 27, 2)) }),
      report('span-overlapping', { startDate: new Date(Date.UTC(2026, 9, 25)), endDate: new Date(Date.UTC(2026, 9, 26, 22)) }),
      report('written-inside', { createdAt: new Date(Date.UTC(2026, 9, 27, 1)) }),
    ], window);
    expect(found.map((f) => f.report.id)).toEqual(['written-inside', 'event-inside-late', 'span-overlapping']);
    expect(found[0]).toMatchObject({ time: { basis: 'written' }, fromExactMs: -3_600_000 });
    expect(found[1].time.basis).toBe('event');
  });

  it('lists none when nothing falls inside', () => {
    expect(intelInWindow([report('later', { startDate: new Date(Date.UTC(2026, 10, 5)) })], window)).toEqual([]);
  });
});

describe('pointedItems', () => {
  it("names each item a daily note points to, by its own title, in the note's order, and says which are held", () => {
    const KEY = 'k'.repeat(64);
    const sky = { family: 'psi_sky_event', event: { kind: 31923, pubkey: KEY, created_at: 1, content: '', tags: [['d', 'psi-sky-aspect-Moon_Mars'], ['title', 'Moon square Mars'], ['window', '10', '20', '30'], ['exact', '20']] } };
    const items = pointedItems([`31923:${KEY}:psi-sky-aspect-Moon_Mars`, `30023:${KEY}:psi-field-2026-10-26`], [sky]);
    expect(items).toEqual([
      { kind: 'sky', address: `31923:${KEY}:psi-sky-aspect-Moon_Mars`, title: 'Moon square Mars', held: true },
      { kind: 'field', address: `30023:${KEY}:psi-field-2026-10-26`, title: 'psi-field-2026-10-26', held: false },
    ]);
  });
});
