/**
 * The declassified desk's day on a card (plan H9; Mecha Jono's spec of 25 Oct): its count, up to three releases
 * each with its source, and each named release's licence on the Data line.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { declassifiedCard } from '../declassifiedCard';
import type { DeclassRecord } from '../../../../services/declassified/declassDesk';

const at = Date.UTC(2026, 9, 23, 9);
const record = (d: string, title: string, sourceName: string, over: Partial<DeclassRecord> = {}): DeclassRecord => ({
  d, title, source: 'x', sourceName, branch: 'technical', publishedAt: at, licence: 'public domain (US government work)',
  links: [`https://example.org/${d}`], createdAt: 1, ...over,
});

describe('declassifiedCard', () => {
  it('heads the day with its count, and names three releases with their sources', () => {
    const { page } = declassifiedCard({ day: '2026-10-23', records: [
      record('a', 'NASA added a 1994 report: Maneuver Design for Galileo Asteroid Flybys', "NASA's Technical Reports Server"),
      record('b', 'DOE made 7 historical laboratory reports public on 23 October 2026 (1966–1988)', "DOE's Office of Scientific and Technical Information (OSTI)"),
      record('c', 'A third release', "NASA's Technical Reports Server"),
      record('d', 'A fourth release', 'Another archive', { licence: 'CC BY 4.0' }),
    ] });
    expect(page).toMatchObject({ kind: 'declassified', day: '2026-10-23', count: 4, title: 'Declassified on 23 Oct 2026: 4 releases' });
    expect(page.lines).toEqual([
      "NASA added a 1994 report: Maneuver Design for Galileo Asteroid Flybys · NASA's Technical Reports Server",
      "DOE made 7 historical laboratory reports public on 23 October 2026 (1966–1988) · DOE's Office of Scientific and Technical Information (OSTI)",
      "A third release · NASA's Technical Reports Server",
      'And 1 more release that day.',
    ]);
    expect(page.records.map((r) => r.d)).toEqual(['a', 'b', 'c']);
    expect(page.records[0]).toMatchObject({ link: 'https://example.org/a', publishedAt: new Date(at).toISOString() });
  });

  it('puts each named release\'s licence on the Data line, once a source', () => {
    const { page } = declassifiedCard({ day: '2026-10-23', records: [
      record('a', 'One', 'Archive A'), record('b', 'Two', 'Archive A'), record('c', 'Three', 'Archive B', { licence: 'CC BY 4.0' }),
      record('d', 'Not named', 'Archive C', { licence: 'CC0' }),
    ] });
    expect(page.credits).toEqual(['Archive A: public domain (US government work)', 'Archive B: CC BY 4.0']);
  });

  it('shortens a long title at a word, keeping the whole of it in the record', () => {
    const long = `NASA added a 1994 report: ${'Economics of Automation in Space and the High Cost of Assembly '.repeat(3)}`.trim();
    const { page } = declassifiedCard({ day: '2026-10-23', records: [record('a', long, 'Archive A')] });
    expect(page.title).toBe('Declassified on 23 Oct 2026: 1 release');
    expect(page.lines[0].length).toBeLessThanOrEqual(110 + ' · Archive A'.length);
    expect(page.lines[0]).toMatch(/… · Archive A$/);
    expect(page.records[0].title).toBe(long);
  });
});
