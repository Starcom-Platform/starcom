/**
 * The language Starcom's screens are in (decision D-ML, L1): one store for the page, read by components
 * through `useMessages()`, with no provider to wire through each root and portal. English is in the bundle; every other language loads as its own chunk when chosen,
 * so the first visit carries none of them.
 */
import { useSyncExternalStore } from 'react';
import { interpolate } from '../messages';
import { en, type Messages } from './en';
import { LANGUAGE_KEY, chooseLanguage, languageOf, type LanguageId } from './languages';
import { amountIn, countedIn, listedIn, numberedIn } from './plain';
import type { Overlay, PluralForms } from './types';

const LOADERS: Record<Exclude<LanguageId, 'en'>, () => Promise<Messages>> = {
  de: () => import('./locales/de').then((m) => m.default),
  'pt-BR': () => import('./locales/pt-BR').then((m) => m.default),
  'pt-BR-bahia': () => Promise.all([import('./locales/pt-BR'), import('./locales/pt-BR-bahia')]).then(([base, layer]) => layered(base.default, layer.default)),
  sw: () => import('./locales/sw').then((m) => m.default),
  hi: () => import('./locales/hi').then((m) => m.default),
  uk: () => import('./locales/uk').then((m) => m.default),
};

/** A base language with a layer of differing words over it (ML4). */
function layered<T extends object>(base: T, layer: Overlay<T>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(layer as Record<string, unknown>)) {
    const under = (base as Record<string, unknown>)[key];
    out[key] = value && typeof value === 'object' && !('other' in value) && under && typeof under === 'object'
      ? layered(under as object, value as Overlay<object>)
      : value;
  }
  return out as T;
}

let state: { lang: LanguageId; m: Messages } = { lang: 'en', m: en };
const listeners = new Set<() => void>();
const publish = (next: typeof state) => { state = next; for (const listener of listeners) listener(); };

/** Switches Starcom's screens to `id`, kept as the person's choice unless `keep` is false. */
export async function setLanguage(id: LanguageId, keep = true): Promise<void> {
  const m = id === 'en' ? en : await LOADERS[id]();
  if (typeof document !== 'undefined') document.documentElement.lang = languageOf(id).html;
  if (keep) { try { localStorage.setItem(LANGUAGE_KEY, id); } catch { /* storage refused: the choice lasts this visit */ } }
  publish({ lang: id, m });
}

/** At start: the person's choice, else their browser's language when Starcom has it. */
export function startLanguage(): Promise<void> {
  let chosen: string | null = null;
  try { chosen = localStorage.getItem(LANGUAGE_KEY); } catch { /* no storage: the browser's language */ }
  const id = chooseLanguage(chosen, typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]);
  return setLanguage(id, false);
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** The language shown now, for code outside React: Starcom Uplink is told it (ML8). */
export const languageNow = (): LanguageId => state.lang;

/** The words shown now, for code outside React: what Starcom says to Uplink as it asks (ML9). */
export const messagesNow = (): Messages => state.m;

/** Calls `listener` each time the language changes, for code outside React; returns how to stop. */
export const onLanguageChange = (listener: () => void): (() => void) => subscribe(listener);

/** The words of the language chosen, and the language: components re-render when it changes. */
export function useMessages(): typeof state {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Named values put into a message: `{name}` placeholders survive word order changing between languages. */
export const fill = (template: string, values: Record<string, string | number> = {}): string => interpolate(template, values);

/** Items joined as the language joins them: "A, B and C", "A, B und C", "A, B і C". */
export const listed = (items: readonly string[], lang: LanguageId = state.lang): string => listedIn(lang, items);

/** A number as the language writes it: 1,234 or 1.234 or 1 234. */
export const numbered = (n: number, lang: LanguageId = state.lang): string => numberedIn(lang, n);

/** An amount as the language shown says it: "2.67 million" from a million, whole below (amountIn). */
export const amounted = (n: number, lang: LanguageId = state.lang): string => amountIn(lang, n);

/** A count in words, by the rules of the language shown: `{n}` is the count, written as the language writes numbers. */
export function counted(forms: PluralForms, n: number, values: Record<string, string | number> = {}, lang: LanguageId = state.lang): string {
  return countedIn(lang, forms, n, values);
}
