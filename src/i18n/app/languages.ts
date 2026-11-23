/**
 * The languages Starcom's screens come in (decision D-ML, ML1–ML4), and which one a person sees: the one
 * they chose, else the first their browser asks for that Starcom has, else English. Pure.
 */

export const LANGUAGES = [
  { id: 'en', name: 'English', html: 'en', reviewed: true },
  { id: 'de', name: 'Deutsch', html: 'de', reviewed: false },
  { id: 'pt-BR', name: 'Português (Brasil)', html: 'pt-BR', reviewed: false },
  // Brazilian Portuguese with the Baiana layer over it (ML4): chosen, never guessed from the browser.
  { id: 'pt-BR-bahia', name: 'Português (Bahia)', html: 'pt-BR', reviewed: false },
  { id: 'sw', name: 'Kiswahili', html: 'sw', reviewed: false },
  { id: 'hi', name: 'हिन्दी', html: 'hi', reviewed: false },
  { id: 'uk', name: 'Українська', html: 'uk', reviewed: false },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]['id'];

/** Where the person's choice is kept, in this browser. */
export const LANGUAGE_KEY = 'starcom-language';

/** Whether `id` is a language Starcom has: what a page tells Starcom Uplink is checked by it (ML8). */
export const isLanguage = (id: unknown): id is LanguageId => LANGUAGES.some((l) => l.id === id);
export const languageOf = (id: LanguageId) => LANGUAGES.find((l) => l.id === id)!;

/** The language to show: the person's choice, else their browser's first that Starcom has, else English. */
export function chooseLanguage(chosen: string | null, asked: readonly string[]): LanguageId {
  if (isLanguage(chosen)) return chosen;
  for (const tag of asked) {
    const lower = tag.toLowerCase();
    // Any Portuguese is offered as Brazilian: the Bahia layer is for the person to choose.
    if (lower === 'pt' || lower.startsWith('pt-')) return 'pt-BR';
    const base = lower.split('-')[0];
    const found = LANGUAGES.find((l) => l.id === base);
    if (found) return found.id;
  }
  return 'en';
}
