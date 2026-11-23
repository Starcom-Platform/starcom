/**
 * The Zones, once something needs them: the layer, the panel, the hover or the
 * header's search. Fetched once per session (zsp.ts, loadZones), so every caller
 * shares one copy.
 */
import { useEffect, useState } from 'react';
import { loadZones, type ZoneIndex } from '../../../geopolitical/zones/zsp';
import { messagesNow } from '../../../i18n/app/i18n';

export interface ZoneIndexState {
  index: ZoneIndex | null;
  /** Said when the Zones could not be read, so a caller never draws an empty layer as if there were none. */
  error: string | null;
}

export function useZoneIndex(wanted: boolean): ZoneIndexState {
  const [state, setState] = useState<ZoneIndexState>({ index: null, error: null });
  useEffect(() => {
    if (!wanted || state.index) return;
    let alive = true;
    void loadZones().then((index) => {
      if (alive) setState(index ? { index, error: null } : { index: null, error: messagesNow().zones.error });
    });
    return () => { alive = false; };
  }, [wanted, state.index]);
  return state;
}
