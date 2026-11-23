/**
 * "Translate" beneath a report from abroad (decision D-ML, T1): offered only where the words seem to be in
 * another language and the browser translates for pages; the pack fetched at the click, its progress said;
 * the translation beneath the original, marked as the browser's, with the language it was read as.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Translatable from '../Translatable';
import { setLanguage } from '../../../i18n/app/i18n';
import { keepCloudKey } from '../../../services/translation/cloudTranslator';

/** Starcom's own translator, stood in: whether this browser could run it, and whether it is kept here. */
const model = vi.hoisted(() => ({ runs: false, kept: false, asked: [] as string[] }));
vi.mock('../../../services/translation/nllbTranslator', () => ({
  modelTranslates: () => model.runs,
  modelKept: async () => model.kept,
  translateWithModel: async (text: string, source: string, target: string, heard?: (p: object) => void) => {
    model.asked.push(`${source}>${target}`);
    heard?.({ fetched: 0.4 });
    heard?.({ done: 0, of: 1 });
    return `[nllb ${source}→${target}] ${text.length} letters`;
  },
}));

const GERMAN = 'Der Fluss ist über Nacht um drei Meter gestiegen, und die Brücke an der alten Mühle ist gesperrt.';
const ENGLISH = 'The river rose three metres overnight and the bridge at the old mill is closed.';
const SWAHILI = 'Mto umefurika usiku na daraja la kinu cha zamani limefungwa kwa sababu ya maji mengi sana.';

/** A stand-in for the browser's translator: German, Hindi and Ukrainian to English, a pack fetched first. */
function browserWithTranslator() {
  const fetched = new Set<string>();
  (globalThis as { Translator?: unknown }).Translator = {
    availability: async ({ sourceLanguage, targetLanguage }: { sourceLanguage: string; targetLanguage: string }) => {
      if (sourceLanguage === 'sw' || targetLanguage === 'sw') return 'unavailable';
      return fetched.has(`${sourceLanguage}>${targetLanguage}`) ? 'available' : 'downloadable';
    },
    create: async ({ sourceLanguage, targetLanguage, monitor }: { sourceLanguage: string; targetLanguage: string; monitor?: (m: EventTarget) => void }) => {
      const m = new EventTarget();
      monitor?.(m);
      for (const loaded of [0.5, 1]) m.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded }));
      fetched.add(`${sourceLanguage}>${targetLanguage}`);
      return { translate: async (text: string) => `[${sourceLanguage}→${targetLanguage}] ${text.length} letters` };
    },
  };
}

beforeEach(() => { browserWithTranslator(); model.runs = false; model.kept = false; model.asked = []; });
afterEach(async () => { delete (globalThis as { Translator?: unknown }).Translator; keepCloudKey(null); vi.restoreAllMocks(); await setLanguage('en', false); });

describe('Translatable', () => {
  it('offers nothing for words already in the language shown, or in a browser with no translator', async () => {
    const { container, unmount } = render(<Translatable text={ENGLISH} />);
    await Promise.resolve();
    expect(container.textContent).toBe('');
    unmount();
    delete (globalThis as { Translator?: unknown }).Translator;
    const again = render(<Translatable text={GERMAN} />);
    expect(again.container.textContent).toBe('');
  });

  it('translates German into English at a click, the original untouched, the translation marked as the browser\'s', async () => {
    render(<Translatable text={GERMAN} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Translate into English' }));
    // The pack is fetched first, and said to be: the browser's translator for German.
    expect((await screen.findByRole('status')).textContent).toMatch(/^Your browser is fetching its translator for German: \d+%$|^Translating on this device…$/);
    const done = await screen.findByTestId('translatable-done');
    expect(done.textContent).toContain('Machine translation from German, by your browser on this device. The original is above.');
    expect(done.textContent).toContain(`[de→en] ${GERMAN.length} letters`);
  });

  it('says plainly when neither the browser nor Starcom\'s translator can read the language', async () => {
    render(<Translatable text={SWAHILI} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Translate into English' }));
    expect((await screen.findByRole('status')).textContent).toBe('Neither your browser nor Starcom\'s translator can read Swahili here.');
  });

  it('offers Starcom\'s own translator where the browser cannot, says what it costs and where it comes from, and marks its work (T2)', async () => {
    model.runs = true;
    render(<Translatable text={SWAHILI} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Translate into English' }));
    const offer = await screen.findByTestId('translatable-offer');
    expect(offer.textContent).toContain('Your browser cannot translate Swahili into English on this device.');
    expect(offer.textContent).toContain('about 900 MB, fetched once from Hugging Face, which sees the download but never your words');
    expect(model.asked).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Fetch it and translate' }));
    const done = await screen.findByTestId('translatable-done');
    expect(model.asked).toEqual(['sw>en']);
    expect(done.textContent).toContain('Machine translation from Swahili by NLLB-200 (Meta, CC BY-NC 4.0), a research model, on this device.');
  });

  it('offers the cloud on the person\'s key for Public content only, and marks the provider\'s work (T3)', async () => {
    keepCloudKey({ provider: 'azure', key: 'k1' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{ translations: [{ text: 'The river rose.' }] }]), { status: 200 }));
    // Not Public: never offered, whatever key is kept.
    const { unmount } = render(<Translatable text={SWAHILI} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Translate into English' }));
    expect((await screen.findByRole('status')).textContent).toBe('Neither your browser nor Starcom\'s translator can read Swahili here.');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    unmount();
    // Public: offered, said to go to Azure with the key, and marked as Azure's.
    render(<Translatable text={SWAHILI} publicContent />);
    fireEvent.click(await screen.findByRole('button', { name: 'Translate into English' }));
    expect((await screen.findByTestId('translatable-offer')).textContent).toContain('Sent to Microsoft Azure Translator with your key, as you chose in Settings. Only Public content ever is.');
    fireEvent.click(screen.getByRole('button', { name: 'Translate with Microsoft Azure Translator' }));
    const done = await screen.findByTestId('translatable-done');
    expect(done.textContent).toContain('Machine translation from Swahili by Microsoft Azure Translator, with your key.');
    expect(done.textContent).toContain('The river rose.');
  });

  it('uses Starcom\'s translator at once when it is kept here, and in a browser with no translator of its own', async () => {
    model.runs = true;
    model.kept = true;
    delete (globalThis as { Translator?: unknown }).Translator;
    render(<Translatable text={GERMAN} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Translate into English' }));
    expect((await screen.findByTestId('translatable-done')).textContent).toContain('[nllb de→en]');
  });

  it('asks which language the words are in when it cannot tell, and reads it in the language shown', async () => {
    await setLanguage('uk', false);
    render(<Translatable text={'Wij zagen 40 vrachtwagens, 12 bussen en 3 tractoren bij de grens tussen 06:00 en 09:00 uur.'} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Перекласти мовою: українська' }));
    const choose = await screen.findByTestId('translatable-source');
    fireEvent.change(choose, { target: { value: 'nl' } });
    fireEvent.click(screen.getByRole('button', { name: 'Перекласти' }));
    expect((await screen.findByTestId('translatable-done')).textContent).toContain('[nl→uk]');
  });
});

describe('Translatable, told the language its words are in', () => {
  it('offers nothing to a reader in that language, however short the words', () => {
    render(<Translatable text="Chinese report on frontier AI" sourceLanguage="en" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers it to a reader in another, and translates from it without asking which', async () => {
    await setLanguage('de', false);
    render(<Translatable text="Chinese report on frontier AI" sourceLanguage="en" />);
    fireEvent.click(await screen.findByRole('button'));
    expect(await screen.findByText(/\[en→de\]/)).toBeTruthy();
  });
});
