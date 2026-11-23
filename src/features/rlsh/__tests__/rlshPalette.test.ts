/** The palette's RLSH commands (D-RF): found by their words, each opening the panel on its tab. */
import { describe, it, expect, beforeEach } from 'vitest';
import { rlshResults } from '../rlshPalette';
import { resetRlshPanelForTests, rlshPanel } from '../rlshPanel';

beforeEach(() => resetRlshPanelForTests());

describe('rlshResults', () => {
  it('offers nothing to an empty box, and the card to "sign up"', () => {
    expect(rlshResults('')).toEqual([]);
    const found = rlshResults('sign up');
    expect(found.map((r) => r.id)).toEqual(['rlsh:card']);
    found[0].run();
    expect(rlshPanel()).toEqual({ open: true, tab: 'mine' });
  });

  it('opens the list of heroes\' cards', () => {
    const found = rlshResults('heroes');
    expect(found.map((r) => r.id)).toContain('rlsh:list');
    found.find((r) => r.id === 'rlsh:list')!.run();
    expect(rlshPanel()).toEqual({ open: true, tab: 'list' });
  });
});
