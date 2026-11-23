import { useEffect, useState } from 'react';
import { nostrStarcomIntelIngest, type NostrRelayState } from '../services/intel/NostrStarcomIntelIngest';

/** How often the time moves on for the lights, so one greys by itself (BD11). */
export const RELAY_HEALTH_TICK_MS = 10_000;

/**
 * The relays the Globe's lights and capacity gauge read (BD11, BD12): the
 * ingest's, read again whenever it says something changed, with the time read
 * again every ten seconds. Without the clock a light would stay green after
 * its relay went quiet, until something else happened to redraw it.
 */
export function useRelayHealth(): { relays: NostrRelayState[]; now: number } {
  const [relays, setRelays] = useState(() => nostrStarcomIntelIngest.getRelayStatus());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const read = () => { setRelays(nostrStarcomIntelIngest.getRelayStatus()); setNow(Date.now()); };
    const off = nostrStarcomIntelIngest.onChange(read);
    const tick = setInterval(() => setNow(Date.now()), RELAY_HEALTH_TICK_MS);
    return () => { off(); clearInterval(tick); };
  }, []);

  return { relays, now };
}
