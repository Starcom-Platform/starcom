/**
 * Opens the glossary, at a word or at its start (plan item 3.2). A "?" beside
 * a word, the header's command box and the coach all open it this way;
 * GlossaryRoot, mounted once in App, shows it.
 */
const openers = new Set<(termId: string | null) => void>();

export function openGlossary(termId: string | null = null): void {
  openers.forEach((open) => open(termId));
}

export function onOpenGlossary(open: (termId: string | null) => void): () => void {
  openers.add(open);
  return () => { openers.delete(open); };
}
