import { describe, expect, it, vi } from 'vitest';
import type { Event, Filter } from 'nostr-tools';
import { MECHA_JONO_KEYS } from '../../../../config/publicInfrastructure';
import {
  OFAC_HISTORY_URL, SANCTIONS_FILE_URL, SANCTIONS_NOTE_TOPIC,
  parseSanctionsFile, readSanctionsChanges, readSanctionsNote, standingNotes,
  type SanctionsPublication,
} from '../sanctionsChanges';

const tally = (entities = 0, individuals = 0, vessels = 0) => ({ entities, individuals, vessels, aircraft: 0, other: 0 });
const publication = (id: number, date: string, over: Partial<SanctionsPublication> = {}): SanctionsPublication => ({
  id, date, kind: 'Standard Action', added: tally(1, 2), removed: tally(), amended: 0,
  programmes: [{ code: 'SDGT', added: 3, removed: 0 }],
  named: [{ action: 'add', type: 'Entity', name: `ENTITY ${id}`, countries: ['Mexico'], programmes: ['SDGT'] }],
  ...over,
});
const file = (publications: SanctionsPublication[], missing: number[] = []) => ({
  version: 1, source: 'OFAC', url: 'https://ofac.treasury.gov/recent-actions', license: 'Public domain', retrievedAt: '2026-10-13T20:00:00Z', from: '2026-09-13', publications, missing,
});

const note = (id: number, date: string, over: Partial<Event> = {}, extra: string[][] = []): Event => ({
  id: `n${id}-${over.created_at ?? 1}`, kind: 30023, pubkey: MECHA_JONO_KEYS[0], created_at: 1_760_000_000, content: '', sig: '',
  tags: [
    ['d', `ofac-${id}`], ['t', SANCTIONS_NOTE_TOPIC], ['publication', String(id)], ['published', date], ['kind', 'Standard Action'],
    ['added', '11', '4', '0', '0', '0'], ['removed', '0', '0', '2', '0', '0'], ['amended', '1'],
    ['programme', 'ILLICIT-DRUGS-EO14059', '15', '0'], ['programme', 'LIBYA3', '0', '2'],
    ['named', 'add', 'Entity', 'EXAMPLE LOGISTICS', 'Mexico', 'ILLICIT-DRUGS-EO14059;SDGT'],
    ['named', 'add', 'Individual', 'A PERSON', 'Mexico', 'SDGT'],
    ...extra,
  ],
  ...over,
});

describe('parseSanctionsFile', () => {
  it('reads each publication, leaving out one that does not read', () => {
    const read = parseSanctionsFile(file([publication(2, '2026-10-09'), { ...publication(1, '2026-10-08'), added: { entities: 1 } } as unknown as SanctionsPublication], [7]));
    expect(read.publications.map((p) => p.id)).toEqual([2]);
    expect(read.missing).toEqual([7]);
  });

  it('reads nothing from a file of another version', () => {
    expect(parseSanctionsFile({ ...file([publication(2, '2026-10-09')]), version: 2 }).publications).toEqual([]);
  });
});

describe("Mecha Jono's sanctions notes", () => {
  it('read a publication from its tags', () => {
    const p = readSanctionsNote(note(1049, '2026-10-13')) as SanctionsPublication;
    expect(p).toMatchObject({ id: 1049, date: '2026-10-13', amended: 1, added: tally(11, 4), removed: tally(0, 0, 2) });
    expect(p.programmes).toEqual([{ code: 'ILLICIT-DRUGS-EO14059', added: 15, removed: 0 }, { code: 'LIBYA3', added: 0, removed: 2 }]);
  });

  it('name organisations, vessels and aircraft only: a person named in a note is dropped (BF2)', () => {
    const p = readSanctionsNote(note(1049, '2026-10-13')) as SanctionsPublication;
    expect(p.named).toEqual([{ action: 'add', type: 'Entity', name: 'EXAMPLE LOGISTICS', countries: ['Mexico'], programmes: ['ILLICIT-DRUGS-EO14059', 'SDGT'] }]);
    expect(JSON.stringify(p)).not.toContain('A PERSON');
  });

  it("are read from Mecha Jono's key only; the newest at an address stands, and a retraction withdraws it", () => {
    expect(readSanctionsNote(note(1, '2026-10-13', { pubkey: 'f'.repeat(64) }))).toBeNull();
    const standing = standingNotes([
      note(1, '2026-10-13', { created_at: 1 }),
      note(1, '2026-10-13', { created_at: 2 }, [['amended', '9']]),
      note(2, '2026-10-12', { created_at: 1 }),
      { ...note(2, '2026-10-12', { created_at: 2 }), tags: [['d', 'ofac-2'], ['t', SANCTIONS_NOTE_TOPIC], ['t', 'retracted']] },
    ]);
    expect(standing.map((p) => p.id)).toEqual([1]);
  });
});

/** A relay holding `events`, answering at once. */
const relay = (events: Event[]) => {
  const filters: Filter[] = [];
  return {
    filters,
    pool: {
      subscribeMany: (_r: string[], filter: Filter, params: { onevent?: (e: Event) => void; oneose?: () => void }) => {
        filters.push(filter);
        queueMicrotask(() => {
          if (filter.until === undefined) for (const e of events) params.onevent?.(e);
          params.oneose?.();
        });
        return { close: () => {} };
      },
    } as never,
  };
};
const NOW = new Date('2026-10-13T20:00:00Z');
const history = [
  { publicationID: 1049, datePublished: '2026-10-13T10:02:04' },
  { publicationID: 1048, datePublished: '2026-10-09T10:01:28' },
  { publicationID: 900, datePublished: '2026-08-01T10:00:00' },
];
const json = (answers: Record<string, unknown>) => vi.fn(async (url: string) => {
  if (!(url in answers)) throw new Error(`not found: ${url}`);
  return answers[url];
});

describe('readSanctionsChanges: OFAC lists, Mecha Jono first, the file for the rest', () => {
  it("asks for Mecha Jono's sanctions notes, and reads the file for the publications they do not hold", async () => {
    const { pool, filters } = relay([note(1049, '2026-10-13')]);
    const answers = json({ [`${OFAC_HISTORY_URL}/2026`]: history, [SANCTIONS_FILE_URL]: file([publication(1049, '2026-10-13'), publication(1048, '2026-10-09')]) });
    const read = await readSanctionsChanges({ pool, relays: ['wss://r'], json: answers, now: NOW });
    expect(filters[0]).toMatchObject({ kinds: [30023], authors: [...MECHA_JONO_KEYS], '#t': [SANCTIONS_NOTE_TOPIC] });
    expect(read.publications.map((p) => [p.id, p.via])).toEqual([[1049, 'record'], [1048, 'file']]);
    expect(read.from).toBe('2026-09-13');
    expect(read.missing).toEqual([]);
  });

  it('never fetches the file when the notes hold every publication OFAC lists', async () => {
    const { pool } = relay([note(1049, '2026-10-13'), note(1048, '2026-10-09')]);
    const answers = json({ [`${OFAC_HISTORY_URL}/2026`]: history });
    const read = await readSanctionsChanges({ pool, relays: ['wss://r'], json: answers, now: NOW });
    expect(answers).not.toHaveBeenCalledWith(SANCTIONS_FILE_URL);
    expect(read.publications.map((p) => p.via)).toEqual(['record', 'record']);
  });

  it("reads the file when OFAC's list does not answer, and names what OFAC lists and nothing holds", async () => {
    const { pool } = relay([]);
    const noList = await readSanctionsChanges({ pool, relays: ['wss://r'], json: json({ [SANCTIONS_FILE_URL]: file([publication(1048, '2026-10-09')], [1047]) }), now: NOW });
    expect(noList.publications.map((p) => p.id)).toEqual([1048]);
    expect(noList.missing).toEqual([1047]);
    const noFile = await readSanctionsChanges({ pool, relays: ['wss://r'], json: json({ [`${OFAC_HISTORY_URL}/2026`]: history }), now: NOW });
    expect(noFile.publications).toEqual([]);
    expect(noFile.missing).toEqual([1049, 1048]);
  });

  it('keeps only the last 30 days, and asks for last year too in early January', async () => {
    const { pool } = relay([note(1, '2026-09-01')]);
    const read = await readSanctionsChanges({ pool, relays: ['wss://r'], json: json({ [`${OFAC_HISTORY_URL}/2026`]: [], [SANCTIONS_FILE_URL]: file([publication(5, '2026-09-12')]) }), now: NOW });
    expect(read.publications).toEqual([]);
    const january = json({ [`${OFAC_HISTORY_URL}/2025`]: [], [`${OFAC_HISTORY_URL}/2026`]: [] });
    await readSanctionsChanges({ pool, relays: ['wss://r'], json: january, now: new Date('2026-01-10T00:00:00Z') });
    expect(january).toHaveBeenCalledWith(`${OFAC_HISTORY_URL}/2025`);
  });
});
