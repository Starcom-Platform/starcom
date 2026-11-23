/**
 * A review is published through the one publish review, like everything else
 * (plan items 0.1 and 5.1): shown as it will go, sent only on a yes.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Event } from 'nostr-tools';

const published = vi.hoisted(() => [] as Array<{ urls: string[]; event: Event }>);
vi.mock('../../nostr/relayPool', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../nostr/relayPool')>()),
  createRelayPool: () => ({
    publish: (urls: string[], event: Event) => { published.push({ urls, event }); return urls.map(() => Promise.resolve('ok')); },
    querySync: async () => [],
    close: () => {},
  }),
}));
vi.mock('../../nostr/publishTargets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../nostr/publishTargets')>()),
  whereItGoes: () => ({ relays: ['wss://internal.test'], refusal: null }),
}));

import { currentReview, decideReview } from '../publishReview';
import { reviewReview } from '../reviews';

const target = { kind: 30079, author: 'f'.repeat(64), coordinate: `30079:${'f'.repeat(64)}:pkg`, eventId: 'a'.repeat(64) };

async function answer(yes: boolean) {
  await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
  const shown = currentReview()!;
  decideReview(shown.id, yes, { acknowledged: true });
  return shown;
}

beforeEach(() => { published.length = 0; });

describe('publishing a review', () => {
  it('shows the verdict and what was checked, and sends exactly that on a yes', async () => {
    const outcome = reviewReview(target, 'Watch berth 4', { type: 'verdict', verdict: 'disputed', reasoning: 'Checked the berth camera.' }, 'limited');
    const shown = await answer(true);
    expect(JSON.stringify(shown)).toMatch(/Disputed/);
    expect(JSON.stringify(shown)).toMatch(/Checked the berth camera\./);
    const result = await outcome;
    expect(result.status).toBe('sent');
    expect(published).toHaveLength(1);
    expect(published[0].event.kind).toBe(1985);
  });

  it('sends nothing on a no', async () => {
    const outcome = reviewReview(target, 'Watch berth 4', { type: 'comment', text: 'Seen it.' }, 'limited');
    await answer(false);
    expect((await outcome).status).toBe('cancelled');
    expect(published).toHaveLength(0);
  });
});
