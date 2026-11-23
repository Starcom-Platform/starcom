/**
 * Why an address is not drawn, asked of each layer in turn: the first that holds it answers, and
 * "drawn" (null) is an answer, never passed over.
 */
import { describe, expect, it } from 'vitest';
import { whyNotDrawnOf } from '../whyNotDrawn';

describe('whyNotDrawnOf', () => {
  const raver = (id: string) => (id === 'drawn' ? null : id === 'raver' ? 'off' : undefined);
  const hero = (id: string) => (id.startsWith('30079:') ? 'no place' : undefined);

  it('takes the first layer that holds the address, a drawn item\'s null among them', () => {
    const ask = whyNotDrawnOf(raver, hero);
    expect(ask('drawn')).toBeNull();
    expect(ask('raver')).toBe('off');
    expect(ask('30079:pk:d')).toBe('no place');
    expect(ask('nobody')).toBeUndefined();
  });

  it('never lets a later layer answer for an item an earlier one draws', () => {
    expect(whyNotDrawnOf(raver, () => 'claimed')('drawn')).toBeNull();
  });
});
