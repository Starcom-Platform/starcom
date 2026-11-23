/**
 * Declassified records as Mecha Jono posts them (plan H9; their spec of 25 Oct): one note a release, each with
 * its title, its source in its own words, its day, its licence and its links; the newest at an address stands.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import type { Event, Filter } from 'nostr-tools';
import { MECHA_JONO_KEYS } from '../../../config/publicInfrastructure';
import { DECLASS_TOPIC, declassDay, readDeclassNote, readDeclassified, standingRecords } from '../declassDesk';

const MJ = MECHA_JONO_KEYS[0];
const DAY = Date.UTC(2026, 9, 23);
const note = (d: string, over: { title?: string; summary?: string; at?: number; source?: string; branch?: string; created?: number; extra?: string[][] } = {}): Event => ({
  id: Math.random().toString(16).slice(2), kind: 30023, pubkey: MJ, created_at: over.created ?? 1_792_900_000, content: '', sig: '',
  tags: [
    ['d', d],
    ['title', over.title ?? 'DOE made 7 historical laboratory reports public on 23 October 2026 (1966–1988)'],
    ['summary', over.summary ?? "DOE's Office of Scientific and Technical Information (OSTI): DOE made 7 historical laboratory reports public on 23 October 2026 (1966–1988)"],
    ['published_at', String(Math.floor((over.at ?? DAY + 3 * 3_600_000) / 1000))],
    ['client', 'Mecha Jono'],
    ['t', 'intel_report'], ['t', DECLASS_TOPIC], ['t', `source:${over.source ?? 'osti'}`], ['t', 'role:context'],
    ['t', 'category:declassified'], ['t', `category:declassified.${over.branch ?? 'technical'}`],
    ['license', 'public domain (US government work)'],
    ['r', 'https://www.osti.gov/biblio/4479192'], ['r', 'https://www.osti.gov/biblio/4477293'],
    ...(over.extra ?? []),
  ],
});

describe('readDeclassNote', () => {
  it('reads a release: its title, its source as its summary names it, its day, licence and links', () => {
    const read = readDeclassNote(note('starcom-intel-declass-osti-8e09bf29ea6d'));
    expect(read).toEqual({
      ok: true,
      record: {
        d: 'starcom-intel-declass-osti-8e09bf29ea6d', title: 'DOE made 7 historical laboratory reports public on 23 October 2026 (1966–1988)',
        source: 'osti', sourceName: "DOE's Office of Scientific and Technical Information (OSTI)", branch: 'technical',
        publishedAt: DAY + 3 * 3_600_000, licence: 'public domain (US government work)',
        links: ['https://www.osti.gov/biblio/4479192', 'https://www.osti.gov/biblio/4477293'], createdAt: 1_792_900_000,
      },
    });
  });

  it('names a source by its code when the summary does not lead with it', () => {
    const read = readDeclassNote(note('a', { summary: 'A release.', source: 'frus', branch: 'diplomatic' }));
    expect(read).toMatchObject({ ok: true, record: { source: 'frus', sourceName: 'frus', branch: 'diplomatic' } });
  });

  it('names no source by a lead that is the note\'s own client, the publisher\'s desk, but by its code', () => {
    const own = note('a', { summary: 'The Example Desk: DOE made 7 historical laboratory reports public on 23 October 2026 (1966–1988)' });
    const withClient = { ...own, tags: own.tags.map((t) => (t[0] === 'client' ? ['client', 'The Example Desk'] : t)) };
    expect(readDeclassNote(withClient)).toMatchObject({ ok: true, record: { sourceName: 'osti' } });
  });

  it('refuses another publisher, another topic, or a release without its title, day or licence', () => {
    expect(readDeclassNote({ ...note('a'), pubkey: 'f'.repeat(64) }).ok).toBe(false);
    expect(readDeclassNote({ ...note('a'), tags: note('a').tags.filter((t) => t[1] !== DECLASS_TOPIC) }).ok).toBe(false);
    for (const missing of ['title', 'published_at', 'license']) {
      expect(readDeclassNote({ ...note('a'), tags: note('a').tags.filter((t) => t[0] !== missing) }).ok).toBe(false);
    }
  });
});

describe('standingRecords', () => {
  it('keeps the newest note at an address, and lets a newer retraction withdraw it', () => {
    const records = standingRecords([
      note('a', { title: 'Old title', created: 1 }), note('a', { title: 'New title', created: 2 }),
      note('b', { created: 1 }), note('b', { created: 2, extra: [['t', 'retracted']] }),
    ]);
    expect(records.map((r) => r.title)).toEqual(['New title']);
  });
});

describe('declassDay', () => {
  const records = standingRecords([
    note('a', { at: DAY + 1_000 }), note('b', { at: DAY + 9 * 3_600_000, title: 'NASA added a 1994 report: Maneuver Design for Galileo Asteroid Flybys', source: 'ntrs' }),
    note('c', { at: DAY - 2 * 3_600_000 }),
  ]);

  it('is the latest UTC day with a release, its releases newest first', () => {
    expect(declassDay(records, 'latest')).toMatchObject({ day: '2026-10-23' });
    expect(declassDay(records, 'latest')!.records.map((r) => r.d)).toEqual(['b', 'a']);
  });

  it('or the day asked, and null for a day with none', () => {
    expect(declassDay(records, '2026-10-22')!.records.map((r) => r.d)).toEqual(['c']);
    expect(declassDay(records, '2026-10-21')).toBeNull();
    expect(declassDay([], 'latest')).toBeNull();
  });
});

describe('readDeclassified', () => {
  it("asks The Record for Mecha Jono's declassified notes of the days before", async () => {
    const asked: Filter[] = [];
    const pool = { subscribeMany: (_relays: string[], filter: Filter, handlers: { onevent?: (e: Event) => void; oneose?: () => void }) => {
      asked.push(filter);
      queueMicrotask(() => { if (filter.until === undefined) handlers.onevent?.(note('a')); handlers.oneose?.(); });
      return { close: () => {} };
    } };
    const records = await readDeclassified({ pool: pool as never, relays: ['wss://example.org'], waitMs: 50, now: DAY + 86_400_000 });
    expect(records.map((r) => r.d)).toEqual(['a']);
    expect(asked[0]).toMatchObject({ kinds: [30023], '#t': [DECLASS_TOPIC], since: Math.floor((DAY + 86_400_000) / 1000) - 8 * 86_400 });
  });
});
