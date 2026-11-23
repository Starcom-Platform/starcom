/**
 * Starcom's own translator from the page's side (decision D-ML, T2, ML15): for what the browser cannot
 * translate (Swahili; Firefox; phones). The model lives in a worker, made only when first asked for, so
 * nothing of it is in the first visit. It is fetched once, at the person's choice, and kept by the browser.
 */
import { sourceAllowed } from '../../legal/buildProfile';
import { NLLB_MODEL, type FromModel, type ToModel } from './nllbProtocol';

/** NLLB-200's code for each language a person may read or write here, by its base tag. */
const CODES: Record<string, string> = {
  en: 'eng_Latn', de: 'deu_Latn', pt: 'por_Latn', sw: 'swh_Latn', hi: 'hin_Deva', uk: 'ukr_Cyrl', es: 'spa_Latn', fr: 'fra_Latn',
  it: 'ita_Latn', nl: 'nld_Latn', pl: 'pol_Latn', ru: 'rus_Cyrl', tr: 'tur_Latn', ar: 'arb_Arab', fa: 'pes_Arab', bn: 'ben_Beng',
  ur: 'urd_Arab', zh: 'zho_Hans', ja: 'jpn_Jpan', ko: 'kor_Hang', vi: 'vie_Latn', id: 'ind_Latn',
};

/** Whether Starcom's translator reads `source` and writes `target`, and this browser can run it. */
// NLLB-200 is CC BY-NC 4.0: a commercial build never offers it (D-CS, CS1, CS13).
export const modelTranslates = (source: string, target: string): boolean =>
  sourceAllowed('nllb') && source in CODES && target in CODES && typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';

/** Where the browser keeps what transformers.js fetched, and the largest file of the model. */
const CACHE = 'transformers-cache';
const ENCODER = `https://huggingface.co/${NLLB_MODEL}/resolve/main/onnx/encoder_model_quantized.onnx`;

/** Whether the model is kept here already, so nothing need be fetched. */
export async function modelKept(): Promise<boolean> {
  try {
    return Boolean(await (await caches.open(CACHE)).match(ENCODER));
  } catch {
    return false;
  }
}

/** The text's sentences, paragraph by paragraph: the model reads at most 512 tokens at a time. */
export function sentencesOf(text: string, lang: string): string[][] {
  const segmenter = new Intl.Segmenter(lang, { granularity: 'sentence' });
  return text.split(/\n+/).map((p) => p.trim()).filter(Boolean)
    .map((p) => [...segmenter.segment(p)].map((s) => s.segment.trim()).filter(Boolean));
}

export interface ModelProgress {
  /** Fetching the model: the share of it come so far, from 0 to 1. */
  fetched?: number;
  /** Translating: how many sentences are done, of how many. */
  done?: number;
  of?: number;
}

let worker: Worker | null = null;
let nextId = 1;

const theWorker = (): Worker => {
  worker ??= new Worker(new URL('./nllb.worker.ts', import.meta.url), { type: 'module' });
  return worker;
};

/** The text in `target`, by Starcom's own translator, its paragraphs kept; `heard` hears the progress. */
export function translateWithModel(text: string, source: string, target: string, heard?: (p: ModelProgress) => void): Promise<string> {
  const paragraphs = sentencesOf(text, source);
  const sentences = paragraphs.flat();
  const id = nextId++;
  const w = theWorker();
  return new Promise((resolve, reject) => {
    const listen = ({ data }: MessageEvent<FromModel>) => {
      if (data.kind === 'fetching') heard?.({ fetched: data.total ? data.loaded / data.total : 0 });
      else if (data.kind === 'working' && data.id === id) heard?.({ done: data.done, of: data.of });
      else if (data.kind === 'translated' && data.id === id) {
        w.removeEventListener('message', listen);
        let at = 0;
        resolve(paragraphs.map((p) => data.sentences.slice(at, (at += p.length)).join(' ')).join('\n\n'));
      } else if (data.kind === 'failed' && (data.id === id || data.id === undefined)) {
        w.removeEventListener('message', listen);
        reject(new Error(data.reason));
      }
    };
    w.addEventListener('message', listen);
    const ask: ToModel = { kind: 'translate', id, sentences, source: CODES[source], target: CODES[target] };
    w.postMessage(ask);
  });
}
