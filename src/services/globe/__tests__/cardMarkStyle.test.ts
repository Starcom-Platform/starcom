/**
 * A card's or clip's one mark style (plan H4): every layer in it while it runs,
 * the person's own choices untouched, and a wait that ends only once the globe
 * says it has drawn the style asked for.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  cardMarkStyle, noteMarkStyleDrawn, resetCardMarkStyleForTest, setCardMarkStyle,
  subscribeCardMarkStyle, untilMarkStyleDrawn, withCardMarkStyle,
} from '../cardMarkStyle';
import { DEFAULT_MARKER_STYLES } from '../../../components/Globe/markerStyles';

afterEach(() => resetCardMarkStyleForTest());

describe('cardMarkStyle', () => {
  it("draws the person's choices as they stand when no capture asks", () => {
    const chosen = { Satellites: 'ring' as const };
    expect(withCardMarkStyle(chosen, null)).toBe(chosen);
  });

  it('draws the asked style on every layer while a capture asks, whatever the person picked', () => {
    const drawn = withCardMarkStyle({ Satellites: 'ring' }, 'disc');
    expect(Object.keys(drawn).sort()).toEqual(Object.keys(DEFAULT_MARKER_STYLES).sort());
    expect(new Set(Object.values(drawn))).toEqual(new Set(['disc']));
  });

  it('tells the globe when the asked style changes, and only then', () => {
    const told = vi.fn();
    subscribeCardMarkStyle(told);
    setCardMarkStyle('glow');
    setCardMarkStyle('glow');
    setCardMarkStyle(null);
    expect(told).toHaveBeenCalledTimes(2);
    expect(cardMarkStyle()).toBeNull();
  });

  it('waits until the globe has drawn the style asked for', async () => {
    setCardMarkStyle('ring');
    const waiting = untilMarkStyleDrawn(1_000, 5);
    noteMarkStyleDrawn('ring');
    await expect(waiting).resolves.toBeUndefined();
  });

  it('says why when the globe never draws it', async () => {
    setCardMarkStyle('ring');
    await expect(untilMarkStyleDrawn(20, 5)).rejects.toThrow(/not redrawn ring in time/);
  });
});
