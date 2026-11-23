import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// One implementation, in the acquisition scripts — the app consumes assets the
// fetchers have already filtered, so there is no second copy to drift.
import { namesAPersonRatherThanAPlace, partitionByPublishability } from '../../../../../scripts/lib/personalAddress.mjs';

describe('an address line that names a person is not a place', () => {
  /**
   * Found by auditing what published subjects actually said. Claims carried
   * "C/O RAYMOND FRIVÅG, 0194" — a private individual's name and a postcode —
   * as the subject of a same-day incorporation batch, declared
   * subjectKind: 'place'. That declaration is false, and the publication
   * policy gates on subjectKind, so the one control that could have caught it
   * never saw a person to protect.
   */
  it('withholds a care-of line naming an individual', () => {
    for (const line of [
      'C/O RAYMOND FRIVÅG', 'C/O ODDVIN HÅLAND', 'C/O LINUS GUNTERBERG',
      'C/O THERESE MARIE VATNE HEGLAND', 'C/O TORE S. SØRENSEN', 'CO HEGELSTAD',
    ]) {
      expect(namesAPersonRatherThanAPlace(line)).toBe(true);
    }
  });

  it('publishes a real street address, however it is written', () => {
    for (const line of [
      '71-75 SHELTON STREET', 'DRAMMENSVEIEN 288', 'HAAKON VIIS GATE 1',
      'SMEDASUNDET 40', 'KEMP HOUSE', '124-128 CITY ROAD',
    ]) {
      expect(namesAPersonRatherThanAPlace(line)).toBe(false);
    }
  });

  it('publishes a care-of line naming an organisation', () => {
    for (const line of [
      'C/O OBOS EIENDOMSFORVALTNING AS', 'C/O BOLIGBYGGELAGET TOBB',
      'C/O MALLING & CO FORVALTNING AS', 'C/O DASHWOOD INTERNATIONAL LTD',
    ]) {
      expect(namesAPersonRatherThanAPlace(line)).toBe(false);
    }
  });

  it('reads Norwegian compounds, where the organisational word is a suffix', () => {
    // "skogeierforening" is a forest owners' association, and a word-boundary
    // match on FORENING does not see it.
    expect(namesAPersonRatherThanAPlace('C/O AGDER-TELEMARK SKOGEIERFORENING')).toBe(false);
    expect(namesAPersonRatherThanAPlace('C/O SØRLANDET BORETTSLAG')).toBe(false);
  });

  it('OVER-excludes rather than risk naming someone', () => {
    /**
     * A company whose name carries no legal-form suffix is withheld too, and
     * that is the intended direction. Losing a finding is recoverable — the
     * address is still in the public register and anyone may look — while
     * publishing a private individual's name is not.
     */
    expect(namesAPersonRatherThanAPlace('C/O STARBRIDGE')).toBe(true);
    expect(namesAPersonRatherThanAPlace('C/O USBL FOLLO')).toBe(true);
  });

  it('splits a list and keeps what it withheld, so the count can be published', () => {
    const { publishable, withheld } = partitionByPublishability([
      { addressLine1: '71-75 SHELTON STREET' },
      { addressLine1: 'C/O RAYMOND FRIVÅG' },
      { addressLine1: 'C/O OBOS EIENDOMSFORVALTNING AS' },
    ]);

    expect(publishable).toHaveLength(2);
    expect(withheld).toHaveLength(1);
  });
});

describe('against the committed register assets', () => {
  for (const file of ['brreg.json', 'companies-house.json']) {
    it(`${file} publishes no address naming a person`, () => {
      const p = path.join(process.cwd(), 'public/data', file);
      if (!fs.existsSync(p)) return;
      const asset = JSON.parse(fs.readFileSync(p, 'utf8'));

      for (const c of asset.clusters ?? []) {
        expect(namesAPersonRatherThanAPlace(c.addressLine1)).toBe(false);
      }
      for (const b of asset.batches ?? []) {
        expect(namesAPersonRatherThanAPlace(b.addressLine1)).toBe(false);
      }
      // The population stays honestly described: what was withheld is counted.
      expect(typeof asset.withheldPersonalAddresses).toBe('number');
      expect(asset.bounding).toMatch(/names a person rather than a place/);
    });
  }
});
