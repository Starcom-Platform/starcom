/**
 * What a board's pinned reports rest on (plan item 4.3, the owner's choice of
 * 2026-09-30): the real part of IntelFusion, moved into the report builder.
 * Counts, grades, places, times and gaps, read from the reports themselves.
 * Not moved: the canned sentences, the analysis that found nothing, and a
 * confidence on the wrong scale that marked every report CRITICAL.
 */
import { describe, it, expect } from 'vitest';
import { digestPinnedReports, digestSection, reportIdsOf } from '../pinnedReportsDigest';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';
import type { PinnedItem } from '../../state/BoardsTypes';

const at = (iso: string) => new Date(iso);
const report = (over: Partial<IntelReportUI> & { id: string }): IntelReportUI => ({
  title: `Report ${over.id}`,
  content: 'c',
  author: 'npub-a',
  category: 'GENERAL',
  tags: [],
  createdAt: at('2026-09-10T00:00:00Z'),
  updatedAt: at('2026-09-10T00:00:00Z'),
  status: 'SUBMITTED',
  visibility: 'limited',
  ...over,
} as IntelReportUI);

const pins = (...ids: string[]): PinnedItem[] => ids.map((id) => ({ id, type: 'report' }));

describe('reportIdsOf', () => {
  it('reads report pins and pinned report events, once each, and nothing else', () => {
    expect(reportIdsOf([
      { id: 'r1', type: 'report' },
      { id: 'evt-report-r2', type: 'event' },
      { id: 'evt-report-r1', type: 'event' },
      { id: 'evt-item-i1', type: 'event' },
      { id: 'i1', type: 'intelItem' },
      { id: 'Acme', type: 'entity' },
    ])).toEqual(['r1', 'r2']);
  });
});

describe('digestPinnedReports', () => {
  const found = [
    report({ id: 'r1', author: 'npub-a', reliability: 'B', latitude: 52.5, longitude: 13.4, jurisdictions: ['de'], sourceIntelIds: ['i1'], startDate: at('2026-09-01T00:00:00Z') }),
    report({ id: 'r2', author: 'npub-b', reliability: 'C', latitude: 48.8, longitude: 2.3, jurisdictions: ['fr', 'de'], startDate: at('2026-09-20T00:00:00Z') }),
    report({ id: 'r3', author: 'npub-a', status: 'DRAFT', sample: true }),
  ];
  const d = digestPinnedReports(pins('r1', 'r2', 'r3', 'r-gone'), found);

  it('counts what was pinned, and what of it is here', () => {
    expect(d.pinned).toBe(4);
    expect(d.found).toBe(3);
  });

  it('counts authors, never names them', () => {
    expect(d.authors).toBe(2);
    expect(JSON.stringify(d)).not.toContain('npub-');
  });

  it('counts each reliability grade, and the reports with none', () => {
    expect(d.grades).toEqual([['B', 1], ['C', 1], ['ungraded', 1]]);
  });

  it('counts the reports that give a place, and names each country once', () => {
    expect(d.placed).toBe(2);
    expect(d.countries).toEqual(['DE', 'FR']);
  });

  it('spans the reports in time by when their events happened', () => {
    expect(d.span).toEqual({ from: Date.parse('2026-09-01T00:00:00Z'), to: Date.parse('2026-09-20T00:00:00Z'), byEvent: 2, byWriting: 1 });
  });

  it('names no country from a Private report, though it still counts it', () => {
    const p = digestPinnedReports(pins('r1', 'p1'), [found[0], report({ id: 'p1', visibility: 'private', jurisdictions: ['ru'], latitude: 55.7, longitude: 37.6 })]);
    expect(p.countries).toEqual(['DE']);
    expect(p.placed).toBe(2);
  });

  it('says what is missing', () => {
    expect(d.gaps).toEqual([
      '1 pinned report is not in this workspace, so nothing about it is counted.',
      '1 report gives no place.',
      '1 report has no reliability grade.',
      '2 reports link no source.',
      '1 report is a draft: its author has not stood behind it yet.',
      '1 report is a sample, not evidence.',
    ]);
  });

  it('says when every report has one author, so none corroborates another', () => {
    const one = digestPinnedReports(pins('r1', 'r3'), [found[0], found[2]]);
    expect(one.gaps).toContain('Both reports have the same author, so neither corroborates the other.');
    const three = digestPinnedReports(pins('a', 'b', 'c'), ['a', 'b', 'c'].map((id) => report({ id, reliability: 'B', latitude: 1, longitude: 1, sourceIntelIds: ['x'] })));
    expect(three.gaps).toEqual(['All 3 reports have the same author, so none corroborates another.']);
    // One report corroborates nothing, and saying so would be noise.
    const lone = digestPinnedReports(pins('a'), [report({ id: 'a', reliability: 'B', latitude: 1, longitude: 1, sourceIntelIds: ['x'] })]);
    expect(lone.gaps).toEqual([]);
  });

  it('ends a span where a report says its event ended', () => {
    const d2 = digestPinnedReports(pins('a', 'b'), [
      report({ id: 'a', startDate: at('2026-09-01T00:00:00Z'), endDate: at('2026-09-25T00:00:00Z') }),
      report({ id: 'b', startDate: at('2026-09-10T00:00:00Z') }),
    ]);
    expect(d2.span?.to).toBe(Date.parse('2026-09-25T00:00:00Z'));
  });
});

describe('digestSection', () => {
  const d = digestPinnedReports(pins('r1', 'r2'), [
    report({ id: 'r1', author: 'npub-a', reliability: 'B', latitude: 52.5, longitude: 13.4, jurisdictions: ['de'], sourceIntelIds: ['i1'], startDate: at('2026-09-01T00:00:00Z') }),
    report({ id: 'r2', author: 'npub-b', reliability: 'B', latitude: 48.8, longitude: 2.3, jurisdictions: ['fr'], sourceIntelIds: ['i2'], startDate: at('2026-09-20T00:00:00Z') }),
  ]);
  const text = digestSection(d);

  it('writes the section a draft carries', () => {
    expect(text).toBe([
      '## What the pinned reports rest on',
      '',
      '- 2 reports pinned, all found here.',
      '- 2 authors.',
      '- Reliability: 2 graded B.',
      '- 2 give a place. Countries named: France, Germany.',
      '- Events from 1 Sep 2026 to 20 Sep 2026 (UTC).',
    ].join('\n'));
  });

  it('lists what is missing under its own heading, and only when something is', () => {
    const gappy = digestSection(digestPinnedReports(pins('r1', 'x'), [report({ id: 'r1' })]));
    expect(gappy).toContain('### What is missing');
    expect(gappy).toContain('- 1 pinned report is not in this workspace, so nothing about it is counted.');
    expect(text).not.toContain('What is missing');
  });

  it('says which reports are placed by writing, when some state no event time', () => {
    const mixed = digestSection(digestPinnedReports(pins('r1', 'r3'), [
      report({ id: 'r1', latitude: 52.5, longitude: 13.4, startDate: at('2026-09-01T00:00:00Z') }),
      report({ id: 'r3' }),
    ]));
    expect(mixed).toContain('- 1 of 2 gives a place.');
    expect(mixed).toContain('- Events and writing from 1 Sep 2026 to 10 Sep 2026 (UTC). 1 report states no event time, so it is placed by writing.');
    const written = digestSection(digestPinnedReports(pins('r3'), [report({ id: 'r3' })]));
    expect(written).toContain('- Written on 10 Sep 2026 (UTC).');
    expect(written).toContain('- None gives a place.');
  });

  it('is empty when nothing pinned is a report', () => {
    expect(digestSection(digestPinnedReports([], []))).toBe('');
  });

  it('claims no confidence and no priority: the author decides those', () => {
    expect(text).not.toMatch(/confiden|CRITICAL|priority/i);
  });

  it('keeps to the house style: no "(s)", no sentence over 20 words', () => {
    const all = digestSection(digestPinnedReports(pins('r1', 'r2', 'r3', 'x'), [
      report({ id: 'r1' }), report({ id: 'r2', status: 'DRAFT' }), report({ id: 'r3', sample: true }),
    ]));
    expect(all).not.toContain('(s)');
    for (const line of all.split('\n')) {
      for (const sentence of line.split(/(?<=[.!?])\s+/)) expect(sentence.split(/\s+/).filter(Boolean).length, sentence).toBeLessThanOrEqual(20);
    }
  });
});
