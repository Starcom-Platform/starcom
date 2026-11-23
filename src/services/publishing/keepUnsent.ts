/**
 * Sends a reviewed event, and keeps it when no relay takes it (work package W1): the outbox sends it, exactly as
 * signed, when a relay answers. Not when every relay refused it for good (relayRefusal.ts), and not a Psi Watch
 * seal, since what it proves rests on reaching a relay before its window opens.
 */
import type { Event } from 'nostr-tools';
import { NoRelayTookIt, sendSignedEvent } from '../nostr/sendSigned';
import { refusedForGood } from '../nostr/relayRefusal';
import { eventOutbox } from '../intel/outbox/EventOutbox';
import type { KeptAfter } from '../intel/outbox/EventOutbox';

export type SentOrKept = { relays: number; event: Event; kept: false } | { relays: 0; event: Event; kept: true };

export async function sendOrKeep(
  template: { kind: number; tags: string[][]; content: string },
  relays: readonly string[],
  now: number,
  after?: KeptAfter,
): Promise<SentOrKept> {
  try {
    const sent = await sendSignedEvent(template, relays, now);
    return { ...sent, kept: false };
  } catch (error) {
    // Refused for good by every relay that answered: said now, with their reasons, rather than kept to fail again.
    if (!(error instanceof NoRelayTookIt) || refusedForGood(error.said)) throw error;
    await eventOutbox.keep(error.event, relays, after ? { after } : {});
    return { relays: 0, event: error.event, kept: true };
  }
}
