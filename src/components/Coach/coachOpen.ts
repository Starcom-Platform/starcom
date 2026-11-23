/**
 * Starts and stops the coach (plan item 6.1), from the pipeline guide or the
 * command box. Whether it is on is kept in this browser, so it follows the
 * person across screens and reloads until they stop it or finish.
 */
const KEY = 'starcom.coach.on';
const listeners = new Set<(on: boolean) => void>();

export function coachIsOn(): boolean {
  try { return globalThis.localStorage?.getItem(KEY) === 'true'; } catch { return false; }
}

function set(on: boolean): void {
  try { globalThis.localStorage?.setItem(KEY, String(on)); } catch { /* on for this page only */ }
  listeners.forEach((l) => l(on));
}

export const startCoach = (): void => set(true);
export const stopCoach = (): void => set(false);

export function onCoach(listener: (on: boolean) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
