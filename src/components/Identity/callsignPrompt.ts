/**
 * Opens the callsign card (CallsignRoot) from anywhere: the "/callsign" command
 * and your key's panel. Kept apart from the component so that file exports a
 * component alone.
 */
const openers = new Set<() => void>();

/** Opens the card to set or change your callsign. */
export function openCallsignPrompt(): void {
  openers.forEach((open) => open());
}

/** The card listens here while it is mounted. */
export function onCallsignPromptOpened(open: () => void): () => void {
  openers.add(open);
  return () => { openers.delete(open); };
}
