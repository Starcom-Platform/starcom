/**
 * The ingest's own job: dispatch verified packages to listeners, and account
 * for what it refused instead of dropping it silently.
 *
 * A receiver that quietly discards malformed packages cannot tell "nobody
 * sent anything" from "everything sent was wrong" — the same distinction the
 * intel ingest's DropReason set exists to preserve.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isAgentKey, resetAgentKeys } from '../../identity/agentKeys';
import { generateSecretKey, getPublicKey, finalizeEvent, nip19, type Event as NostrEvent } from 'nostr-tools';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { bytesToHex } from '@noble/hashes/utils';
import { MissionPackageIngest } from '../MissionPackageIngest';
import { buildMissionPackageManifest } from '../MissionPackageBuilder';
import { profileTags } from '../packageProfile';
import { createMLDSASigner } from '../../exchange/signing';
import { MissionStatus } from '../../../types/intel/MissionUI';
import type { MissionUI } from '../../../types/intel/MissionUI';

const onevents: Array<(e: NostrEvent) => void> = [];
/** Each open read's end-of-stored-events and close, by relay, as a relay would call them. */
const ends: Array<{ relay: string; oneose?: () => void; onclose?: (reasons: unknown) => void }> = [];
vi.mock('nostr-tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('nostr-tools')>();
  return {
    ...actual,
    SimplePool: class {
      subscribeMany(relays: string[], _filter: unknown, params: { onevent?: (e: NostrEvent) => void; oneose?: () => void; onclose?: (reasons: unknown) => void }) {
        if (params.onevent) onevents.push(params.onevent);
        ends.push({ relay: relays[0], oneose: params.oneose, onclose: params.onclose });
        return { close: () => {} };
      }
      close() {}
    },
  };
});

const sk = generateSecretKey();
const mission = (o: Partial<MissionUI> = {}): MissionUI => ({
  id: 'm1', missionNumber: 'MSN-1', title: 'Recon', briefing: 'Proceed.',
  status: MissionStatus.READY_FOR_PACKAGE, objectives: [], assignedTo: [],
  startDate: '2026-01-15T00:00:00.000Z', relatedReports: [], relatedCases: [],
  collaborators: [], activityLog: [],
  createdBy: getPublicKey(sk), createdAt: '2026-01-15T00:00:00.000Z',
  updatedAt: '2026-01-15T00:00:00.000Z', ...o,
} as MissionUI);

async function signedManifestFor(secret: Uint8Array) {
  const keys = ml_dsa65.keygen();
  return createMLDSASigner(bytesToHex(keys.secretKey))(
    // Its signer names it, by key, as a package published through Starcom without a callsign does (D-MX, MX7).
    buildMissionPackageManifest(mission({ createdBy: getPublicKey(secret) }), nip19.npubEncode(getPublicKey(secret))));
}

async function goodEvent(agent?: string): Promise<NostrEvent> {
  const keys = ml_dsa65.keygen();
  const manifest = await createMLDSASigner(bytesToHex(keys.secretKey))(buildMissionPackageManifest(mission(), nip19.npubEncode(getPublicKey(sk)), agent));
  return finalizeEvent({
    kind: 30079, created_at: 1,
    // As the broadcaster tags it: the profile its manifest signs, written out (rev 11).
    tags: [['d', `starcom_mission_package_${manifest.id}`], ['t', 'starcom_mission_package'], ...profileTags(manifest.profile)],
    content: JSON.stringify(manifest),
  } as Parameters<typeof finalizeEvent>[0], sk);
}

const deliver = (e: NostrEvent) => { for (const fn of onevents) fn(e); };
const settle = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => { onevents.length = 0; ends.length = 0; });
/** Every open read on this relay says it has sent all it holds. */
const endOfStored = (relay: string) => { for (const end of ends.splice(0).filter((e) => { const mine = e.relay === relay; if (!mine) ends.push(e); return mine; })) end.oneose?.(); };

describe('MissionPackageIngest', () => {
  it('emits a verified package to accepted listeners', async () => {
    const ingest = new MissionPackageIngest(['ws://relay.test']);
    const accepted = vi.fn();
    ingest.onAccepted(accepted);
    ingest.start();

    deliver(await goodEvent());
    await settle();

    expect(accepted).toHaveBeenCalledOnce();
    expect(ingest.stats()).toMatchObject({ seen: 1, accepted: 1, refused: 0 });
    ingest.stop();
  });

  // An AI agent's key, as its own signed package says (MX14): labelled wherever it is named (the legal review).
  it('marks the signer of a verified package that says it is an agent\'s', async () => {
    resetAgentKeys();
    const ingest = new MissionPackageIngest(['ws://relay.test']);
    ingest.start();
    deliver(await goodEvent());
    await settle();
    expect(isAgentKey(getPublicKey(sk))).toBe(false);
    deliver({ ...(await goodEvent('mecha_jono')) });
    await settle();
    expect(isAgentKey(getPublicKey(sk))).toBe(true);
    ingest.stop();
  });

  it('accounts for a refusal by cause instead of dropping it', async () => {
    const ingest = new MissionPackageIngest(['ws://relay.test']);
    const refused = vi.fn();
    ingest.onRefused(refused);
    ingest.start();

    // Unsigned manifest: the outer signature is fine, the payload is unproven.
    const unsigned = buildMissionPackageManifest(mission(), nip19.npubEncode(getPublicKey(sk)));
    deliver(finalizeEvent({
      kind: 30079, created_at: 1,
      tags: [['d', 'x'], ['t', 'starcom_mission_package'], ...profileTags(unsigned.profile)],
      content: JSON.stringify(unsigned),
    } as Parameters<typeof finalizeEvent>[0], sk));
    await settle();

    expect(refused).toHaveBeenCalledOnce();
    expect(refused.mock.calls[0][0].code).toBe('missing-manifest-signature');
    expect(ingest.stats().refusedBy['missing-manifest-signature']).toBe(1);
    ingest.stop();
  });

  it('records every publisher it saw, admitted or not', async () => {
    // A receiver that only counts what it accepted cannot tell an empty
    // network from one it is refusing wholesale.
    const stranger = generateSecretKey();
    const ingest = new MissionPackageIngest(['ws://relay.test'], {
      admittedPublishers: new Set([getPublicKey(sk)]),
    });
    const refused = vi.fn();
    ingest.onRefused(refused);
    ingest.start();

    deliver(await goodEvent());
    const manifest = await signedManifestFor(stranger);
    deliver(finalizeEvent({
      kind: 30079, created_at: 2,
      tags: [['d', 'y'], ['t', 'starcom_mission_package'], ...profileTags(manifest.profile)],
      content: JSON.stringify(manifest),
    } as Parameters<typeof finalizeEvent>[0], stranger));
    await settle();

    const seen = ingest.seenPublishers();
    expect(seen).toHaveLength(2);
    expect(seen.find((p) => p.pubkey === getPublicKey(sk))?.accepted).toBe(1);
    expect(seen.find((p) => p.pubkey === getPublicKey(stranger))?.refused).toBe(1);
    expect(refused.mock.calls[0][0].code).toBe('publisher-not-admitted');
    ingest.stop();
  });

  it('verifies a replaceable event once, however often a relay redelivers it', async () => {
    const ingest = new MissionPackageIngest(['ws://relay.test']);
    const accepted = vi.fn();
    ingest.onAccepted(accepted);
    ingest.start();

    const event = await goodEvent();
    deliver(event); deliver(event); deliver(event);
    await settle();

    expect(accepted).toHaveBeenCalledOnce();
    expect(ingest.stats().seen).toBe(1);
    ingest.stop();
  });

  it('is settled only once each relay has sent everything, paged past its cap, or failed, and every package is verified', async () => {
    const ingest = new MissionPackageIngest(['ws://a.test', 'ws://b.test']);
    const settled = vi.fn();
    ingest.onSettled(settled);
    ingest.start();

    const event = await goodEvent();
    deliver(event);
    expect(ingest.isSettled()).toBe(false);
    endOfStored('ws://a.test');
    // A page brought something, so the page before its oldest is read too, and brings nothing new.
    endOfStored('ws://a.test');
    expect(ingest.isSettled()).toBe(false);
    // The other relay closes before it says it has sent everything: it is done with, unread.
    ends.filter((e) => e.relay === 'ws://b.test').forEach((e) => e.onclose?.([{ url: 'ws://b.test', reason: 'closed' }]));
    // Every relay is done, and the package is still being verified.
    expect(ingest.isSettled()).toBe(false);
    await settle();
    expect(ingest.isSettled()).toBe(true);
    expect(settled).toHaveBeenCalled();
    ingest.stop();
  });
});
