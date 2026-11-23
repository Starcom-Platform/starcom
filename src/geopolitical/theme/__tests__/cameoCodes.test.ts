/**
 * CAMEO's names for the cooperative codes, for the Diplomacy drawer (D-DP, DP8). The codes are every
 * cooperative code in the 2026-10-13 snapshot, 55 of them, so none is drawn without its name. And the
 * conflict codes, for Conflict Zones' notes (critique C5).
 */
import { describe, expect, it } from 'vitest';
import { cameoNameOf } from '../cameoCodes';

const IN_THE_SNAPSHOT = ['030', '031', '0311', '032', '033', '0331', '0332', '0333', '0334', '035', '0353', '0355', '0356', '036',
  '037', '038', '039', '040', '041', '042', '043', '044', '045', '046', '050', '051', '052', '053', '054', '055', '057', '060',
  '061', '062', '063', '064', '070', '071', '072', '073', '075', '080', '081', '082', '083', '0831', '0833', '084', '0841',
  '0842', '085', '0862', '087', '0871', '0874'];

describe('CAMEO\'s names', () => {
  it('name every cooperative code a day of GDELT carried', () => {
    expect(IN_THE_SNAPSHOT.filter((code) => !cameoNameOf(code))).toEqual([]);
  });

  it('are the codebook\'s own words', () => {
    expect(cameoNameOf('057')?.name).toBe('Sign formal agreement');
    expect(cameoNameOf('042')?.name).toBe('Make a visit');
    expect(cameoNameOf('073')?.name).toBe('Provide humanitarian aid');
  });

  it('give a four-digit code its parent', () => {
    expect(cameoNameOf('0871')).toEqual({ name: 'Declare truce, ceasefire', parent: { code: '087', name: 'De-escalate military engagement' } });
    expect(cameoNameOf('042')?.parent).toBeNull();
  });

  /*
   * Conflict's codes (roots 14–20) for the Conflict Zones notes (critique C5): every one in the 2026-10-16
   * snapshot, 41 of them, in GDELT's own lookup's words.
   */
  it("name every conflict code a day of GDELT carried, in GDELT's words", () => {
    const conflictInTheSnapshot = ['140', '141', '143', '145', '150', '151', '152', '153', '154', '160', '161', '162', '163',
      '164', '166', '170', '171', '1711', '1712', '172', '1721', '173', '174', '175', '180', '181', '182', '1821', '1822', '183',
      '1832', '186', '190', '191', '192', '193', '194', '195', '196', '202', '203'];
    expect(conflictInTheSnapshot.filter((code) => !cameoNameOf(code))).toEqual([]);
    expect(cameoNameOf('193')?.name).toBe('Fight with small arms and light weapons');
    expect(cameoNameOf('1712')).toEqual({ name: 'Destroy property', parent: { code: '171', name: 'Seize or damage property, not specified below' } });
    // Only spacing changed from GDELT's text.
    expect(cameoNameOf('1454')?.name).toBe('Engage in violent protest for change in institutions, regime');
    expect(cameoNameOf('2041')?.name).toBe('Use chemical, biological, or radiological weapons');
  });

  it('name no code outside the lists, nor a root alone', () => {
    expect(cameoNameOf('099')).toBeNull();
    expect(cameoNameOf('19')).toBeNull();
    expect(cameoNameOf('1951')).toBeNull();
    expect(cameoNameOf('constructor')).toBeNull();
  });
});
