import { describe, expect, it, vi } from 'vitest';
import type { Event, Filter } from 'nostr-tools';
import { MECHA_JONO_KEYS } from '../../../../config/publicInfrastructure';
import { EXCLUSIONS_FILE_URL, EXCLUSIONS_NOTE_TOPIC, parseExclusionsFile, readExclusionsNote, readHealthExclusions, type ExclusionMonth } from '../healthExclusions';

const month = (m: string, over: Partial<ExclusionMonth> = {}): ExclusionMonth => ({
  month: m, exclusions: 145, reinstatements: 53, people: 136, practicesCounted: 0,
  byState: { FL: 28 }, byCategory: { 'DME COMPANY': 2 }, byBasis: { '1128b4': 87 },
  organisations: [{ name: 'EXAMPLE SUPPLY, LLC', state: 'NC', category: 'DME COMPANY', basis: '1128a1', date: '2026-10-20' }],
  ...over,
});
const file = (months: ExclusionMonth[]) => ({ version: 1, source: 'OIG', url: 'u', license: 'l', retrievedAt: '2026-10-13T00:00:00Z', months, missing: [] });

const note = (m: string, over: Partial<Event> = {}): Event => ({
  id: `n-${m}-${over.created_at ?? 1}`, kind: 30023, pubkey: MECHA_JONO_KEYS[0], created_at: 1, content: '', sig: '',
  tags: [
    ['d', `leie-${m}`], ['t', EXCLUSIONS_NOTE_TOPIC], ['month', m], ['exclusions', '145'], ['reinstatements', '53'], ['people', '136'], ['practices', '1'],
    ['state', 'FL', '28'], ['state', 'OH', '13'], ['category', 'DME COMPANY', '2'], ['basis', '1128b4', '87'],
    ['organisation', 'EXAMPLE SUPPLY, LLC', 'NC', 'DME COMPANY', '1128a1', '2026-10-20'],
  ],
  ...over,
});

describe('parseExclusionsFile', () => {
  it('reads each month, leaving out one that does not read', () => {
    expect(parseExclusionsFile(file([month('2026-09'), { ...month('2026-08'), byState: { FL: -1 } }])).map((m) => m.month)).toEqual(['2026-09']);
    expect(parseExclusionsFile({ ...file([month('2026-09')]), version: 2 })).toEqual([]);
  });
});

describe("Mecha Jono's exclusions notes", () => {
  it('read a month from their tags', () => {
    expect(readExclusionsNote(note('2026-09'))).toEqual(month('2026-09', { practicesCounted: 1, byState: { FL: 28, OH: 13 } }));
  });

  it("are read from Mecha Jono's key only, and a retraction says so", () => {
    expect(readExclusionsNote(note('2026-09', { pubkey: 'f'.repeat(64) }))).toBeNull();
    expect(readExclusionsNote({ ...note('2026-09'), tags: [['d', 'leie-2026-09'], ['t', EXCLUSIONS_NOTE_TOPIC], ['t', 'retracted']] })).toBe('retracted');
  });
});

const relay = (events: Event[]) => ({
  subscribeMany: (_r: string[], filter: Filter, params: { onevent?: (e: Event) => void; oneose?: () => void }) => {
    queueMicrotask(() => {
      if (filter.until === undefined) for (const e of events) params.onevent?.(e);
      params.oneose?.();
    });
    return { close: () => {} };
  },
}) as never;

describe('readHealthExclusions: Mecha Jono first, the file for the rest', () => {
  it('takes the notes and fills the three months from the file, newest first', async () => {
    const json = vi.fn(async () => file([month('2026-09'), month('2026-08'), month('2026-07'), month('2026-06')]));
    const read = await readHealthExclusions({ pool: relay([note('2026-09')]), relays: ['wss://r'], json });
    expect(json).toHaveBeenCalledWith(EXCLUSIONS_FILE_URL);
    expect(read.months.map((m) => [m.month, m.via])).toEqual([['2026-09', 'record'], ['2026-08', 'file'], ['2026-07', 'file']]);
  });

  it('never fetches the file when the notes hold three months', async () => {
    const json = vi.fn(async () => file([]));
    const read = await readHealthExclusions({ pool: relay([note('2026-09'), note('2026-08'), note('2026-07')]), relays: ['wss://r'], json });
    expect(json).not.toHaveBeenCalled();
    expect(read.months).toHaveLength(3);
  });

  it('holds nothing when neither answers, rather than guessing', async () => {
    const read = await readHealthExclusions({ pool: relay([]), relays: ['wss://r'], json: vi.fn(async () => { throw new Error('404'); }) });
    expect(read.months).toEqual([]);
  });
});
