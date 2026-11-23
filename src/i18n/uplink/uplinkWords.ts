/**
 * Which language Starcom Uplink's pages are in, and their words (decision D-ML, L5). Uplink keeps the
 * language a Starcom page last told it (ML8); before any page has, the browser's own. English is in the
 * package's pages; every other language loads as its own chunk, when it is the one shown.
 */
import { chooseLanguage, type LanguageId } from '../app/languages';
import { uplinkEn, type UplinkMessages } from './en';

/** Where Uplink keeps the language a Starcom page told it, in the extension's storage. */
export const UPLINK_LANGUAGE_KEY = 'uplink-language';

const LOADERS: Record<Exclude<LanguageId, 'en'>, () => Promise<UplinkMessages>> = {
  de: () => import('./locales/de').then((m) => m.default),
  'pt-BR': () => import('./locales/pt-BR').then((m) => m.default),
  // Uplink has no Baiana words of its own: the Bahia layer reads Brazilian Portuguese here.
  'pt-BR-bahia': () => import('./locales/pt-BR').then((m) => m.default),
  sw: () => import('./locales/sw').then((m) => m.default),
  hi: () => import('./locales/hi').then((m) => m.default),
  uk: () => import('./locales/uk').then((m) => m.default),
};

/** Uplink's language and words: the one a Starcom page told it, else the browser's first Starcom has, else English. */
export async function uplinkWords(told: unknown, browserLanguages: readonly string[]): Promise<{ lang: LanguageId; m: UplinkMessages }> {
  const lang = chooseLanguage(typeof told === 'string' ? told : null, browserLanguages);
  return { lang, m: lang === 'en' ? uplinkEn : await LOADERS[lang]() };
}
