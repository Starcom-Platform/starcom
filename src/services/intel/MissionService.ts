import { MissionUI, CreateMissionInput, MissionStatus, MissionActivityAction, VALID_MISSION_STATUS_TRANSITIONS, type PublishReceipt } from '../../types/intel/MissionUI';
import { restsOnEvidence, evidenceIn, type EvidenceLookup } from './missionEvidence';
import { visibilityOf, isInformationVisibility } from '../../types/intel/IntelItemUI';
import type { ReportCitation } from '../../types/intel/IntelReportUI';
import { packageCitations } from './citations';
import { intelWorkspaceManager, isEncryptedAtRest } from './IntelWorkspaceManager';
import { buildMissionPackageManifest, buildMissionPackageComposeInput } from './MissionPackageBuilder';
import { authorFor, agentFor } from '../identity/callsign';
import { fieldWorkProblem, keptFieldWorkProblem } from './packageProfile';
import { MissionPackageBroadcastService, BroadcastResult } from './MissionPackageBroadcastService';
import { eventOutbox, isKeptPackageOf } from './outbox/EventOutbox';
import { refusedForGood } from '../nostr/relayRefusal';
import { coordinateFor as packageCoordinateFor } from './missionPackageThread';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import {
  missionResource, mintRootGrantSigned, verifyGrantChain, readGrant, buildGrantEvent, buildRevocationEvent,
} from './capability/missionCapability';
import { nip19, type Event as NostrEvent } from 'nostr-tools';
import { whereItGoes } from '../nostr/publishTargets';
import { statusName } from './steps/statusSteps';
import { en, type Messages } from '../../i18n/app/en';
import { interpolate } from '../../i18n/messages';

/** The words a mission's locks are said in (D-ML, L3): a screen in another language hands its own in. English when none are. */
type LockWords = Pick<Messages, 'missions' | 'shared'>;
import { holdDeletion } from './deletionHolding';
import { missionCapabilityStore } from './capability/missionCapabilityStore';
import { fetchGrantChain, publishCapabilityEvent } from './capability/capabilityDelegation';
import { manifestSigningKeyStore } from '../crypto/ManifestSigningKeyStore';
import { createMLDSASigner, verifyManifestSignature, manifestDigest } from '../exchange/signing';
import type { PackageManifest } from '../exchange/types';
import { stableStringify } from './findings/signFinding';
import { bytesToHex } from '@noble/hashes/utils';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { missionNamesPeopleProblem, missionWords } from './missionNamesPeople';

export interface PublishToNavcomResult {
  mission: MissionUI;
  broadcast: BroadcastResult;
  /** No relay took it, and the signed package waits on this device to go when one answers (W1c). */
  kept?: true;
}

/**
 * A Mission Package checked and built, not yet signed or sent: what the publish
 * review shows (plan item 0.1).
 */
export interface PreparedMissionPackage {
  missionId: string;
  /** The package as it will be signed, without its signature. */
  manifest: PackageManifest;
  /** What the mission said when this was built. Sending refuses if it changed since. */
  contentKey: string;
  /** Where it goes, from the mission's distribution: what the review shows is where it is sent. */
  relays: string[];
  /** What it cites, in its tags (D-MX: MX19, MX22): what the review shows is what is cited. */
  cites: ReportCitation[];
  /** Linked reports resting on observations it does not cite, their distribution not reaching as far (MX24). */
  heldBack: number;
  /** The Causes and Initiatives it works toward (RS59): what the review shows is what is linked. */
  toward: Array<{ coordinate: string; relay: string }>;
}

/** A delegation or revocation built and not yet signed: what the publish review shows. */
export interface PreparedCapabilityEvent {
  missionId: string;
  holder: string;
  /** The event as it will be signed, with the key that will sign it. */
  event: { kind: number; created_at: number; tags: string[][]; content: string; pubkey: string };
  /** Where it goes: where the mission goes. */
  relays: string[];
}

export interface MissionService {
  listMissions(): Promise<MissionUI[]>;
  getMission(id: string): Promise<MissionUI | null>;
  createMission(input: CreateMissionInput): Promise<MissionUI>;
  /** Full-record save — mirrors IntelCaseService.saveCase: read a mission, mutate a sub-field (a collaborator, an objective, ...), save it back through this. */
  saveMission(record: MissionUI): Promise<void>;
  /**
   * @param user - Who performed the transition (e.g. nostrIdentityService.signerPubkey()).
   *   Optional — when omitted, no STATUS_CHANGED activity entry is logged at
   *   all, rather than logging one with a fabricated actor. Unlike
   *   IntelReportService's history entries (where `user` is an optional
   *   field on an always-pushed entry), ActivityLogEntry.userId is a
   *   required field — there's no honest way to push an entry that claims
   *   an unknown actor performed it, so the entry is simply skipped instead.
   */
  updateStatus(id: string, status: MissionStatus, user?: string): Promise<MissionUI | null>;
  deleteMission(id: string): Promise<void>;
  /** Remove one objective, held ten seconds with Undo (plan item 0.6). */
  removeObjective(missionId: string, objectiveId: string, actorId: string): Promise<void>;
  /**
   * Cycle 4: package a READY_FOR_PACKAGE mission (redacted, per Locked
   * Decision #7 — objectives/briefing only, no raw report content or
   * analyst identity) and broadcast it to Navcom's shared Nostr relay
   * surface. Transitions READY_FOR_PACKAGE -> PACKAGED before broadcasting
   * (the package was built, whether or not the send succeeds), then
   * PACKAGED -> DISPATCHED only once the broadcast actually reports
   * success — a failed broadcast leaves the mission at PACKAGED rather
   * than silently reverting or silently advancing.
   */
  publishToNavcom(id: string): Promise<PublishToNavcomResult>;
  /**
   * Send a PACKAGED mission's kept package again, exactly as it was signed
   * (plan item 0.7). It does not step back through READY_FOR_PACKAGE, so what
   * was packaged is what goes out.
   */
  retryPublish(id: string, expectedDigest?: string): Promise<PublishToNavcomResult>;
  /**
   * A package kept when no relay took it went later (W1c): its mission, still packaged, is dispatched with the
   * receipt of that send. Sends nothing; anything else is left as it is.
   */
  recordKeptDispatch(missionId: string, event: Pick<NostrEvent, 'id' | 'pubkey' | 'tags'>, relaysAccepted: number, relaysTried: number): Promise<void>;
  /** Check a READY_FOR_PACKAGE mission for publishing and build its package, unsigned. Sends nothing. */
  prepareMissionPackage(id: string): Promise<PreparedMissionPackage>;
  /** Sign and send a package prepared from this mission, as prepared. Refuses if the mission changed since. */
  publishPreparedPackage(prepared: PreparedMissionPackage): Promise<PublishToNavcomResult>;
  prepareDelegation(missionId: string, holder: string): Promise<PreparedCapabilityEvent>;
  publishPreparedDelegation(prepared: PreparedCapabilityEvent): Promise<{ relaysOk: number }>;
  /** Close a dispatched mission as done or called off (D-MX, MX12). Its package says open until its closing is published. */
  closeMission(id: string, as: 'completed' | 'cancelled', user?: string): Promise<MissionUI>;
  /** Build the closing of a published mission's package, unsigned: the same package, saying closed. Sends nothing. */
  prepareClosingPackage(id: string): Promise<PreparedMissionPackage>;
  /** Sign and send a closing prepared from this mission, as prepared, and record what happened. */
  publishPreparedClosing(prepared: PreparedMissionPackage): Promise<PublishToNavcomResult>;
  prepareRevocation(missionId: string, holder: string, reason: string): Promise<PreparedCapabilityEvent>;
  publishPreparedRevocation(prepared: PreparedCapabilityEvent): Promise<{ relaysOk: number }>;
  /** Grant another operator authority to dispatch this mission. */
  delegateDispatch(missionId: string, holder: string): Promise<{ relaysOk: number }>;
  /** Withdraw a delegation this device issued. Only the issuer can: a revocation replaces the grant at its slot, and a slot belongs to the key that wrote it. */
  revokeDispatch(missionId: string, holder: string, reason: string): Promise<{ relaysOk: number }>;
  onChange(listener: (missions: MissionUI[]) => void): () => void;
}

/**
 * Classification levels whose content is encrypted at rest.
 *
 * Reused as the transmission threshold deliberately: the same levels
 * considered too sensitive to sit in plaintext on this device are too
 * sensitive to sit in plaintext on a public relay. The line was drawn for
 * storage, and until somebody decides otherwise it is the honest line for the
 * wire too. Mirrored IntelWorkspaceManager's own tier set; both are now the
 * `visibility` axis, so there is one predicate instead of two copies of a set.
 */

// The rule a mission rests on, one definition (plan items 0.6 and 1.8), in missionEvidence.
export { restsOnEvidence, evidenceIn, type EvidenceLookup };

/** A lookup over what this workspace holds now, for the gate. */
function workspaceEvidence(): EvidenceLookup {
  return evidenceIn(
    intelWorkspaceManager.getReports().map((r) => r.id),
    intelWorkspaceManager.getCases().map((c) => c.id),
  );
}

/**
 * What a mission's package cites (decision D-MX: MX19, MX22, MX24): the
 * observations its linked reports rest on, for each report whose distribution
 * reaches as far as the mission's, and how many reports were held back. Read
 * from the reports as stored now, when the package is built.
 */
function linkedCitations(mission: MissionUI): { cites: ReportCitation[]; heldBack: number } {
  const linked = new Set(mission.relatedReports ?? []);
  const reports = intelWorkspaceManager.getReports()
    .filter((r) => linked.has(r.id))
    .map((r) => ({
      visibility: isInformationVisibility(r.metadata?.visibility) ? r.metadata.visibility : undefined,
      cites: r.metadata?.cites,
    }));
  return packageCitations(reports, visibilityOf(mission));
}

/**
 * What a link to a record that is not here should say (plan item 0.6). The
 * deletion log knows the title of what was deleted in this workspace; a record
 * never held here is only its id, and calling it deleted would be a guess.
 */
export function absentLink(
  kind: 'report' | 'case', id: string, words: Messages['missions']['absentLabel'] = en.missions.absentLabel,
): { label: string; deleted: boolean } {
  const entry = intelWorkspaceManager.deletions().reverse().find((d) => d.kind === kind && d.id === id);
  return entry
    ? { label: interpolate(words.deleted, { title: entry.title }), deleted: true }
    : { label: interpolate(words.notHere, { id }), deleted: false };
}

/**
 * Where a mission's package and its grants go, from who may receive it, or
 * the words to show when that is nowhere (plan items 0.4 and 0.5, decision
 * D2). ONE definition: the Publish button and the gate both read it, because a
 * button enabled by one definition and refused by another is worse than no
 * button.
 *
 * Limited used to be refused unless every mission relay was on this network,
 * so with the default relays a Limited mission could never be published; and
 * a mission nobody had marked went to public relays.
 */
export function missionDestinations(
  mission: Pick<MissionUI, 'visibility' | 'limitedTo'>,
  words: Messages['reasons'] = en.reasons,
): { relays: string[]; refusal: string | null } {
  return whereItGoes('MISSION', visibilityOf(mission), 'mission', words, mission.limitedTo);
}

/**
 * restsOnEvidence, reading a briefing that is encrypted at rest.
 *
 * A protected mission stores its briefing as ciphertext, and restsOnEvidence reads only
 * the string it is handed. So a direct observation declared in a protected briefing was
 * invisible: the gate refused the mission with a message telling the operator to write
 * what they had already written, and the Missions panel disabled the button. Found in
 * the classification purge (stage 6b) and deferred, because the fix had to decide
 * whether this check may decrypt. It may: the briefing is decrypted in memory, as it
 * already is to build the package, and nothing derived from it is stored.
 */
export async function restsOnEvidenceReadingBriefing(mission: MissionUI, evidence: EvidenceLookup): Promise<boolean> {
  if (restsOnEvidence(mission, evidence)) return true;
  if (!isEncryptedAtRest(mission.briefing)) return false;
  try {
    const briefing = await intelWorkspaceManager.decryptMissionBriefing(mission.id);
    return typeof briefing === 'string' && restsOnEvidence({ ...mission, briefing }, evidence);
  } catch {
    // No key for it in this browser: nothing in it can be read, so nothing is declared.
    return false;
  }
}

/**
 * Statuses only publishing writes (plan item 0.7). PACKAGED means a package was
 * built and signed; DISPATCHED means at least one relay accepted it. Written
 * any other way, either would be a claim nothing backs.
 */
const WRITTEN_ONLY_BY_PUBLISHING: ReadonlySet<MissionStatus> = new Set([MissionStatus.PACKAGED, MissionStatus.DISPATCHED]);

/** From READY_FOR_PACKAGE on, what the mission's package carries cannot change. */
const PACKAGE_LOCKED: ReadonlySet<MissionStatus> = new Set([
  MissionStatus.READY_FOR_PACKAGE, MissionStatus.PACKAGED, MissionStatus.DISPATCHED, MissionStatus.CLOSED,
]);

/** Published: dispatched, or closed since. Its package is on the relays as it went out. */
const wasPublished = (mission: Pick<MissionUI, 'status'>) =>
  mission.status === MissionStatus.DISPATCHED || mission.status === MissionStatus.CLOSED;

/** Whether what a mission's package carries, its distribution among it, can no longer change. */
export function missionPackageLocked(mission: Pick<MissionUI, 'status'>): boolean {
  return PACKAGE_LOCKED.has(mission.status);
}

/**
 * Why who takes a mission and its field work cannot be changed now, or null
 * (D-MX). They travel in the package, so they lock with it, as the
 * distribution does.
 */
export function missionProfileLock(mission: Pick<MissionUI, 'status'>, said: LockWords = en): string | null {
  if (!missionPackageLocked(mission)) return null;
  if (wasPublished(mission)) return said.missions.locks.profilePublished;
  return interpolate(said.missions.locks.profileMoveBack, { planning: statusName('mission', MissionStatus.PLANNING, said.shared) });
}

/**
 * Why a mission's distribution cannot be chosen or changed now, in words that
 * say what to do instead, or null when it can (plan item 9.13). It travels in
 * the package, so it locks with it; the way back is through Planning, and a
 * mission already published has none.
 */
export function missionDistributionLock(mission: Pick<MissionUI, 'status' | 'visibility'>, said: LockWords = en): string | null {
  if (!missionPackageLocked(mission)) return null;
  if (wasPublished(mission)) return said.missions.locks.distributionPublished;
  return interpolate(visibilityOf(mission) === undefined ? said.missions.locks.distributionChoose : said.missions.locks.distributionChange, {
    planning: statusName('mission', MissionStatus.PLANNING, said.shared),
  });
}

/**
 * Why a mission goes nowhere, in whereItGoes' words, and, where those ask for
 * a different distribution that its locked package will not take, how to get
 * there (plan item 9.13). A Public mission's only refusal is a build with no
 * relays at all, which no distribution would change, so it says nothing more.
 */
export function goesNowhereWords(mission: Pick<MissionUI, 'status' | 'visibility'>, refusal: string | null, said: LockWords = en): string | null {
  const lock = missionDistributionLock(mission, said);
  return refusal !== null && lock !== null && visibilityOf(mission) !== 'public' ? `${refusal} ${lock}` : refusal;
}

/**
 * What a Mission Package carries from a mission, as one comparable string.
 *
 * Taken from the package builder itself, so the lock cannot drift from what a
 * package holds. Objective completion is set aside: ticking one done is
 * progress, not a change to what was asked. Status is set aside too.
 */
function packagedContent(mission: MissionUI): string {
  const compose = buildMissionPackageComposeInput({
    ...mission,
    status: MissionStatus.DRAFT,
    objectives: mission.objectives.map((o) => ({ ...o, completed: false })),
  });
  // What it works toward travels in its package's tags (RS59), so it locks with the package too.
  return stableStringify(mission.toward?.length ? { compose, toward: mission.toward } : compose);
}

async function assertRestsOnEvidence(mission: MissionUI): Promise<void> {
  if (await restsOnEvidenceReadingBriefing(mission, workspaceEvidence())) return;

  throw new Error(
    `Mission ${mission.missionNumber} cannot become READY_FOR_PACKAGE: it rests on no evidence. `
    + 'Attach at least one intel report or case, or — if it rests on direct observation — say so '
    + 'in the briefing, so the basis is recorded rather than absent.',
  );
}

function activityEntry(action: MissionActivityAction, userId: string, details: Record<string, unknown>) {
  return {
    id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    action,
    timestamp: new Date().toISOString(),
    userId,
    details,
  };
}

class WorkspaceBackedMissionService implements MissionService {
  private listeners = new Set<(missions: MissionUI[]) => void>();
  /** Memoized promise, not a boolean — same concurrent-init hazard IntelReportService/IntelCaseService already had to fix. */
  private initPromise: Promise<void> | null = null;

  private notify(missions: MissionUI[]) { this.listeners.forEach(l => l(missions)); }

  private async ensure(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await intelWorkspaceManager.ensureInitialized();
        intelWorkspaceManager.subscribe(async () => {
          this.notify(await this.listMissions());
        });
      })();
    }
    return this.initPromise;
  }

  async listMissions(): Promise<MissionUI[]> {
    await this.ensure();
    return intelWorkspaceManager.getMissions();
  }

  async getMission(id: string): Promise<MissionUI | null> {
    await this.ensure();
    return intelWorkspaceManager.getMission(id);
  }

  async createMission(input: CreateMissionInput): Promise<MissionUI> {
    await this.ensure();
    // Every mission starts at DRAFT. The input type has no status; this stops a
    // caller that passes one anyway, such as an import, from starting a mission
    // part-way along (plan item 0.7).
    const claimed = (input as { status?: unknown }).status;
    if (claimed !== undefined && claimed !== MissionStatus.DRAFT) {
      throw new Error(`A mission starts at ${MissionStatus.DRAFT}, not ${String(claimed)}. It moves on through updateStatus and publishing.`);
    }
    return await intelWorkspaceManager.addMission(input);
  }

  /**
   * Save a mission's content. It cannot change the status, and from
   * READY_FOR_PACKAGE on it cannot change what the package carries (plan item
   * 0.7). A comment, a claim or an objective ticked done still saves.
   */
  async saveMission(record: MissionUI): Promise<void> {
    await this.ensure();
    const current = intelWorkspaceManager.getMission(record.id);
    if (!current) {
      await intelWorkspaceManager.updateMission(record);
      return;
    }
    if (record.status !== current.status) {
      throw new Error(`Saving cannot change a mission's status (${current.status} to ${record.status}). Use updateStatus; ${MissionStatus.PACKAGED} and ${MissionStatus.DISPATCHED} come only from publishing.`);
    }
    if (PACKAGE_LOCKED.has(current.status) && packagedContent(record) !== packagedContent(current)) {
      throw new Error(`This mission is locked from ${statusName('mission', MissionStatus.READY_FOR_PACKAGE)} on: that change would alter its package. Move it back to ${statusName('mission', MissionStatus.PLANNING)} to change it.`);
    }
    // What only publishing writes is kept from the stored record, whatever the caller held.
    await intelWorkspaceManager.updateMission({
      ...record,
      dispatchedDate: current.dispatchedDate,
      publishedAs: current.publishedAs,
      packagedManifest: current.packagedManifest,
      packagedCites: current.packagedCites,
      dispatchReceipt: current.dispatchReceipt,
      lastPublishAttempt: current.lastPublishAttempt,
      closedAs: current.closedAs,
      closingReceipt: current.closingReceipt,
    });
  }

  async updateStatus(id: string, status: MissionStatus, user?: string): Promise<MissionUI | null> {
    await this.ensure();
    const current = intelWorkspaceManager.getMission(id);
    if (!current) return null;
    if (current.status === status) return current;
    if (status === MissionStatus.CLOSED) {
      throw new Error('A mission is closed as completed or cancelled, and closeMission records which.');
    }
    if (WRITTEN_ONLY_BY_PUBLISHING.has(status)) {
      throw new Error(`A mission becomes ${status} only by publishing it: the package is built and signed there, and dispatch is recorded from the relays' receipt.`);
    }
    return this.moveTo(current, status, user);
  }

  /**
   * The one place a mission's status is written. updateStatus reaches it for
   * the statuses a person chooses; publishing reaches it for PACKAGED, with the
   * signed package, and DISPATCHED, with the relays' receipt.
   */
  private async moveTo(current: MissionUI, status: MissionStatus, user: string | undefined, record: Partial<MissionUI> = {}): Promise<MissionUI> {
    if (!VALID_MISSION_STATUS_TRANSITIONS[current.status].includes(status)) {
      throw new Error(`Invalid mission status transition: ${current.status} -> ${status}`);
    }
    if (status === MissionStatus.READY_FOR_PACKAGE) await assertRestsOnEvidence(current);
    /*
     * Field work names a region and an end to come before it is ready (D-MX,
     * MX13). Only on the way forward: a packaged mission whose end has passed
     * must still be able to go back through Ready to Planning to change it.
     */
    if (status === MissionStatus.READY_FOR_PACKAGE && current.status === MissionStatus.PLANNING) {
      const fieldWork = fieldWorkProblem(current);
      if (fieldWork) throw new Error(fieldWork);
    }
    const updated: MissionUI = {
      ...current,
      // Back to READY_FOR_PACKAGE drops a kept package: the next publish builds anew.
      ...(status === MissionStatus.READY_FOR_PACKAGE ? { packagedManifest: undefined, packagedCites: undefined } : {}),
      ...record,
      status,
      dispatchedDate: status === MissionStatus.DISPATCHED ? new Date().toISOString() : current.dispatchedDate,
      // The STATUS CHANGE is always logged; only the ACTOR can be unknown.
      // This used to drop the whole entry when no caller identity was passed,
      // so a mission could move DRAFT -> ... -> DISPATCHED leaving no trace
      // that it moved at all — the same defect already fixed on the Case side
      // (see currentAttribution in caseManagerAdapter). An empty userId says
      // "we do not know who", which is honest; writing a placeholder name
      // would launder that into a named actor in an audit trail.
      activityLog: [...current.activityLog, {
        id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        action: MissionActivityAction.STATUS_CHANGED,
        timestamp: new Date().toISOString(),
        userId: user ?? '',
        details: { fromStatus: current.status, toStatus: status }
      }]
    };
    await intelWorkspaceManager.updateMission(updated);
    // A package kept to go later (W1c) goes only while its mission is packaged: moved back to change it, it is let go.
    if (current.status === MissionStatus.PACKAGED && status !== MissionStatus.DISPATCHED) {
      await eventOutbox.cancelWhere((r) => isKeptPackageOf(r, current.id));
    }
    return updated;
  }

  /** Deletes a mission, held for ten seconds with Undo (plan item 0.6). */
  async deleteMission(id: string): Promise<void> {
    await this.ensure();
    const removed = intelWorkspaceManager.removeMission(id);
    if (!removed) return;
    // Its package, kept to go later, goes nowhere now; brought back, it is retried by hand. Let go in the background,
    // so the Undo notice shows at once rather than after a storage round trip.
    void eventOutbox.cancelWhere((r) => isKeptPackageOf(r, id)).catch(() => undefined);
    holdDeletion({
      label: `Mission "${removed.title}"`,
      undo: async () => {
        const restored = intelWorkspaceManager.restoreDeleted('mission', id) as MissionUI | null;
        if (!restored) return;
        // Its own history says when it was deleted and that it was brought back.
        await intelWorkspaceManager.updateMission({
          ...restored,
          activityLog: [...restored.activityLog, activityEntry(
            MissionActivityAction.RESTORED, nostrIdentityService.signerPubkey() ?? '', { deletedAt: removed.deletedAt },
          )],
        });
      },
      finalize: () => intelWorkspaceManager.finalizeDeletion('mission', id),
    });
  }

  /**
   * Removes an objective, held ten seconds with Undo (plan item 0.6). The log
   * keeps the whole objective and where it was, not only its text, so Undo
   * puts back the same objective in the same place. Nothing is encrypted per
   * objective, so there is nothing to make final.
   */
  async removeObjective(missionId: string, objectiveId: string, actorId: string): Promise<void> {
    await this.ensure();
    const mission = intelWorkspaceManager.getMission(missionId);
    const index = mission ? mission.objectives.findIndex((o) => o.id === objectiveId) : -1;
    if (!mission || index === -1) return;
    const objective = mission.objectives[index];
    await this.saveMission({
      ...mission,
      objectives: mission.objectives.filter((o) => o.id !== objectiveId),
      activityLog: [...mission.activityLog, activityEntry(
        MissionActivityAction.OBJECTIVE_REMOVED, actorId, { objectiveId, description: objective.description, index, objective },
      )],
    });
    holdDeletion({
      label: `Objective "${objective.description}"`,
      undo: async () => {
        const current = intelWorkspaceManager.getMission(missionId);
        if (!current || current.objectives.some((o) => o.id === objectiveId)) return;
        const objectives = [...current.objectives];
        objectives.splice(Math.min(index, objectives.length), 0, objective);
        await this.saveMission({
          ...current,
          objectives,
          activityLog: [...current.activityLog, activityEntry(
            MissionActivityAction.RESTORED, nostrIdentityService.signerPubkey() ?? '', { objectiveId, description: objective.description },
          )],
        });
      },
      finalize: () => {},
    });
  }

  /**
   * Where this mission may go, or a refusal that says why it may go nowhere.
   * Restricted content is never published where anyone can read it.
   *
   * The marking on a mission drove exactly one thing: whether a field was
   * encrypted IN LOCAL STORAGE. On the publish path it drove nothing — this
   * service contained no reference to it at all. So a mission marked SECRET
   * went: briefing encrypted at rest, decrypted for packaging, redacted, and
   * published in PLAINTEXT to five public relays carrying
   * a restrictive marking in the manifest.
   *
   * The label crossed; the protection did not. That is worse than an
   * unlabelled document, because it reads as though something enforced it —
   * and a relay publish cannot be recalled.
   *
   * Now keyed on `visibility`, which is the axis that actually means "who may
   * receive this". That is a real improvement and not just a rename: under
   * the old tier set, the only way to keep a mission off public relays was to
   * mark it CONFIDENTIAL, which ALSO forced its briefing to be encrypted at
   * rest. 'limited' now says the one thing without the other.
   *
   * Redaction is not the answer here: it is unconditional and it masks
   * positions, emails and name-shaped text. It is not confidentiality.
   *
   * This fails CLOSED, and deliberately does not offer an override. Reach
   * control is what it does now: the distribution picks the relays (plan item
   * 0.4), and Limited goes only to the team's internal relays. Encrypting the
   * payload to a recipient's published ML-KEM key is still to come (bundles,
   * plan item 2.4); it is a format decision shared with Navcom.
   */
  private destinationsOf(mission: MissionUI): string[] {
    const { relays, refusal } = missionDestinations(mission);
    if (refusal) throw new Error(refusal);
    return relays;
  }

  /**
   * Whether this operator holds dispatch on this mission.
   *
   * Authority is ROOTED IN THE RESOURCE, not granted by any body: the mission
   * records `createdBy`, and only a chain starting from that key grants
   * anything. There is no institution to consult and nothing to be online for.
   *
   * A creator with no stored chain gets one minted here rather than being
   * refused. That is not a loophole — the root grant is DERIVABLE from the
   * mission itself, so refusing would only punish whoever legitimately made
   * it for having cleared their storage. Anyone else still needs a signed
   * delegation, which they cannot mint.
   */
  private async assertMayDispatch(mission: MissionUI): Promise<void> {
    // The signer, whose key mints and holds the grants (plan item 2.2). This was
    // this browser's key, so with an extension installed the root grant was
    // signed by the extension and checked against a local key: never a match.
    const acting = await nostrIdentityService.refreshSigner();
    if (!acting) {
      throw new Error('Cannot dispatch: this device has no Nostr identity to act as.');
    }

    // IntelWorkspaceManager.currentActorId() records the literal string
    // 'operative' when no Nostr identity existed at creation time. That is not
    // a public key, so no keypair can ever issue a grant rooted in it and the
    // mission is undispatchable by anyone, permanently. Said plainly here
    // rather than surfacing as "the chain does not start from whoever created
    // this mission", which sounds like a permissions problem and is not one.
    if (mission.createdBy === 'operative') {
      throw new Error(
        `Cannot dispatch mission ${mission.id}: it was created before this device had a Nostr identity, `
        + 'so its authority cannot be rooted in anyone. Recreate it under the current identity.',
      );
    }

    const resource = missionResource(mission.id);
    let chain = missionCapabilityStore.get(mission.id);

    if (chain.length === 0 && acting === mission.createdBy) {
      chain = [await mintRootGrantSigned(resource, nostrIdentityService.asSigner())];
      missionCapabilityStore.put(mission.id, chain);
    }

    const expectation = {
      resource, action: 'dispatch' as const, holder: acting, rootIssuer: mission.createdBy,
    };
    let check = verifyGrantChain(chain, expectation);

    // A delegation is minted on the delegator's device and published so the
    // holder can obtain it. So a chain we hold no local copy of is the normal
    // case for a delegate, not an error — look for one addressed to us before
    // refusing.
    if (!check.ok && acting !== mission.createdBy) {
      const fetched = await fetchGrantChain(resource, acting);
      if (fetched.length > 0) {
        const fetchedCheck = verifyGrantChain(fetched, expectation);
        if (fetchedCheck.ok) {
          missionCapabilityStore.put(mission.id, fetched);
          chain = fetched;
          check = fetchedCheck;
        }
      }
    }

    if (!check.ok) {
      throw new Error(`Cannot dispatch this mission: ${check.reason}`);
    }
  }

  /**
   * Grant another operator authority to dispatch this mission.
   *
   * Only somebody who already holds dispatch may pass it on — the chain is
   * verified first, so this cannot mint authority the caller does not have.
   * The grant is published because a delegation the holder cannot obtain is
   * not a delegation; they are on another device.
   */
  async delegateDispatch(missionId: string, holder: string): Promise<{ relaysOk: number }> {
    return this.publishPreparedDelegation(await this.prepareDelegation(missionId, holder));
  }

  async prepareDelegation(missionId: string, holder: string): Promise<PreparedCapabilityEvent> {
    await this.ensure();
    const mission = intelWorkspaceManager.getMission(missionId);
    if (!mission) throw new Error(`Mission not found: ${missionId}`);

    const acting = await nostrIdentityService.refreshSigner();
    if (!acting) throw new Error('Cannot delegate: this device has no Nostr identity to act as.');
    if (holder === acting) throw new Error('Cannot delegate to yourself; you already hold this.');

    await this.assertMayDispatch(mission);
    const relays = this.destinationsOf(mission);
    const chain = missionCapabilityStore.get(missionId);
    const held = chain[chain.length - 1];
    const parent = held ? readGrant(held) : null;
    if (!held || !parent) throw new Error('Cannot delegate: no capability is held for this mission.');

    const unsigned = buildGrantEvent({
      resource: parent.resource,
      action: parent.action,
      holder,
      parentId: held.id,
      issuedAt: new Date().toISOString(),
    }) as Omit<PreparedCapabilityEvent['event'], 'pubkey'>;
    return { missionId, holder, event: { ...unsigned, pubkey: acting }, relays };
  }

  async publishPreparedDelegation(prepared: PreparedCapabilityEvent): Promise<{ relaysOk: number }> {
    await this.ensure();
    const chain = missionCapabilityStore.get(prepared.missionId);
    if (!chain.length) throw new Error('Cannot delegate: no capability is held for this mission.');
    const grant = await this.signPrepared(prepared);
    const relaysOk = await publishCapabilityEvent(grant, prepared.relays);
    // The delegator keeps their own record so the delegation stays visible to
    // them even if no relay retained it.
    missionCapabilityStore.putDelegation(prepared.missionId, prepared.holder, [...chain, grant]);
    return { relaysOk };
  }

  /** Sign exactly the prepared event, under the key it names. */
  private async signPrepared(prepared: PreparedCapabilityEvent): Promise<NostrEvent> {
    const signer = nostrIdentityService.asSigner();
    if ((await signer.getPublicKey()) !== prepared.event.pubkey) {
      throw new Error('The signing key changed after this was reviewed. Review it again.');
    }
    return signer.signEvent({ ...prepared.event });
  }

  /**
   * Withdraw a delegation this device issued.
   *
   * ─── WHY ONLY THE ISSUER ───────────────────────────────────────────────
   *
   * Not a policy choice. A revocation works by replacing the grant at its slot,
   * and a replaceable event's slot is keyed by (pubkey, kind, d) — so a
   * different key publishing to `cap:<resource>:<holder>` writes to its OWN
   * slot and removes nothing. Someone else's "revocation" would be an event
   * nobody fetches. Refused here with a reason rather than published into the
   * void.
   */
  async revokeDispatch(missionId: string, holder: string, reason: string): Promise<{ relaysOk: number }> {
    return this.publishPreparedRevocation(await this.prepareRevocation(missionId, holder, reason));
  }

  async prepareRevocation(missionId: string, holder: string, reason: string): Promise<PreparedCapabilityEvent> {
    await this.ensure();
    const mission = intelWorkspaceManager.getMission(missionId);
    if (!mission) throw new Error(`Mission not found: ${missionId}`);

    const acting = await nostrIdentityService.refreshSigner();
    if (!acting) throw new Error('Cannot revoke: this device has no Nostr identity to act as.');
    const relays = this.destinationsOf(mission);

    const record = missionCapabilityStore.delegations(missionId).find((d) => d.holder === holder);
    if (!record) throw new Error('Cannot revoke: no delegation to this holder is recorded on this device.');

    const leaf = record.chain[record.chain.length - 1];
    const grant = leaf ? readGrant(leaf) : null;
    if (!grant) throw new Error('Cannot revoke: the recorded delegation is not a readable grant.');
    if (grant.issuer !== acting) {
      throw new Error('Only whoever issued a delegation can withdraw it; this device did not issue this one.');
    }

    const unsigned = buildRevocationEvent({
      resource: grant.resource,
      action: grant.action,
      holder: grant.holder,
      revokedAt: new Date().toISOString(),
      reason,
    }) as Omit<PreparedCapabilityEvent['event'], 'pubkey'>;
    return { missionId, holder, event: { ...unsigned, pubkey: acting }, relays };
  }

  async publishPreparedRevocation(prepared: PreparedCapabilityEvent): Promise<{ relaysOk: number }> {
    await this.ensure();
    const revocation = await this.signPrepared(prepared);
    const relaysOk = await publishCapabilityEvent(revocation, prepared.relays);
    /*
     * The local record is kept unless a relay took it.
     *
     * A revocation that reached nothing is an authority still in force while
     * its issuer believes they took it back. Forgetting it here would show this
     * device "not delegated" while the holder still has something that
     * verifies — the one failure direction that must not happen quietly.
     */
    if (relaysOk > 0) missionCapabilityStore.removeDelegation(prepared.missionId, prepared.holder);
    return { relaysOk };
  }

  async publishToNavcom(id: string): Promise<PublishToNavcomResult> {
    return this.publishPreparedPackage(await this.prepareMissionPackage(id));
  }

  async prepareMissionPackage(id: string): Promise<PreparedMissionPackage> {
    await this.ensure();
    const current = intelWorkspaceManager.getMission(id);
    if (!current) throw new Error(`Mission not found: ${id}`);
    if (current.status !== MissionStatus.READY_FOR_PACKAGE) {
      throw new Error(`Mission must be READY_FOR_PACKAGE to publish (current: ${current.status})`);
    }

    await this.assertMayDispatch(current);
    const relays = this.destinationsOf(current);
    // Field work names a region and an end, and is never published after its end (D-MX, MX13).
    const fieldWork = fieldWorkProblem(current);
    if (fieldWork) throw new Error(fieldWork);

    // Resolve the real briefing: for a CONFIDENTIAL+ mission, current.briefing
    // is the STORED, encrypted-at-rest ciphertext (see IntelWorkspaceManager's
    // Cycle 3 fix), not the real text. buildMissionPackageManifest needs the
    // actual briefing to redact and package — without this, a classified
    // mission's "package" sent to Navcom would literally be the raw ciphertext
    // JSON blob. A missing key fails here, before anything is built or shown.
    const realBriefing = await intelWorkspaceManager.decryptMissionBriefing(id);
    if (realBriefing === null) {
      throw new Error(`Cannot publish mission ${id}: its briefing is encrypted and its decryption key is missing`);
    }

    /*
     * The package names its signer as author: the callsign they publish, or
     * their key (D-MX, MX7). Resolved now, so the review shows the author that
     * will be signed; a person with no key yet has one made here, as the
     * publish they asked for would make it.
     */
    const signer = await nostrIdentityService.ensureSigner('publish a Mission Package');
    const author = authorFor(signer);

    // Built as PACKAGED, which is what the package has always said of itself.
    const manifest = buildMissionPackageManifest({ ...current, status: MissionStatus.PACKAGED, briefing: realBriefing }, author, agentFor(signer));
    // A mission names no one: none goes out carrying a tagged note's words (D-NP, NP5).
    const naming = missionNamesPeopleProblem(missionWords(manifest));
    if (naming) throw new Error(naming);
    return {
      missionId: id,
      manifest,
      contentKey: packagedContent(current),
      relays,
      ...linkedCitations(current),
      toward: current.toward ?? [],
    };
  }

  async publishPreparedPackage(prepared: PreparedMissionPackage): Promise<PublishToNavcomResult> {
    await this.ensure();
    const current = intelWorkspaceManager.getMission(prepared.missionId);
    if (!current) throw new Error(`Mission not found: ${prepared.missionId}`);
    if (current.status !== MissionStatus.READY_FOR_PACKAGE) {
      throw new Error(`Mission must be READY_FOR_PACKAGE to publish (current: ${current.status})`);
    }
    // What was reviewed must still be what the mission says.
    if (packagedContent(current) !== prepared.contentKey) {
      throw new Error('The mission changed after its package was reviewed. Review it again.');
    }
    // An end can pass while the review is open.
    const fieldWork = fieldWorkProblem(current);
    if (fieldWork) throw new Error(fieldWork);
    // And a note naming a person can arrive while it is open (D-NP, NP5).
    const naming = missionNamesPeopleProblem(missionWords(prepared.manifest));
    if (naming) throw new Error(naming);
    await this.assertMayDispatch(current);
    this.destinationsOf(current);

    // ML-DSA-65 signs the MANIFEST payload — a second, independent,
    // post-quantum-safe integrity proof over the package content, distinct
    // from (and unable to replace, per NIP-01) the outer Nostr event's own
    // Schnorr signature applied next in publishMissionPackage. Signs under
    // this Starcom instance's persisted keypair (generated once, reused for
    // every package) rather than a fresh throwaway key, so a verifier can
    // actually attribute this and future packages to the same source.
    const signingKeys = await manifestSigningKeyStore.getOrCreate(() => ml_dsa65.keygen());
    const manifest = await createMLDSASigner(bytesToHex(signingKeys.secretKey))(prepared.manifest);

    // The signed package is kept with the mission, so a retry sends exactly it.
    const packaged = await this.moveTo(current, MissionStatus.PACKAGED, nostrIdentityService.signerPubkey() ?? undefined, {
      packagedManifest: manifest,
      packagedCites: prepared.cites.length ? prepared.cites : undefined,
      lastPublishAttempt: undefined,
    });
    return this.send(packaged, manifest, prepared.relays, prepared.cites);
  }

  async retryPublish(id: string, expectedDigest?: string): Promise<PublishToNavcomResult> {
    await this.ensure();
    const current = intelWorkspaceManager.getMission(id);
    if (!current) throw new Error(`Mission not found: ${id}`);
    if (current.status !== MissionStatus.PACKAGED) {
      throw new Error(`Only a ${MissionStatus.PACKAGED} mission can be retried (current: ${current.status})`);
    }
    const manifest = current.packagedManifest;
    if (!manifest) {
      throw new Error(`This mission was packaged before packages were kept, so there is nothing frozen to send again. Move it back to ${MissionStatus.READY_FOR_PACKAGE} and publish it.`);
    }
    // Kept in browser storage, possibly for days. Check it is still what this
    // instance signed before it goes on the wire, as the findings outbox does.
    if (!(await verifyManifestSignature(manifest))) {
      throw new Error(`The kept package no longer matches its signature, so it will not be sent. Move the mission back to ${MissionStatus.READY_FOR_PACKAGE} and publish it.`);
    }
    // A reviewed retry names the package it showed; anything else is refused.
    if (expectedDigest !== undefined && bytesToHex(manifestDigest(manifest)) !== expectedDigest) {
      throw new Error('The kept package is not the one that was reviewed. Review it again.');
    }
    const ended = keptFieldWorkProblem(manifest.profile);
    if (ended) throw new Error(ended);
    await this.assertMayDispatch(current);
    return this.send(current, manifest, this.destinationsOf(current), current.packagedCites ?? []);
  }

  async closeMission(id: string, as: 'completed' | 'cancelled', user?: string): Promise<MissionUI> {
    await this.ensure();
    const current = intelWorkspaceManager.getMission(id);
    if (!current) throw new Error(`Mission not found: ${id}`);
    if (current.status !== MissionStatus.DISPATCHED) {
      throw new Error(`Only a dispatched mission is closed (current: ${statusName('mission', current.status)}). One never published can be deleted.`);
    }
    return this.moveTo(current, MissionStatus.CLOSED, user, { closedAs: as });
  }

  /**
   * The closing of a published mission's package (D-MX, MX12): the same
   * package, at the same address, saying `mission_state: closed`, so NavCom
   * stops offering what can no longer be settled. Built for a closed mission,
   * or for a dispatched one about to be deleted.
   *
   * A package is replaced at (kind, key, d), so only the key that published it
   * can close it: under any other key the closing would sit beside it.
   */
  async prepareClosingPackage(id: string): Promise<PreparedMissionPackage> {
    await this.ensure();
    const current = intelWorkspaceManager.getMission(id);
    if (!current) throw new Error(`Mission not found: ${id}`);
    if (!wasPublished(current)) {
      throw new Error(`Only a published mission's package can be closed (current: ${statusName('mission', current.status)}).`);
    }
    const publisher = this.publisherOf(current);
    const signer = await nostrIdentityService.ensureSigner('close a Mission Package');
    if (signer !== publisher) throw new Error(anotherKeyWords(publisher));
    await this.assertMayDispatch(current);
    const relays = this.destinationsOf(current);
    const realBriefing = await intelWorkspaceManager.decryptMissionBriefing(id);
    if (realBriefing === null) {
      throw new Error(`Cannot close mission ${id}'s package: its briefing is encrypted and its decryption key is missing`);
    }
    return {
      missionId: id,
      // Its region and end unchanged: closed after its end is what closing is for.
      manifest: buildMissionPackageManifest({ ...current, status: MissionStatus.CLOSED, briefing: realBriefing }, authorFor(signer), agentFor(signer)),
      contentKey: packagedContent(current),
      relays,
      // What the package cited, cited still: the closing replaces it at its address.
      cites: current.packagedCites ?? [],
      heldBack: 0,
      toward: current.toward ?? [],
    };
  }

  async publishPreparedClosing(prepared: PreparedMissionPackage): Promise<PublishToNavcomResult> {
    await this.ensure();
    const current = intelWorkspaceManager.getMission(prepared.missionId);
    if (!current) throw new Error(`Mission not found: ${prepared.missionId}`);
    if (!wasPublished(current)) {
      throw new Error(`Only a published mission's package can be closed (current: ${statusName('mission', current.status)}).`);
    }
    if (prepared.manifest.profile?.missionState !== 'closed') {
      throw new Error('That package does not say closed, so it is not a closing.');
    }
    if (packagedContent(current) !== prepared.contentKey) {
      throw new Error('The mission changed after its closing was reviewed. Review it again.');
    }
    const publisher = this.publisherOf(current);
    if ((await nostrIdentityService.refreshSigner()) !== publisher) throw new Error(anotherKeyWords(publisher));
    await this.assertMayDispatch(current);
    this.destinationsOf(current);

    const signingKeys = await manifestSigningKeyStore.getOrCreate(() => ml_dsa65.keygen());
    const manifest = await createMLDSASigner(bytesToHex(signingKeys.secretKey))(prepared.manifest);
    const broadcastService = new MissionPackageBroadcastService(prepared.relays);
    const broadcast = await broadcastService.publishMissionPackage(manifest, nostrIdentityService.asSigner(), prepared.cites, prepared.toward);
    broadcastService.dispose();

    const receipt = receiptOf(broadcast);
    const recorded: MissionUI = broadcast.success
      ? { ...current, closingReceipt: receipt, lastPublishAttempt: undefined }
      : { ...current, lastPublishAttempt: { ...receipt, ...(broadcast.error ? { error: broadcast.error } : {}) } };
    await intelWorkspaceManager.updateMission(recorded);
    return { mission: recorded, broadcast };
  }

  /** The key a published mission's package went out under, from where it went. */
  private publisherOf(mission: MissionUI): string {
    const publisher = mission.publishedAs?.split(':')[1];
    if (!publisher) {
      throw new Error('It went out before where it went was recorded, so its package cannot be replaced. It is closed here only.');
    }
    return publisher;
  }

  /**
   * Broadcast a signed package and record what happened. DISPATCHED is written
   * only here, and only with a receipt: at least one relay accepted it.
   */
  private async send(packaged: MissionUI, manifest: PackageManifest, relays: string[], cites: readonly ReportCitation[]): Promise<PublishToNavcomResult> {
    const broadcastService = new MissionPackageBroadcastService(relays);
    const broadcast = await broadcastService.publishMissionPackage(manifest, nostrIdentityService.asSigner(), cites, packaged.toward ?? []);
    broadcastService.dispose();

    const receipt = receiptOf(broadcast);

    if (!broadcast.success) {
      const recorded: MissionUI = { ...packaged, lastPublishAttempt: { ...receipt, ...(broadcast.error ? { error: broadcast.error } : {}) } };
      await intelWorkspaceManager.updateMission(recorded);
      // No relay took it: the package, as signed, waits on this device and goes when one answers (W1c). Not when
      // every relay refused it for good: that is shown, with their reasons, and Retry (walk story S22).
      const kept = broadcast.signed && !refusedForGood(broadcast.said ?? [])
        ? await eventOutbox.keep(broadcast.signed, relays, { after: { dispatched: { mission: packaged.id } } }).then(() => true, () => false)
        : false;
      return { mission: recorded, broadcast, ...(kept ? { kept: true as const } : {}) };
    }
    // Sent: an older version of it kept to go later is not needed now.
    await eventOutbox.cancelWhere((r) => isKeptPackageOf(r, packaged.id));

    /*
     * Remember where it went, so a reply to it can be found.
     *
     * The coordinate comes from the signed event, not from the current
     * identity: a package stays addressable at the key that published it even
     * if this node signs under a different one later. Without this the mission
     * is dispatched and unreachable — which is the state every package was in
     * when a peer asked, on 2026-09-20, how a reply threads here.
     */
    const dispatched = await this.moveTo(packaged, MissionStatus.DISPATCHED, nostrIdentityService.signerPubkey() ?? undefined, {
      dispatchReceipt: receipt,
      lastPublishAttempt: undefined,
      ...(broadcast.coordinate ? { publishedAs: broadcast.coordinate } : {}),
    });
    return { mission: dispatched, broadcast };
  }

  async recordKeptDispatch(missionId: string, event: Pick<NostrEvent, 'id' | 'pubkey' | 'tags'>, relaysAccepted: number, relaysTried: number): Promise<void> {
    await this.ensure();
    const current = intelWorkspaceManager.getMission(missionId);
    if (!current || current.status !== MissionStatus.PACKAGED) return;
    const d = event.tags.find((t) => t[0] === 'd')?.[1];
    await this.moveTo(current, MissionStatus.DISPATCHED, event.pubkey, {
      dispatchReceipt: { eventId: event.id, relaysAccepted, relaysTried, at: new Date().toISOString() },
      lastPublishAttempt: undefined,
      ...(d ? { publishedAs: packageCoordinateFor(event.pubkey, d) } : {}),
    });
  }

  onChange(listener: (missions: MissionUI[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** What a broadcast achieved: the signed event, and relays accepted out of relays tried. */
function receiptOf(broadcast: BroadcastResult): PublishReceipt {
  return {
    ...(broadcast.eventId ? { eventId: broadcast.eventId } : {}),
    relaysAccepted: broadcast.relaysOk ?? 0,
    relaysTried: broadcast.relaysTried ?? 0,
    at: new Date().toISOString(),
  };
}

const anotherKeyWords = (publisher: string) =>
  `Its package was published under another key (${nip19.npubEncode(publisher).slice(0, 14)}…), and only that key can replace it.`;

export const missionService: MissionService = new WorkspaceBackedMissionService();
