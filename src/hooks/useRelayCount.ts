import { useEffect, useState } from 'react';
import { nostrStarcomIntelIngest } from '../services/intel/NostrStarcomIntelIngest';
import { readRelayCount, type RelayCount } from '../services/intel/relays/relayCount';

/**
 * The relay count (see readRelayCount), kept current on every change the
 * ingest reports, so every screen that shows it shows the same number at the
 * same moment (plan item 1.8).
 */
export function useRelayCount(): RelayCount {
  const [count, setCount] = useState<RelayCount>(readRelayCount);
  useEffect(() => {
    const update = () => setCount((prev) => {
      const next = readRelayCount();
      return prev.active === next.active && prev.connected === next.connected && prev.total === next.total ? prev : next;
    });
    update();
    return nostrStarcomIntelIngest.onChange(update);
  }, []);
  return count;
}
