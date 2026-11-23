/**
 * Deletes you can take back (plan item 0.6, stories S14 and S23).
 *
 * A deleted case, mission, objective or report used to be gone the moment the
 * button was pressed, some behind a "cannot be undone" confirmation and some
 * behind nothing at all. Now each is held for ten seconds with Undo, and only
 * made final after that. Whoever deletes says how to put it back (undo) and
 * how to make it final (finalize, where a protected record's key is deleted).
 *
 * The screen that offers Undo reads what is held from here, so every delete
 * path gets the same bar without each screen building its own.
 */

/** How long a deletion can be taken back. */
export const UNDO_WINDOW_MS = 10_000;

export interface HeldDeletion {
  id: string;
  /** What was deleted, as the Undo bar names it: 'Case "Newark food banks"'. */
  label: string;
  /** When it becomes final, in milliseconds since the epoch. */
  heldUntil: number;
}

interface Entry extends HeldDeletion {
  undo: () => Promise<void>;
  finalize: () => Promise<void> | void;
  timer: ReturnType<typeof setTimeout>;
}

const held = new Map<string, Entry>();
const listeners = new Set<(held: HeldDeletion[]) => void>();
let nextId = 1;

const snapshot = (): HeldDeletion[] =>
  [...held.values()].map(({ id, label, heldUntil }) => ({ id, label, heldUntil }));

const notify = () => {
  const now = snapshot();
  for (const listener of listeners) listener(now);
};

/** Holds a deletion that has just happened; returns its id for Undo. */
export function holdDeletion(spec: {
  label: string;
  undo: () => Promise<void>;
  finalize: () => Promise<void> | void;
}): string {
  const id = `held-${nextId++}`;
  const timer = setTimeout(() => {
    const entry = held.get(id);
    if (!entry) return;
    held.delete(id);
    notify();
    void Promise.resolve(entry.finalize()).catch(() => { /* the deleter logs its own failure */ });
  }, UNDO_WINDOW_MS);
  held.set(id, { id, label: spec.label, heldUntil: Date.now() + UNDO_WINDOW_MS, undo: spec.undo, finalize: spec.finalize, timer });
  notify();
  return id;
}

/** Takes a held deletion back. False when it is no longer held: too late, or already undone. */
export async function undoDeletion(id: string): Promise<boolean> {
  const entry = held.get(id);
  if (!entry) return false;
  clearTimeout(entry.timer);
  held.delete(id);
  notify();
  await entry.undo();
  return true;
}

/** What is held now, oldest first. */
export function heldDeletions(): HeldDeletion[] {
  return snapshot();
}

export function subscribeHeldDeletions(listener: (held: HeldDeletion[]) => void): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => { listeners.delete(listener); };
}
