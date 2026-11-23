import { useEffect, useMemo, useRef, useState } from 'react';
import { CaseStatus, type IntelCaseUI } from '../../../types/intel/IntelCaseUI';
import { intelCaseService } from '../IntelCaseService';
import { useCorrelation } from '../../../applications/intelanalyzer/state/CorrelationContext';
import { AttentionQueue, type QueueSnapshot } from './AttentionQueue';
import { produceContradictionItems, CONTRADICTION_PRODUCER, type OpenCase } from './contradictionProducer';
import { produceForeignClaimItems, FOREIGN_CLAIM_PRODUCER, type ForeignClaim } from './foreignClaimProducer';
import { produceDecayedFindingItems, DECAYED_FINDING_PRODUCER } from './decayedFindingProducer';
import { produceStaleRequirementItems, STALE_REQUIREMENT_PRODUCER } from './staleRequirementProducer';
import { produceGivenObjectiveItems, GIVEN_OBJECTIVE_PRODUCER } from './givenObjectiveProducer';
import { produceTakenAskItems, TAKEN_ASK_PRODUCER } from './takenAskProducer';
import { produceUpgradedPublicItems, UPGRADED_PUBLIC_PRODUCER } from './upgradedPublicProducer';
import { takenAsks } from '../received/takenAsks';
import { nameOf } from '../../identity/names';
import { nip19 } from 'nostr-tools';
import { missionService } from '../MissionService';
import type { MissionUI } from '../../../types/intel/MissionUI';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { intelReportService } from '../IntelReportService';
import { publishedFindingsLedger } from '../findings/PublishedFindingsLedger';
import type { AttentionState } from './AttentionItem';
import type { LocationConflict } from '../../../applications/intelanalyzer/state/correlationUtils';
import { BrowserAttentionStateStore, MemoryAttentionStateStore } from './AttentionStateStore';
import { myCases } from './caseVisibility';
import { nostrIdentityService } from '../../identity/NostrIdentityService';

/**
 * Which statuses mean someone is still working the case.
 *
 * RESOLVED and CLOSED are excluded: raising attention on a case its owner has
 * finished with is the fastest way to teach them the queue is noise.
 */
const OPEN_STATUSES = new Set<CaseStatus>([
  CaseStatus.NEW, CaseStatus.OPEN, CaseStatus.IN_PROGRESS, CaseStatus.PENDING,
]);

export interface UseAttentionQueue {
  snapshot: QueueSnapshot;
  setState: (id: string, state: AttentionState) => void;
}

const EMPTY: QueueSnapshot = { items: [], hiddenByBudget: 0, actionableCount: 0, failures: [], quiet: false };

/**
 * Wires the queue to live data.
 *
 * The queue and its producers are plain objects with no React in them; this
 * hook is the only place the two meet, so the rules stay testable without
 * rendering anything.
 */
/** A package's signer in words: the name someone gave the key, or the key, short. */
const callSigner = (pubkey: string): string => {
  const named = nameOf(pubkey)?.name;
  if (named) return named;
  try {
    const npub = nip19.npubEncode(pubkey);
    return `${npub.slice(0, 14)}…${npub.slice(-6)}`;
  } catch {
    return pubkey.slice(0, 12);
  }
};

export function useAttentionQueue(): UseAttentionQueue {
  const { locationConflicts, foreignAgreement, entitiesForSource } = useCorrelation();
  const [cases, setCases] = useState<IntelCaseUI[]>([]);
  /**
   * Report lifecycle stages, so a requirement's answered-ness stays DERIVED.
   * Offering a draft against a question settles nothing, and a report later
   * withdrawn stops answering one without anybody revisiting it.
   */
  const [reportStages, setReportStages] = useState<Record<string, string>>({});
  // Every case and report, for records an upgrade may have made Public (plan item 9.6).
  const [reports, setReports] = useState<IntelReportUI[]>([]);
  const everyRecord = useRef<{ cases: IntelCaseUI[]; reports: IntelReportUI[] }>({ cases: [], reports: [] });
  everyRecord.current = { cases, reports };
  const [snapshot, setSnapshot] = useState<QueueSnapshot>(EMPTY);

  const openCases = useMemo<OpenCase[]>(
    // Mine first, then open. A case someone shared into this workspace so I
    // could look at one thing must not start generating work I owe — see
    // caseVisibility on why this is a relevance boundary and not access
    // control.
    () => myCases(cases, nostrIdentityService.signerPubkey())
      .filter((c) => OPEN_STATUSES.has(c.status))
      // `relatedEntities` holds report/item ids despite the name — see OpenCase.
      .map((c) => ({ id: c.id, title: c.title, linkedSourceIds: c.relatedEntities ?? [] })),
    [cases],
  );

  /**
   * Latest producer inputs, held in a ref rather than captured in a closure.
   *
   * The queue instance must be STABLE — it is what holds firstSeen and every
   * acknowledgement, so replacing it when inputs change would discard the
   * exact state it exists to keep. But a producer registered once against a
   * closure would keep reporting whatever was true at mount.
   *
   * A ref resolves both: one queue for its whole life, one producer, and
   * inputs read at produce() time.
   */
  const inputs = useRef<{
    conflicts: LocationConflict[];
    openCases: OpenCase[];
    claims: ForeignClaim[];
    entitiesForSource: (sourceId: string) => string[];
  }>({ conflicts: [], openCases: [], claims: [], entitiesForSource: () => [] });
  inputs.current = { conflicts: locationConflicts, openCases, claims: foreignAgreement, entitiesForSource };

  /**
   * The same cases as `openCases`, before the narrowing to OpenCase drops
   * everything but the linked source ids. Requirements live on the full record,
   * and re-deriving the scope here keeps one definition of whose work this is.
   */
  const myOpenCases = useMemo(
    () => myCases(cases, nostrIdentityService.signerPubkey()).filter((c) => OPEN_STATUSES.has(c.status)),
    [cases],
  );
  const requirementCases = useRef<IntelCaseUI[]>([]);
  requirementCases.current = myOpenCases;
  const stagesRef = useRef<Record<string, string>>({});
  stagesRef.current = reportStages;
  // Objectives given to you (plan item 2.5), from every mission, since work
  // given to you is yours wherever the mission sits.
  const [missions, setMissions] = useState<MissionUI[]>([]);
  const missionsRef = useRef<MissionUI[]>([]);
  missionsRef.current = missions;

  // Asks taken on from other nodes' packages (plan item 2.6), read again when one is taken or let go.
  const [asksVersion, setAsksVersion] = useState(0);
  useEffect(() => takenAsks.subscribe(() => setAsksVersion((v) => v + 1)), []);

  const queueRef = useRef<AttentionQueue | null>(null);
  if (!queueRef.current) {
    // Real persistence in a browser, memory elsewhere. Defaulting to memory
    // here would have made every decision look persisted in tests and vanish
    // in the app — the failure mode is invisible precisely where it matters.
    queueRef.current = new AttentionQueue(
      typeof localStorage !== 'undefined' ? new BrowserAttentionStateStore() : new MemoryAttentionStateStore(),
    );
    queueRef.current.register({
      name: CONTRADICTION_PRODUCER,
      produce: () => produceContradictionItems(inputs.current),
    });
    queueRef.current.register({
      name: FOREIGN_CLAIM_PRODUCER,
      produce: () => produceForeignClaimItems(inputs.current),
    });
    queueRef.current.register({
      // Reads the ledger directly rather than through `inputs`: this producer's
      // subject is what WE published, which does not depend on correlation
      // output or on which cases are open.
      name: DECAYED_FINDING_PRODUCER,
      produce: () => produceDecayedFindingItems({ published: publishedFindingsLedger.live() }),
    });
    queueRef.current.register({
      /**
       * The only producer whose subject is COLLECTION rather than analysis.
       *
       * Scoped to the operator's own cases like the others, so the queue keeps
       * one meaning of "yours" — a question raised in a case somebody else owns
       * is arguably still collectable work, and if that turns out to matter it
       * should widen for every producer at once rather than for this one alone.
       */
      name: GIVEN_OBJECTIVE_PRODUCER,
      produce: () => produceGivenObjectiveItems({ missions: missionsRef.current, me: nostrIdentityService.signerPubkey() }),
    });
    queueRef.current.register({
      name: TAKEN_ASK_PRODUCER,
      produce: () => produceTakenAskItems({ asks: takenAsks.all(), callSigner }),
    });
    queueRef.current.register({
      name: UPGRADED_PUBLIC_PRODUCER,
      produce: () => produceUpgradedPublicItems({ ...everyRecord.current, missions: missionsRef.current }),
    });
    queueRef.current.register({
      name: STALE_REQUIREMENT_PRODUCER,
      produce: () => produceStaleRequirementItems({
        cases: requirementCases.current,
        reportStage: (id) => stagesRef.current[id],
      }),
    });
  }

  useEffect(() => {
    let alive = true;
    intelCaseService.listCases().then((c) => { if (alive) setCases(c); }).catch(() => {
      // Cases unavailable is not the queue's failure to report; the producer
      // has nothing to match against and the queue stays empty.
    });
    const off = intelCaseService.onChange((c) => setCases(c));
    return () => { alive = false; off(); };
  }, []);

  useEffect(() => {
    let alive = true;
    intelReportService.listReports()
      .then((rs) => {
        if (!alive) return;
        setReportStages(Object.fromEntries(rs.map((r) => [r.id, r.status])));
        setReports(rs);
      })
      // Reports unavailable means requirements cannot be told apart from
      // answered ones, so the producer raises nothing rather than guessing.
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    missionService.listMissions().then((m) => { if (alive) setMissions(m); }).catch(() => {
      // Missions unavailable: nothing is known to be yours, so nothing is raised.
    });
    const off = missionService.onChange((m) => setMissions(m));
    return () => { alive = false; off(); };
  }, []);

  useEffect(() => {
    setSnapshot(queueRef.current!.refresh());
    /**
     * reportStages belongs here.
     *
     * Without it the refresh ran once against an empty stage map, so every
     * linked report resolved to no stage and counted as offered-but-not-
     * evidential — raising stale-requirement items for questions that were in
     * fact answered, persisting them, and never re-running once the stages
     * arrived. An attention queue that invents work is worse than one that
     * misses some, because the invented items are indistinguishable from real
     * ones.
     */
  }, [locationConflicts, openCases, foreignAgreement, entitiesForSource, reportStages, missions, asksVersion, cases, reports]);

  return {
    snapshot,
    setState: (id, state) => {
      if (queueRef.current?.setState(id, state)) setSnapshot(queueRef.current.current());
    },
  };
}
