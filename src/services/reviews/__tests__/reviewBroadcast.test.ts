/**
 * Sending and reading reviews (plan item 5.1). A review goes only where its
 * distribution sends it, asked every time (decision D2); reading keeps only
 * events whose signature holds and that are about the item.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent, type Event, type Filter } from 'nostr-tools';

const relays = vi.hoisted(() => ({
  published: [] as Array<{ urls: string[]; event: Event }>,
  stored: [] as Event[],
  queried: [] as Array<{ urls: string[]; filter: Filter }>,
  channels: [] as string[],
}));
vi.mock('../../nostr/relayPool', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../nostr/relayPool')>()),
  createRelayPool: () => ({
    publish: (urls: string[], event: Event) => { relays.published.push({ urls, event }); return urls.map(() => Promise.resolve('ok')); },
    querySync: async (urls: string[], filter: Filter) => {
      relays.queried.push({ urls, filter });
      return relays.stored.filter((e) => filter.kinds!.includes(e.kind));
    },
    close: () => {},
  }),
}));
vi.mock('../../nostr/publishTargets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../nostr/publishTargets')>()),
  whereItGoes: (channel: string, visibility: string | undefined) => (relays.channels.push(`send:${channel}`), visibility === 'public')
    ? { relays: ['wss://public.test', 'wss://internal.test'], refusal: null }
    : visibility === 'limited' ? { relays: ['wss://internal.test'], refusal: null }
      : { relays: [], refusal: 'nowhere' },
  readRelays: (channel: string) => (relays.channels.push(`read:${channel}`), ['wss://public.test', 'wss://internal.test']),
}));

import { prepareReview, publishPreparedReview, fetchReviews } from '../reviewBroadcast';
import { commentTemplate, verdictTemplate, type ReviewTarget } from '../reviewEvents';

const itemKey = generateSecretKey();
const target: ReviewTarget = { kind: 30079, author: getPublicKey(itemKey), coordinate: `30079:${getPublicKey(itemKey)}:pkg`, eventId: 'a'.repeat(64) };

beforeEach(() => { relays.published.length = 0; relays.stored.length = 0; relays.queried.length = 0; relays.channels.length = 0; });

describe('sending a review', () => {
  it('goes only where its distribution sends it, signed by this browser\'s key', async () => {
    const limited = await prepareReview(target, { type: 'comment', text: 'Seen it.' }, 'limited');
    expect(limited.relays).toEqual(['wss://internal.test']);
    expect(limited.event.kind).toBe(1111);
    const sent = await publishPreparedReview(limited);
    expect(relays.published).toEqual([{ urls: ['wss://internal.test'], event: limited.event }]);
    expect(sent).toEqual({ relaysOk: 1, relaysTried: 1 });
  });

  it('asks who may receive it, and goes nowhere without an answer', async () => {
    await expect(prepareReview(target, { type: 'verdict', verdict: 'disputed', reasoning: '' }, undefined as never)).rejects.toThrow(/nowhere/);
  });
});

describe('reading reviews', () => {
  it('keeps only reviews of this item whose signature holds', async () => {
    const reviewer = generateSecretKey();
    const good = finalizeEvent(commentTemplate(target, 'Seen it.'), reviewer);
    const forged = { ...finalizeEvent(verdictTemplate(target, 'confirmed', 'Checked.'), reviewer), content: 'Changed after signing.' };
    const elsewhere = finalizeEvent(commentTemplate({ ...target, coordinate: `30079:${target.author}:other`, eventId: 'b'.repeat(64) }, 'Other.'), reviewer);
    relays.stored.push(good, forged, elsewhere);
    const reviews = await fetchReviews(target);
    expect(reviews.map((r) => r.id)).toEqual([good.id]);
    expect(relays.queried.every((q) => q.urls.includes('wss://internal.test'))).toBe(true);
  });
});

describe('which relays a review goes to', () => {
  it('sends and reads a review of a package on the mission relays, where replies to it are heard, and of anything else on the findings relays', async () => {
    await prepareReview(target, { type: 'comment', text: 'Seen it.' }, 'limited');
    await fetchReviews(target);
    const claim = { ...target, kind: 30082, coordinate: `30082:${target.author}:slot` };
    await prepareReview(claim, { type: 'comment', text: 'Seen it.' }, 'limited');
    await fetchReviews(claim);
    expect(relays.channels).toEqual(['send:MISSION', 'read:MISSION', 'send:FINDING', 'read:FINDING']);
  });
});
