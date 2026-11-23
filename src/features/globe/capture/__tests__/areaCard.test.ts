/**
 * What a card about an area says (BA23): the area's name as its headline; how
 * many Intel Reports are in it, by assessment; the most severe by title; its
 * caveats, where it was taken from and when; and what is outside the frame.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { areaCardFacts } from '../areaCard';
import { areaByCode } from '../../areas/areaRegistry';
import type { ShareReportInfo } from '../shareReports';

const report = (id: string, variant: string, iso: string | null, over: Partial<ShareReportInfo> = {}): ShareReportInfo => ({
  id, layer: 'IntelReports', title: `Report ${id}`, variant, variantMeans: variant, author: 'npub1abcdef…wxyz',
  time: iso ? { iso, basis: 'written' } : null, precisionM: null, lat: 48.9, lng: 2.4, sharesPlaceWith: 0, ...over,
} as ShareReportInfo);
const EU = areaByCode('union:eu')!;
const at = { lat: 47.2, lng: 11.2 };

describe('a card about an area (BA23)', () => {
  it('its name as the headline, at the place it is listed as standing', () => {
    const card = areaCardFacts({ area: EU, reports: [], outside: null, position: at });
    expect(card.id).toBe('area:union:eu');
    expect(card.title).toBe('European Union');
    expect(card.position).toEqual(at);
  });

  it('how many Intel Reports are in it, by assessment, the most severe first', () => {
    const reports = [
      report('a', 'raw', '2026-10-04T10:00:00Z'), report('b', 'critical', '2026-10-03T10:00:00Z'),
      report('c', 'raw', null), report('d', 'actionable', '2026-10-04T09:00:00Z'), report('e', 'standard', '2026-10-01T00:00:00Z'),
    ];
    const card = areaCardFacts({ area: EU, reports, outside: null, position: at });
    expect(card.lines[0]).toBe('5 Intel Reports in it: 1 critical, 1 actionable, 1 assessed, 2 not assessed');
    expect(card.lines[1]).toBe('Most severe: Report b');
  });

  it('of two equally severe, the newer', () => {
    const card = areaCardFacts({ area: EU, reports: [report('old', 'critical', '2026-10-01T00:00:00Z'), report('new', 'critical', '2026-10-04T00:00:00Z')], outside: null, position: at });
    expect(card.lines[1]).toBe('Most severe: Report new');
  });

  it('one in it, and none, said so', () => {
    expect(areaCardFacts({ area: EU, reports: [report('a', 'raw', null)], outside: null, position: at }).lines[0])
      .toBe('1 Intel Report in it: 1 not assessed');
    const none = areaCardFacts({ area: EU, reports: [], outside: null, position: at });
    expect(none.lines[0]).toBe('No Intel Reports in it now');
    expect(none.lines.some((line) => line.startsWith('Most severe'))).toBe(false);
  });

  it('only Intel Reports count, whatever else stands in the area', () => {
    const war = report('w', 'critical', '2026-10-04T00:00:00Z', { layer: 'WarConflict' } as Partial<ShareReportInfo>);
    expect(areaCardFacts({ area: EU, reports: [war, report('a', 'raw', null)], outside: null, position: at }).lines[0])
      .toBe('1 Intel Report in it: 1 not assessed');
  });

  it('its caveats: its note, where it was taken from and the day it was read, and what is outside', () => {
    const card = areaCardFacts({ area: EU, reports: [], outside: 'Outside the frame: part of France.', position: at });
    expect(card.lines).toContain('27 members are drawn; the 10 candidates are listed, not drawn. Northern Cyprus is left out: EU law is suspended there.');
    expect(card.lines).toContain('From European Union: EU countries (both pages of the list), read 23 Oct 2026');
    expect(card.lines[card.lines.length - 1]).toBe('Outside the frame: part of France.');
  });

  it('a long title cut at a word, never mid-word', () => {
    const long = report('l', 'critical', null, { title: 'A very long title that goes on and on about a regulation adopted across the whole of the Union today' } as Partial<ShareReportInfo>);
    const line = areaCardFacts({ area: EU, reports: [long], outside: null, position: at }).lines[1];
    expect(line.length).toBeLessThanOrEqual(74);
    expect(line).toMatch(/^Most severe: A very long title .*\w…$/);
  });
});
