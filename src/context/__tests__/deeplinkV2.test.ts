/**
 * Deeplink v2 (decision IM1; globe record, section 21): v1, and the globe's
 * look, so a card's link opens the picture as it was drawn, lit the same way.
 *
 *   look=<skin>,<light>,<nightFill>
 *
 * Each part stands or falls alone, and an empty part is unstated. A link says
 * `v=2` only when it states a look, so every link that said v1 still reads,
 * and is still written, as v1; their 21 vectors are run in deeplinkV1.test.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { parseDeeplink, deeplinkSearch } from '../deeplinkV1';

describe('deeplink v2, read', () => {
  it('reads a look: skin, light and night fill', () => {
    const link = parseDeeplink('?v=2&sub=WarConflict&look=blueMarble,headlamp,0.3');
    expect(link).toMatchObject({ v: 2, sub: 'WarConflict', look: { skin: 'blueMarble', light: 'headlamp', nightFill: 0.3 } });
  });

  it('reads the parts it can, and leaves the rest unstated', () => {
    expect(parseDeeplink('?look=,headlamp').look).toEqual({ light: 'headlamp' });
    expect(parseDeeplink('?look=terrain,disco,0.5').look).toEqual({ skin: 'terrain', nightFill: 0.5 });
    expect(parseDeeplink('?look=auto,,2').look).toEqual({ skin: 'auto' });
  });

  it('has no look when none of it can be read, or none was given', () => {
    expect(parseDeeplink('?look=neon,disco,5')).not.toHaveProperty('look');
    expect(parseDeeplink('?v=1&sub=WarConflict')).not.toHaveProperty('look');
  });

  it('reads v=2 as version 2, and any other version as unstated', () => {
    expect(parseDeeplink('?v=2&sub=WarConflict').v).toBe(2);
    expect(parseDeeplink('?v=3&sub=WarConflict').v).toBeNull();
  });
});

describe('deeplink v2, written', () => {
  const base = { v: 1 as const, sub: 'WarConflict' as const, mode: 'GeoPolitical' as const, at: null, pins: [], focus: null, win: null };

  it('says v=2 and its look when it has one', () => {
    expect(deeplinkSearch({ ...base, look: { skin: 'blueMarble', light: 'headlamp', nightFill: 0.3 } }))
      .toBe('?v=2&sub=WarConflict&look=blueMarble,headlamp,0.3');
  });

  it('writes the smallest look: unstated parts empty, trailing ones dropped', () => {
    expect(deeplinkSearch({ ...base, look: { light: 'flat' } })).toBe('?v=2&sub=WarConflict&look=,flat');
  });

  it('stays v1 with no look', () => {
    expect(deeplinkSearch(base)).toBe('?v=1&sub=WarConflict');
  });

  it('reads back as the link it was written from', () => {
    const link = { ...base, v: 2 as const, look: { skin: 'dayNight' as const, light: 'sun' as const, nightFill: 0.15 } };
    expect(parseDeeplink(deeplinkSearch(link))).toEqual(link);
  });
});
