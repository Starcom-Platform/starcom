/**
 * Starcom's own translator, NLLB-200, off the page's thread (decision D-ML, T2, ML15). Its weights come from
 * Hugging Face once, at the person's choice (ML13), and are kept by the browser; ONNX Runtime's WebAssembly
 * is Starcom's own file, because the page's policy runs scripts from Starcom alone. Text arrives sentence
 * by sentence, within the model's 512-token limit, and nothing leaves the device.
 */
import { env, pipeline } from '@huggingface/transformers';
import ortWasm from '@ort-dist/ort-wasm-simd-threaded.jsep.wasm?url';
import ortMjs from '@ort-dist/ort-wasm-simd-threaded.jsep.mjs?url';
import { NLLB_MODEL, type ToModel, type FromModel } from './nllbProtocol';

env.allowLocalModels = false;
if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = { wasm: ortWasm, mjs: ortMjs };

const scope = self as unknown as { postMessage(message: FromModel): void; onmessage: ((e: MessageEvent<ToModel>) => void) | null };

type Translate = (text: string, options: { src_lang: string; tgt_lang: string; max_new_tokens: number }) => Promise<Array<{ translation_text: string }>>;
let loading: Promise<Translate> | null = null;

/** The model, loaded once: each file's progress summed into one share of the whole. */
function load(): Promise<Translate> {
  const files = new Map<string, { loaded: number; total: number }>();
  loading ??= pipeline('translation', NLLB_MODEL, {
    dtype: 'q8',
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== 'progress' || !p.file || !p.total) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
      let loaded = 0, total = 0;
      for (const f of files.values()) { loaded += f.loaded; total += f.total; }
      scope.postMessage({ kind: 'fetching', loaded, total });
    },
  }).then((made) => made as unknown as Translate);
  return loading;
}

scope.onmessage = async ({ data }) => {
  try {
    const translate = await load();
    if (data.kind === 'load') { scope.postMessage({ kind: 'ready' }); return; }
    const out: string[] = [];
    for (const [i, sentence] of data.sentences.entries()) {
      scope.postMessage({ kind: 'working', id: data.id, done: i, of: data.sentences.length });
      const [said] = await translate(sentence, { src_lang: data.source, tgt_lang: data.target, max_new_tokens: 400 });
      out.push(said.translation_text);
    }
    scope.postMessage({ kind: 'translated', id: data.id, sentences: out });
  } catch (e) {
    loading = null;
    scope.postMessage({ kind: 'failed', id: data.kind === 'translate' ? data.id : undefined, reason: e instanceof Error ? e.message : String(e) });
  }
};
