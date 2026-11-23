/**
 * Sending a roster item where its author chose (decision D-RS, RS14): signed to the public relays, signed to one
 * team's own relay, or sealed to each invitee by NIP-59, one wrap each. Called only from the publish review, after
 * the person says yes (rosterPosts.ts).
 */
import type { SimplePool } from 'nostr-tools';
import { createRelayPool } from '../nostr/relayPool';
import { sealAndWrap } from '../nostr/giftWrap';
import { nostrIdentityService } from '../identity/NostrIdentityService';

type Template = { kind: number; tags: string[][]; content: string };

async function publishTo(pool: Pick<SimplePool, 'publish'>, relays: string[], event: Parameters<SimplePool['publish']>[1]): Promise<number> {
  const answers = await Promise.allSettled(pool.publish(relays, event));
  const took = answers.filter((a) => a.status === 'fulfilled').length;
  if (took === 0) {
    const said = answers.map((a) => (a.status === 'rejected' ? String(a.reason?.message ?? a.reason) : '')).filter(Boolean);
    throw new Error(said.length > 0 ? `No relay took it: ${said.join('; ')}` : 'No relay took it.');
  }
  return took;
}

/** Signed, to these relays: the public ones, or a team's own. */
export async function sendSignedRoster(template: Template, relays: string[], now: number = Date.now(), pool: Pick<SimplePool, 'publish'> = createRelayPool()): Promise<{ relays: number }> {
  const signed = await nostrIdentityService.asSigner().signEvent({ ...template, created_at: Math.floor(now / 1000) });
  return { relays: await publishTo(pool, relays, signed as Parameters<SimplePool['publish']>[1]) };
}

/** Sealed to each invitee, one wrap each, to these relays. Counts the relays that took every wrap's first. */
export async function sendSealedRoster(template: Template, recipients: readonly string[], relays: string[], now: number = Date.now(), pool: Pick<SimplePool, 'publish'> = createRelayPool()): Promise<{ relays: number; to: number }> {
  let took = 0;
  for (const recipient of recipients) {
    const wrap = await sealAndWrap(template, recipient, Math.floor(now / 1000));
    took = Math.max(took, await publishTo(pool, relays, wrap));
  }
  return { relays: took, to: recipients.length };
}
