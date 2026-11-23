/**
 * The years Mecha Jono holds back for their sealed tests (their notes of 27 Oct): kept out of Echoes and the alignment
 * chart, and out of the usual those compare with, until each is released.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { openRecord, touchesWithheld, WITHHELD } from '../withheld';
import { echoReturns, usualCount } from '../echoes';
import { alignCounts } from '../alignment';
import { readEventSet, type EventSetFile } from '../eventSets';

const DAY = 86_400_000;
const served = (id: string) => readEventSet(JSON.parse(readFileSync(`public/data/psi-events-${id}.json`, 'utf8')) as EventSetFile)!;

describe('the held-back years', () => {
  it('are the three spans Mecha Jono named', () => {
    expect(WITHHELD.conflict.map((w) => w.years)).toEqual(['2015–2025']);
    expect(WITHHELD.storms.map((w) => w.years)).toEqual(['1966–2025']);
    expect(WITHHELD.quakes.map((w) => w.years)).toEqual(['2000–2024']);
    expect(touchesWithheld('quakes', Date.UTC(1999, 11, 31), Date.UTC(2000, 0, 2))).toBe(true);
    expect(touchesWithheld('quakes', Date.UTC(2025, 0, 1), Date.UTC(2025, 1, 1))).toBe(false);
  });

  it('keep a return in them out of Echoes and the alignment, and their events out of the usual', () => {
    const conflict = served('conflict');
    const open = Date.UTC(2010, 5, 1);
    const held = Date.UTC(2018, 5, 1);
    expect(echoReturns({ returns: [open, held], beforeMs: DAY, afterMs: DAY }, conflict).map((r) => r.ms)).toEqual([open]);
    expect(alignCounts({ returns: [open, held] }, conflict).returns).toBe(1);
    const record = openRecord(conflict);
    const before2015 = conflict.ms.filter((ms) => ms < Date.UTC(2015, 0, 1)).length;
    expect(record.events).toBe(before2015);
    expect(record.days).toBeCloseTo((Date.UTC(2015, 0, 1) - Date.UTC(1989, 0, 1)) / DAY, 6);
    expect(usualCount(conflict, DAY)).toBeCloseTo(before2015 / record.days, 9);
  });

  it('leave the storms only 1932–1965 to echo', () => {
    const storms = served('storms');
    const held = Date.UTC(1980, 3, 1);
    const open = Date.UTC(1950, 3, 1);
    expect(echoReturns({ returns: [open, held], beforeMs: DAY, afterMs: DAY }, storms).map((r) => r.ms)).toEqual([open]);
  });
});
