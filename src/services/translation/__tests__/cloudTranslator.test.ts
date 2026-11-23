/**
 * Translation in the cloud on the person's own key (decision D-ML, T3): the key kept in this browser and
 * sent only to its provider, each provider asked as it expects, and a refusal said in the provider's words.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLOUD_KEY, cloudKey, keepCloudKey, translateInCloud } from '../cloudTranslator';

afterEach(() => { keepCloudKey(null); vi.restoreAllMocks(); });

describe('the person\'s key', () => {
  it('is kept in this browser, and forgotten when removed', () => {
    keepCloudKey({ provider: 'azure', key: ' abc123 ', region: 'westeurope' });
    expect(cloudKey()).toEqual({ provider: 'azure', key: 'abc123', region: 'westeurope' });
    expect(JSON.parse(localStorage.getItem(CLOUD_KEY)!)).toEqual({ provider: 'azure', key: 'abc123', region: 'westeurope' });
    keepCloudKey(null);
    expect(cloudKey()).toBeNull();
    expect(localStorage.getItem(CLOUD_KEY)).toBeNull();
  });
});

describe('translateInCloud', () => {
  it('asks Azure with the key in its header, one item a paragraph, and nothing else', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
      { translations: [{ text: 'The river rose.' }] }, { translations: [{ text: 'The bridge is closed.' }] },
    ]), { status: 200 }));
    const out = await translateInCloud('Mto umefurika.\n\nDaraja limefungwa.', 'sw', 'en', { provider: 'azure', key: 'k1', region: 'eastus' });
    expect(out).toBe('The river rose.\n\nThe bridge is closed.');
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=sw&to=en');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'Ocp-Apim-Subscription-Key': 'k1', 'Ocp-Apim-Subscription-Region': 'eastus' });
    expect(JSON.parse(init.body as string)).toEqual([{ Text: 'Mto umefurika.' }, { Text: 'Daraja limefungwa.' }]);
  });

  it('asks Google with the key in the address, as plain text, and says its refusal in its words', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { translations: [{ translatedText: 'The river rose.' }] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }), { status: 400 }));
    expect(await translateInCloud('Mto umefurika.', 'sw', 'en', { provider: 'google', key: 'g k' })).toBe('The river rose.');
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://translation.googleapis.com/language/translate/v2?key=g%20k');
    expect(JSON.parse(init.body as string)).toEqual({ q: ['Mto umefurika.'], source: 'sw', target: 'en', format: 'text' });
    await expect(translateInCloud('Mto umefurika.', 'sw', 'en', { provider: 'google', key: 'bad' })).rejects.toThrow('Google said: API key not valid. Please pass a valid API key.');
  });
});
