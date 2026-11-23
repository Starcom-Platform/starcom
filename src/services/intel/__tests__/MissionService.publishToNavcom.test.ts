/**
 * MissionService.publishToNavcom — Cycle 4 orchestration, extended in
 * Cycle 7 to also sign the manifest with a persisted ML-DSA-65 keypair
 * (ManifestSigningKeyStore) before broadcast.
 *
 * Mocks MissionPackageBroadcastService (network layer already covered for
 * real in MissionPackageBroadcastService.test.ts) to isolate what this
 * layer actually owns: the READY_FOR_PACKAGE -> PACKAGED -> DISPATCHED
 * state machine and its partial-failure behavior. jsdom (this file's
 * default environment) has no IndexedDB — ManifestSigningKeyStore needs
 * one to persist the signing keypair, hence fake-indexeddb/auto. jsdom
 * also has no crypto.subtle, which the classified-mission tests below need
 * (AES-GCM via the real encryptClassifiedData path) — polyfilled locally,
 * only here, from Node's real webcrypto, leaving jsdom's own
 * crypto.getRandomValues untouched (same technique as
 * IntelWorkspaceManager.classifiedEncryption.test.ts).
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { nip19 } from 'nostr-tools';
import { missionService, missionDestinations, missionProfileLock } from '../MissionService';
import { nostrIdentityService } from '../../identity/NostrIdentityService';
import { mintRootGrantSigned } from '../capability/missionCapability';
import { intelReportService } from '../IntelReportService';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { publishRelays } from '../../nostr/publishTargets';
import { joinRelay, leaveRelay } from '../../nostr/joinedRelays';
import { MissionStatus } from '../../../types/intel/MissionUI';
import type { CreateMissionInput, MissionUI } from '../../../types/intel/MissionUI';
import { intelWorkspaceManager } from '../IntelWorkspaceManager';
import { eventOutbox, isKeptPackageOf } from '../outbox/EventOutbox';

const publishMissionPackage = vi.fn();
/** Where each broadcast was sent: the relays the service was built with. */
const sentTo: Array<string[] | undefined> = [];

// A plain class, not vi.fn().mockImplementation() — this file's global
// afterEach (src/setupVitest.ts) calls vi.restoreAllMocks() after every
// test, which would wipe a mockImplementation() set on the constructor
// itself. publishToNavcom constructs a fresh MissionPackageBroadcastService
// per call (unlike PublishAdapter's cached-singleton orchestrator), so a
// wiped constructor breaks every test after the first. The inner
// publishMissionPackage stays a real vi.fn() — only its calls need
// resetting per test, which beforeEach already does below.
/**
 * The capability gate is verified for real — with real keys, real signatures
 * and real forgery attempts — in capability/__tests__/missionCapability.test.ts,
 * which runs in node because jsdom's Uint8Array is a different realm and
 * @noble rejects it inside getEventHash. This file cannot follow it there: the
 * workspace manager needs localStorage.
 *
 * So the crypto is mocked here and the WIRING is what these tests own — that
 * publish consults the gate at all, and that a refusal stops the publish
 * rather than being logged and stepped over.
 */
const verifyGrantChain = vi.fn(() => ({ ok: true as boolean, reason: undefined as string | undefined }));
vi.mock('../capability/missionCapability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../capability/missionCapability')>();
  return {
    ...actual,
    mintRootGrantSigned: vi.fn(async () => ({ id: 'cap-root' })),
    verifyGrantChain: (...args: unknown[]) => verifyGrantChain(...(args as [])),
  };
});

// Only the network layer is stubbed. isPrivateRelay/missionPackageRelays pass
// through to the real module so the classification gate below is exercised
// against the shipping relay defaults rather than against a fixture.
vi.mock('../MissionPackageBroadcastService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../MissionPackageBroadcastService')>();
  return {
    ...actual,
    MissionPackageBroadcastService: class {
      constructor(relays?: string[]) { sentTo.push(relays); }
      publishMissionPackage(...args: unknown[]) { return publishMissionPackage(...args); }
      dispose() {}
    },
  };
});

/**
 * Missions here carry a linked report because READY_FOR_PACKAGE now requires
 * a mission to rest on something. Passing no evidence would be testing the
 * publish path from a state the product refuses to produce.
 */
async function makeReadyMission(title: string, briefing = '...', extra: Partial<CreateMissionInput> = {}) {
  const created = await missionService.createMission({
    title, briefing, relatedReports: ['report-fixture-1'], visibility: 'public', ...extra,
  });
  await missionService.updateStatus(created.id, MissionStatus.PLANNING);
  return missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE);
}


/*
 * The missions here rest on 'report-fixture-1', and the evidence gate counts
 * only records held in this workspace (plan item 0.6), so the fixture is held.
 */
beforeAll(async () => {
  await intelReportService.importReport({
    id: 'report-fixture-1', title: 'Fixture report', content: 'Two of the five sites look closed.',
    author: 'analyst-1', category: 'general', tags: [], createdAt: new Date(), updatedAt: new Date(), status: 'DRAFT',
  } as IntelReportUI, { strategy: 'skip' });
});

/*
 * Plan item 2.2. Dispatch acted as this browser's key while the extension signed
 * the root grant, and missions were recorded under a second, local key. The
 * chain was rooted in one key and checked against another: a person with an
 * extension could never dispatch their own mission.
 */
describe('MissionService.publishToNavcom, with a signer extension installed', () => {
  it("acts as the extension's key: its own mission's root grant is minted and checked against it", async () => {
    const extensionPubkey = 'e'.repeat(64);
    (globalThis as { nostr?: unknown }).nostr = {
      getPublicKey: async () => extensionPubkey,
      signEvent: async (event: Record<string, unknown>) => ({ ...event, pubkey: extensionPubkey, id: 'y', sig: 'x' }),
    };
    try {
      publishMissionPackage.mockResolvedValue({ success: true, eventId: 'evt-ext', relaysOk: 1, relaysTried: 1 });
      const ready = (await makeReadyMission('Extension-signed mission'))!;
      expect(ready.createdBy).toBe(extensionPubkey);
      verifyGrantChain.mockClear();
      vi.mocked(mintRootGrantSigned).mockClear();

      await missionService.publishToNavcom(ready.id);

      expect(mintRootGrantSigned).toHaveBeenCalledTimes(1);
      expect(verifyGrantChain).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ holder: extensionPubkey, rootIssuer: extensionPubkey }));
    } finally {
      delete (globalThis as { nostr?: unknown }).nostr;
    }
  });
});

describe('MissionService.publishToNavcom', () => {
  beforeEach(() => {
    publishMissionPackage.mockReset();
    sentTo.length = 0;
  });

  it('refuses to publish when the capability chain does not authorise this operator', async () => {
    // The gate must STOP the publish, not warn past it: nothing may be
    // broadcast and the mission must not advance out of READY_FOR_PACKAGE.
    verifyGrantChain.mockReturnValueOnce({ ok: false, reason: 'This capability empowers a different operator.' });

    const created = await missionService.createMission({
      title: 'Unauthorised', briefing: 'b', relatedReports: ['report-fixture-1'], visibility: 'public',
    });
    await missionService.updateStatus(created.id, MissionStatus.PLANNING);
    await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE);

    await expect(missionService.publishToNavcom(created.id)).rejects.toThrow(/empowers a different operator/i);
    expect(publishMissionPackage).not.toHaveBeenCalled();
    expect((await missionService.getMission(created.id))?.status).toBe(MissionStatus.READY_FOR_PACKAGE);
  });

  /*
   * ─── THE 'classification does not encrypt the wire' BLOCK LIVED HERE ─────
   *
   * It created missions at CONFIDENTIAL / SECRET / TOP_SECRET and asserted
   * each was refused, plus an UNCLASSIFIED one that went through. Through the
   * Stage 6a bridge those tiers resolved to 'private', so it kept passing
   * across the re-key — which was the point of it.
   *
   * 7c deleted the bridge and the field, so the block cannot construct its own
   * fixtures any more. Every case it made has an equivalent in 'the interlock
   * is keyed on visibility' below. Since plan item 0.4 each distribution
   * picks its relays, and a mission nobody marked goes nowhere. The legacy-input half of the property
   * moved to handlingBackfill.test.ts, which proves those tiers become
   * 'private' on a real stored record.
   */

  /**
   * ─── WHERE THE UI/GATE AGREEMENT IS ACTUALLY ENFORCED ─────────────────────
   *
   * MissionsPanel used to hold its own copy of this rule
   * (`publishIsPublic && ['CONFIDENTIAL','SECRET','TOP_SECRET'].includes(...)`)
   * and diverged from the gate when Stage 6b moved onto `visibility`. Both
   * now call `missionDestinations` (it was `publicRelayRefusal`).
   *
   * I first wrote the regression test HERE, as eight cases asserting
   * the refusal was non-null iff `publishToNavcom` rejected. Mutating
   * the predicate proved it TAUTOLOGICAL: the gate calls the predicate, so
   * mutating one moves both and all eight kept passing. Eight tests that look
   * like protection and are not is the defect this whole effort is about, so
   * they are gone.
   *
   * The agreement is enforced in MissionsPanel.test.tsx, at the render, where
   * the button's disabled state can actually disagree with the gate. Verified
   * by mutation: reinstating the panel's tier-reading copy fails two tests
   * there, in both directions.
   *
   * What IS worth asserting here is the refusal's content — the UI shows these
   * words, so they are part of the contract.
   */
  /*
   * Distribution picks the relays (plan item 0.4, decision D2), and when it
   * picks none, these are the words the screen shows.
   */
  it('hands the UI where a mission goes, or why it goes nowhere, in the gate\'s own words', () => {
    expect(missionDestinations({ visibility: 'public' })).toEqual({ relays: publishRelays('MISSION'), refusal: null });
    expect(missionDestinations({}).refusal).toMatch(/Nobody has decided who may receive this mission/);
    expect(missionDestinations({ visibility: 'private' }).refusal).toMatch(/stays in this workspace and is never published/);
    expect(missionDestinations({ visibility: 'limited' }).refusal).toMatch(/no internal relay/);
    process.env.VITE_NOSTR_INTERNAL_RELAYS = 'wss://team.relay.example';
    try {
      expect(missionDestinations({ visibility: 'limited' })).toEqual({ relays: ['wss://team.relay.example'], refusal: null });
    } finally {
      delete process.env.VITE_NOSTR_INTERNAL_RELAYS;
    }
  });

  it('sends a Limited mission to the joined team relays its author picked, even with no internal relay (LW1)', () => {
    joinRelay({ url: 'wss://relay.newark-desk.example', relayPubkey: '9'.repeat(64), team: 'Newark desk' });
    try {
      expect(missionDestinations({ visibility: 'limited', limitedTo: ['wss://relay.newark-desk.example', 'wss://relay.not-joined.example'] }))
        .toEqual({ relays: ['wss://relay.newark-desk.example'], refusal: null });
      expect(missionDestinations({ visibility: 'limited' }).refusal).toMatch(/no internal relay/);
    } finally {
      leaveRelay('wss://relay.newark-desk.example');
    }
  });

  /**
   * Stage 6b re-keyed this interlock from the clearance ladder onto
   * `visibility`. The block above covers the LEGACY path and must keep passing
   * unchanged — that is the evidence that missions already on disk still refuse
   * to dispatch. These cover what the axis buys.
   */
  describe('the interlock is keyed on visibility', () => {
    /**
     * The combination the ladder could not express. Under the tier set, keeping
     * a mission off public relays required marking it CONFIDENTIAL, which also
     * forced its briefing to be encrypted at rest. 'limited' says the one thing
     * without the other.
     */
    it("refuses a 'limited' mission when this build has no internal relay, and sends nothing", async () => {
      const created = await missionService.createMission({
        title: 'Limited op', briefing: 'operational', visibility: 'limited',
        relatedReports: ['report-fixture-1'],
      });
      await missionService.updateStatus(created.id, MissionStatus.PLANNING);
      await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE);

      await expect(missionService.publishToNavcom(created.id))
        .rejects.toThrow(/no internal relay/i);
      expect(publishMissionPackage).not.toHaveBeenCalled();
      expect((await missionService.getMission(created.id))?.status)
        .toBe(MissionStatus.READY_FOR_PACKAGE);
    });

    it("refuses to publish a 'private' mission to public relays", async () => {
      const created = await missionService.createMission({
        title: 'Private op', briefing: 'internal', visibility: 'private',
        relatedReports: ['report-fixture-1'],
      });
      await missionService.updateStatus(created.id, MissionStatus.PLANNING);
      await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE);

      // Private is refused everywhere, so the words say that rather than naming relays.
      await expect(missionService.publishToNavcom(created.id))
        .rejects.toThrow(/stays in this workspace and is never published/i);
      expect(publishMissionPackage).not.toHaveBeenCalled();
    });

    // Plan items 0.3 and 0.4: Private stays in the workspace, even when the only
    // relay is on this network; Limited may go to a relay that is not public.
    it("refuses a 'private' mission anywhere, even to a relay on this network", async () => {
      process.env.VITE_NOSTR_MISSION_RELAYS = 'ws://127.0.0.1:7447';
      process.env.VITE_NOSTR_MISSION_RELAYS_EXCLUSIVE = 'true';
      try {
        const created = await missionService.createMission({
          title: 'Stays here', briefing: 'b', visibility: 'private', relatedReports: ['report-fixture-1'],
        });
        await missionService.updateStatus(created.id, MissionStatus.PLANNING);
        await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE);

        await expect(missionService.publishToNavcom(created.id)).rejects.toThrow(/never published/);
        expect(publishMissionPackage).not.toHaveBeenCalled();
      } finally {
        delete process.env.VITE_NOSTR_MISSION_RELAYS;
        delete process.env.VITE_NOSTR_MISSION_RELAYS_EXCLUSIVE;
      }
    });

    it("sends a 'limited' mission to the team's declared internal relay", async () => {
      process.env.VITE_NOSTR_MISSION_RELAYS = 'wss://team.relay.example';
      process.env.VITE_NOSTR_MISSION_RELAYS_EXCLUSIVE = 'true';
      process.env.VITE_NOSTR_INTERNAL_RELAYS = 'wss://team.relay.example';
      try {
        publishMissionPackage.mockResolvedValue({ success: true, eventId: 'evt-team', relaysOk: 1, relaysTried: 1 });
        const created = await missionService.createMission({
          title: 'For the team', briefing: 'b', visibility: 'limited', relatedReports: ['report-fixture-1'],
        });
        await missionService.updateStatus(created.id, MissionStatus.PLANNING);
        await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE);

        expect((await missionService.publishToNavcom(created.id)).broadcast.success).toBe(true);
      } finally {
        delete process.env.VITE_NOSTR_MISSION_RELAYS;
        delete process.env.VITE_NOSTR_MISSION_RELAYS_EXCLUSIVE;
        delete process.env.VITE_NOSTR_INTERNAL_RELAYS;
      }
    });

    it("sends a 'limited' mission only to the internal relays, never to the public ones it used to", async () => {
      process.env.VITE_NOSTR_INTERNAL_RELAYS = 'wss://team.relay.example';
      try {
        publishMissionPackage.mockResolvedValue({ success: true, eventId: 'evt-team-2', relaysOk: 1, relaysTried: 1 });
        const created = await makeReadyMission('Team only', 'b', { visibility: 'limited' });

        await missionService.publishToNavcom(created.id);
        expect(sentTo).toEqual([['wss://team.relay.example']]);
      } finally {
        delete process.env.VITE_NOSTR_INTERNAL_RELAYS;
      }
    });

    it('carries what the mission works toward in its package, and will not let it change once locked (RS59)', async () => {
      publishMissionPackage.mockResolvedValue({ success: true, eventId: 'evt-toward', relaysOk: 1, relaysTried: 1 });
      const cause = `30084:${'c'.repeat(64)}:cause-clean-water`;
      const created = await missionService.createMission({ title: 'Toward clean water', briefing: 'b', relatedReports: ['report-fixture-1'], visibility: 'public' });
      await missionService.saveMission({ ...(await missionService.getMission(created.id))!, toward: [{ coordinate: cause, relay: '' }] });
      await missionService.updateStatus(created.id, MissionStatus.PLANNING);
      const ready = (await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE))!;
      await expect(missionService.saveMission({ ...ready, toward: [] })).rejects.toThrow(/locked/);
      // What the review shows is what it links.
      expect((await missionService.prepareMissionPackage(created.id)).toward).toEqual([{ coordinate: cause, relay: '' }]);
      publishMissionPackage.mockClear();
      await missionService.publishToNavcom(created.id);
      expect(publishMissionPackage.mock.calls[0][3]).toEqual([{ coordinate: cause, relay: '' }]);
    });

    it("sends a 'public' mission to the mission relays", async () => {
      publishMissionPackage.mockResolvedValue({ success: true, eventId: 'evt-public', relaysOk: 5, relaysTried: 5 });
      const created = await makeReadyMission('Everyone', 'b');

      await missionService.publishToNavcom(created.id);
      expect(sentTo).toEqual([publishRelays('MISSION')]);
    });

    it("names the distribution in the refusal, not a clearance tier", async () => {
      const created = await missionService.createMission({
        title: 'Limited op 2', briefing: 'operational', visibility: 'limited',
        relatedReports: ['report-fixture-1'],
      });
      await missionService.updateStatus(created.id, MissionStatus.PLANNING);
      await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE);

      await expect(missionService.publishToNavcom(created.id))
        .rejects.toThrow(/This mission is Limited/);
    });

    it("allows a 'public' mission through the same path", async () => {
      // The gate must not become a blanket refusal.
      publishMissionPackage.mockResolvedValue({ success: true, eventId: 'evt-v1', relaysOk: 1 });
      const created = await missionService.createMission({
        title: 'Public op', briefing: 'routine', visibility: 'public',
        relatedReports: ['report-fixture-1'],
      });
      await missionService.updateStatus(created.id, MissionStatus.PLANNING);
      await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE);

      expect((await missionService.publishToNavcom(created.id)).broadcast.success).toBe(true);
    });

    /**
     * A mission nobody has marked goes nowhere (plan item 0.5, decision D2: ask
     * every time). It used to publish to public relays, reading silence as
     * consent to a publication nobody can recall.
     */
    it('refuses a mission nobody has decided on, and sends nothing', async () => {
      const created = await missionService.createMission({
        title: 'Unmarked op', briefing: 'routine',
        relatedReports: ['report-fixture-1'],
      });
      await missionService.updateStatus(created.id, MissionStatus.PLANNING);
      await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE);

      await expect(missionService.publishToNavcom(created.id)).rejects.toThrow(/Nobody has decided who may receive this mission/);
      expect(publishMissionPackage).not.toHaveBeenCalled();
    });

    /**
     * An explicit visibility wins over a legacy tier. This matters because it
     * is how a mission gets deliberately released: without it, a record still
     * carrying `classification: 'SECRET'` would be permanently undispatchable
     * with no way to say otherwise.
     */
    it('prefers an explicit visibility over a legacy classification', async () => {
      publishMissionPackage.mockResolvedValue({ success: true, eventId: 'evt-v3', relaysOk: 1 });
      const created = await missionService.createMission({
        title: 'Released op', briefing: 'routine',
        visibility: 'public',
        relatedReports: ['report-fixture-1'],
      });
      await missionService.updateStatus(created.id, MissionStatus.PLANNING);
      await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE);

      expect((await missionService.publishToNavcom(created.id)).broadcast.success).toBe(true);
    });
  });

  it('rejects a mission that is not READY_FOR_PACKAGE', async () => {
    const created = await missionService.createMission({ title: 'Not Ready', briefing: '...' });
    await expect(missionService.publishToNavcom(created.id)).rejects.toThrow(/must be READY_FOR_PACKAGE/i);
    expect(publishMissionPackage).not.toHaveBeenCalled();
  });

  it('on broadcast success, advances READY_FOR_PACKAGE -> PACKAGED -> DISPATCHED and stamps dispatchedDate', async () => {
    const ready = await makeReadyMission('Successful Dispatch');
    publishMissionPackage.mockResolvedValue({ success: true, eventId: 'evt-1', relaysOk: 3 });

    const result = await missionService.publishToNavcom(ready!.id);

    expect(result.broadcast.success).toBe(true);
    expect(result.mission.status).toBe(MissionStatus.DISPATCHED);
    expect(result.mission.dispatchedDate).toBeTruthy();

    const reloaded = await missionService.getMission(ready!.id);
    expect(reloaded?.status).toBe(MissionStatus.DISPATCHED);
  });

  it('on broadcast failure, the mission is left at PACKAGED — not silently reverted, not silently advanced', async () => {
    const ready = await makeReadyMission('Failed Dispatch');
    publishMissionPackage.mockResolvedValue({ success: false, error: 'no relays reachable' });

    const result = await missionService.publishToNavcom(ready!.id);

    expect(result.broadcast.success).toBe(false);
    expect(result.mission.status).toBe(MissionStatus.PACKAGED);
    expect(result.mission.dispatchedDate).toBeFalsy();

    const reloaded = await missionService.getMission(ready!.id);
    expect(reloaded?.status).toBe(MissionStatus.PACKAGED);
  });

  describe('a package no relay took (W1c)', () => {
    const signed = (pubkey: string, d: string) => ({ id: `e${'1'.repeat(63)}`, pubkey, kind: 30079, created_at: 1, tags: [['d', d]], content: '{}', sig: 'x' });
    const keptFor = async (id: string) => (await eventOutbox.waiting()).filter((r) => isKeptPackageOf(r, id));

    it('keeps the package as signed, to go when a relay answers, and says so', async () => {
      const ready = await makeReadyMission('Kept Dispatch');
      publishMissionPackage.mockResolvedValue({ success: false, error: 'no relays reachable', signed: signed('a'.repeat(64), 'starcom_mission_package_x') });
      const result = await missionService.publishToNavcom(ready!.id);
      expect(result.kept).toBe(true);
      expect(result.mission.status).toBe(MissionStatus.PACKAGED);
      const [kept] = await keptFor(ready!.id);
      expect(kept).toMatchObject({ relays: sentTo.at(-1), after: { dispatched: { mission: ready!.id } } });
      await eventOutbox.cancelWhere(() => true);
    });

    it('keeps nothing every relay refused for good: their reasons, and Retry, say what happened (S22)', async () => {
      const ready = await makeReadyMission('Refused Dispatch');
      publishMissionPackage.mockResolvedValue({
        success: false, error: 'wss://a: blocked: not this key', said: ['blocked: not this key'], signed: signed('a'.repeat(64), 'starcom_mission_package_r'),
      });
      const result = await missionService.publishToNavcom(ready!.id);
      expect(result.kept).toBeUndefined();
      expect(await keptFor(ready!.id)).toEqual([]);
    });

    it('dispatches the mission when its kept package goes, with that send\'s receipt and address', async () => {
      const ready = await makeReadyMission('Kept Then Sent');
      publishMissionPackage.mockResolvedValue({ success: false, error: 'no relays reachable' });
      await missionService.publishToNavcom(ready!.id);
      const event = signed('b'.repeat(64), 'starcom_mission_package_y');
      await missionService.recordKeptDispatch(ready!.id, event, 3, 5);
      const after = await missionService.getMission(ready!.id);
      expect(after).toMatchObject({
        status: MissionStatus.DISPATCHED,
        dispatchReceipt: { eventId: event.id, relaysAccepted: 3, relaysTried: 5 },
        publishedAs: `30079:${'b'.repeat(64)}:starcom_mission_package_y`,
      });
      expect(after?.lastPublishAttempt).toBeUndefined();
      // Once dispatched, a second word of it changes nothing.
      await missionService.recordKeptDispatch(ready!.id, signed('c'.repeat(64), 'other'), 1, 1);
      expect((await missionService.getMission(ready!.id))?.publishedAs).toBe(`30079:${'b'.repeat(64)}:starcom_mission_package_y`);
    });

    it('lets the kept package go when the mission is moved back to change it, or is sent another way', async () => {
      const ready = await makeReadyMission('Kept Then Moved Back');
      publishMissionPackage.mockResolvedValue({ success: false, error: 'no relays reachable', signed: signed('a'.repeat(64), 'starcom_mission_package_z') });
      await missionService.publishToNavcom(ready!.id);
      expect(await keptFor(ready!.id)).toHaveLength(1);
      await missionService.updateStatus(ready!.id, MissionStatus.READY_FOR_PACKAGE);
      expect(await keptFor(ready!.id)).toHaveLength(0);

      const again = await makeReadyMission('Kept Then Retried');
      await missionService.publishToNavcom(again!.id);
      expect(await keptFor(again!.id)).toHaveLength(1);
      publishMissionPackage.mockResolvedValue({ success: true, eventId: 'evt-2', relaysOk: 2, relaysTried: 5 });
      await missionService.retryPublish(again!.id);
      expect(await keptFor(again!.id)).toHaveLength(0);
    });
  });

  it('passes a redacted, checksummed manifest (not the raw MissionUI) to the broadcast layer', async () => {
    const ready = await makeReadyMission('Manifest Shape Check');
    publishMissionPackage.mockResolvedValue({ success: true, eventId: 'evt-1', relaysOk: 1 });

    await missionService.publishToNavcom(ready!.id);

    expect(publishMissionPackage).toHaveBeenCalledOnce();
    const [manifest] = publishMissionPackage.mock.calls[0];
    expect(manifest).toHaveProperty('reports');
    expect(manifest).toHaveProperty('id');
    // Its signer, by key, since no callsign is set (D-MX, MX7): never "Starcom".
    expect(manifest.author).toBe(nip19.npubEncode(nostrIdentityService.signerPubkey()!));
    // The manifest is a PackageManifest, not a MissionUI — it must not carry
    // raw MissionUI-only fields like collaborators/comments/activityLog.
    expect(manifest).not.toHaveProperty('collaborators');
    expect(manifest).not.toHaveProperty('comments');
    expect(manifest).not.toHaveProperty('activityLog');
  });

  // Hardening pass: MissionUI.briefing is encrypted at rest for
  // CONFIDENTIAL+ missions (Cycle 3). updateStatus (which publishToNavcom
  // calls internally to reach PACKAGED) reads the STORED record, so
  // without decrypting first, the "packaged" manifest sent to Navcom would
  // literally contain the raw ciphertext JSON blob instead of the real
  // briefing text.
  describe('classified missions (Cycle 3 encryption interaction)', () => {
    /**
     * Publishing classified content to a public relay is refused outright, so
     * these run against a private relay — the only configuration in which
     * dispatching a SECRET mission is legitimate at all. Without this they
     * would be asserting the encryption interaction from a starting position
     * the product no longer allows.
     */
    beforeEach(() => {
      process.env.VITE_NOSTR_MISSION_RELAYS = 'ws://127.0.0.1:7447';
      process.env.VITE_NOSTR_MISSION_RELAYS_EXCLUSIVE = 'true';
    });
    afterEach(() => {
      delete process.env.VITE_NOSTR_MISSION_RELAYS;
      delete process.env.VITE_NOSTR_MISSION_RELAYS_EXCLUSIVE;
    });

    it('packages the real, decrypted briefing text — not the stored ciphertext', async () => {
      const plaintext = 'Real briefing: extract asset from checkpoint Delta at 0300Z.';
      const created = await missionService.createMission({
        title: 'Classified Mission',
        briefing: plaintext,
        sensitivity: 'protected',
        // Limited: sent only to the relay on this network set above. A private
        // mission is never published at all (plan items 0.3 and 0.4).
        visibility: 'limited',
        relatedReports: ['report-fixture-1'],
      });
      await missionService.updateStatus(created.id, MissionStatus.PLANNING);
      await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE);

      publishMissionPackage.mockResolvedValue({ success: true, eventId: 'evt-1', relaysOk: 1 });
      await missionService.publishToNavcom(created.id);

      const [manifest] = publishMissionPackage.mock.calls[0];
      const manifestText = JSON.stringify(manifest);
      // The manifest only ever carries a checksum of the (redacted) content,
      // never the raw text itself — so this asserts the negative that
      // matters most: it must NOT contain the tell-tale encrypted-marker
      // shape, which would mean ciphertext leaked into the package instead
      // of being decrypted first.
      expect(manifestText).not.toContain('__classifiedEncrypted');
    });

    it('rejects publishing (and leaves the mission at READY_FOR_PACKAGE, not stuck at PACKAGED) when the briefing decryption key is missing', async () => {
      const created = await missionService.createMission({
        title: 'Key Lost Mission',
        briefing: 'Sensitive content whose key will be deleted.',
        sensitivity: 'protected',
        // Limited: sent only to the relay on this network set above. A private
        // mission is never published at all (plan items 0.3 and 0.4).
        visibility: 'limited',
        relatedReports: ['report-fixture-1'],
      });
      await missionService.updateStatus(created.id, MissionStatus.PLANNING);
      await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE);

      const { classifiedDataKeyStore } = await import('../../crypto/ClassifiedDataKeyStore');
      await classifiedDataKeyStore.delete(created.id);

      await expect(missionService.publishToNavcom(created.id)).rejects.toThrow(/decryption key is missing/i);
      expect(publishMissionPackage).not.toHaveBeenCalled();

      const reloaded = await missionService.getMission(created.id);
      expect(reloaded?.status).toBe(MissionStatus.READY_FOR_PACKAGE);
    });
  });
});

/*
 * The package profile (interchange rev 11; D-MX, MX2, MX13): field work names
 * a region and an end, and no package is published as field work without
 * both, or after its end. Checked when the package is built, and again when a
 * kept one is sent.
 */
describe('MissionService.publishToNavcom, field work', () => {
  const LATER = '2099-01-31T23:59:59.000Z';

  beforeEach(() => {
    publishMissionPackage.mockReset();
    sentTo.length = 0;
  });

  async function fieldWorkMission(title: string, fieldWork: MissionUI['fieldWork'], claims?: MissionUI['claims']) {
    // Field work names something to report (NavCom §4.3; D-MX MX28).
    const created = await missionService.createMission({
      title, briefing: '...', relatedReports: ['report-fixture-1'], visibility: 'public', objectives: ['Count the cooling centres open'],
    });
    const planning = (await missionService.updateStatus(created.id, MissionStatus.PLANNING))!;
    await missionService.saveMission({ ...planning, fieldWork, ...(claims ? { claims } : {}) });
    return (await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE))!;
  }

  it('carries its region, its end and who takes it in the package it signs', async () => {
    const ready = await fieldWorkMission('Field work', { jurisdiction: 'us-ca', until: LATER }, 'one');
    publishMissionPackage.mockResolvedValue({ success: true, eventId: 'evt-1', relaysOk: 1 });

    await missionService.publishToNavcom(ready.id);

    const [manifest] = publishMissionPackage.mock.calls[0];
    expect(manifest.profile).toEqual({
      missionState: 'open', claims: 'one', fieldWork: { jurisdiction: 'us-ca', validUntil: Date.parse(LATER) / 1000 },
    });
  });

  it('refuses to build a package for field work with no region, a place finer than a state, no end, or an end already past', async () => {
    const ready = await fieldWorkMission('Field work, incomplete', { jurisdiction: 'us-ca', until: LATER });
    for (const fieldWork of [
      { until: LATER },
      { jurisdiction: 'us-tx-leander', until: LATER },
      { jurisdiction: 'us-ca' },
      { jurisdiction: 'us-ca', until: '2020-01-31T23:59:59.000Z' },
    ]) {
      // As a record from elsewhere, or one whose end passed while it waited, arrives here.
      await intelWorkspaceManager.updateMission({ ...ready, fieldWork });
      await expect(missionService.prepareMissionPackage(ready.id), JSON.stringify(fieldWork)).rejects.toThrow(/field work/i);
    }
    expect(publishMissionPackage).not.toHaveBeenCalled();
  });

  it('says why who takes it and its field work cannot change, once its package is locked', () => {
    expect(missionProfileLock({ status: MissionStatus.PLANNING })).toBeNull();
    expect(missionProfileLock({ status: MissionStatus.READY_FOR_PACKAGE })).toMatch(/move it back to Planning/);
    expect(missionProfileLock({ status: MissionStatus.DISPATCHED })).toMatch(/published, so who takes it and its field work stay as they went out/);
  });

  it('will not mark field work ready without a region and an end to come', async () => {
    const created = await missionService.createMission({ title: 'Gate', briefing: '...', relatedReports: ['report-fixture-1'], visibility: 'public' });
    const planning = (await missionService.updateStatus(created.id, MissionStatus.PLANNING))!;
    for (const [fieldWork, said] of [
      [{ jurisdiction: 'us-ca' }, /end date/],
      [{ until: LATER }, /region/],
      [{ jurisdiction: 'us-tx-leander', until: LATER }, /country or a state/],
      [{ jurisdiction: 'us-ca', until: '2020-01-31T23:59:59.000Z' }, /ended/],
    ] as const) {
      await missionService.saveMission({ ...planning, fieldWork });
      await expect(missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE)).rejects.toThrow(said);
    }
    expect((await missionService.getMission(created.id))!.status).toBe(MissionStatus.PLANNING);
  });

  it('lets a packaged mission whose field work ended go back through Ready to Planning, to set a later end', async () => {
    const until = new Date(Date.now() + 60_000).toISOString();
    const ready = await fieldWorkMission('Back to fix it', { jurisdiction: 'us-ca', until });
    publishMissionPackage.mockResolvedValueOnce({ success: false, error: 'no relays reachable' });
    await missionService.publishToNavcom(ready.id);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse(until) + 1000);
    try {
      await missionService.updateStatus(ready.id, MissionStatus.READY_FOR_PACKAGE);
      expect((await missionService.updateStatus(ready.id, MissionStatus.PLANNING))!.status).toBe(MissionStatus.PLANNING);
    } finally {
      vi.useRealTimers();
    }
  });

  it('locks field work and who takes it with the rest of the package, from Ready on', async () => {
    const ready = await fieldWorkMission('Locked field work', { jurisdiction: 'us-ca', until: LATER });
    await expect(missionService.saveMission({ ...ready, fieldWork: { jurisdiction: 'us-nv', until: LATER } })).rejects.toThrow(/locked/);
    await expect(missionService.saveMission({ ...ready, claims: 'one' })).rejects.toThrow(/locked/);
  });

  it('refuses to send a reviewed package whose field work ended while the review was open', async () => {
    const until = new Date(Date.now() + 60_000).toISOString();
    const ready = await fieldWorkMission('Ended under review', { jurisdiction: 'us-ca', until });
    const prepared = await missionService.prepareMissionPackage(ready.id);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse(until) + 1000);
    try {
      await expect(missionService.publishPreparedPackage(prepared)).rejects.toThrow(/field work ended/i);
    } finally {
      vi.useRealTimers();
    }
    expect(publishMissionPackage).not.toHaveBeenCalled();
    expect((await missionService.getMission(ready.id))!.status).toBe(MissionStatus.READY_FOR_PACKAGE);
  });

  it("says an agent posted it when this key is an agent's, naming its author (MX14)", async () => {
    const { setPublishesAsAgent } = await import('../../identity/callsign');
    const ready = await fieldWorkMission('Posted by an agent', { jurisdiction: 'us-ca', until: LATER });
    publishMissionPackage.mockResolvedValue({ success: true, eventId: 'evt-1', relaysOk: 1 });
    setPublishesAsAgent(true);
    try {
      await missionService.publishToNavcom(ready.id);
    } finally {
      setPublishesAsAgent(false);
    }
    const [manifest] = publishMissionPackage.mock.calls[0];
    expect(manifest.profile.agent).toBe(manifest.author);
  });

  it('will not send a kept package again once its field work has ended', async () => {
    const until = new Date(Date.now() + 60_000).toISOString();
    const ready = await fieldWorkMission('Kept field work', { jurisdiction: 'us-ca', until });
    publishMissionPackage.mockResolvedValueOnce({ success: false, error: 'no relays reachable' });
    await missionService.publishToNavcom(ready.id);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse(until) + 1000);
    try {
      await expect(missionService.retryPublish(ready.id)).rejects.toThrow(/field work ended/i);
    } finally {
      vi.useRealTimers();
    }
    expect(publishMissionPackage).toHaveBeenCalledTimes(1);
  });
});
