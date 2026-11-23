/**
 * The big-three lenses and their filter (D-CT, CT5).
 */
import { describe, it, expect } from 'vitest';
import { LENSES, LENS_HELP, lensesOf, passesLensChoice, readLensChoice, toggleLens } from '../bigThreeLenses';

describe('bigThreeLenses', () => {
  it('names the three as the contract does, in the order the filter offers them', () => {
    expect(LENSES.map((l) => [l.tag, l.short, l.name])).toEqual([
      ['lens:tcs', 'TCS', 'Transnational Crime Syndicates'],
      ['lens:idc', 'IDC', 'International Death Cults'],
      ['lens:cbc', 'CBC', 'Cabals of Banking Cartels'],
    ]);
    expect(LENS_HELP).toBe('A lens sorts; it never asserts that a syndicate, cult or cabal exists.');
  });

  it('reads the lenses a report carries, more than one where it has them', () => {
    expect(lensesOf(['nostr', 'lens:cbc', 'starcom_intel', 'lens:tcs'])).toEqual(['tcs', 'cbc']);
    expect(lensesOf([' LENS:IDC '])).toEqual(['idc']);
    expect(lensesOf(['lens', 'lens:xyz', 'tcs'])).toEqual([]);
    expect(lensesOf(undefined)).toEqual([]);
  });

  it('shows every report under All, and only a chosen lens otherwise', () => {
    const tcs = ['lens:tcs'];
    const both = ['lens:idc', 'lens:cbc'];
    const none = ['world_note'];
    expect([tcs, both, none, undefined].map((t) => passesLensChoice(t, []))).toEqual([true, true, true, true]);
    expect([tcs, both, none].map((t) => passesLensChoice(t, undefined))).toEqual([true, true, true]);
    expect([tcs, both, none].map((t) => passesLensChoice(t, ['tcs']))).toEqual([true, false, false]);
    expect([tcs, both, none].map((t) => passesLensChoice(t, ['cbc', 'tcs']))).toEqual([true, true, false]);
  });

  it('reads a stored choice as known lenses only, and anything else as All', () => {
    expect(readLensChoice(['cbc', 'tcs', 'cbc', 'evil', 3])).toEqual(['tcs', 'cbc']);
    expect(readLensChoice('tcs')).toEqual([]);
    expect(readLensChoice(undefined)).toEqual([]);
  });

  it('turns one lens on or off', () => {
    expect(toggleLens([], 'idc')).toEqual(['idc']);
    expect(toggleLens(['idc'], 'tcs')).toEqual(['tcs', 'idc']);
    expect(toggleLens(['tcs', 'idc'], 'tcs')).toEqual(['idc']);
  });
});
