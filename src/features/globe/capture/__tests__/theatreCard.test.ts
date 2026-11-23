/**
 * What a card about a War & Conflict theatre says (theatre-lens.md, TL3).
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { frameForTheatre, theatreCardFacts } from '../theatreCard';
import { frameForArea, frameShows } from '../areaFrame';
import { frameForReports, type ShareReportInfo } from '../shareReports';
import { CARD_PRESETS } from '../shareCardLayout';
import type { RegionOutline } from '../../../../services/raverWatch/usStates';

const report = (id: string, variant: string, iso: string, title = `Item ${id}`) =>
  ({ id, layer: 'WarConflict', variant, title, time: { iso, basis: 'written' }, lat: 48, lng: 37 }) as unknown as ShareReportInfo;
const WAR = { name: 'Russo-Ukrainian war', tierLabel: 'Major war' };

describe('a card about a theatre', () => {
  it('heads with its name and counts its items by what backs them, the most serious by title', () => {
    const facts = theatreCardFacts({
      slug: 'russia-ukraine', name: 'Russia–Ukraine war', war: WAR, position: { lat: 48.5, lng: 35 },
      reports: [
        report('a', 'report', '2026-10-09T08:00:00Z'),
        report('b', 'deadly', '2026-10-09T09:00:00Z', 'Missile strike on Kramatorsk'),
        report('c', 'deadly', '2026-10-09T07:00:00Z'),
      ],
    });
    expect(facts).toEqual({
      id: 'theatre:russia-ukraine',
      title: 'Russia–Ukraine war',
      position: { lat: 48.5, lng: 35 },
      lines: [
        '3 items standing in it: 2 with deaths reported, 1 report',
        'Most serious: Missile strike on Kramatorsk',
        'War: Russo-Ukrainian war (major war on Wikipedia\'s list)',
        'From War & Conflict\'s reports on The Record',
      ],
    });
  });

  it('puts a critical warning first, and says so when nothing stands or no war names it', () => {
    const one = theatreCardFacts({ slug: 'iran', name: 'Iran', war: null, position: { lat: 32, lng: 53 }, reports: [report('x', 'report', '2026-10-09T09:00:00Z'), report('y', 'critical', '2026-10-08T09:00:00Z', 'Airspace closed')] });
    expect(one.lines[0]).toBe('2 items standing in it: 1 critical warning, 1 report');
    expect(one.lines[1]).toBe('Most serious: Airspace closed');
    expect(one.lines[2]).toBe('War: none on Wikipedia\'s list names it');
    const none = theatreCardFacts({ slug: 'iran', name: 'Iran', war: null, position: { lat: 32, lng: 53 }, reports: [] });
    expect(none.lines[0]).toBe('No items standing in it now');
    expect(none.lines).toHaveLength(3);
  });
});

describe('where a card about a theatre looks (TL3)', () => {
  const view = { fovDeg: 50, frameAspect: 1400 / 900, cardAspect: CARD_PRESETS.wide.globeAspect };
  const box = (west: number, south: number, east: number, north: number): RegionOutline => ({
    name: '', geometry: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] },
  });
  const ukraine = box(22, 45, 40, 52);
  const poland = box(14, 49, 24, 55);
  // Wider than any card holds, as Russia's mainland is.
  const russia = box(28, 42, 178, 77);

  it('frames its countries together, built round the smallest', () => {
    const frame = frameForTheatre([ukraine, poland], [], view)!;
    // Both whole: Poland's far corner and Ukraine's.
    const shows = (lat: number, lng: number) => frameShows({ ...frame, outside: [] }, view, { lat, lng });
    expect([shows(55, 14), shows(49, 14), shows(45, 40), shows(52, 40)]).toEqual([true, true, true, true]);
    expect(frame.centre.lng).toBeGreaterThan(18);
    expect(frame.centre.lng).toBeLessThan(36);
    expect(frame.position).toEqual(frameForArea(poland, view)!.position);
  });

  it('leaves out a country that would take the card further out than the smallest needs', () => {
    const alone = frameForArea(ukraine, view)!;
    // Further out than Ukraine needs, though within the 1.5 times an area allows (Russia's mainland on a square card).
    const nearer = box(28, 50, 90, 70);
    const both = frameForArea({ name: '', geometry: { type: 'MultiPolygon', coordinates: [ukraine.geometry.coordinates as number[][][], nearer.geometry.coordinates as number[][][]] } }, view)!;
    expect(both.altitude).toBeGreaterThan(Math.max(1, alone.altitude));
    expect(both.altitude).toBeLessThanOrEqual(1.5 * Math.max(1, alone.altitude));
    expect(frameForTheatre([nearer, ukraine], [], view)).toEqual({ centre: alone.centre, altitude: alone.altitude, position: alone.position });
    expect(frameForArea(russia, view)!.altitude).toBeGreaterThan(1.5 * Math.max(1, alone.altitude));
    expect(frameForTheatre([russia, ukraine], [], view)).toEqual({ centre: alone.centre, altitude: alone.altitude, position: alone.position });
  });

  it('leaves out every part of a country whose largest part it leaves out', () => {
    // Russia's mainland, too far out beside Ukraine, and an Arctic island Ukraine's frame could stretch to.
    const withIsland: RegionOutline = {
      name: '', geometry: { type: 'MultiPolygon', coordinates: [russia.geometry.coordinates as number[][][], box(50, 60, 54, 63).geometry.coordinates as number[][][]] },
    };
    const alone = frameForArea(ukraine, view)!;
    expect(frameForTheatre([withIsland, ukraine], [], view)).toEqual({ centre: alone.centre, altitude: alone.altitude, position: alone.position });
  });

  it('keeps the smallest country\'s own other parts that fit', () => {
    // Ukraine with an island off its coast, and Poland beside it.
    const withIsland: RegionOutline = {
      name: '', geometry: { type: 'MultiPolygon', coordinates: [ukraine.geometry.coordinates as number[][][], box(36, 41, 38, 43).geometry.coordinates as number[][][]] },
    };
    const frame = frameForTheatre([withIsland, box(14, 49, 40, 58)], [], view)!;
    expect(frameShows({ ...frame, outside: [] }, view, { lat: 41, lng: 38 })).toBe(true);
    // Framed with the island in it, not as if Ukraine had none.
    expect(frame.centre).not.toEqual(frameForTheatre([ukraine, box(14, 49, 40, 58)], [], view)!.centre);
    expect(frame.position).toEqual(frameForArea(ukraine, view)!.position);
  });

  it('frames its items when none of its countries fits a card, and nothing when it has neither', () => {
    const items = [{ lat: 15, lng: 30 }, { lat: 13, lng: 33 }];
    const framed = frameForReports(items, view)!;
    const asItems = { centre: { lat: framed.lat, lng: framed.lng }, altitude: framed.altitude, position: { lat: framed.lat, lng: framed.lng } };
    const world = box(-179, -80, 179, 80);
    expect(frameForArea(world, view)).toBeNull();
    expect(frameForTheatre([world], items, view)).toEqual(asItems);
    expect(frameForTheatre([], items, view)).toEqual(asItems);
    expect(frameForTheatre([world], [], view)).toBeNull();
    expect(frameForTheatre([], [], view)).toBeNull();
  });
});
