/**
 * Translation in the cloud, on the person's own key (decision D-ML, T3, ML6, ML16–ML18): Microsoft Azure
 * Translator or Google Cloud Translation, called by the page itself. Only Public content is ever sent; the
 * component that offers it decides that, and this module sends only what it is handed. The key is kept in
 * this browser, on this device, and sent only to the provider it is for.
 */
import { useSyncExternalStore } from 'react';

export type CloudProvider = 'azure' | 'google';

export interface CloudKey {
  provider: CloudProvider;
  key: string;
  /** Azure's resource region, when the resource has one (a global resource has none). */
  region?: string;
}

/** Where the key is kept, in this browser. */
export const CLOUD_KEY = 'starcom-translate-cloud';

const listeners = new Set<() => void>();
let cached: CloudKey | null | undefined;

function read(): CloudKey | null {
  try {
    const kept = JSON.parse(localStorage.getItem(CLOUD_KEY) ?? 'null') as Partial<CloudKey> | null;
    if (!kept || (kept.provider !== 'azure' && kept.provider !== 'google') || typeof kept.key !== 'string' || !kept.key.trim()) return null;
    return { provider: kept.provider, key: kept.key, ...(typeof kept.region === 'string' && kept.region.trim() ? { region: kept.region.trim() } : {}) };
  } catch {
    return null;
  }
}

/** The person's key, or null when they have kept none. */
export function cloudKey(): CloudKey | null {
  if (cached === undefined) cached = read();
  return cached;
}

/** Keeps the person's key in this browser, or forgets it. */
export function keepCloudKey(key: CloudKey | null): void {
  try {
    if (key) localStorage.setItem(CLOUD_KEY, JSON.stringify({ provider: key.provider, key: key.key.trim(), ...(key.region?.trim() ? { region: key.region.trim() } : {}) }));
    else localStorage.removeItem(CLOUD_KEY);
  } catch { /* storage refused: nothing is kept */ }
  cached = read();
  for (const heard of listeners) heard();
}

const subscribe = (heard: () => void) => { listeners.add(heard); return () => { listeners.delete(heard); }; };

/** The person's key, as React reads it: components re-render when it is kept or forgotten. */
export function useCloudKey(): CloudKey | null {
  return useSyncExternalStore(subscribe, cloudKey, cloudKey);
}

/** Each provider's tag for a language, where it differs from the base tag. */
const TAGS: Record<CloudProvider, Record<string, string>> = {
  azure: { zh: 'zh-Hans' },
  google: { zh: 'zh-CN' },
};
const tagFor = (provider: CloudProvider, lang: string) => TAGS[provider][lang] ?? lang;

/** What the provider said went wrong, in its words. */
async function refusal(provider: CloudProvider, response: Response): Promise<Error> {
  let said = `${response.status} ${response.statusText}`.trim();
  try {
    const body = await response.json() as { error?: { message?: string } };
    if (body.error?.message) said = body.error.message;
  } catch { /* no body to read */ }
  return new Error(`${provider === 'azure' ? 'Azure' : 'Google'} said: ${said}`);
}

/** The text in `target` by the provider on the person's key, paragraph by paragraph. */
export async function translateInCloud(text: string, source: string, target: string, key: CloudKey): Promise<string> {
  const paragraphs = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  if (key.provider === 'azure') {
    const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${encodeURIComponent(tagFor('azure', source))}&to=${encodeURIComponent(tagFor('azure', target))}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Ocp-Apim-Subscription-Key': key.key, ...(key.region ? { 'Ocp-Apim-Subscription-Region': key.region } : {}) },
      body: JSON.stringify(paragraphs.map((p) => ({ Text: p }))),
    });
    if (!response.ok) throw await refusal('azure', response);
    const said = await response.json() as Array<{ translations: Array<{ text: string }> }>;
    return said.map((s) => s.translations[0]?.text ?? '').join('\n\n');
  }
  const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key.key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: paragraphs, source: tagFor('google', source), target: tagFor('google', target), format: 'text' }),
  });
  if (!response.ok) throw await refusal('google', response);
  const said = await response.json() as { data: { translations: Array<{ translatedText: string }> } };
  return said.data.translations.map((t) => t.translatedText).join('\n\n');
}
