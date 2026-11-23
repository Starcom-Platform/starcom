/**
 * One of the board's public-record feeds (decision D-BF), read once when the board opens. A feed that
 * does not answer says so in its own words; the others are unaffected.
 */
import { useEffect, useState } from 'react';

export interface BoardFeed<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/** Read when `load` changes: pass a module-level function, so it is read once a mount. */
export function useBoardFeed<T>(load: () => Promise<T>): BoardFeed<T> {
  const [state, setState] = useState<BoardFeed<T>>({ data: null, error: null, loading: true });
  useEffect(() => {
    let live = true;
    load().then(
      (data) => { if (live) setState({ data, error: null, loading: false }); },
      (error: unknown) => { if (live) setState({ data: null, error: error instanceof Error ? error.message : String(error), loading: false }); },
    );
    return () => { live = false; };
  }, [load]);
  return state;
}
