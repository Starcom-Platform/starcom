/**
 * A place's name mid-sentence: "About the United States of America as a
 * whole", never "About United States of America as a whole".
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nameInText } from '../nameInText';

describe('a name mid-sentence', () => {
  it('takes "the" where English gives it one', () => {
    for (const [name, inText] of [
      ['United States of America', 'the United States of America'], ['United Kingdom', 'the United Kingdom'],
      ['Philippines', 'the Philippines'], ['Netherlands', 'the Netherlands'], ['Democratic Republic of the Congo', 'the Democratic Republic of the Congo'],
      ['Republic of the Congo', 'the Republic of the Congo'], ['Central African Republic', 'the Central African Republic'],
      ['Solomon Islands', 'the Solomon Islands'], ['British Indian Ocean Territory', 'the British Indian Ocean Territory'],
      ['The Bahamas', 'the Bahamas'], ['Gambia', 'the Gambia'], ['United Arab Emirates', 'the United Arab Emirates'],
    ]) expect(nameInText(name), name).toBe(inText);
  });

  it('none where it takes none', () => {
    for (const name of ['France', 'Ohio', 'Saint Lucia', 'Czechia', 'Ivory Coast', 'Kosovo', 'eSwatini', 'Guinea-Bissau', 'Hong Kong S.A.R.']) {
      expect(nameInText(name), name).toBe(name);
    }
  });

  it('every name on the map reads as a name, its own words kept', () => {
    const ROOT = resolve(__dirname, '../../..');
    const names = (JSON.parse(readFileSync(resolve(ROOT, 'public/geopolitical/world-territories-lod0.geojson'), 'utf8')).features as Array<{ properties: { ADMIN?: string } }>)
      .map((f) => f.properties.ADMIN).filter((n): n is string => !!n);
    for (const name of names) expect(nameInText(name).replace(/^the /, '').replace(/^The /, '')).toBe(name.replace(/^The /, ''));
  });
});
