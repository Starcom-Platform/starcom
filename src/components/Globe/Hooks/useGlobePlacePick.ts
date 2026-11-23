import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { placePick } from '../../../services/intel/place/placePick';
import { isGlobeClick, isPrimaryButton, type PointerAt } from '../globeClick';

/**
 * The globe's half of picking a report's place (plan item 3.5, story S6): the
 * report form asks, and the next click on the globe gives the point, the way
 * Measure Distance takes its second point. A drag still turns the globe to find
 * the place, a click beside the globe keeps waiting, and Esc (or the hint's
 * button) goes back to the form without one.
 *
 * While it waits no other layer picks (see pressOn), so the click that gives the
 * place does not also open a country's or a cable's panel over the form.
 */
export function useGlobePlacePick({ canvas, locate, onPick, onCancel }: {
  canvas: () => Element | null | undefined;
  /** The point on the globe under a screen position, or null off it. */
  locate: (clientX: number, clientY: number) => { lat: number; lng: number } | null;
  onPick: (lat: number, lng: number) => void;
  onCancel: () => void;
}): { pending: boolean; cancel: () => void } {
  const pending = useSyncExternalStore(placePick.subscribe, placePick.isPending);
  const latest = useRef({ canvas, locate, onPick, onCancel });
  latest.current = { canvas, locate, onPick, onCancel };

  const cancel = useCallback(() => {
    placePick.cancel();
    latest.current.onCancel();
  }, []);

  useEffect(() => {
    if (!pending) return;
    let pressedAt: PointerAt | null = null;

    // Not pressOn: that stands every layer down while a place is picked, this one included.
    const onPointerDown = (e: PointerEvent) => {
      pressedAt = e.target === latest.current.canvas() && isPrimaryButton(e) ? { x: e.clientX, y: e.clientY } : null;
    };
    const onPointerUp = (e: PointerEvent) => {
      const press = pressedAt;
      pressedAt = null;
      if (e.target !== latest.current.canvas() || !isGlobeClick(press, { x: e.clientX, y: e.clientY })) return;
      const at = latest.current.locate(e.clientX, e.clientY);
      if (!at) return;
      placePick.done();
      latest.current.onPick(at.lat, at.lng);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pending, cancel]);

  return { pending, cancel };
}
