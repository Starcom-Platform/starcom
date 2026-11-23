import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Whether a row's labels fit its width (decision D-F, step 3.2).
 *
 * At 1280 wide the bottom bar needed 120 px more than it had and cut MarketExchange
 * to "Mark". Where the labels do not fit, its buttons show icons. Whether they fit is
 * measured with the labels showing: with them hidden the row is narrower, and a
 * measurement then would bring them straight back. So the width they need is kept
 * from the last time they showed, and they return once the row is that wide again.
 */
export function useLabelsFit(ref: RefObject<HTMLElement>): boolean {
  const [fits, setFits] = useState(true);
  const fitsNow = useRef(true);
  const needed = useRef(0);
  const check = useRef<() => void>(() => {});

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    check.current = () => {
      if (fitsNow.current) needed.current = el.scrollWidth;
      const next = el.clientWidth >= needed.current;
      if (next !== fitsNow.current) {
        fitsNow.current = next;
        setFits(next);
      }
    };
    const observer = new ResizeObserver(() => check.current());
    observer.observe(el);
    check.current();
    return () => observer.disconnect();
  }, [ref]);

  // Once the labels show again, measure what they need while they are showing.
  useEffect(() => {
    if (fits) check.current();
  }, [fits]);

  return fits;
}
