/**
 * A burst of notes, told once (the Raver Watch fix of 2026-10-18, b92277e4, for every reader of The Record). A relay
 * sends hundreds of notes in a few seconds, and telling listeners after each one rebuilt the whole list and redrew
 * React that many times, past its limit of nested updates. A reader marks what changed and asks for it to be told
 * `soon`, at most once each BURST_MS; `now` tells it at once, as when the relay has sent what it holds.
 */
export const BURST_MS = 100;

export interface Burst {
  /** Tell it within BURST_MS, once however often asked. */
  soon(): void;
  /** Tell it now, and drop what was waiting. */
  now(): void;
}

export function burst(tell: () => void, ms: number = BURST_MS): Burst {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const now = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    tell();
  };
  return {
    soon: () => { if (timer === null) timer = setTimeout(now, ms); },
    now,
  };
}
