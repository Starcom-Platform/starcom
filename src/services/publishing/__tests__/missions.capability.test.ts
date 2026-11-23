/**
 * Delegating or withdrawing dispatch through the publish review (plan item 0.1).
 * The review shows the event as it will be signed; its fingerprint is that
 * event's NIP-01 id; a yes sends exactly the reviewed event.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { currentReview, decideReview } from '../publishReview';
import { nostrEventId } from '../nostrEventId';

const svc = vi.hoisted(() => ({
  prepareDelegation: vi.fn(),
  publishPreparedDelegation: vi.fn(),
  prepareRevocation: vi.fn(),
  publishPreparedRevocation: vi.fn(),
  getMission: vi.fn(async () => ({ title: 'Newark food banks' })),
}));
vi.mock('../../intel/MissionService', () => ({ missionService: svc }));

import { reviewDelegation, reviewRevocation } from '../missions';

const holder = 'b'.repeat(64);
const prepared = (content = '') => ({
  missionId: 'm-1',
  holder,
  event: {
    kind: 30081,
    created_at: 1790400000,
    tags: [['d', `cap:mission:m-1:${holder}`], ['resource', 'mission:m-1'], ['action', 'dispatch'], ['holder', holder], ['parent', 'p-1']],
    content,
    pubkey: 'a'.repeat(64),
  },
  // Where the mission goes (plan item 0.4): the review shows exactly these.
  relays: ['wss://team.relay.example'],
});

async function answer(confirmed: boolean) {
  await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
  const shown = currentReview()!;
  // The first publish from a key must carry the publisher acknowledgement.
  decideReview(shown.id, confirmed, { acknowledged: true });
  return shown;
}

describe('delegation and withdrawal reviews', () => {
  beforeEach(() => Object.values(svc).forEach((f) => f.mockClear()));
  afterEach(async () => {
    for (let i = 0; i < 50 && currentReview(); i++) {
      decideReview(currentReview()!.id, false);
      await new Promise((r) => setTimeout(r, 0));
    }
  });

  it('shows the grant, fingerprints it by its event id, and sends exactly it', async () => {
    svc.prepareDelegation.mockResolvedValue(prepared());
    svc.publishPreparedDelegation.mockResolvedValue({ relaysOk: 3 });

    const outcome = reviewDelegation('m-1', holder);
    const shown = await answer(true);

    expect(shown.act).toBe('Publish delegation');
    expect(shown.content.title).toContain('dispatch "Newark food banks"');
    expect(shown.digest).toBe(nostrEventId(prepared().event));
    expect(shown.destinations.map((d) => d.address)).toEqual(['wss://team.relay.example']);
    expect(await outcome).toEqual({ status: 'sent', result: { relaysOk: 3 } });
    expect(svc.publishPreparedDelegation).toHaveBeenCalledWith(prepared());
  });

  it('shows a withdrawal with its reason, and sends nothing on cancel', async () => {
    svc.prepareRevocation.mockResolvedValue(prepared('They moved to another team.'));

    const outcome = reviewRevocation('m-1', holder, 'They moved to another team.');
    const shown = await answer(false);

    expect(shown.act).toBe('Publish withdrawal');
    expect(shown.content.body).toContain('They moved to another team.');
    expect((await outcome).status).toBe('cancelled');
    expect(svc.publishPreparedRevocation).not.toHaveBeenCalled();
  });
});
