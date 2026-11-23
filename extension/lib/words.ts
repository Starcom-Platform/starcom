/**
 * Uplink's pages in the language a Starcom page last showed (decision D-ML, ML8), else the browser's:
 * read once as a page opens. Its consent windows put the English beneath each sentence that asks, until a
 * native speaker has reviewed the language shown (ML9), so a mistranslation cannot change what is agreed.
 */
import { UPLINK_LANGUAGE_KEY, uplinkWords } from '../../src/i18n/uplink/uplinkWords';
import { languageOf, type LanguageId } from '../../src/i18n/app/languages';
import type { UplinkMessages } from '../../src/i18n/uplink/en';
import { text } from './theme';

export interface Words {
  lang: LanguageId;
  m: UplinkMessages;
}

/** This page's words, and the page's language set to them. */
export async function wordsHere(): Promise<Words> {
  const told = (await browser.storage.local.get(UPLINK_LANGUAGE_KEY))[UPLINK_LANGUAGE_KEY];
  const words = await uplinkWords(told, navigator.languages ?? [navigator.language]);
  document.documentElement.lang = languageOf(words.lang).html;
  return words;
}

/** Whether the English goes beneath: a language nobody has reviewed yet. */
const unreviewed = (lang: LanguageId) => !languageOf(lang).reviewed;

/** A sentence that asks for consent, with the English beneath it while its language is unreviewed (ML9). */
export function asks(lang: LanguageId, tag: string, said: string, english: string, className?: string): HTMLElement {
  const el = text(tag, said, className);
  if (!unreviewed(lang) || said === english) return el;
  const both = document.createElement('div');
  const beneath = text('p', english, 'english');
  beneath.lang = 'en';
  both.append(el, beneath);
  return both;
}

/** A button that gives consent, its English beneath its label while the language is unreviewed (ML9). */
export function asksButton(lang: LanguageId, said: string, english: string, className?: string): HTMLElement {
  const button = text('button', said, className);
  if (unreviewed(lang) && said !== english) {
    const beneath = text('span', english, 'english');
    beneath.lang = 'en';
    button.append(beneath);
  }
  return button;
}
