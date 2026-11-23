import { nostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';

/**
 * How many of the relays the intel ingest reads from are connected: one count,
 * read one way, wherever it is shown (plan item 1.8). The top strip, its STATUS
 * panel, the globe's note and its Coverage panel each counted for themselves,
 * sampled at different moments and worded three ways: "2/6 UP", "2 of 6
 * relays connected", "relays answering: 2 of 6".
 */
export interface RelayCount {
  /** Whether the ingest has started at all. */
  active: boolean;
  connected: number;
  total: number;
}

export function readRelayCount(): RelayCount {
  const relays = nostrStarcomIntelIngest.getRelayStatus();
  return {
    active: nostrStarcomIntelIngest.isActive(),
    connected: relays.filter((relay) => relay.connected).length,
    total: relays.length,
  };
}
