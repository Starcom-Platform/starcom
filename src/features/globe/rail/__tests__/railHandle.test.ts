/**
 * The share handle's side of the rail (contract v68): the layers with choices it can set, and their keys; an agent's
 * choices checked, a wrong key, a wrong value and a setting the person keeps each refused in words; the choices in
 * force, and whether the page's handle set them.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { choosableLayerChoices, layerChoicesInForce, readLayerChoices } from '../railHandle';
import { resetLayerChoicesForTests, setPageLayerChoices } from '../layerChoices';

describe('railHandle', () => {
  beforeEach(() => { localStorage.clear(); resetLayerChoicesForTests(); });

  it("publishes each layer's choices, and none a layer keeps in its own settings", () => {
    expect(choosableLayerChoices()).toEqual({
      WarConflict: ['war:items', 'war:arcs', 'war:deaths', 'war:map'],
      // v69: Civil Unrest and Protest surges, one layer with two looks (OR5).
      CivilUnrest: ['unrest:events', 'unrest:surges', 'unrest:tint'],
      // v70: Eco Disasters' marks and quakes' depth (O7, OR29); v75 the quakes' colour, magnitude or depth (D-EQ, EQ5);
      // v76 the plates and volcanoes beside them (EQ8), and which magnitudes and depths are drawn (EQ6).
      EcologicalDisasters: ['eco:mark', 'eco:depth', 'eco:colour', 'eco:plates', 'eco:volcanoes', 'eco:magnitudes', 'eco:depths'],
      ConflictZones: ['conflict:view', 'conflict:mark'],
      // v82: Planet lines' bands and parans (D-PW, PW59, PW81–PW84).
      PsiLines: ['psi:bands', 'psi:parans'],
    });
  });

  it('takes good choices and refuses the rest, in words', () => {
    expect(readLayerChoices('WarConflict', { 'war:arcs': false })).toEqual({ choices: { 'war:arcs': false } });
    expect(readLayerChoices('WarConflict', { 'war:arcs': 'no' })).toEqual({ refused: "WarConflict's \"war:arcs\" is on or off: true or false." });
    expect(readLayerChoices('WarConflict', { 'war:wings': true })).toEqual({ refused: 'WarConflict has no choice "war:wings": it has war:items, war:arcs, war:deaths, war:map.' });
    expect(readLayerChoices('DiplomaticEvents', { 'diplomacy:placeBy': 'event' })).toMatchObject({ refused: expect.stringContaining('has no choices to set') });
    expect(readLayerChoices('WarConflict', ['war:arcs'])).toMatchObject({ refused: expect.stringContaining('as an object') });
    expect(readLayerChoices('EcologicalDisasters', { 'eco:colour': 'depth' })).toEqual({ choices: { 'eco:colour': 'depth' } });
    expect(readLayerChoices('EcologicalDisasters', { 'eco:colour': 'age' })).toMatchObject({ refused: expect.stringContaining('magnitude') });
    expect(readLayerChoices('EcologicalDisasters', { 'eco:magnitudes': ['5', '6', '7'], 'eco:plates': false })).toEqual({ choices: { 'eco:magnitudes': ['5', '6', '7'], 'eco:plates': false } });
    expect(readLayerChoices('EcologicalDisasters', { 'eco:depths': ['2000'] })).toMatchObject({ refused: expect.stringContaining('500') });
  });

  it("says the choices in force, and who set them", () => {
    expect(layerChoicesInForce('WarConflict')).toEqual({ layer: 'WarConflict', choices: { 'war:items': true, 'war:arcs': true, 'war:deaths': true, 'war:map': true }, from: 'person' });
    setPageLayerChoices('WarConflict', { 'war:map': false });
    expect(layerChoicesInForce('WarConflict')).toMatchObject({ choices: { 'war:map': false }, from: 'handle' });
  });
});
