import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Event, Filter } from 'nostr-tools';
import { MECHA_JONO_KEYS } from '../../../config/publicInfrastructure';
import { energyFileFromBulk } from '../eiaBulk';
import {
  ENERGY_NOTE_TOPIC,
  parseEnergyFile,
  readEnergyNote,
  readEnergyProduction,
  standingSeries,
} from '../energyProduction';

const MJ = MECHA_JONO_KEYS[0];

const bulk = (id: string, data: Array<[string, number | string]>, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ series_id: id, units: 'thousand barrels per day', last_updated: '2026-09-03T10:00:00-04:00', data, ...extra });

describe("energyFileFromBulk: EIA's bulk file to the fallback file", () => {
  const lines = [
    bulk('INTL.57-1-USA-TBPD.A', [['2025', 13221.4], ['2024', 13200]]),
    bulk('INTL.57-1-SAU-TBPD.A', [['2025', 9000.5]]),
    bulk('INTL.57-1-NOR-TBPD.A', [['2025', 0], ['2024', 1.2]]),
    bulk('INTL.57-1-SUN-TBPD.A', [['1991', 9000]]),
    bulk('INTL.57-1-CAN-TBPD.A', [['2026', 5000], ['2025', 4900]]),
    bulk('INTL.57-1-WORL-TBPD.A', [['2025', 84383.4]]),
    bulk('INTL.57-2-USA-TBPD.A', [['2025', 20000]]),
    bulk('INTL.57-1-USA-TBPD.M', [['202501', 13000]]),
    bulk('INTL.57-1-USA-QBTU.A', [['2025', 27]]),
    bulk('INTL.26-1-USA-BCF.A', [['2024', 37000]], { units: 'billion cubic feet', last_updated: '2026-09-30T00:00:00-04:00' }),
    bulk('INTL.4418-1-BRA-QBTU.A', [['2024', 6.1], ['2023', 'NA']], { units: 'quadrillion Btu' }),
    'not json',
  ];
  const file = energyFileFromBulk(lines);

  it('keeps annual production of the three series for countries only', () => {
    expect(file.series.oil?.values).toEqual({ CAN: 4900, USA: 13221.4, SAU: 9000.5 });
    expect(file.series.gas?.values).toEqual({ USA: 37000 });
    expect(file.series.renewable?.values).toEqual({ BRA: 6.1 });
  });

  it("puts every figure in the year most countries' latest figures are for, not one country's newest", () => {
    expect(file.series.oil?.year).toBe(2025);
    expect(file.series.gas?.year).toBe(2024);
  });

  it("keeps EIA's unit and the newest date EIA updated a kept series", () => {
    expect(file.series.oil?.unit).toBe('thousand barrels per day');
    expect(file.series.gas?.unit).toBe('billion cubic feet');
    expect(file.updated).toBe('2026-09-30');
  });

  it('reads back as the file the app loads', () => {
    const read = parseEnergyFile(JSON.parse(JSON.stringify(file)));
    expect(Object.keys(read).sort()).toEqual(['gas', 'oil', 'renewable']);
    expect(read.oil?.via).toBe('file');
  });
});

describe('the shipped file, as the app reads it', () => {
  const shipped = parseEnergyFile(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../public/data/eia-production.json'), 'utf8')));

  it('holds all three series, each for one year', () => {
    for (const s of ['oil', 'gas', 'renewable'] as const) {
      expect(Object.keys(shipped[s]?.values ?? {}).length).toBeGreaterThan(50);
      expect(shipped[s]?.year).toBeGreaterThanOrEqual(2024);
    }
  });

  it('ranks the known largest producers at the top', () => {
    const top = (s: 'oil' | 'gas') => Object.entries(shipped[s]!.values).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
    expect(top('oil')).toContain('USA');
    expect(top('oil')).toContain('SAU');
    expect(top('gas')).toContain('USA');
    expect(top('gas')).toContain('RUS');
  });
});

describe('parseEnergyFile', () => {
  const good = { name: 'Dry natural gas production', unit: 'billion cubic feet', year: 2024, values: { USA: 37000 } };

  it('reads nothing from a file of another version', () => {
    expect(parseEnergyFile({ version: 2, series: { gas: good } })).toEqual({});
    expect(parseEnergyFile(null)).toEqual({});
  });

  it('leaves out a series that does not read, never guessing it', () => {
    const read = parseEnergyFile({ version: 1, series: { gas: good, oil: { ...good, year: '2025' }, renewable: { ...good, unit: '' } } });
    expect(Object.keys(read)).toEqual(['gas']);
  });

  it('keeps only countries with an amount above zero', () => {
    const read = parseEnergyFile({ version: 1, series: { gas: { ...good, values: { USA: 37000, RUS: 0, QAT: -1, WORL: 5, usa: 3, IRN: 'x' } } } });
    expect(read.gas?.values).toEqual({ USA: 37000 });
  });
});

const note = (tags: string[][], over: Partial<Event> = {}): Event => ({
  id: Math.random().toString(16).slice(2),
  kind: 30023,
  pubkey: MJ,
  created_at: 1_760_000_000,
  content: '',
  sig: '',
  tags: [['t', ENERGY_NOTE_TOPIC], ...tags],
  ...over,
});
const oilTags = (year = '2025', usa = '13221.4') => [
  ['d', 'eia-production-oil'], ['series', 'oil'], ['name', 'Crude oil including lease condensate production'],
  ['unit', 'thousand barrels per day'], ['year', year], ['v', 'USA', usa], ['v', 'SAU', '9000.5'],
];

describe("readEnergyNote: Mecha Jono's note", () => {
  it('reads a series from its tags', () => {
    const read = readEnergyNote(note(oilTags()));
    expect(read).toMatchObject({ ok: true, series: 'oil', data: { year: 2025, values: { USA: 13221.4, SAU: 9000.5 }, via: 'record' } });
  });

  it("refuses a note from anyone but a named publisher, another kind, or without the topic", () => {
    expect(readEnergyNote(note(oilTags(), { pubkey: 'f'.repeat(64) })).ok).toBe(false);
    expect(readEnergyNote(note(oilTags(), { kind: 1 })).ok).toBe(false);
    expect(readEnergyNote({ ...note(oilTags()), tags: oilTags() }).ok).toBe(false);
  });

  it('refuses a series it does not know, or one without its year', () => {
    expect(readEnergyNote(note(oilTags().map((t) => (t[0] === 'series' ? ['series', 'coal'] : t)))).ok).toBe(false);
    expect(readEnergyNote(note(oilTags().filter((t) => t[0] !== 'year'))).ok).toBe(false);
  });
});

describe('when a series was written (plan H10)', () => {
  it("is a note's own time, or the day EIA last updated the file", () => {
    expect(readEnergyNote(note(oilTags()))).toMatchObject({ data: { written: new Date(1_760_000_000_000).toISOString() } });
    const good = { name: 'Dry natural gas production', unit: 'billion cubic feet', year: 2024, values: { USA: 37000 } };
    expect(parseEnergyFile({ version: 1, updated: '2026-09-30', series: { gas: good } }).gas?.written).toBe('2026-09-30T00:00:00.000Z');
    expect(parseEnergyFile({ version: 1, updated: 'soon', series: { gas: good } }).gas?.written).toBeUndefined();
  });
});

describe('standingSeries', () => {
  it('takes the newest note at an address', () => {
    const series = standingSeries([
      readEnergyNote(note(oilTags('2025', '13000'), { created_at: 2 })),
      readEnergyNote(note(oilTags('2024', '12000'), { created_at: 1 })),
    ]);
    expect(series.oil?.values.USA).toBe(13000);
  });

  it('lets a newer retraction withdraw the series', () => {
    const series = standingSeries([
      readEnergyNote(note(oilTags(), { created_at: 1 })),
      readEnergyNote(note([['d', 'eia-production-oil'], ['t', 'retracted']], { created_at: 2 })),
    ]);
    expect(series.oil).toBeUndefined();
  });
});

/** A relay that sends `events` to the first page and nothing before it, or never answers. */
const relay = (events: Event[], answers = true) => {
  const filters: Filter[] = [];
  return {
    filters,
    pool: {
      subscribeMany: (_relays: string[], filter: Filter, params: { onevent?: (e: Event) => void; oneose?: () => void }) => {
        filters.push(filter);
        if (answers) {
          queueMicrotask(() => {
            if (filter.until === undefined) for (const e of events) params.onevent?.(e);
            params.oneose?.();
          });
        }
        return { close: () => {} };
      },
    } as never,
  };
};

const fileWith = (series: Record<string, unknown>) => vi.fn(async () => ({ version: 1, series }));
const fileGas = { gas: { name: 'Dry natural gas production', unit: 'billion cubic feet', year: 2024, values: { USA: 37000 } } };

describe('readEnergyProduction: The Record first, then the file', () => {
  it("asks for Mecha Jono's energy notes", async () => {
    const { pool, filters } = relay([]);
    await readEnergyProduction({ pool, relays: ['wss://r'], fetchFile: fileWith(fileGas) });
    expect(filters[0]).toMatchObject({ kinds: [30023], authors: [...MECHA_JONO_KEYS], '#t': [ENERGY_NOTE_TOPIC] });
  });

  it("reads the file for the series Mecha Jono's notes do not hold, and says where each came from", async () => {
    const { pool } = relay([note(oilTags())]);
    const read = await readEnergyProduction({ pool, relays: ['wss://r'], fetchFile: fileWith({ ...fileGas, oil: { ...fileGas.gas, values: { USA: 1 } } }) });
    expect(read.oil).toMatchObject({ via: 'record', values: { USA: 13221.4 } });
    expect(read.gas).toMatchObject({ via: 'file', values: { USA: 37000 } });
  });

  it('never fetches the file when the notes hold every series', async () => {
    const tags = (s: string) => oilTags().map((t) => (t[0] === 'series' ? ['series', s] : t[0] === 'd' ? ['d', `eia-production-${s}`] : t));
    const { pool } = relay([note(tags('oil')), note(tags('gas')), note(tags('renewable'))]);
    const fetchFile = fileWith(fileGas);
    const read = await readEnergyProduction({ pool, relays: ['wss://r'], fetchFile });
    expect(fetchFile).not.toHaveBeenCalled();
    expect(read.renewable?.via).toBe('record');
  });

  it('reads the file when The Record does not answer within the wait', async () => {
    vi.useFakeTimers();
    try {
      const { pool } = relay([], false);
      const reading = readEnergyProduction({ pool, relays: ['wss://r'], fetchFile: fileWith(fileGas), waitMs: 6000 });
      await vi.advanceTimersByTimeAsync(6000);
      expect((await reading).gas?.via).toBe('file');
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds nothing when neither answers, rather than guessing', async () => {
    const { pool } = relay([]);
    const read = await readEnergyProduction({ pool, relays: ['wss://r'], fetchFile: vi.fn(async () => { throw new Error('offline'); }) });
    expect(read).toEqual({});
  });
});
