import { useSyncExternalStore } from 'react';

/**
 * A phone's window (K2): the width the bar takes its five buttons, the header
 * folds to the mark, and the Globe's corners start folded (BD6). The CSS that
 * goes with it uses the same width.
 */
export const PHONE_QUERY = '(max-width: 600px)';

const query = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(PHONE_QUERY) : null);

const subscribe = (onChange: () => void) => {
  const mql = query();
  mql?.addEventListener?.('change', onChange);
  return () => mql?.removeEventListener?.('change', onChange);
};

/** Whether the window is a phone's, following it as it changes. */
export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, () => query()?.matches ?? false, () => false);
}
