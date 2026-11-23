/**
 * Hero Watch's week on a card (D-HW, HW10): the page as the record keeps it, and where the camera
 * turns: the middle of the week's relief and missions.
 */
import { describe, expect, it } from 'vitest';
import { weekCard } from '../weekCard';
import type { HeroWatchWeek } from '../../../../services/heroWatch/heroWatchWeek';

const week = (over: Partial<HeroWatchWeek> = {}): HeroWatchWeek => ({
  week: '2026-w41', title: 'Hero Watch: the week to 8 October', lines: ['Relief: 1 operation, in Ethiopia'],
  relief: 1, missions: 3, stations: 238, points: [{ lat: 10, lng: 40 }, { lat: 34, lng: -106 }], ...over,
});

describe('weekCard', () => {
  it('keeps the week\'s page as drawn, a week\'s kind, and faces the middle of its places', () => {
    const { page, centre } = weekCard(week());
    expect(page).toEqual({
      kind: 'week', week: '2026-w41', title: 'Hero Watch: the week to 8 October', lines: ['Relief: 1 operation, in Ethiopia'],
      relief: 1, missions: 3, stations: 238,
    });
    expect(centre).not.toBeNull();
    // Between Ethiopia and New Mexico, over the Atlantic.
    expect(centre!.lng).toBeGreaterThan(-106);
    expect(centre!.lng).toBeLessThan(40);
  });

  it('faces nothing in particular where nothing it counts is placed', () => {
    expect(weekCard(week({ points: [] })).centre).toBeNull();
  });
});
