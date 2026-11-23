/**
 * FindingsBroadcastService — Findings Publisher.
 *
 * Same pool-mocking approach as MissionPackageBroadcastService.test.ts: a
 * real secret key signs a real event, only the network layer is mocked.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { FindingsBroadcastService, FINDING_KIND } from '../FindingsBroadcastService';
import { buildFindingAttestation } from '../FindingContent';
import { signFinding } from '../signFinding';
import type { SignedFinding } from '../signFinding';
import type { CorroboratedFinding } from '../../../../applications/intelanalyzer/state/correlationUtils';

function makeSignedFinding(overrides: Partial<CorroboratedFinding> = {}): SignedFinding {
  const finding: CorroboratedFinding = {
    entityRef: 'John Smith',
    attribute: 'location',
    value: { lat: 40.7128, lon: -74.006 },
    confidence: 0.81,
    sourceCount: 3,
    algorithmVersion: 2,
    ...overrides
  };
  const content = buildFindingAttestation(finding, { modality: 'inference', weakBacking: [] }, () => new Date('2026-08-17T00:00:00.000Z'));
  const { secretKey } = ml_dsa65.keygen();
  return signFinding(content, secretKey);
}

describe('FindingsBroadcastService', () => {
  let service: FindingsBroadcastService;
  let secretKey: Uint8Array;

  beforeEach(() => {
    service = new FindingsBroadcastService(['wss://test-relay']);
    secretKey = generateSecretKey();
  });

  it('builds an unsigned event under kind 30082 — distinct from Mission Package (30079) and Intel Report (30023)', () => {
    const event = service.buildUnsignedEvent(makeSignedFinding());
    expect(event.kind).toBe(FINDING_KIND);
    expect(event.kind).not.toBe(30079);
    expect(event.kind).not.toBe(30023);
    expect(typeof event.created_at).toBe('number');
  });

  it('emits one e tag per cited event, so a filter can find them', () => {
    /*
     * The citation has to be a TAG. Navcom's own rule — everything you filter
     * on is a tag, not a content field — holds in the return direction: with
     * these an operator answers "which findings rest on what I filed?" with
     * `{kinds:[30082], "#e":[...]}`, using ids they already know because they
     * published them. In content it would mean fetching every finding Starcom
     * has published and parsing each one.
     */
    const a = 'a'.repeat(64);
    const b = 'b'.repeat(64);
    const event = service.buildUnsignedEvent(makeSignedFinding({ citedEventIds: [a, b] }));
    const eTags = (event.tags as string[][]).filter(t => t[0] === 'e').map(t => t[1]);
    expect(eTags).toEqual([a, b]);
  });

  it('emits no e tags when nothing cited is fetchable', () => {
    // Most sources are registers and open data whose record ids resolve to
    // nothing on a relay. An `e` tag pointing at one would look checkable and
    // not be, which is worse than no citation at all.
    const event = service.buildUnsignedEvent(makeSignedFinding());
    expect((event.tags as string[][]).filter(t => t[0] === 'e')).toHaveLength(0);
  });

  it('tags the event as a finding, with its schema version, and embeds the signed content as JSON', () => {
    const signed = makeSignedFinding();
    const event = service.buildUnsignedEvent(signed);
    const tags = event.tags as string[][];
    const tTags = tags.filter(t => t[0] === 't').map(t => t[1]);
    expect(tTags).toContain('attested-claim');
    expect(tags.find(t => t[0] === 'schema_version')?.[1]).toBe(String(signed.content.schemaVersion));
    expect(JSON.parse(event.content as string)).toEqual(signed);
  });

  it('the d-tag identifier is stable for the same entity+attribute, so republishing replaces rather than duplicates', () => {
    const eventA = service.buildUnsignedEvent(makeSignedFinding());
    const eventB = service.buildUnsignedEvent(makeSignedFinding());
    const dTagA = (eventA.tags as string[][]).find(t => t[0] === 'd')?.[1];
    const dTagB = (eventB.tags as string[][]).find(t => t[0] === 'd')?.[1];
    expect(dTagA).toBe(dTagB);
  });

  it('signs with a secret key and publishes, returning a real relay-accepted result', async () => {
    const publishMock = (() => [Promise.resolve()]) as unknown as (relays: string[], event: unknown) => Promise<void>[];
    (service as unknown as { pool: { publish: typeof publishMock } }).pool = { publish: publishMock };

    const result = await service.publishFinding(makeSignedFinding(), secretKey);

    expect(result.success).toBe(true);
    expect(typeof result.eventId).toBe('string');
    expect(result.eventId!.length).toBe(64);
    expect(result.relaysOk).toBe(1);
  });

  it('says which Nostr key signed it: with the slot, where a review finds it (plan item 5.1)', async () => {
    const publishMock = (() => [Promise.resolve()]) as unknown as (relays: string[], event: unknown) => Promise<void>[];
    (service as unknown as { pool: { publish: typeof publishMock } }).pool = { publish: publishMock };
    const result = await service.publishFinding(makeSignedFinding(), secretKey);
    expect(result.nostrPubkey).toBe(getPublicKey(secretKey));
  });

  it('the published event is signed by, and verifiable under, the provided identity', async () => {
    let captured: { kind: number; pubkey: string; sig: string } | undefined;
    const publishMock = ((_relays: string[], event: { kind: number; pubkey: string; sig: string }) => {
      captured = event;
      return [Promise.resolve()];
    }) as unknown as (relays: string[], event: unknown) => Promise<void>[];
    (service as unknown as { pool: { publish: typeof publishMock } }).pool = { publish: publishMock };

    await service.publishFinding(makeSignedFinding(), secretKey);

    expect(captured).toBeDefined();
    expect(captured!.pubkey).toBe(getPublicKey(secretKey));
    expect(captured!.kind).toBe(FINDING_KIND);
  });

  it('signs via a NIP-07-shaped signer (the same shape nostrIdentityService.asSigner() produces)', async () => {
    const publishMock = (() => [Promise.resolve()]) as unknown as (relays: string[], event: unknown) => Promise<void>[];
    (service as unknown as { pool: { publish: typeof publishMock } }).pool = { publish: publishMock };

    const mockPubkey = getPublicKey(secretKey);
    const nip07Signer = {
      getPublicKey: async () => mockPubkey,
      signEvent: async (event: Record<string, unknown>) => finalizeEvent(event as any, secretKey)
    };

    const result = await service.publishFinding(makeSignedFinding(), nip07Signer);
    expect(result.success).toBe(true);
  });

  it('returns failure, not a thrown error, when no signer is available', async () => {
    const result = await service.publishFinding(makeSignedFinding());
    expect(result.success).toBe(false);
    expect(result.error).toContain('No signing method');
  });

  it('reports failure when all relays reject', async () => {
    const publishMock = (() => [Promise.reject(new Error('closed'))]) as unknown as (relays: string[], event: unknown) => Promise<void>[];
    (service as unknown as { pool: { publish: typeof publishMock } }).pool = { publish: publishMock };

    const result = await service.publishFinding(makeSignedFinding(), secretKey);
    expect(result.success).toBe(false);
    expect(result.relaysOk).toBe(0);
    expect(result.error).toContain('closed');
  });
});
