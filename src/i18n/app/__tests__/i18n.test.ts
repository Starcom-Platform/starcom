/**
 * Starcom's screens in many languages, the foundation (decision D-ML, L1): which language a person sees,
 * counts said by each language's own rules, the Bahia layer over Brazilian Portuguese, switching without a
 * reload, and every language holding every word.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { en } from '../en';
import { LANGUAGES, LANGUAGE_KEY, chooseLanguage, type LanguageId } from '../languages';
import { CAPABILITIES } from '../../../extension/protocol';
import { counted, setLanguage, useMessages } from '../i18n';
import { amountIn } from '../plain';
import de from '../locales/de';
import ptBR from '../locales/pt-BR';
import bahia from '../locales/pt-BR-bahia';
import sw from '../locales/sw';
import hi from '../locales/hi';
import uk from '../locales/uk';
import { uplinkEn } from '../../uplink/en';
import uplinkDe from '../../uplink/locales/de';
import uplinkPtBR from '../../uplink/locales/pt-BR';
import uplinkSw from '../../uplink/locales/sw';
import uplinkHi from '../../uplink/locales/hi';
import uplinkUk from '../../uplink/locales/uk';
import { uplinkWords } from '../../uplink/uplinkWords';

afterEach(async () => { await setLanguage('en', false); localStorage.clear(); });

/** The words and language a component would see now. */
const shown = () => renderHook(() => useMessages()).result.current;

describe('chooseLanguage', () => {
  it('takes the person\'s choice first, then their browser\'s first language Starcom has, else English', () => {
    expect(chooseLanguage('uk', ['de-DE'])).toBe('uk');
    expect(chooseLanguage(null, ['fr-FR', 'de-AT', 'en'])).toBe('de');
    expect(chooseLanguage(null, ['sw-KE'])).toBe('sw');
    expect(chooseLanguage('xx', ['ja'])).toBe('en');
  });

  it('offers any Portuguese as Brazilian, and never guesses the Bahia layer: the person chooses it', () => {
    expect(chooseLanguage(null, ['pt-PT'])).toBe('pt-BR');
    expect(chooseLanguage(null, ['pt'])).toBe('pt-BR');
    expect(chooseLanguage('pt-BR-bahia', ['en'])).toBe('pt-BR-bahia');
  });
});

describe('counted', () => {
  const forms = { one: '{n} file', few: '{n} files (few)', many: '{n} files (many)', other: '{n} files (other)' };

  it('says a count by the language\'s own plural rules', () => {
    expect(counted(forms, 1, {}, 'uk')).toBe('1 file');
    expect(counted(forms, 3, {}, 'uk')).toBe('3 files (few)');
    expect(counted(forms, 5, {}, 'uk')).toBe('5 files (many)');
    expect(counted(forms, 21, {}, 'uk')).toBe('21 file');
    expect(counted(forms, 2, {}, 'en')).toBe('2 files (other)');
    // Hindi counts 0 as "one".
    expect(counted({ one: '{n} फ़ाइल', other: '{n} फ़ाइलें' }, 0, {}, 'hi')).toBe('0 फ़ाइल');
  });

  it('falls back to "other" when a language gives no form for the category', () => {
    expect(counted({ one: '{n} file', other: '{n} files' }, 5, {}, 'uk')).toBe('5 files');
  });
});

describe('the Bahia layer', () => {
  it('lies over Brazilian Portuguese, changing only the words it names', async () => {
    await setLanguage('pt-BR-bahia', false);
    const { m } = shown();
    expect(m.language.reviewed).toBe(bahia.language!.reviewed);
    expect(m.language.heading).toBe(ptBR.language.heading);
    expect(m.settings).toEqual(ptBR.settings);
  });
});

describe('setLanguage', () => {
  it('switches the words, sets the page\'s language, and keeps the choice', async () => {
    await setLanguage('uk');
    expect(shown().lang).toBe('uk');
    expect(shown().m.settings.title).toBe('Налаштування');
    expect(document.documentElement.lang).toBe('uk');
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('uk');
    await setLanguage('pt-BR-bahia');
    expect(document.documentElement.lang).toBe('pt-BR');
    expect(shown().m.language.reviewed).toBe('Revisado por alguém da Bahia.');
  });
});

describe('every language', () => {
  /** A count's forms are one word: each language has its own number of them. */
  const isCount = (x: unknown): x is Record<string, string> => typeof x === 'object' && x !== null && typeof (x as { other?: unknown }).other === 'string';
  const shape = (x: unknown): unknown => (typeof x === 'string' ? 'string' : isCount(x) ? 'count'
    : Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, shape((x as Record<string, unknown>)[k])])));
  const counts = (x: unknown, at = ''): Array<[string, Record<string, string>]> => (typeof x !== 'object' || x === null ? []
    : isCount(x) ? [[at, x]] : Object.entries(x).flatMap(([k, v]) => counts(v, at ? `${at}.${k}` : k)));
  const all: Record<Exclude<LanguageId, 'pt-BR-bahia'>, unknown> = { en, de, 'pt-BR': ptBR, sw, hi, uk };

  it('holds every word English has, and no other', () => {
    for (const [id, catalog] of Object.entries(all)) expect(shape(catalog), id).toEqual(shape(en));
  });

  it('gives each count exactly the forms its language\'s plural rules use', () => {
    for (const [id, catalog] of Object.entries(all)) {
      const categories = new Intl.PluralRules(LANGUAGES.find((l) => l.id === id)!.html).resolvedOptions().pluralCategories;
      for (const [at, forms] of counts(catalog)) expect(Object.keys(forms).sort(), `${id} ${at}`).toEqual([...categories].sort());
    }
  });

  it('is listed, and only English is marked checked by a native speaker so far', () => {
    expect(LANGUAGES.map((l) => l.id).sort()).toEqual(['de', 'en', 'hi', 'pt-BR', 'pt-BR-bahia', 'sw', 'uk']);
    expect(LANGUAGES.filter((l) => l.reviewed).map((l) => l.id)).toEqual(['en']);
  });

  it('has Starcom Uplink\'s words too, each count in its own plural forms (D-ML, L5)', () => {
    const uplinks: Record<string, unknown> = { en: uplinkEn, de: uplinkDe, 'pt-BR': uplinkPtBR, sw: uplinkSw, hi: uplinkHi, uk: uplinkUk };
    for (const [id, catalog] of Object.entries(uplinks)) {
      expect(shape(catalog), id).toEqual(shape(uplinkEn));
      const categories = new Intl.PluralRules(LANGUAGES.find((l) => l.id === id)!.html).resolvedOptions().pluralCategories;
      for (const [at, forms] of counts(catalog)) expect(Object.keys(forms).sort(), `uplink ${id} ${at}`).toEqual([...categories].sort());
    }
  });

  it('gives Uplink the language a Starcom page told it, else the browser\'s, and Bahia its Brazilian words', async () => {
    expect((await uplinkWords('uk', ['de-DE'])).m.grant.allow).toBe(uplinkUk.grant.allow);
    expect((await uplinkWords(null, ['de-DE'])).lang).toBe('de');
    expect((await uplinkWords('pt-BR-bahia', [])).m).toEqual(uplinkPtBR);
    expect((await uplinkWords('xx', ['ja'])).m).toBe(uplinkEn);
  });

  it('has words for every capability Uplink can name', () => {
    expect(Object.keys(en.uplink.capabilities).sort()).toEqual([...CAPABILITIES].sort());
  });
});

describe('amountIn', () => {
  it('says a million and more in the language\'s words, to three figures', () => {
    expect(amountIn('en', 2_671_560)).toBe('2.67 million');
    expect(amountIn('en', 3.7e13)).toBe('37 trillion');
    expect(amountIn('de', 2_671_560)).toBe('2,67 Millionen');
    expect(amountIn('hi', 2_671_560)).toBe('26.7 लाख');
  });

  it('writes less than a million whole, and under ten to three figures', () => {
    expect(amountIn('en', 270_007)).toBe('270,007');
    expect(amountIn('en', 1234.5)).toBe('1,235');
    expect(amountIn('en', 6.104)).toBe('6.1');
    expect(amountIn('en', 0.000412)).toBe('0.000412');
  });
});
