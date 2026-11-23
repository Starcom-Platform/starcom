import { relayReach } from '../nostr/publishTargets';
import type { Destination } from './publishReview';

/**
 * Relays as the publish review names them: Public, Internal or Local, by the
 * same rule every screen uses (relayReach). Internal only when the operator
 * declared the relay (plan item 0.3).
 */
export function destinationsFor(relays: readonly string[]): Destination[] {
  return relays.map((address) => ({ address, kind: relayReach(address) }));
}
