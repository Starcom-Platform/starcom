/**
 * A report as the note that publishes it (decision D-RP): what goes, what is refused, and that a Starcom globe
 * reading the note back gets the report itself, at a place no finer than it was given.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import { reportNoteTemplate, reportPublishRefusal, reportTopics, reportWithdrawalTemplates, WITHDRAWN_TEXT } from '../reportNote';
import { NostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';
import { recordReportPublished, markSending } from '../publishedReports';
import { geohashCellRadiusM, geohashOf, geohashWithin } from '../../geoint/statedPrecision';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const report = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: 'report-berth-4', title: 'Berth 4 cranes at night', content: 'Three cranes working after 02:00.', author: 'me',
  category: 'GENERAL', tags: ['Port', '#maritime', 'night shift', 'port'], visibility: 'public',
  latitude: 40.6895, longitude: -74.1745, createdAt: new Date(Date.UTC(2026, 10, 19)), updatedAt: new Date(Date.UTC(2026, 10, 19)),
  status: 'DRAFT', history: [], ...over,
});
const tag = (tags: string[][], name: string) => tags.filter((t) => t[0] === name);

type Handler = (event: unknown, relay: string) => void;
function readBack(...events: unknown[]) {
  const ingest = new NostrStarcomIntelIngest({ relays: [], searchRelays: [] });
  const seen: IntelReportUI[] = [];
  const withdrawn: string[][] = [];
  ingest.subscribe((r) => seen.push(r));
  ingest.onWithdrawn((ids) => withdrawn.push(ids));
  for (const event of events) (ingest as unknown as { readEvent: Handler }).readEvent(event, 'wss://relay.example');
  const held: IntelReportUI[] = [];
  ingest.replayAccepted((r) => held.push(r));
  return { seen, withdrawn, held, metrics: ingest.getMetrics() };
}

beforeEach(() => localStorage.clear());

describe('geohashes for a published place', () => {
  it('encodes as the standard does', () => {
    expect(geohashOf(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
  });

  it('is never finer than the precision given, and its point stays within it', () => {
    const county = geohashWithin(40.6895, -74.1745, 30_000);
    expect(county).toHaveLength(4);
    expect(geohashCellRadiusM(county)!).toBeLessThanOrEqual(30_000);
    expect(geohashWithin(40.6895, -74.1745, 1_000_000)).toHaveLength(2);
    expect(geohashWithin(40.6895, -74.1745, 10)).toHaveLength(9);
    expect(geohashWithin(40.6895, -74.1745, undefined)).toHaveLength(9);
  });
});

describe('reportNoteTemplate', () => {
  it('is a long-form note: the title first, then the summary and the text, addressed by the report', () => {
    const note = reportNoteTemplate(report({ summary: 'Night work at berth 4.' }), 1_795_000_000);
    expect(note.kind).toBe(30023);
    expect(note.content).toBe('Berth 4 cranes at night\n\nNight work at berth 4.\n\nThree cranes working after 02:00.');
    expect(note.tags.slice(0, 4)).toEqual([
      ['d', 'report-berth-4'], ['title', 'Berth 4 cranes at night'], ['published_at', '1795000000'], ['t', 'starcom_intel'],
    ]);
    expect(tag(note.tags, 'summary')).toEqual([['summary', 'Night work at berth 4.']]);
    expect(tag(note.tags, 't').map((t) => t[1])).toEqual(['starcom_intel', 'port', 'maritime', 'night-shift']);
  });

  it('places it no finer than its precision, and says the precision', () => {
    const exact = reportNoteTemplate(report(), 1);
    expect(tag(exact.tags, 'g')).toEqual([['g', geohashOf(40.6895, -74.1745, 9)]]);
    expect(tag(exact.tags, 'geo_precision')).toEqual([]);
    const county = reportNoteTemplate(report({ geoPrecisionM: 30_000 }), 1);
    expect(tag(county.tags, 'g')[0][1]).toHaveLength(4);
    expect(tag(county.tags, 'geo_precision')).toEqual([['geo_precision', '30000m']]);
    // No coordinate is written anywhere else in the note.
    expect(JSON.stringify(county)).not.toContain('40.6895');
  });

  it('names its jurisdictions, sources and what it rests on, and that an agent wrote it', () => {
    const note = reportNoteTemplate(report({
      latitude: undefined, longitude: undefined, jurisdictions: ['US-NJ', 'us-nj', 'us'],
      sourceLinks: ['https://example.org/a', 'javascript:alert(1)'], cites: [{ eventId: 'e'.repeat(64), relay: 'wss://r.example' }],
    }), 1, 'Scout');
    expect(tag(note.tags, 'g')).toEqual([]);
    expect(tag(note.tags, 'jurisdiction')).toEqual([['jurisdiction', 'us-nj'], ['jurisdiction', 'us']]);
    expect(tag(note.tags, 'r')).toEqual([['r', 'https://example.org/a']]);
    expect(tag(note.tags, 'e')).toEqual([['e', 'e'.repeat(64), 'wss://r.example', 'cites']]);
    expect(tag(note.tags, 'agent')).toEqual([['agent', 'Scout']]);
  });

  it('keeps topics short, lowercased and each once', () => {
    expect(reportTopics(['A B', '#a-b', 'x'.repeat(51), '', 'starcom_intel'])).toEqual(['a-b']);
  });
});

describe('reportPublishRefusal', () => {
  it('lets a Public report of your own go', () => {
    expect(reportPublishRefusal(report())).toBeNull();
  });

  it('refuses what is not yours, undecided, not Public, or marked as holding sources and methods', () => {
    expect(reportPublishRefusal(report({ history: [{ action: 'IMPORTED', user: 'nostr', timestamp: '' }] }))).toMatch(/its author's note/);
    expect(reportPublishRefusal(report({ receivedFrom: { pubkey: 'p', at: '' } as never }))).toMatch(/sent to you/);
    expect(reportPublishRefusal(report({ visibility: undefined }))).toMatch(/Mark it Public/);
    expect(reportPublishRefusal(report({ visibility: 'limited' }))).toMatch(/This report is Limited/);
    expect(reportPublishRefusal(report({ visibility: 'private' }))).toMatch(/This report is Private/);
    expect(reportPublishRefusal(report({ sensitivity: 'careful' }))).toMatch(/source or method detail/);
    expect(reportPublishRefusal(report({ content: '  ' }))).toMatch(/title and text/);
  });

  it('refuses a placeless report whose title other globes would read as a map', () => {
    expect(reportPublishRefusal(report({ title: '[UPDATE] Berth 4', latitude: undefined, longitude: undefined }))).toMatch(/\[ or \{/);
    expect(reportPublishRefusal(report({ title: '[UPDATE] Berth 4' }))).toBeNull();
  });
});

describe('the note, read back by a Starcom globe', () => {
  const sk = generateSecretKey();
  const signed = (r: IntelReportUI) => finalizeEvent({ ...reportNoteTemplate(r, 1_795_000_000), created_at: 1_795_000_100 }, sk);

  it('shows the report itself: its title, its text, its place and how precisely, its sources', () => {
    const { seen } = readBack(signed(report({ geoPrecisionM: 2_000, sourceLinks: ['https://example.org/a'], cites: [{ eventId: 'e'.repeat(64) }] })));
    expect(seen).toHaveLength(1);
    const [read] = seen;
    expect(read.title).toBe('Berth 4 cranes at night');
    expect(read.content).toContain('Three cranes working after 02:00.');
    expect(read.id).toBe(`30023:${getPublicKey(sk)}:report-berth-4`);
    expect(Math.abs(read.latitude! - 40.6895)).toBeLessThan(0.05);
    expect(Math.abs(read.longitude! - -74.1745)).toBeLessThan(0.05);
    expect(read.geoPrecisionM).toBe(2_000);
    expect(read.sourceLinks).toEqual(['https://example.org/a']);
    expect(read.cites).toEqual([{ eventId: 'e'.repeat(64) }]);
    expect(read.createdAt.getTime()).toBe(1_795_000_000_000);
  });

  it('lists a placeless one by its jurisdiction', () => {
    const { seen } = readBack(signed(report({ latitude: undefined, longitude: undefined, jurisdictions: ['us-nj'] })));
    expect(seen[0].jurisdictions).toEqual(['us-nj']);
    expect(seen[0].latitude).toBeUndefined();
  });

  it('is not set beside the report it came from, on the browser that published it (RP5)', () => {
    const event = signed(report());
    const address = `30023:${getPublicKey(sk)}:report-berth-4`;
    recordReportPublished('report-berth-4', { address, eventId: event.id, firstAt: 1, at: 1, relays: 1, reportUpdatedAt: 1 });
    const { seen, metrics } = readBack(event);
    expect(seen).toEqual([]);
    expect(metrics.deduped).toBe(1);
  });

  it('nor while it is still being sent', () => {
    const event = signed(report());
    const done = markSending(`30023:${getPublicKey(sk)}:report-berth-4`);
    expect(readBack(event).seen).toEqual([]);
    done();
    expect(readBack(event).seen).toHaveLength(1);
  });
});

describe('withdrawing a published report (RP7)', () => {
  const sk = generateSecretKey();
  const address = `30023:${getPublicKey(sk)}:report-berth-4`;
  const original = finalizeEvent({ ...reportNoteTemplate(report(), 1_795_000_000), created_at: 1_795_000_100 }, sk);
  const { deletion, notice } = reportWithdrawalTemplates({ address, eventId: original.id }, 'report-berth-4');
  const withdrawal = finalizeEvent({ ...notice, created_at: 1_795_000_201 }, sk);

  it('asks relays to delete every version at the address, and replaces it with a notice that repeats nothing', () => {
    expect(deletion).toEqual({ kind: 5, tags: [['a', address], ['e', original.id], ['k', '30023']], content: WITHDRAWN_TEXT });
    expect(notice.kind).toBe(30023);
    expect(notice.tags).toEqual([['d', 'report-berth-4'], ['title', 'Withdrawn'], ['t', 'starcom_intel'], ['t', 'retracted']]);
    expect(JSON.stringify(notice)).not.toMatch(/cranes|night|02:00|40\.6|74\.1/i);
  });

  it('takes the report off every reader, and the withdrawal itself is not a report', () => {
    const { seen, withdrawn, held, metrics } = readBack(original, withdrawal);
    expect(seen.map((r) => r.id)).toEqual([address]);
    expect(withdrawn).toEqual([[address]]);
    expect(held).toEqual([]);
    expect(metrics.withdrawn).toBe(1);
  });

  it('takes off a copy saved in an earlier session, and the older version arriving late stays off', () => {
    const { seen, withdrawn } = readBack(withdrawal, original);
    expect(withdrawn).toEqual([[address]]);
    expect(seen).toEqual([]);
  });

  it('reads the publisher\'s own tag, never a #retracted in the text, and never on a note that is not addressable', () => {
    const inText = finalizeEvent({ ...reportNoteTemplate(report({ content: 'The #retracted claim stands.' }), 1), created_at: 1_795_000_300 }, sk);
    expect(readBack(inText).seen).toHaveLength(1);
    const kind1 = finalizeEvent({ kind: 1, tags: [['t', 'starcom_intel'], ['t', 'retracted'], ['g', 'dr5r']], content: 'A short note', created_at: 1_795_000_300 }, sk);
    expect(readBack(kind1).withdrawn).toEqual([]);
  });
});
