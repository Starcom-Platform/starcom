/**
 * Whether the share handle is in use: a card, a clip, a tour, or the moves between them (D-GV GV0.2).
 *
 * Mecha Jono's videos and cards are drawn through the handle, often on a slow renderer. There the borders' frame
 * budget stepped the level of detail down partway through a session, so a session's later cards drew coarser
 * borders than its first, and the share-session smoke saw a level's files fetched between two captures of one view.
 * While the handle is in use, and for a minute after its last call, nothing steps the detail down on its own.
 */

import { noteHandleCall } from './linkYield';

/** How long after the handle's last call a session still counts as in use. */
export const SHARE_ACTIVE_HOLD_MS = 60_000;

let running = 0;
let lastCallAt = -Infinity;

/** The handle was called. */
export function noteShareActivity(now = Date.now()): void {
  lastCallAt = now;
}

/** Run a capture, which counts as in use for as long as it runs. */
export async function whileSharing<T>(work: () => Promise<T>): Promise<T> {
  running += 1;
  noteShareActivity();
  try {
    return await work();
  } finally {
    running -= 1;
    noteShareActivity();
  }
}

/** Whether a capture is running, or the handle was called within the last minute. */
export function shareActive(now = Date.now()): boolean {
  return running > 0 || now - lastCallAt < SHARE_ACTIVE_HOLD_MS;
}

/** For tests. */
export function resetShareActivity(): void {
  running = 0;
  lastCallAt = -Infinity;
}

/**
 * The handle as installed: every method notes the call, and one that returns a promise counts as a capture until
 * it settles; a call that chooses the layer, the camera, the window or the featured report is the caller's, and a
 * page's link no longer applies that part (linkYield.ts). Its keys and values are otherwise the handle's own, so the
 * contract it publishes is unchanged.
 */
export function noticedWhenUsed<T extends object>(handle: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(handle)) {
    out[key] = typeof value === 'function'
      ? (...args: unknown[]) => {
        noteShareActivity();
        noteHandleCall(key);
        const result = (value as (...a: unknown[]) => unknown).apply(handle, args);
        return result instanceof Promise ? whileSharing(() => result) : result;
      }
      : value;
  }
  return out as T;
}

/** How long a card waits for its full-detail look to be drawn before it is made anyway, saying what it shows. */
export const FULL_DETAIL_WAIT_MS = 20_000;

/** One animation frame, or a short wait where there are none. */
const nextFrame = () => new Promise<void>((resolve) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
  else setTimeout(resolve, 16);
});

/**
 * Make a still card at full detail (the owner, 2026-10-24, "Cards full detail, clips governed"): the globe draws
 * its full step for the card, whatever auto measured, and the card waits until that look is drawn (a few frames, and
 * the clouds if they are meant to show), then the step goes back. A clip is never made this way. The card's caveats
 * still say what it shows, so a look that did not arrive in time is stated, not hidden.
 */
export async function drawnAtFullDetail<T>(
  work: () => Promise<T>,
  deps: { hold: () => () => void; settled: () => boolean; waitMs?: number },
): Promise<T> {
  const release = deps.hold();
  try {
    // The step's effects (atmosphere, hatching, pixel ratio) apply on the next renders.
    for (let i = 0; i < 3; i++) await nextFrame();
    const until = Date.now() + (deps.waitMs ?? FULL_DETAIL_WAIT_MS);
    while (!deps.settled() && Date.now() < until) await nextFrame();
    return await work();
  } finally {
    release();
  }
}
