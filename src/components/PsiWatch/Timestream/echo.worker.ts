/// <reference lib="webworker" />
/**
 * Echoes' returns off the page's thread (decision D-PW, PW47, PW49): a fast kind's returns across the century of the
 * history take a second or so to find, too long to hold a frame.
 */
import { returnsOf } from '../../../services/psiWatch/timestream/echoReturns';
import type { PsiSkyEvent } from '../../../services/psiWatch/psiEvents';
import type { ZodiacFrame } from '../../../services/psiWatch/astro/frames';

export interface EchoJob { id: number; event: PsiSkyEvent; fromMs: number; untilMs: number; frame: ZodiacFrame }
export type EchoAnswer = { id: number; returns: number[] } | { id: number; error: string };

self.onmessage = (event: MessageEvent<EchoJob>) => {
  const { id, event: sky, fromMs, untilMs, frame } = event.data;
  try {
    (self as unknown as Worker).postMessage({ id, returns: returnsOf(sky, fromMs, untilMs, frame) } satisfies EchoAnswer);
  } catch (error) {
    (self as unknown as Worker).postMessage({ id, error: (error as Error).message } satisfies EchoAnswer);
  }
};
