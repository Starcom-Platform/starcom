/**
 * Mecha Jono's notes in a commercial build (D-CS, CS6), held to the tag texts their notes carried on 11 Nov 2026
 * (.local/audit/2026-11-11-mj-licences.json).
 */
import { describe, expect, it } from 'vitest';
import { licenceAllowsCommercial, mjNoteShown, noteShownInThisBuild } from '../noteLicence';
import { MECHA_JONO_KEYS } from '../../config/publicInfrastructure';

const ALLOWED = [
  'CC BY-SA 4.0', 'public domain (US government work)', "CC BY (Global Voices; see globalvoices.org's attribution policy)",
  "CC BY 4.0 (IOM's Missing Migrants Project)", 'GIS Open Data Licence (RNLI)', 'CC BY-IGO (WFP, Global - Food Prices on HDX)',
  'US government work, public domain: 17 U.S.C. 105', 'CC0 (NASA FIRMS fire detections)',
  'GDELT Project terms: free use, with citation and link', 'Open Government Licence v3.0', 'OGL-UK-3.0',
  'Public Data License 1.0 (PDL1.0; compatible with CC BY 4.0)', 'Open Government Licence v3.0 (National Crime Agency)', 'CC BY 4.0',
  'Open Database License (ODbL) 1.0 (Que faire à Paris, Ville de Paris (opendata.paris.fr))',
  'Licence Ouverte 2.0 (Etalab) (DATAtourisme, from OT Seignanx, last updated 2026-11-09)', 'ODbL-1.0 (venue: OpenStreetMap contributors)',
];
const REFUSED = [
  'CC BY-NC (Xataka, Webedia)', 'CC BY-NC 4.0', "CC BY-NC-ND 4.0 (Direct Relief's headlines, quoted unchanged)", 'CC BY-ND 3.0',
  'headline and link only', "each linked note's own; the portal's lines CC BY-SA 4.0", "each linked note's own; UCDP's data CC BY 4.0",
  'CC BY-NC-ND 3.0 (ASPI The Strategist)', 'CC BY-ND 4.0 FR (https://creativecommons.org/licenses/by-nd/4.0/deed.fr)',
  "each count's source's own (Wikipedia: CC BY-SA 4.0; the CGT: non-commercial, credited)", 'all rights reserved', '',
];

describe('licenceAllowsCommercial', () => {
  it.each(ALLOWED)('allows %s', (words) => expect(licenceAllowsCommercial(words)).toBe(true));
  it.each(REFUSED)('refuses %s', (words) => expect(licenceAllowsCommercial(words)).toBe(false));

  it('lets the SPDX id decide when the note carries one', () => {
    expect(licenceAllowsCommercial('CC BY 4.0 (whatever the words say)', 'CC-BY-4.0')).toBe(true);
    expect(licenceAllowsCommercial('CC BY 4.0', 'CC-BY-NC-4.0')).toBe(false);
    expect(licenceAllowsCommercial('US federal', 'LicenseRef-us-gov')).toBe(true);
  });
});

describe('noteShownInThisBuild', () => {
  const tagged = (...license: string[]) => ({ tags: [['d', 'x'], ['license', ...license]] });
  it('shows every note in the non-commercial build, untagged ones too', () => {
    expect(noteShownInThisBuild({ tags: [] }, 'noncommercial')).toBe(true);
    expect(noteShownInThisBuild(tagged('CC BY-NC 4.0'), 'noncommercial')).toBe(true);
  });
  it('shows in the commercial build only a note whose licence allows it', () => {
    expect(noteShownInThisBuild({ tags: [] }, 'commercial')).toBe(false);
    expect(noteShownInThisBuild(tagged('CC BY-NC 4.0'), 'commercial')).toBe(false);
    expect(noteShownInThisBuild(tagged('CC BY 4.0', 'CC-BY-4.0'), 'commercial')).toBe(true);
  });
});

describe('mjNoteShown', () => {
  const mj = MECHA_JONO_KEYS[0];
  const someone = 'f'.repeat(64);
  it("holds only Mecha Jono's notes to their licence, in the commercial build only", () => {
    expect(mjNoteShown({ pubkey: mj, tags: [] }, 'commercial')).toBe(false);
    expect(mjNoteShown({ pubkey: mj, tags: [['license', 'CC BY 4.0']] }, 'commercial')).toBe(true);
    expect(mjNoteShown({ pubkey: someone, tags: [] }, 'commercial')).toBe(true);
    expect(mjNoteShown({ pubkey: mj, tags: [] }, 'noncommercial')).toBe(true);
  });
});

describe('every relay read passes the filter', () => {
  it('builds no pool outside createRelayPool, whose subscriptions apply mjNoteShown', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === '__tests__' ? [] : walk(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
    });
    expect(walk('src').filter((p) => /new SimplePool\(/.test(readFileSync(p, 'utf8')))).toEqual([]);
    expect(readFileSync('src/services/nostr/relayPool.ts', 'utf8')).toMatch(/mjNoteShown\(event\)/);
  });
});
