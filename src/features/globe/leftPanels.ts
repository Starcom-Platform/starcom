/**
 * The panels docked on the left of the globe, one at a time (Story, RLSH, an event chart): each names how it closes,
 * and opening one closes the others, so they never stand over one another.
 */
const closers = new Map<string, () => void>();

/** Names a left panel and how it closes. */
export function registerLeftPanel(id: string, close: () => void): void {
  closers.set(id, close);
}

/** Said by a panel as it opens: every other left panel closes. */
export function openingLeftPanel(id: string): void {
  for (const [other, close] of closers) if (other !== id) close();
}
