/**
 * useGlobeNavHint — the "drag to pan, scroll to zoom" hint shown until the
 * user's first interaction, or a timeout, whichever comes first.
 *
 * Extracted verbatim from Globe.tsx (~1899-1917) as the first cut of pulling
 * that file apart: no Three.js contact, no service contact, the smallest
 * possible instance of "state Globe.tsx owns that isn't actually about the
 * globe." Exists mainly to prove the extraction pattern for this specific
 * file before anything bigger — Globe.tsx itself has no direct test coverage,
 * so establishing that a piece can be pulled out, tested, and wired back in
 * without changing behavior matters more here than the ~19 lines it saves.
 *
 * Deliberately never a persistent nag: dismissed by the first pointerdown or
 * wheel event on the globe's own container, or after 8 seconds, whichever
 * comes first.
 */
import { useEffect, useState, RefObject } from 'react';

export interface UseGlobeNavHintResult {
  /** Whether the hint should currently be rendered. */
  showNavHint: boolean;
}

const DISMISS_TIMEOUT_MS = 8000;

export const useGlobeNavHint = (containerRef: RefObject<HTMLDivElement | null>): UseGlobeNavHintResult => {
  const [showNavHint, setShowNavHint] = useState(true);

  useEffect(() => {
    if (!showNavHint || !containerRef.current) return;
    const container = containerRef.current;

    const dismiss = () => setShowNavHint(false);
    const timer = setTimeout(dismiss, DISMISS_TIMEOUT_MS);

    container.addEventListener('pointerdown', dismiss, { once: true });
    container.addEventListener('wheel', dismiss, { once: true, passive: true });

    return () => {
      clearTimeout(timer);
      container.removeEventListener('pointerdown', dismiss);
      container.removeEventListener('wheel', dismiss);
    };
  }, [showNavHint, containerRef]);

  return { showNavHint };
};

export default useGlobeNavHint;
