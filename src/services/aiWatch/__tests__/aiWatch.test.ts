/**
 * AI Watch's intake (decision D-AW, step 1): Mecha Jono's Terminator Watch notes read from The Record, each
 * in the sections its facets name (AW2), with its stance, source, language, what may be done with it, and
 * its place only as the note states it (AW3). Read against the 26 records of 12 October, kept beside the
 * record.
 */
import { describe, expect, it, vi } from 'vitest';
import { BURST_MS } from '../../nostr/burst';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Event } from 'nostr-tools';
import { AiWatchStore, aiWatchItems, aiWatchStatus, readAiWatchNote, startAiWatch, subscribeAiWatch, type AiWatchItem } from '../aiWatch';
import { MECHA_JONO_KEYS, THE_RECORD_RELAY } from '../../../config/publicInfrastructure';

const MECHA = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const LIVE: Event[] = JSON.parse(readFileSync(resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/ai-watch/terminator_watch_live_2026-10-12.json'), 'utf8'));
const read = (event: Event): AiWatchItem => {
  const r = readAiWatchNote(event);
  if ('refused' in r) throw new Error(r.refused);
  return r;
};
const all = LIVE.map(read);
const withTags = (event: Event, tags: string[][]): Event => ({ ...event, tags });
const without = (event: Event, name: string, value?: string): Event =>
  withTags(event, event.tags.filter((t) => !(t[0] === name && (value === undefined || t[1] === value))));
const sourceOf = (id: string) => LIVE.find((e) => e.tags.some((t) => t[0] === 't' && t[1] === `source:${id}`))!;

describe('readAiWatchNote', () => {
  it('reads every record of 12 October', () => {
    expect(LIVE).toHaveLength(26);
    expect(all).toHaveLength(26);
  });

  it('puts each in the sections its facets name, a record with two in both (AW2)', () => {
    const count = (section: string) => all.filter((i) => i.sections.includes(section as never)).length;
    expect(count('AiFrontier')).toBe(16);
    expect(count('AiIncidents')).toBe(12);
    expect(count('AiWar')).toBe(11);
    expect(count('AiSafety')).toBe(2);
    expect(all.filter((i) => i.sections.length === 2)).toHaveLength(15);
  });

  it('keeps the stance as stated, and none where none is stated (AW4)', () => {
    const stances = all.map((i) => i.stance ?? 'none');
    expect(stances.filter((s) => s === 'ugly')).toHaveLength(14);
    expect(stances.filter((s) => s === 'good')).toHaveLength(1);
    expect(stances.filter((s) => s === 'bad')).toHaveLength(1);
    expect(stances.filter((s) => s === 'none')).toHaveLength(10);
  });

  it('places a record only as it states: a point at its stated precision, else its country, else nowhere (AW3)', () => {
    const points = all.filter((i) => i.point);
    expect(points).toHaveLength(3);
    for (const p of points) expect(p).toMatchObject({ point: { lat: 28.65, lon: 77.23 }, precision: 'city', jurisdiction: 'in' });
    expect(all.filter((i) => !i.point && i.jurisdiction)).toHaveLength(6);
    expect(all.filter((i) => !i.point && !i.jurisdiction)).toHaveLength(17);
  });

  it('never places a record by its outlet: the outlet country is kept apart from the place', () => {
    const reportedFrom = all.filter((i) => i.outletCountry && !i.point && !i.jurisdiction);
    expect(reportedFrom.length).toBeGreaterThan(0);
    for (const i of reportedFrom) expect(i).not.toHaveProperty('jurisdiction');
  });

  it('keeps its source, link, language, and what its terms allow', () => {
    const qbit = read(sourceOf('qbitai'));
    expect(qbit).toMatchObject({ source: 'qbitai', outletCountry: 'cn', language: 'zh', url: 'https://www.qbitai.com/2026/10/502764.html' });
    expect(qbit.readerOnly).toBe("QbitAI (量子位)'s terms allow no adaptation");
    expect(all.filter((i) => i.readerOnly)).toHaveLength(3);
    expect(read(sourceOf('aiid')).readerOnly).toBeUndefined();
  });

  it('accepts a note also tagged starcom_intel: AI Watch is where it is drawn (AW1)', () => {
    expect(all.filter((i) => i.jurisdiction || i.point).length).toBe(9);
  });

  it('refuses what is not a Terminator Watch note from Mecha Jono', () => {
    const note = LIVE[0];
    expect(readAiWatchNote({ ...note, pubkey: 'f'.repeat(64) })).toEqual({ refused: 'not from a named AI Watch publisher' });
    expect(readAiWatchNote({ ...note, kind: 1 })).toEqual({ refused: 'not a long-form note (30023)' });
    expect(readAiWatchNote(without(note, 't', 'terminator_watch'))).toEqual({ refused: 'not tagged terminator_watch' });
    expect(readAiWatchNote(without(note, 'r'))).toEqual({ refused: 'it has no link to its source' });
    expect(readAiWatchNote(without(note, 'title'))).toEqual({ refused: 'it has no title' });
    expect(readAiWatchNote(without(note, 'd'))).toEqual({ refused: 'it has no address' });
  });

  it('refuses a link that is not to a web page', () => {
    const note = LIVE[0];
    const tags = note.tags.map((t) => (t[0] === 'r' ? ['r', 'javascript:alert(1)'] : t));
    expect(readAiWatchNote(withTags(note, tags))).toEqual({ refused: 'it has no link to its source' });
  });
});

describe('AiWatchStore', () => {
  it('keeps the newest record at each address, and a retraction withdraws it', () => {
    const store = new AiWatchStore();
    const note = LIVE[0];
    expect(store.accept(note).kept).toBe(true);
    expect(store.accept({ ...note, id: 'older', created_at: note.created_at - 10 }).kept).toBe(false);
    expect(store.accept(withTags({ ...note, id: 'newer', created_at: note.created_at + 10 }, [...note.tags, ['t', 'retracted']])).kept).toBe(true);
    expect(store.items()).toEqual([]);
  });

  it('lists every record that stands, newest first', () => {
    const store = new AiWatchStore();
    for (const e of LIVE) store.accept(e);
    const items = store.items();
    expect(items).toHaveLength(26);
    expect(items.every((item, i) => i === 0 || items[i - 1].publishedAt >= item.publishedAt)).toBe(true);
  });
});

describe('startAiWatch', () => {
  it("reads Mecha Jono's terminator_watch notes from The Record, one read however many ask", () => {
    vi.useFakeTimers();
    type H = { onevent: (e: Event) => void; oneose: () => void; onclose: (r: { url: string; reason: string }[]) => void };
    const handlers: H[] = [];
    const close = vi.fn();
    const subscribeMany = vi.fn((_relays: string[], _filter: unknown, h: H) => { handlers.push(h); return { close }; });
    const heard = vi.fn();
    const stopListening = subscribeAiWatch(heard);
    const stop = startAiWatch({ pool: { subscribeMany } as never });
    expect(subscribeMany.mock.calls.map((c) => c[1])).toEqual([{ kinds: [30023], authors: [...MECHA_JONO_KEYS], '#t': ['terminator_watch'] }]);
    expect(subscribeMany.mock.calls.every((c) => c[0].length === 1 && c[0][0] === THE_RECORD_RELAY)).toBe(true);
    handlers[0].onevent(LIVE[0]);
    // A burst is gathered before it is told (burst.ts).
    expect(heard).not.toHaveBeenCalled();
    vi.advanceTimersByTime(BURST_MS);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(aiWatchItems()).toHaveLength(1);
    expect(aiWatchItems()).toBe(aiWatchItems());
    const second = startAiWatch({ pool: { subscribeMany } as never });
    expect(subscribeMany).toHaveBeenCalledTimes(1);
    stop();
    expect(close).not.toHaveBeenCalled();
    second();
    expect(close).toHaveBeenCalledTimes(1);
    stopListening();
    vi.useRealTimers();
  });

  it('says when The Record has sent what it holds, and when it could not be read', () => {
    type H = { onevent: (e: Event) => void; oneose: () => void; onclose: (r: { url: string; reason: string }[]) => void };
    const opened: H[] = [];
    const subscribeMany = vi.fn((_r: string[], _f: unknown, h: H) => { opened.push(h); return { close: vi.fn() }; });
    const stop = startAiWatch({ pool: { subscribeMany } as never });
    expect(aiWatchStatus()).toEqual({ loaded: false, error: null, at: null });
    opened[0].oneose();
    expect(aiWatchStatus()).toMatchObject({ loaded: true, error: null });
    stop();
    const again = startAiWatch({ pool: { subscribeMany } as never });
    opened.at(-1)!.onclose([{ url: THE_RECORD_RELAY, reason: 'connection failed' }]);
    expect(aiWatchStatus()).toEqual({ loaded: false, error: 'The Record could not be read: connection failed', at: null });
    again();
  });
});

// Mecha Jono's key change (2 Nov 2026): a note re-signed under the new key keeps its time, by its carried tag.
describe('an AI Watch note carried to Mecha Jono\'s new key', () => {
  it('keeps when it was first published', () => {
    const event = LIVE[0];
    const first = event.created_at;
    const carried: Event = {
      ...event, pubkey: MECHA_JONO_KEYS[0], created_at: 1_793_631_600,
      tags: [...event.tags.filter((t) => t[0] !== 'published_at'), ['carried', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', String(first)]],
    };
    expect(read(carried).publishedAt).toBe(first);
  });
});
