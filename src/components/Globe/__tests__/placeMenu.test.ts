/**
 * What a click on the globe opens (K8; decisions BA8, BA9; plan block J,
 * item 4): a report alone opens; anything to choose between opens a menu of
 * the groups at the click, a section each.
 */
import { describe, it, expect } from 'vitest';
import { whatAClickOpens, placeGroupOf, sectionOf, type ReportGroup } from '../placeMenu';
import { INTEL_CATEGORY_SYMBOLS } from '../../../symbols/symbolRegistry';
import type { IntelReportOverlayMarker } from '../../../interfaces/IntelReportOverlay';

const report = (pubkey: string, over: Partial<IntelReportOverlayMarker> = {}): IntelReportOverlayMarker => ({
  pubkey, title: `Report ${pubkey}`, content: '', tags: [], latitude: 40, longitude: -83,
  timestamp: Date.UTC(2026, 9, 3, 12), author: 'a', ...over,
});
const group = (key: string, members: IntelReportOverlayMarker[]): ReportGroup => ({ key, title: key, members });

describe('what a click opens', () => {
  it('a report alone, as before', () => {
    expect(whatAClickOpens([group('place', [report('a')])])).toEqual({ kind: 'report', reports: [report('a')], initial: 'a' });
  });

  it('a menu when a place holds more than one', () => {
    const opens = whatAClickOpens([group('place', [report('a'), report('b')])]);
    expect(opens.kind).toBe('menu');
  });

  it('a menu when the click is inside two territories with one report each: there is still a choice', () => {
    const opens = whatAClickOpens([group('territory:us-oh', [report('oh')]), group('territory:us', [report('us')])]);
    expect(opens).toEqual({ kind: 'menu', groups: [group('territory:us-oh', [report('oh')]), group('territory:us', [report('us')])] });
  });

  it('a menu for one report about where the click is, when the country under it can be opened too (BA20)', () => {
    const opens = whatAClickOpens([group('territory:union:eu', [report('eu')])], { country: true });
    expect(opens).toEqual({ kind: 'menu', groups: [group('territory:union:eu', [report('eu')])] });
    // No report there, and the country layer took the click itself.
    expect(whatAClickOpens([], { country: true })).toEqual({ kind: 'nothing' });
    expect(whatAClickOpens([group('territory:fr', [])], { country: true })).toEqual({ kind: 'nothing' });
  });

  it('nothing for a click where nothing is, and leaves empty groups out', () => {
    expect(whatAClickOpens([])).toEqual({ kind: 'nothing' });
    expect(whatAClickOpens([group('territory:fr', [])])).toEqual({ kind: 'nothing' });
    expect(whatAClickOpens([group('territory:fr', []), group('territory:de', [report('d')])]))
      .toEqual({ kind: 'report', reports: [report('d')], initial: 'd' });
  });
});

describe('a place, as the menu lists it', () => {
  it('headed by how many it holds, each report by title, what it is and when', () => {
    const here = [report('a', { tags: ['critical'] }), report('b'), report('c', { timestamp: Number.NaN })];
    const placed = placeGroupOf(here);
    expect(placed.key).toBe('place:intel|40.0000,-83.0000');
    expect(placed.title).toBe('3 reports here');
    const section = sectionOf(placed);
    expect(section.items).toEqual([
      { id: 'a', title: 'Report a', variant: 'critical', timeMs: Date.UTC(2026, 9, 3, 12), category: null, symbol: null },
      { id: 'b', title: 'Report b', variant: 'raw', timeMs: Date.UTC(2026, 9, 3, 12), category: null, symbol: null },
      { id: 'c', title: 'Report c', variant: 'raw', timeMs: null, category: null, symbol: null },
    ]);
  });

  it('each report\'s category in words, and its icon only while emblems are on (BA14, BA15)', () => {
    const group = placeGroupOf([report('w', { tags: ['category:conflict.wars', 'category:conflict'] })]);
    expect(sectionOf(group, { emblems: true }).items[0]).toMatchObject({ category: 'conflict', symbol: INTEL_CATEGORY_SYMBOLS.conflict });
    expect(sectionOf(group, { emblems: false }).items[0]).toMatchObject({ category: 'conflict', symbol: null });
  });
});
