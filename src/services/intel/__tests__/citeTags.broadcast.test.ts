/**
 * A report or package resting on observations cites each on the event that
 * publishes it, as rev 11 writes it: `["e", id, relay, "cites"]` (decision
 * D-MX: MX3, MX22). In the tags only: a package's manifest is unchanged.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { generateSecretKey, verifyEvent, type Event as NostrEvent } from 'nostr-tools';
import { NostrIntelBroadcastService } from '../NostrIntelBroadcastService';
import { MissionPackageBroadcastService } from '../MissionPackageBroadcastService';
import type { PackageManifest } from '../../exchange/types';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const RELAY = 'wss://relay.example';
const citesIn = (tags: unknown) => (tags as string[][]).filter((t) => t[0] === 'e' && t[3] === 'cites');

/** Stands in for the relay pool, keeping what it was asked to publish. */
const capture = (service: object): NostrEvent[] => {
  const sent: NostrEvent[] = [];
  (service as { pool: unknown }).pool = { publish: (_relays: string[], event: NostrEvent) => { sent.push(event); return [Promise.resolve()]; } };
  return sent;
};

const manifest: PackageManifest = {
  id: 'pkg-mission-1', name: 'Recon Mission', version: '0.1.0', description: 'Recon and extraction',
  createdAt: '2026-10-06T12:00:00.000Z', author: 'Kestrel', license: 'PROPRIETARY',
  reports: [{ id: 'mission-1', title: 'Recon Mission', checksum: 'abc123' }], intel: [], assets: [],
};

describe('an Intel Report event', () => {
  const base = { title: 'Seen at the anchor', ipfsCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi' };

  it('cites each observation the report rests on, the relay empty when none is known', () => {
    const event = new NostrIntelBroadcastService(['wss://test-relay']).buildUnsignedEvent({ ...base, cites: [{ eventId: A, relay: RELAY }, { eventId: B }] });
    expect(citesIn(event.tags)).toEqual([['e', A, RELAY, 'cites'], ['e', B, '', 'cites']]);
    expect(event.content as string).not.toContain(A);
  });

  it('cites nothing for a report that rests on nothing', () => {
    expect(citesIn(new NostrIntelBroadcastService(['wss://test-relay']).buildUnsignedEvent(base).tags)).toEqual([]);
  });

  it('sends the citations signed, in the event the relays receive', async () => {
    const service = new NostrIntelBroadcastService(['wss://test-relay']);
    const sent = capture(service);
    await service.publishIntelReport({ ...base, cites: [{ eventId: A, relay: RELAY }] }, generateSecretKey());
    expect(verifyEvent(sent[0])).toBe(true);
    expect(citesIn(sent[0].tags)).toEqual([['e', A, RELAY, 'cites']]);
  });
});

describe('a Mission Package event', () => {
  it('cites what it is given, in its tags, and carries the manifest as it was (MX22)', () => {
    const event = new MissionPackageBroadcastService(['wss://test-relay']).buildUnsignedEvent(manifest, [{ eventId: A, relay: RELAY }]);
    expect(citesIn(event.tags)).toEqual([['e', A, RELAY, 'cites']]);
    expect(JSON.parse(event.content as string)).toEqual(manifest);
  });

  it('cites nothing when it is given nothing', () => {
    expect(citesIn(new MissionPackageBroadcastService(['wss://test-relay']).buildUnsignedEvent(manifest).tags)).toEqual([]);
  });

  it('sends the citations signed, in the event the relays receive', async () => {
    const service = new MissionPackageBroadcastService(['wss://test-relay']);
    const sent = capture(service);
    await service.publishMissionPackage(manifest, generateSecretKey(), [{ eventId: B }]);
    expect(verifyEvent(sent[0])).toBe(true);
    expect(citesIn(sent[0].tags)).toEqual([['e', B, '', 'cites']]);
  });
});
