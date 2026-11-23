/**
 * Diplomatic events are named as CAMEO names them (critique audit of
 * 2026-10-01, section 11; plan block F, item 6).
 *
 * Any "sign formal agreement" (CAMEO 057) was called a Treaty; any root-04
 * consultation, phone calls included, a Summit; and root 06, which includes
 * military and intelligence cooperation, Trade Cooperation. A learner reading
 * "Treaty" over a country learns something the data never said.
 *
 * @vitest-environment node
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { DIPLOMATIC_CATEGORY_NAMES, DIPLOMATIC_CATEGORIES } from '../diplomaticEventTheme';
import { en } from '../../../i18n/app/en';

const SRC = resolve(__dirname, '../../..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('the names of diplomatic events', () => {
  it('are CAMEO\'s own', () => {
    expect(DIPLOMATIC_CATEGORY_NAMES.agreement.many).toBe('Formal agreements signed');
    expect(DIPLOMATIC_CATEGORY_NAMES.consult.many).toBe('Consultations: calls, visits, meetings');
    expect(DIPLOMATIC_CATEGORY_NAMES.material.many).toBe('Material cooperation: economic, military, intelligence');
  });

  // D-DP, DP4: the four that were loaded and dropped, under CAMEO's root names.
  it('name the four roots that were dropped as CAMEO names them', () => {
    expect(DIPLOMATIC_CATEGORY_NAMES.intent.one).toBe('Intent to cooperate');
    expect(DIPLOMATIC_CATEGORY_NAMES.diplomatic.one).toBe('Diplomatic cooperation');
    expect(DIPLOMATIC_CATEGORY_NAMES.aid.one).toBe('Aid provided');
    expect(DIPLOMATIC_CATEGORY_NAMES.yield.one).toBe('Yielding');
  });

  it('are the catalogue\'s, so each language has all seven', async () => {
    expect(DIPLOMATIC_CATEGORY_NAMES).toBe(en.diplomacy.categories);
    for (const lang of ['de', 'pt-BR', 'sw', 'hi', 'uk']) {
      const m = (await import(`../../../i18n/app/locales/${lang}.ts`)).default;
      expect(Object.keys(m.diplomacy.categories), lang).toEqual(DIPLOMATIC_CATEGORIES);
    }
  });

  it('nowhere call them treaties, summits or trade cooperation', () => {
    const found = sources(SRC).flatMap((path) => readFileSync(path, 'utf8').split('\n')
      .map((line, i) => ({ where: `${path.slice(SRC.length + 1)}:${i + 1}`, text: line.trim() }))
      .filter(({ text }) => !/^(\/\/|\*|\/\*)/.test(text) && /['"`](Treaty|Treaties|Summit|Summits|Trade Cooperation)['"`]/.test(text)));
    expect(found.map(({ where, text }) => `${where} ${text}`)).toEqual([]);
  });
});
