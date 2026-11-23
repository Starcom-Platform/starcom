/**
 * A reviewed delegation is signed as reviewed (plan item 0.1): the event handed
 * to the signer is the prepared event, unchanged, under the key it names.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nostrEventId } from '../../publishing/nostrEventId';

const signEvent = vi.fn(async (e: Record<string, unknown>) => ({ ...e, id: nostrEventId(e as never), sig: 'sig' }));
let signerKey = 'a'.repeat(64);
vi.mock('../../identity/NostrIdentityService', () => ({
  nostrIdentityService: {
    getPubkey: () => 'a'.repeat(64),
    signerPubkey: () => 'a'.repeat(64),
    refreshSigner: async () => 'a'.repeat(64),
    hasExtension: () => false,
    asSigner: () => ({ getPublicKey: async () => signerKey, signEvent }),
    ensureLocalIdentity: () => 'a'.repeat(64),
  },
}));
const publishCapabilityEvent = vi.fn(async () => 2);
vi.mock('../capability/capabilityDelegation', () => ({
  publishCapabilityEvent: (...a: unknown[]) => publishCapabilityEvent(...(a as [])),
  fetchGrantChain: vi.fn(async () => []),
}));
const putDelegation = vi.fn();
vi.mock('../capability/missionCapabilityStore', () => ({
  missionCapabilityStore: {
    get: () => [{ id: 'root-grant' }],
    putDelegation: (...a: unknown[]) => putDelegation(...a),
    delegations: () => [],
    removeDelegation: vi.fn(),
  },
}));

import { missionService } from '../MissionService';

const holder = 'b'.repeat(64);
const prepared = {
  missionId: 'm-1',
  holder,
  event: {
    kind: 30081,
    created_at: 1790400000,
    tags: [['d', `cap:mission:m-1:${holder}`], ['holder', holder]],
    content: '',
    pubkey: 'a'.repeat(64),
  },
  // Where the mission goes, decided when the grant was prepared (plan item 0.4).
  relays: ['wss://team.relay.example'],
};

describe('MissionService.publishPreparedDelegation', () => {
  beforeEach(() => {
    signEvent.mockClear();
    publishCapabilityEvent.mockClear();
    putDelegation.mockClear();
    signerKey = 'a'.repeat(64);
  });

  it('signs the prepared event unchanged, and records the grant it published', async () => {
    const result = await missionService.publishPreparedDelegation(prepared);

    expect(signEvent).toHaveBeenCalledWith(prepared.event);
    const grant = (publishCapabilityEvent.mock.calls[0] as unknown[])[0] as { id: string };
    expect(grant.id).toBe(nostrEventId(prepared.event));
    expect(putDelegation).toHaveBeenCalledWith('m-1', holder, [{ id: 'root-grant' }, grant]);
    expect(result).toEqual({ relaysOk: 2 });
  });

  it('sends the grant only where the mission goes, not to every mission relay', async () => {
    await missionService.publishPreparedDelegation(prepared);
    expect((publishCapabilityEvent.mock.calls[0] as unknown[])[1]).toEqual(['wss://team.relay.example']);
  });

  it('refuses when the signing key is not the one the review showed', async () => {
    signerKey = 'c'.repeat(64);

    await expect(missionService.publishPreparedDelegation(prepared)).rejects.toThrow(/signing key changed/);
    expect(signEvent).not.toHaveBeenCalled();
    expect(publishCapabilityEvent).not.toHaveBeenCalled();
  });
});
