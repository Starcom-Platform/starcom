import { describe, expect, it } from 'vitest';
import { tonightCard } from '../tonightCard';
import type { Tonight } from '../../../../services/raverWatch/raverWatchView';

// 10 Oct 2026 02:40Z.
const FROM_S = Date.UTC(2026, 9, 10, 2, 40) / 1000;
const tonight = (over: Partial<Tonight> = {}): Tonight => ({
  fromS: FROM_S,
  untilS: FROM_S + 12 * 3600,
  count: 3,
  underHeat: 1,
  underWay: 4,
  regions: [
    { name: 'US Central', count: 2, underHeat: 1, first: { atS: FROM_S + 1200, local: '21:00 CDT' } },
    { name: 'US Pacific', count: 1, underHeat: 0, first: { atS: FROM_S + 3 * 3600, local: '22:40 PDT' } },
  ],
  points: [{ lat: 30, lon: -97 }, { lat: 30, lon: -97 }, { lat: 34, lon: -118 }],
  ...over,
});

describe('tonightCard', () => {
  it('heads tonight\'s page with when it starts, in UTC, and states it in tonight\'s lines', () => {
    const { page } = tonightCard(tonight());
    expect(page).toEqual({
      kind: 'tonight',
      fromS: FROM_S,
      untilS: FROM_S + 12 * 3600,
      title: 'Raver Watch · tonight from 10 Oct 2026 02:40Z',
      lines: [
        '3 scene events start in the twelve hours from 02:40Z, 1 in a hot town',
        'US Central · 2 events · 1 under heat · first 21:00 CDT',
        'US Pacific · 1 event · first 22:40 PDT',
      ],
      count: 3,
      underHeat: 1,
      underWay: 4,
      regions: tonight().regions,
    });
    // Where the events are is for the camera, not the record.
    expect(page).not.toHaveProperty('points');
  });

  it('centres among tonight\'s events, nearer where more of them are', () => {
    const { centre } = tonightCard(tonight());
    expect(centre!.lat).toBeGreaterThan(30);
    expect(centre!.lat).toBeLessThan(34);
    // Two of the three are in Austin, so the middle is nearer it than Los Angeles.
    expect(Math.abs(centre!.lng - -97)).toBeLessThan(Math.abs(centre!.lng - -118));
  });

  it('refuses a night with no events, saying from when', () => {
    expect(() => tonightCard(tonight({ count: 0, underHeat: 0, underWay: 0, regions: [], points: [] })))
      .toThrow('No scene events start in the twelve hours from 10 Oct 2026 02:40Z.');
  });
});
