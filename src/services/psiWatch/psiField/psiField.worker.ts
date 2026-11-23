/// <reference lib="webworker" />
/**
 * The ψ field off the page's thread (decision D-PW, PW78): a moment's field in some 40 ms, a new year's core line or an
 * eclipse's day in a few hundred more, too long to hold a frame while the cursor is dragged. The inputs come with the
 * first job and are kept; the answers' arrays are handed over, not copied.
 */
import { psiFieldAt, type PsiFieldAt, type PsiFieldInputs } from './field';

export interface PsiFieldJob { id: number; timeMs: number; year: number; inputs?: PsiFieldInputs }
export type PsiFieldAnswer = { id: number; field: PsiFieldAt } | { id: number; error: string };

let inputs: PsiFieldInputs | null = null;

self.onmessage = (event: MessageEvent<PsiFieldJob>) => {
  const { id, timeMs, year } = event.data;
  if (event.data.inputs) inputs = event.data.inputs;
  try {
    if (!inputs) throw new Error('The ψ field\'s inputs never came');
    const field = psiFieldAt(inputs, timeMs, year);
    (self as unknown as Worker).postMessage({ id, field } satisfies PsiFieldAnswer, [field.psi.buffer, field.calm.buffer, field.mean.buffer, field.calmMean.buffer, field.structure.buffer]);
  } catch (error) {
    (self as unknown as Worker).postMessage({ id, error: (error as Error).message } satisfies PsiFieldAnswer);
  }
};
