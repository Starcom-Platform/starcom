/** What the page and Starcom's own translator say to each other (decision D-ML, T2). */

/** NLLB-200, distilled to 600M, as ONNX for the browser: Meta's model, CC BY-NC 4.0 (ML15). */
export const NLLB_MODEL = 'Xenova/nllb-200-distilled-600M';

export type ToModel =
  | { kind: 'load' }
  | { kind: 'translate'; id: number; sentences: string[]; source: string; target: string };

export type FromModel =
  | { kind: 'fetching'; loaded: number; total: number }
  | { kind: 'ready' }
  | { kind: 'working'; id: number; done: number; of: number }
  | { kind: 'translated'; id: number; sentences: string[] }
  | { kind: 'failed'; id?: number; reason: string };
