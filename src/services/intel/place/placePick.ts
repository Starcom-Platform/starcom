/**
 * A report form waiting for its place to be picked on the globe (plan item
 * 3.5, story S6), and the report being written, kept while it waits.
 *
 * The form asks, and goes to the globe; the globe, while asked, takes the next
 * click as the place, as Measure Distance takes its second point, and hands it
 * back the way "Create Intel Report" does. Both halves live in this browser's
 * memory for the trip: nothing is stored, and a reload forgets the pick.
 */
let pending = false;
const listeners = new Set<() => void>();
const set = (next: boolean) => {
  if (pending === next) return;
  pending = next;
  listeners.forEach((listener) => listener());
};

export const placePick = {
  request(): void { set(true); },
  isPending(): boolean { return pending; },
  /** The place was picked. */
  done(): void { set(false); },
  /** The pick was given up. */
  cancel(): void { set(false); },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};

let draft: Record<string, unknown> | null = null;

/** The report being written, for one taking: the form that comes back takes it. */
export const reportDraft = {
  save(value: Record<string, unknown>): void { draft = { ...value }; },
  /** Looked at without taking, where a render may run twice. */
  peek(): Record<string, unknown> | null { return draft; },
  take(): Record<string, unknown> | null {
    const taken = draft;
    draft = null;
    return taken;
  },
};
