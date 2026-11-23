/**
 * The War & Conflict Brief's front page (decision IM16): one UTC day of Mecha
 * Jono's war news, counted, with each theatre and its count, worst first, by
 * the tier of its war on Wikipedia's list.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import type { ConflictItem, WarItem } from '../warConflict';
import { warConflictBrief, briefDayWindow, theatreDays, briefFrontRows } from '../warConflictBrief';

const DAY = Date.UTC(2026, 9, 2) / 1000;
const HOUR = 3600;
let n = 0;
const item = (over: Partial<ConflictItem> = {}): ConflictItem => {
  n += 1;
  return {
    family: 'item', id: `30023:pk:item-${n}`, pubkey: 'pk', d: `item-${n}`, eventId: `e${n}`, createdAt: DAY + 10 * HOUR,
    title: `Item ${n}`, reportedAt: DAY + 10 * HOUR, content: 'words', events: [], fatal: false, actors: [], casualties: [],
    ...over,
  };
};
const theatre = (slug: string, name: string) => ({ slug, name, region: '' });
const UKRAINE = theatre('russo-ukrainian', 'Russo-Ukrainian war');
const SUDAN = theatre('sudan', 'Sudanese civil war');
const KASHMIR = theatre('kashmir', 'Kashmir conflict');
const war = (name: string, tier: WarItem['tier'], theatres: Array<ReturnType<typeof theatre>>): WarItem => ({
  family: 'war', id: `30023:pk:war-${name}`, pubkey: 'pk', d: `war-${name}`, eventId: 'w', createdAt: DAY, title: name,
  reportedAt: DAY, content: 'words', name, tier, tierLabel: tier, tierMeans: '', countries: [], fatalities: [], includes: [], theatres,
});
const WARS = [
  war('Russo-Ukrainian war', 'major_war', [UKRAINE]),
  war('Sudanese civil war', 'major_war', [SUDAN]),
  war('Kashmir conflict', 'conflict', [KASHMIR]),
];

describe('the day', () => {
  it('is the newest UTC day with items, unless one is named', () => {
    const items = [item({ reportedAt: DAY - 5 * HOUR }), item({ reportedAt: DAY + 23 * HOUR })];
    expect(warConflictBrief(items, WARS)?.day).toBe('2026-10-02');
    expect(warConflictBrief(items, WARS, '2026-10-01')?.day).toBe('2026-10-01');
  });

  it('counts only that day\'s items, midnight to midnight UTC', () => {
    const items = [
      item({ reportedAt: DAY - 1 }), item({ reportedAt: DAY }), item({ reportedAt: DAY + 24 * HOUR - 1 }), item({ reportedAt: DAY + 24 * HOUR }),
    ];
    expect(warConflictBrief(items, WARS, '2026-10-02')?.count).toBe(2);
  });

  it('is nothing when there is no item that day', () => {
    expect(warConflictBrief([], WARS)).toBeNull();
    expect(warConflictBrief([item()], WARS, '2026-09-01')).toBeNull();
  });
});

describe('the theatres', () => {
  it('each with its count, the worst war first, then the most items, then by name', () => {
    const items = [
      item({ theatre: KASHMIR }), item({ theatre: KASHMIR }), item({ theatre: KASHMIR }), item({ theatre: KASHMIR }),
      item({ theatre: SUDAN }), item({ theatre: SUDAN }), item({ theatre: SUDAN }),
      item({ theatre: UKRAINE }), item({ theatre: UKRAINE }),
    ];
    expect(warConflictBrief(items, WARS)?.theatres.map(({ slug, name, count, tier }) => ({ slug, name, count, tier }))).toEqual([
      { slug: 'sudan', name: 'Sudanese civil war', count: 3, tier: 'major_war' },
      { slug: 'russo-ukrainian', name: 'Russo-Ukrainian war', count: 2, tier: 'major_war' },
      { slug: 'kashmir', name: 'Kashmir conflict', count: 4, tier: 'conflict' },
    ]);
  });

  // For the four-theatre front page's rows (theatre-lens.md, TL16).
  it('names each theatre\'s most serious item: a critical warning, then deaths reported, then the newest', () => {
    const plain = item({ theatre: SUDAN, title: 'Newest report', reportedAt: DAY + 20 * HOUR });
    const deadly = item({ theatre: SUDAN, title: 'Deaths in El Fasher', fatal: true, reportedAt: DAY + 5 * HOUR });
    const olderDeadly = item({ theatre: SUDAN, title: 'Older deaths', fatal: true, reportedAt: DAY + 2 * HOUR });
    const brief = warConflictBrief([plain, deadly, olderDeadly], WARS)!;
    expect(brief.theatres[0].mostSerious).toEqual({ id: deadly.id, title: 'Deaths in El Fasher' });
    const warned = item({ theatre: SUDAN, title: 'Airspace closed', role: 'critical', reportedAt: DAY + HOUR });
    expect(warConflictBrief([plain, deadly, warned], WARS)!.theatres[0].mostSerious).toEqual({ id: warned.id, title: 'Airspace closed' });
  });

  it('orders a tie by name', () => {
    const items = [item({ theatre: SUDAN }), item({ theatre: UKRAINE })];
    expect(warConflictBrief(items, WARS)?.theatres.map((t) => t.name)).toEqual(['Russo-Ukrainian war', 'Sudanese civil war']);
  });

  it('gives a theatre in two wars the worse tier', () => {
    const wars = [war('Small', 'skirmish', [KASHMIR]), war('Big', 'minor_war', [KASHMIR]), war('Smaller', 'conflict', [KASHMIR])];
    expect(warConflictBrief([item({ theatre: KASHMIR })], wars)?.theatres[0].tier).toBe('minor_war');
  });

  it('puts a theatre on no war\'s list after those that are', () => {
    const items = [item({ theatre: theatre('gaza', 'Gaza') }), item({ theatre: KASHMIR })];
    expect(warConflictBrief(items, WARS)?.theatres.map((t) => [t.name, t.tier])).toEqual([['Kashmir conflict', 'conflict'], ['Gaza', null]]);
  });

  it('says how many name no war, and counts them in the day', () => {
    const brief = warConflictBrief([item(), item(), item({ theatre: SUDAN })], WARS);
    expect(brief).toMatchObject({ count: 3, noTheatre: 2 });
    expect(brief?.theatres).toHaveLength(1);
  });

  it('lists the day\'s items by id, newest first, for framing them', () => {
    const a = item({ theatre: SUDAN, reportedAt: DAY + 2 * HOUR });
    const b = item({ reportedAt: DAY - HOUR });
    const c = item({ reportedAt: DAY + 5 * HOUR });
    expect(warConflictBrief([a, b, c], WARS)?.ids).toEqual([c.id, a.id]);
  });
});

describe('what the card says', () => {
  it('heads it with the brief and its day, and gives the theatres by tier, worst first, in the key\'s words', () => {
    const gaza = theatre('gaza', 'Gaza');
    const brief = warConflictBrief([
      item({ theatre: UKRAINE }), item({ theatre: UKRAINE }), item({ theatre: SUDAN }), item({ theatre: KASHMIR }), item({ theatre: gaza }), item(),
    ], WARS)!;
    expect(brief.title).toBe('War & Conflict Brief · 2 Oct 2026');
    // A no-break space holds each theatre to its count, so a wrapped line never orphans one.
    const nb = (text: string) => text.replace(/ (\d+)(?= ·|$)/g, '\u00a0$1');
    expect(brief.lines).toEqual([
      '6 items reported on 2 Oct 2026 (UTC), posted on The Record',
      nb('Major wars: Russo-Ukrainian war 2 · Sudanese civil war 1'),
      nb('Conflicts: Kashmir conflict 1'),
      nb('On no war\'s list: Gaza 1'),
      '1 names no war',
    ]);
  });

  it('says one item as one', () => {
    expect(warConflictBrief([item({ theatre: SUDAN })], WARS)!.lines[0]).toMatch(/^1 item reported/);
  });
});

describe('a brief\'s day on the globe (theatre-lens.md, TL4)', () => {
  it('is that UTC day, its first millisecond to its last, and nothing for a day that is not one', () => {
    expect(briefDayWindow('2026-10-02')).toEqual({ start: Date.UTC(2026, 9, 2), end: Date.UTC(2026, 9, 3) - 1 });
    expect(briefDayWindow('not a day')).toBeNull();
  });
});

/*
 * Each theatre's items a day, for its sparkline (theatre-lens.md, TL7): the days
 * ending on the brief's, oldest first. A day before anything was read is not read,
 * which is not the same as a day with none.
 */
describe('a theatre\'s items a day', () => {
  const T = theatre('russia-ukraine', 'Russia–Ukraine war');
  const S = theatre('sudan', 'Sudanese civil war');
  const on = (dayOffset: number, th = T) => item({ theatre: th, reportedAt: DAY + dayOffset * 86_400 + 10 * HOUR });

  it('counts each day\'s items, oldest first, ending on the day asked', () => {
    const items = [on(0), on(0), on(1), on(3), on(3), on(3), on(1, S)];
    const days = theatreDays(items, '2026-10-05', 5);
    expect(days.get('russia-ukraine')).toEqual([
      { day: '2026-10-01', count: null },
      { day: '2026-10-02', count: 2 },
      { day: '2026-10-03', count: 1 },
      { day: '2026-10-04', count: 0 },
      { day: '2026-10-05', count: 3 },
    ]);
    expect(days.get('sudan')!.map((d) => d.count)).toEqual([null, 0, 1, 0, 0]);
  });

  it('leaves out what was reported after the day asked, and items that name no theatre', () => {
    const days = theatreDays([on(0), on(4), item({ reportedAt: DAY })], '2026-10-04', 3);
    expect([...days.keys()]).toEqual(['russia-ukraine']);
    expect(days.get('russia-ukraine')!.map((d) => d.count)).toEqual([1, 0, 0]);
  });

  it('runs two weeks unless told otherwise', () => {
    expect(theatreDays([on(0)], '2026-10-15').get('russia-ukraine')).toHaveLength(14);
  });
});

/*
 * The four-theatre front page's rows (theatre-lens.md, TL15, TL16): the day's
 * count, then for each of the brief's worst theatres, in its order, its name, its
 * items that day and its war's tier, and its most serious item by title.
 */
describe('the front page\'s rows', () => {
  it('says the day, then two lines a theatre, worst first, as many as asked', () => {
    const items = [
      item({ theatre: SUDAN, title: 'Deaths in El Fasher, where the Rapid Support Forces shelled the last open hospital in the city', fatal: true }),
      item({ theatre: SUDAN }),
      item({ theatre: UKRAINE, title: 'Drone strike on Odesa' }),
      item({ theatre: KASHMIR, title: 'Shelling across the line of control' }),
    ];
    const brief = warConflictBrief(items, WARS)!;
    expect(briefFrontRows(brief, 2)).toEqual([
      brief.lines[0],
      'Sudanese civil war · 2 items · a major war',
      'Most serious: Deaths in El Fasher, where the Rapid Support Forces shelled…',
      'Russo-Ukrainian war · 1 item · a major war',
      'Most serious: Drone strike on Odesa',
    ]);
    expect(briefFrontRows(brief, 4)).toHaveLength(1 + 2 * 3);
    expect(briefFrontRows(brief, 4)[5]).toBe('Kashmir conflict · 1 item · a conflict');
  });

  it('says so of a theatre on no war\'s list', () => {
    const brief = warConflictBrief([item({ theatre: theatre('haiti', 'Haiti gang war'), title: 'Gangs attack Kenscoff' })], WARS)!;
    expect(briefFrontRows(brief, 4).slice(1)).toEqual(['Haiti gang war · 1 item · on no war\'s list', 'Most serious: Gangs attack Kenscoff']);
  });
});
