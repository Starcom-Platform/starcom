/**
 * Sending a reviewed RLSH card, or its deletion, signed by the card's contact key (D-RF, RF1). Called only from the
 * publish review, after the person says yes (publishing/rlshCards.ts).
 */
import type { Event, SimplePool } from 'nostr-tools';
import { createRelayPool } from '../nostr/relayPool';
import { signWithContactKey } from './contactKey';

export async function sendRlshCard(
  template: { kind: number; tags: string[][]; content: string },
  relays: readonly string[],
  now: number = Date.now(),
  pool: Pick<SimplePool, 'publish'> = createRelayPool(),
): Promise<{ relays: number; event: Event }> {
  const event = signWithContactKey(template, now);
  const answers = await Promise.allSettled(pool.publish([...relays], event));
  const took = answers.filter((a) => a.status === 'fulfilled').length;
  if (took === 0) {
    const said = answers.map((a) => (a.status === 'rejected' ? String(a.reason?.message ?? a.reason) : '')).filter(Boolean);
    throw new Error(said.length > 0 ? `No relay took it: ${said.join('; ')}` : 'No relay took it.');
  }
  return { relays: took, event };
}
