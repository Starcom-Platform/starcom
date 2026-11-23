/**
 * What the globe is divided by (decision D-ZR, ZR12): Nation States, the Zones, the Spheres, or none, one at a time,
 * chosen from one rail button. The owner: "a toggle that switches between Nation States … and several other ways to
 * slice up the surface of the world". Organisations show one body at a time (the owner, 2026-10-18), chosen in
 * the picker.
 *
 * The choice is derived from the layers' own switches, never kept beside them: a layer turned on elsewhere (a
 * search opening a Zone, a card opening a Sphere) is what the picker shows. Where more than one is on, as a browser
 * that kept the old buttons' choices may have, the most specific is named, and the next pick leaves one.
 */
export type Division = 'nations' | 'zones' | 'spheres' | 'organisations' | 'none';

/** In the picker's order. */
export const DIVISIONS: readonly Division[] = ['nations', 'zones', 'spheres', 'organisations', 'none'];

export interface DivisionSwitches {
  nations: boolean;
  zones: boolean;
  spheres: boolean;
  organisations: boolean;
}

/** The division the switches show: the Zones, then the Spheres, then an Organisation, then the Nation States. */
export function divisionOf(s: DivisionSwitches): Division {
  if (s.zones) return 'zones';
  if (s.spheres) return 'spheres';
  if (s.organisations) return 'organisations';
  if (s.nations) return 'nations';
  return 'none';
}

/** The switches one division leaves: that layer on and the others off. */
export function switchesFor(division: Division): DivisionSwitches {
  return {
    nations: division === 'nations', zones: division === 'zones', spheres: division === 'spheres', organisations: division === 'organisations',
  };
}
