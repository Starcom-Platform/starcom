/**
 * The browser's own translator, on this device (decision D-ML, T1): Chrome's Translator API, which Brave
 * and Edge offer too, on desktop. Nothing is sent anywhere: a language pack is fetched by the browser,
 * once, at the person's click, and the words are translated where they are. Firefox and phones have none.
 */
import { languageOf, type LanguageId } from '../../i18n/app/languages';

export type PackState = 'available' | 'downloadable' | 'downloading' | 'unavailable';

interface BrowserTranslator {
  translate(text: string): Promise<string>;
}

interface TranslatorApi {
  availability(pair: { sourceLanguage: string; targetLanguage: string }): Promise<PackState>;
  create(options: { sourceLanguage: string; targetLanguage: string; monitor?: (m: EventTarget) => void }): Promise<BrowserTranslator>;
}

interface DetectorApi {
  availability(): Promise<PackState>;
  create(): Promise<{ detect(text: string): Promise<Array<{ detectedLanguage: string; confidence: number }>> }>;
}

const translatorApi = (): TranslatorApi | null => (globalThis as { Translator?: TranslatorApi }).Translator ?? null;
const detectorApi = (): DetectorApi | null => (globalThis as { LanguageDetector?: DetectorApi }).LanguageDetector ?? null;

/** Whether this browser translates for pages at all. */
export const browserTranslates = (): boolean => translatorApi() !== null;

/** The tag the translator is asked for: the language Starcom shows, as its base language. */
export const translatorTag = (lang: LanguageId): string => languageOf(lang).html.split('-')[0];

/** Whether the browser can translate from `source` into `target`, and whether a pack must be fetched first. */
export async function packState(source: string, target: string): Promise<PackState> {
  const api = translatorApi();
  if (!api) return 'unavailable';
  try {
    return await api.availability({ sourceLanguage: source, targetLanguage: target });
  } catch {
    return 'unavailable';
  }
}

/**
 * What the browser's detector says the text is written in, when it is sure. Its model is fetched only when
 * `mayFetch`: on the person's click, as the browser requires.
 */
export async function detected(text: string, mayFetch: boolean): Promise<string | null> {
  const api = detectorApi();
  if (!api) return null;
  try {
    const state = await api.availability();
    if (state === 'unavailable' || (state !== 'available' && !mayFetch)) return null;
    const [best] = await (await api.create()).detect(text);
    return best && best.confidence >= 0.6 && best.detectedLanguage !== 'und' ? best.detectedLanguage : null;
  } catch {
    return null;
  }
}

/** One translator for each pair, kept while the page is open: its pack is fetched once. */
const made = new Map<string, Promise<BrowserTranslator>>();

/**
 * The text in `target`, paragraph by paragraph so the breaks stay where they were. `onFetched` hears how
 * much of a pack has come, from 0 to 1, when one has to be fetched.
 */
export async function translateHere(text: string, source: string, target: string, onFetched?: (share: number) => void): Promise<string> {
  const api = translatorApi();
  if (!api) throw new Error('This browser has no translator for pages');
  const key = `${source}>${target}`;
  let translator = made.get(key);
  if (!translator) {
    translator = api.create({
      sourceLanguage: source,
      targetLanguage: target,
      monitor: (m) => m.addEventListener('downloadprogress', (e) => onFetched?.((e as Event & { loaded: number }).loaded)),
    });
    made.set(key, translator);
    translator.catch(() => made.delete(key));
  }
  const ready = await translator;
  const parts = text.split(/(\n+)/);
  const out: string[] = [];
  for (const part of parts) out.push(part.trim() ? await ready.translate(part) : part);
  return out.join('');
}
