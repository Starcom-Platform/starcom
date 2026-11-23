/**
 * Which language a text seems to be written in, without a model (decision D-ML, T1): the browser's own
 * detector is often not there (Brave, and Chrome until its model is fetched), so a report's script and
 * its commonest short words say what they can. A guess, never a claim: the person can always say.
 */

/** Short words common in each language's running text, and rare in the others'. */
const COMMON: Record<string, readonly string[]> = {
  en: ['the', 'and', 'of', 'to', 'is', 'in', 'that', 'was', 'for', 'with', 'are', 'on', 'it', 'at', 'by', 'from', 'this', 'have', 'were', 'has'],
  de: ['der', 'die', 'und', 'das', 'ist', 'nicht', 'mit', 'sich', 'auf', 'den', 'ein', 'eine', 'auch', 'wurde', 'sind', 'von', 'dem', 'zu', 'im', 'über'],
  pt: ['de', 'que', 'não', 'uma', 'para', 'com', 'os', 'em', 'do', 'da', 'no', 'na', 'por', 'mais', 'foi', 'são', 'ao', 'pelo', 'pela', 'também'],
  es: ['el', 'los', 'las', 'del', 'que', 'una', 'por', 'con', 'para', 'es', 'se', 'más', 'fue', 'pero', 'como', 'muy', 'está', 'han', 'sus', 'también'],
  fr: ['le', 'les', 'des', 'est', 'une', 'dans', 'que', 'pour', 'pas', 'sur', 'qui', 'avec', 'ont', 'été', 'sont', 'au', 'aux', 'mais', 'cette', 'il'],
  sw: ['na', 'ya', 'wa', 'kwa', 'ni', 'za', 'katika', 'la', 'cha', 'kwamba', 'hii', 'hiyo', 'pia', 'lakini', 'sana', 'kama', 'baada', 'wakati', 'watu', 'mto'],
};

/** Letters of a script, and the languages written in it that a person here is likely to meet. */
const SCRIPTS: Array<{ test: RegExp; languages: readonly string[] }> = [
  { test: /[ऀ-ॿ]/g, languages: ['hi'] },
  { test: /[Ѐ-ӿ]/g, languages: ['uk', 'ru'] },
  { test: /[؀-ۿ]/g, languages: ['ar'] },
  { test: /[一-鿿]/g, languages: ['zh'] },
  { test: /[぀-ヿ]/g, languages: ['ja'] },
  { test: /[가-힯]/g, languages: ['ko'] },
];

/** Letters only Ukrainian writes among the Cyrillic ones met here, and only Russian. */
const UKRAINIAN = /[ієїґ]/i;
const RUSSIAN = /[ыэъё]/i;

/**
 * The languages the text seems to be written in, likeliest first; empty when it cannot say. `lang` is a
 * base tag ("en", "pt"): what the translator is asked for.
 */
export function seemsWrittenIn(text: string): string[] {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length < 12) return [];
  for (const { test, languages } of SCRIPTS) {
    const found = text.match(test)?.length ?? 0;
    if (found / letters.length < 0.3) continue;
    if (languages.includes('uk')) {
      if (UKRAINIAN.test(text) && !RUSSIAN.test(text)) return ['uk'];
      if (RUSSIAN.test(text) && !UKRAINIAN.test(text)) return ['ru'];
    }
    return [...languages];
  }
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.length < 5) return [];
  // Two of a language's common words at least: one short word is shared by too many ("de", "en").
  const scores = Object.entries(COMMON)
    .map(([lang, common]) => ({ lang, found: words.filter((w) => common.includes(w)).length }))
    .filter((s) => s.found >= 2 && s.found / words.length >= 0.08)
    .sort((a, b) => b.found - a.found);
  return scores.map((s) => s.lang);
}
