/**
 * Whether the pipeline guide is open over the globe (decision D-F, step 3,
 * docs/missions/01-architecture-decisions/globe-visualization.md).
 *
 * One thing opens over the globe at a time, so the support ask waits while the guide
 * is expanded. The guide is docked beside the globe and the ask is mounted at the app
 * root, above it, so the guide says so here rather than through a context.
 */

let open = false;
const listeners = new Set<() => void>();

export function setPipelineGuideOpen(value: boolean): void {
  open = value;
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // One listener failing is no reason to leave the others untold.
    }
  }
}

export function isPipelineGuideOpen(): boolean {
  return open;
}

/** Called whenever the guide opens or closes. Returns the way to stop listening. */
export function onPipelineGuideChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetPipelineGuideForTests(): void {
  open = false;
  listeners.clear();
}
