/**
 * Sends a reviewed bundle over relays (plan item 2.4). Called only from the
 * publish review (guard-publish-review.mjs), after the person confirmed who
 * it goes to and where.
 *
 * Each part is sealed to each recipient and gift-wrapped (NIP-59), so a
 * relay holds only wraps signed by keys used once, each addressed to a
 * recipient: never who sent them, and never what is in them. A recipient is
 * reached when every part was taken by at least one relay.
 */
import type { SimplePool } from 'nostr-tools';
import { createRelayPool } from '../../nostr/relayPool';
import { sealAndWrap } from '../../nostr/giftWrap';
import { partsOf } from './bundleParts';
import type { BundleFile } from '../../exchange/bundle';

export interface SendResult {
  reached: string[];
  notReached: Array<{ pubkey: string; reason: string }>;
}

export async function sendBundle(file: BundleFile, recipients: string[], relays: string[], pool: SimplePool = createRelayPool()): Promise<SendResult> {
  const parts = partsOf(file);
  const result: SendResult = { reached: [], notReached: [] };
  for (const recipient of recipients) {
    try {
      for (const part of parts) {
        const wrap = await sealAndWrap(part, recipient);
        const answers = await Promise.allSettled(pool.publish(relays, wrap));
        if (!answers.some((a) => a.status === 'fulfilled')) {
          const said = answers.map((a) => (a.status === 'rejected' ? String(a.reason?.message ?? a.reason) : '')).filter(Boolean);
          throw new Error(said.length > 0 ? `No relay took it: ${said.join('; ')}` : 'No relay took it.');
        }
      }
      result.reached.push(recipient);
    } catch (e) {
      result.notReached.push({ pubkey: recipient, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}
