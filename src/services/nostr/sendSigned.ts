/**
 * Sends one reviewed event, signed by the person, to these relays (the owner's MX32): their inbox list, a label on
 * a report sealed to them, or a Psi Watch call's seal or reveal (D-PW, PW72); and a report, or its withdrawal
 * (D-RP). Called only from the publish review (guard-publish-review.mjs), after a yes.
 *
 * When no relay takes it, the error carries the event as signed, so a caller that keeps what did not go
 * (src/services/publishing/keepUnsent.ts, work package W1) can hold exactly that event and send it later, with no
 * second signature and no second question.
 */
import type { Event, SimplePool } from 'nostr-tools';
import { createRelayPool } from './relayPool';
import { nostrIdentityService } from '../identity/NostrIdentityService';

/** No relay took a signed event; `event` is what was signed, unchanged. */
export class NoRelayTookIt extends Error {
  /** What each relay that answered said, as it said it. */
  constructor(readonly event: Event, readonly said: readonly string[]) {
    super(said.length > 0 ? `No relay took it: ${said.join('; ')}` : 'No relay took it.');
    this.name = 'NoRelayTookIt';
  }
}

/** Offers an event already signed to these relays; resolves with how many took it, and why the rest did not. */
async function offer(event: Event, relays: readonly string[], pool: Pick<SimplePool, 'publish'>): Promise<{ took: number; said: string[] }> {
  const answers = await Promise.allSettled(pool.publish([...relays], event));
  const took = answers.filter((a) => a.status === 'fulfilled').length;
  const said = answers.map((a) => (a.status === 'rejected' ? String(a.reason?.message ?? a.reason) : '')).filter(Boolean);
  return { took, said };
}

export async function sendSignedEvent(
  template: { kind: number; tags: string[][]; content: string },
  relays: readonly string[],
  now: number = Date.now(),
  pool: Pick<SimplePool, 'publish'> = createRelayPool(),
): Promise<{ relays: number; event: Event }> {
  const event = await nostrIdentityService.asSigner().signEvent({ ...template, created_at: Math.floor(now / 1000) }) as Event;
  const { took, said } = await offer(event, relays, pool);
  if (took === 0) throw new NoRelayTookIt(event, said);
  return { relays: took, event };
}

/**
 * Sends again an event signed and kept after its review, to the relays that review named (W1). Signs nothing:
 * what goes is exactly what the person was shown. Resolves with how many relays took it.
 */
export async function resendSigned(
  event: Event,
  relays: readonly string[],
  pool: Pick<SimplePool, 'publish'> = createRelayPool(),
): Promise<number> {
  const { took, said } = await offer(event, relays, pool);
  if (took === 0) throw new NoRelayTookIt(event, said);
  return took;
}
