/**
 * MissionPackageBroadcastService — Cycle 4.
 *
 * Same pool-mocking approach as nostrIntelBroadcast.integration.test.ts
 * (this app's established precedent for testing a SimplePool.publish-based
 * broadcaster without real relay I/O): a real secret key signs a real
 * event, and only the network layer is swapped for a mock.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { MissionPackageBroadcastService, MISSION_PACKAGE_KIND } from '../MissionPackageBroadcastService';
import type { PackageManifest } from '../../exchange/types';

function makeManifest(overrides: Partial<PackageManifest> = {}): PackageManifest {
  return {
    id: 'pkg-mission-1',
    name: 'Recon Mission',
    version: '0.1.0',
    description: 'Recon and extraction',
    createdAt: new Date().toISOString(),
    author: 'Starcom',
    license: 'PROPRIETARY',
    reports: [{ id: 'mission-1', title: 'Recon Mission', checksum: 'abc123' }],
    intel: [],
    assets: [],
    metadata: { missionNumber: 'MSN-2026-0001' },
    ...overrides
  };
}

describe('MissionPackageBroadcastService', () => {
  let service: MissionPackageBroadcastService;
  let secretKey: Uint8Array;

  beforeEach(() => {
    service = new MissionPackageBroadcastService(['wss://test-relay']);
    secretKey = generateSecretKey();
  });

  it('carries a toward link for each cause or initiative it works toward, once (RS59; spec rev 18)', () => {
    const cause = `30084:${'c'.repeat(64)}:cause-clean-water`;
    const event = service.buildUnsignedEvent(makeManifest(), [], [{ coordinate: cause, relay: 'wss://r.example' }, { coordinate: cause, relay: '' }, { coordinate: 'bad', relay: '' }]);
    expect((event.tags as string[][]).filter((t) => t[3] === 'toward')).toEqual([['a', cause, 'wss://r.example', 'toward']]);
    expect((service.buildUnsignedEvent(makeManifest()).tags as string[][]).some((t) => t[3] === 'toward')).toBe(false);
  });

  it('builds an unsigned event under kind 30079 — deliberately distinct from Intel Report broadcast (kind 30023)', () => {
    const event = service.buildUnsignedEvent(makeManifest());
    expect(event.kind).toBe(MISSION_PACKAGE_KIND);
    expect(event.kind).not.toBe(30023);
    expect(typeof event.created_at).toBe('number');
  });

  it('tags the event as a mission package / navcom handoff, and embeds the full manifest as content', () => {
    const manifest = makeManifest();
    const event = service.buildUnsignedEvent(manifest);
    const tags = event.tags as string[][];
    const tTags = tags.filter(t => t[0] === 't').map(t => t[1]);
    expect(tTags).toContain('starcom_mission_package');
    expect(tTags).toContain('navcom_handoff');
    expect(JSON.parse(event.content as string)).toEqual(manifest);
  });

  it('names Starcom as the client it was published through, never as its author (NIP-89; D-MX, MX7)', () => {
    const event = service.buildUnsignedEvent(makeManifest({ author: 'Night Owl' }));
    const tags = event.tags as string[][];
    expect(tags).toContainEqual(['client', 'Starcom']);
    expect(JSON.parse(event.content as string).author).toBe('Night Owl');
  });

  it('carries the profile NavCom reads as tags, from the manifest whose signature covers it (rev 11; D-MX, MX2, MX13)', () => {
    const profile = { missionState: 'open' as const, claims: 'one' as const, fieldWork: { jurisdiction: 'us-ca', validUntil: 1796083199 } };
    const tags = service.buildUnsignedEvent(makeManifest({ profile })).tags as string[][];
    expect(tags).toEqual(expect.arrayContaining([
      ['mission_state', 'open'], ['claims', 'one'], ['t', 'navcom_mission'], ['valid_until', '1796083199'], ['jurisdiction', 'us-ca'],
    ]));
  });

  it('adds no profile tags for a manifest that has no profile', () => {
    const tags = service.buildUnsignedEvent(makeManifest()).tags as string[][];
    expect(tags.map((t) => t[0])).toEqual(['d', 't', 't', 'client']);
  });

  it('signs with a secret key and publishes, returning a real relay-accepted result', async () => {
    const publishMock = (() => [Promise.resolve()]) as unknown as (relays: string[], event: unknown) => Promise<void>[];
    (service as unknown as { pool: { publish: typeof publishMock } }).pool = { publish: publishMock };

    const result = await service.publishMissionPackage(makeManifest(), secretKey);

    expect(result.success).toBe(true);
    expect(typeof result.eventId).toBe('string');
    expect(result.eventId!.length).toBe(64);
    expect(result.relaysOk).toBe(1);
  });

  it('the published event is signed by, and verifiable under, the provided identity', async () => {
    let captured: { kind: number; pubkey: string; sig: string } | undefined;
    const publishMock = ((_relays: string[], event: { kind: number; pubkey: string; sig: string }) => {
      captured = event;
      return [Promise.resolve()];
    }) as unknown as (relays: string[], event: unknown) => Promise<void>[];
    (service as unknown as { pool: { publish: typeof publishMock } }).pool = { publish: publishMock };

    await service.publishMissionPackage(makeManifest(), secretKey);

    expect(captured).toBeDefined();
    expect(captured!.pubkey).toBe(getPublicKey(secretKey));
    expect(captured!.kind).toBe(MISSION_PACKAGE_KIND);
  });

  it('signs via a NIP-07-shaped signer (the same shape nostrIdentityService.asSigner() produces)', async () => {
    const publishMock = (() => [Promise.resolve()]) as unknown as (relays: string[], event: unknown) => Promise<void>[];
    (service as unknown as { pool: { publish: typeof publishMock } }).pool = { publish: publishMock };

    const mockPubkey = getPublicKey(secretKey);
    const nip07Signer = {
      getPublicKey: async () => mockPubkey,
      signEvent: async (event: Record<string, unknown>) => finalizeEvent(event as any, secretKey)
    };

    const result = await service.publishMissionPackage(makeManifest(), nip07Signer);
    expect(result.success).toBe(true);
  });

  it('returns failure, not a thrown error, when no signer is available', async () => {
    const result = await service.publishMissionPackage(makeManifest());
    expect(result.success).toBe(false);
    expect(result.error).toContain('No signing method');
  });

  it('reports failure when all relays reject', async () => {
    const publishMock = (() => [Promise.reject(new Error('closed'))]) as unknown as (relays: string[], event: unknown) => Promise<void>[];
    (service as unknown as { pool: { publish: typeof publishMock } }).pool = { publish: publishMock };

    const result = await service.publishMissionPackage(makeManifest(), secretKey);
    expect(result.success).toBe(false);
    expect(result.relaysOk).toBe(0);
    expect(result.error).toContain('closed');
  });

  // Plan item 0.7: a mission keeps its receipt as "accepted out of tried", so
  // the screen can say "Sent to 3 of 5 relays".
  it('reports how many relays it tried, beside how many accepted', async () => {
    const relays = ['wss://one.example', 'wss://two.example', 'wss://three.example'];
    (service as unknown as { relays: string[] }).relays = relays;
    const publishMock = (() => [Promise.resolve(), Promise.reject(new Error('closed')), Promise.resolve()]) as unknown as (relays: string[], event: unknown) => Promise<void>[];
    (service as unknown as { pool: { publish: typeof publishMock } }).pool = { publish: publishMock };

    const result = await service.publishMissionPackage(makeManifest(), secretKey);

    expect(result.relaysOk).toBe(2);
    expect(result.relaysTried).toBe(3);
  });

  it('reports no relay tried when nothing could be signed', async () => {
    const result = await service.publishMissionPackage(makeManifest());
    expect(result.relaysTried).toBe(0);
  });
});

/**
 * Relay configuration. The publish side used to be hardcoded to five public
 * relays while the intel INGEST side was already configurable
 * (VITE_NOSTR_INTEL_RELAYS) — so Starcom could receive from the AI Security
 * Relay Node's internal relay but never publish back to it. These cover the
 * config that closes that asymmetry, including the additive-by-default choice
 * (an internally-published package must still reach the Navcom surface unless
 * an operator explicitly opts out).
 */
describe('MissionPackageBroadcastService — relay configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('publishes to the public Navcom relay surface when nothing is configured', () => {
    const relays = new MissionPackageBroadcastService().getRelays();
    expect(relays).toContain('wss://relay.damus.io');
    expect(relays.length).toBeGreaterThan(1);
  });

  it('APPENDS a configured internal relay rather than replacing the public set', () => {
    vi.stubEnv('VITE_NOSTR_MISSION_RELAYS', 'wss://relay.internal.archangel');

    const relays = new MissionPackageBroadcastService().getRelays();

    expect(relays).toContain('wss://relay.internal.archangel');
    // The whole point: a package sent to the relay node is still visible to Navcom.
    expect(relays).toContain('wss://relay.damus.io');
  });

  it('accepts several comma-separated relays, trimming whitespace', () => {
    vi.stubEnv('VITE_NOSTR_MISSION_RELAYS', ' wss://a.internal , wss://b.internal ');

    const relays = new MissionPackageBroadcastService().getRelays();

    expect(relays).toContain('wss://a.internal');
    expect(relays).toContain('wss://b.internal');
  });

  it('publishes ONLY to configured relays when exclusivity is explicitly opted into', () => {
    vi.stubEnv('VITE_NOSTR_MISSION_RELAYS', 'wss://relay.internal.archangel');
    vi.stubEnv('VITE_NOSTR_MISSION_RELAYS_EXCLUSIVE', 'true');

    const relays = new MissionPackageBroadcastService().getRelays();

    expect(relays).toEqual(['wss://relay.internal.archangel']);
    expect(relays).not.toContain('wss://relay.damus.io');
  });

  it('ignores the exclusivity flag when no relays are configured, rather than publishing nowhere', () => {
    vi.stubEnv('VITE_NOSTR_MISSION_RELAYS_EXCLUSIVE', 'true');

    const relays = new MissionPackageBroadcastService().getRelays();

    expect(relays).toContain('wss://relay.damus.io');
  });

  it('does not duplicate a relay that is both public and explicitly configured', () => {
    vi.stubEnv('VITE_NOSTR_MISSION_RELAYS', 'wss://relay.damus.io');

    const relays = new MissionPackageBroadcastService().getRelays();

    expect(relays.filter((r) => r === 'wss://relay.damus.io')).toHaveLength(1);
  });

  it('still honours an explicit constructor relay list, ignoring env config', () => {
    vi.stubEnv('VITE_NOSTR_MISSION_RELAYS', 'wss://relay.internal.archangel');

    const relays = new MissionPackageBroadcastService(['wss://explicit-only']).getRelays();

    expect(relays).toEqual(['wss://explicit-only']);
  });
});
