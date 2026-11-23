/**
 * Words by a language's own rules, with nothing of React (decision D-ML): a count, a list and a number
 * as the language says them. The app's helpers (i18n.ts) read the language shown; Starcom Uplink's
 * pages, which have no React and their own language (ML8), name theirs.
 */
import { interpolate } from '../messages';
import { languageOf, type LanguageId } from './languages';
import type { PluralForms } from './types';

/** Items joined as the language joins them: "A, B and C", "A, B und C", "A, B і C". */
export const listedIn = (lang: LanguageId, items: readonly string[]): string =>
  // English as the house style writes it, with no comma before "and": British usage does the same.
  new Intl.ListFormat(lang === 'en' ? 'en-GB' : languageOf(lang).html, { type: 'conjunction' }).format(items);

/** A number as the language writes it: 1,234 or 1.234 or 1 234. */
export const numberedIn = (lang: LanguageId, n: number): string => new Intl.NumberFormat(languageOf(lang).html).format(n);

/**
 * An amount as the language says it: from a million, in its words ("2.67 million", "2,67 Millionen",
 * "26.7 लाख"), to three figures; below that, whole ("270,007"), and to three figures under ten ("6.1").
 */
export const amountIn = (lang: LanguageId, n: number): string => {
  const locale = languageOf(lang).html;
  if (Math.abs(n) >= 1e6) return new Intl.NumberFormat(locale, { notation: 'compact', compactDisplay: 'long', maximumSignificantDigits: 3 }).format(n);
  if (Math.abs(n) >= 10) return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);
  return new Intl.NumberFormat(locale, { maximumSignificantDigits: 3 }).format(n);
};

/** A count in words, by the language's plural rules: `{n}` is the count, written as the language writes numbers. */
export function countedIn(lang: LanguageId, forms: PluralForms, n: number, values: Record<string, string | number> = {}): string {
  const category = new Intl.PluralRules(languageOf(lang).html).select(n) as keyof PluralForms;
  return interpolate(forms[category] ?? forms.other, { n: numberedIn(lang, n), ...values });
}

/** A distance as the language writes it, in metres or, from a kilometre, kilometres: "10 m", "1,000 km". */
export const distanceIn = (lang: LanguageId, metres: number): string => {
  const km = metres >= 1000;
  return new Intl.NumberFormat(languageOf(lang).html, { style: 'unit', unit: km ? 'kilometer' : 'meter', unitDisplay: 'short' }).format(km ? metres / 1000 : metres);
};
