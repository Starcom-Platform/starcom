import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Stop rendering the globe while nobody can see it.
 *
 * CyberCommandCenterManager imports the globe eagerly and keeps it mounted on
 * purpose — "not lazy loaded to keep it mounted" — so returning to it is
 * instant, the camera is where you left it, and the textures never re-upload.
 * That is the right call and this does not change it.
 *
 * What it changes is that staying MOUNTED also meant staying RENDERED.
 * three-render-objects' tick() draws unconditionally whenever the instance is
 * initialised; there is no dirty check, and react-globe.gl drives it every
 * animation frame. So a full-screen sphere — atmosphere shell, day/night
 * blend, 4096x2048 textures — was being shaded 60 times a second for the
 * whole session: while the operator read a case in IntelWeb, while the tab sat
 * in the background, while nothing on screen changed at all.
 *
 * The scene itself is small (5 draw calls, ~24k triangles), so this was never
 * a geometry cost. It is fill rate: millions of fragments per frame, most of
 * them identical to the frame before, because nothing here auto-rotates.
 *
 * Two signals, both conservative. Either one going quiet pauses; both must be
 * true to resume:
 *   - document.hidden        — the tab is not on screen
 *   - IntersectionObserver   — the container is display:none, zero-sized, or
 *                              scrolled out, which is what happens when
 *                              another application view takes the centre.
 *
 * Deliberately NOT idle-based. Pausing an idle-but-visible globe would freeze
 * animated markers and any in-flight camera transition, and "it stopped moving
 * while I was looking at it" is a far worse defect than the cost it saves.
 */
export function useGlobeRenderGate(
  globeRef: RefObject<unknown>,
  containerRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (typeof document === 'undefined' || !container) return;

    let onScreen = true;
    let paused = false;

    const apply = () => {
      const globe = globeRef.current as unknown as {
        pauseAnimation?: () => void;
        resumeAnimation?: () => void;
      } | null;
      // The ref is populated asynchronously by react-globe.gl; before then
      // there is nothing to pause and the next event will settle it.
      if (!globe?.pauseAnimation || !globe?.resumeAnimation) return;

      const shouldRender = onScreen && !document.hidden;
      if (shouldRender && paused) {
        globe.resumeAnimation();
        paused = false;
      } else if (!shouldRender && !paused) {
        globe.pauseAnimation();
        paused = true;
      }
    };

    const observer = new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting);
      apply();
    }, { threshold: 0 });
    observer.observe(container);

    document.addEventListener('visibilitychange', apply);
    apply();

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', apply);
      // Never leave it paused on unmount: a later mount would inherit a
      // stopped renderer and look like a dead globe.
      const globe = globeRef.current as unknown as { resumeAnimation?: () => void } | null;
      globe?.resumeAnimation?.();
    };
  }, [globeRef, containerRef]);
}
