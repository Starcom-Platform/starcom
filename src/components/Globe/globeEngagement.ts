/**
 * Whether the person has used the globe yet on this visit (decision D-F, step 3,
 * docs/missions/01-architecture-decisions/globe-visualization.md).
 *
 * A first visit sees the globe, with one thing over it at a time, so the support ask
 * opens only after the person has used the globe: moved it, or opened a report and
 * closed it again. The ask is mounted at the app root, above the globe, and cannot
 * read the globe's state through a context, so the globe says so here, the way
 * globeIntelLayerStore carries the analyzer's layer to the globe.
 *
 * It holds for the page load, which is the visit. A move made in code, like the turn
 * to the first reports, is not the person using the globe and is never marked.
 */

let engaged = false;
const listeners = new Set<() => void>();

/** The person has used the globe. Only the first time on a visit tells anyone. */
export function markGlobeEngaged(): void {
  if (engaged) return;
  engaged = true;
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // One listener failing is no reason to leave the others untold.
    }
  }
}

export function hasEngagedWithGlobe(): boolean {
  return engaged;
}

/** Called once, when the person first uses the globe. Returns the way to stop listening. */
export function onGlobeEngaged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetGlobeEngagementForTests(): void {
  engaged = false;
  listeners.clear();
}
