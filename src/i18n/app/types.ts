/**
 * The app's message catalogue, typed (decision D-ML, L1). English is the source; every other language is
 * the same shape, so a language that misses a word does not compile, and none ships half-translated
 * without anyone noticing (the reason `src/i18n/messages.ts` gives, kept here).
 */

/** A count's words, by the plural category `Intl.PluralRules` gives: Ukrainian uses one, few, many, other. */
export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

/** A catalogue shaped like `T`: every word a string, every count its plural forms. */
export type Catalog<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : T[K] extends { other: string } ? PluralForms : Catalog<T[K]>;
};

/** Words that differ from a base language, and only those: the Baiana layer over Brazilian Portuguese (ML4). */
export type Overlay<T> = {
  readonly [K in keyof T]?: T[K] extends string ? string : T[K] extends { other: string } ? PluralForms : Overlay<T[K]>;
};
