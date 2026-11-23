import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useIntelWorkspace } from '../../../services/intel/IntelWorkspaceContext';
import { adaptWorkspaceToEvents, reportsExcludedFromCorrelation, isEvidential, eventInTimeRange, type Event } from '../adapters/eventsAdapter';
import { useFilter } from './FilterContext';
import {
  computeAnomaliesByDay, computeCooccurrence, computeTagCooccurrence, computePlaceClusters,
  computeCorroborationGaps,
  CooccurrencePair, PlaceCluster, LocationConflict, CorroboratedFinding,
  buildPositionIndex,
} from './correlationUtils';
import type { CorroborationGap } from './correlationUtils';
import { useCorrelationWorker } from './useCorrelationWorker';
import { observationIngestService } from '../../../services/intel/observations/ObservationIngestService';
import { registerObservationSources } from '../../../services/intel/observations/registerSources';
import { observationsToEvents } from '../../../services/intel/observations/observationsToEvents';
import { REGISTERED_SOURCES } from '../../../services/intel/observations/adapters';
import type { CoverageSummary } from '../../../services/intel/observations/sourceIngestStatus';
import type { Source } from '../../../types/intel/SourceObservation';
import { hasMixedWeightBasis } from '../../../services/intel/observations/weightOf';
import { federationIngestService } from '../../../services/intel/federation/FederationIngestService';
import { assessForeignFinding } from '../../../services/intel/federation/foreignFinding';
import { identifierFor } from '../../../services/intel/findings/FindingContent';
import { publishedFindingsLedger } from '../../../services/intel/findings/PublishedFindingsLedger';
import type { ContestedState, RefutationGround } from '../../../services/intel/findings/refutation';
import { findMergeSuggestions, EntityMergeSuggestion } from '../../../services/intel/entity/findMergeSuggestions';
import { entityAliasRegistry } from '../../../services/intel/entity/EntityAliasRegistry';
import { buildReadableNames, type ReadableNames } from './readableNames';
import { fieldObservations as readFieldObservations, type FieldObservation } from '../../../services/intel/observations/fieldObservations';

type CorrelationState = {
  anomaliesByDay: Set<string>;
  cooccurrence: CooccurrencePair[];
  tagCooccurrence: CooccurrencePair[];
  placeClusters: PlaceCluster[];
  locationConflicts: LocationConflict[];
  corroboratedFindings: CorroboratedFinding[];
  /**
   * Claims backed by exactly one independent feed — what a second source
   * would upgrade. Not findings: an uncorroborated claim is a prompt for
   * collection, never evidence, and is never published.
   */
  corroborationGaps: CorroborationGap[];
  /**
   * Names for what the engine matches by id: a company for its LEI, a place
   * for its Wikidata id, a source for its feed id (plan item 3.6). Read from
   * every record, not only the filtered ones, so a filter never hides a name.
   */
  names: ReadableNames;
  /**
   * NavCom's field observations, one per event, newest seen first (decision
   * D-MX, MX21). They feed correlation claim by claim, like any source's; here
   * they are the events they are, for a person to read and to write a report on.
   */
  fieldObservations: FieldObservation[];
  /**
   * Reports held out of the evidence pool by their lifecycle status.
   *
   * Surfaced so a panel can SAY so. A draft no longer corroborates anything —
   * which is correct, a draft is not yet asserted — but an analyst whose work
   * quietly stopped contributing should see where it went rather than conclude
   * the tool is broken. Empty in the ordinary case.
   */
  excludedReports: Array<{ id: string; title: string; status: string }>;
  /**
   * Where correlation ran, and whether the shown result is behind the current
   * filters. Surfaced rather than hidden: 'main-thread' means the work is
   * blocking render, which a developer profiling a slow tab needs to see, and
   * `stale` distinguishes "no contradictions" from "not finished looking".
   */
  correlationComputedBy: 'worker' | 'main-thread';
  correlationStale: boolean;
  /**
   * Which open-data sources reported, and which could not be reached.
   *
   * Null until the first ingest completes. `degraded` means the corpus is
   * missing data it would otherwise have, so any "no corroboration found"
   * conclusion drawn from it is provisional — a sparse result during an outage
   * must not read as a quiet world.
   */
  sourceCoverage: CoverageSummary | null;
  /**
   * Position of the event behind a given sourceId.
   *
   * A LocationConflict records the two source ids, the distance and the
   * strength, but not the coordinates — so anything drawing a contradiction
   * needs this to place both ends. Returns undefined rather than a fallback:
   * on a map, an invented position is an invented observation.
   */
  positionOf: (sourceId: string) => { lat: number; lon: number } | undefined;
  /**
   * Entity names a source record mentions.
   *
   * The bridge between two things that do not share a key: a case links
   * report/item IDS, while findings — local and federated alike — are about
   * entity NAMES. Nothing can join them without the events in between, and the
   * events live here.
   *
   * Exposed as a resolver rather than the raw index, matching positionOf, so
   * consumers cannot come to depend on the index's identity.
   */
  entitiesForSource: (sourceId: string) => string[];
  /**
   * True when the working set mixes DERIVED weights (open-data observations:
   * source reliability x method x age) with DECLARED ones (a confidence a
   * person typed into a report).
   *
   * The engine compares confidences across events — computeLocationConflicts
   * takes min(a, b) as conflict strength — so once both kinds are present it is
   * silently comparing a measurement against an opinion. Both are numbers in
   * 0..1 and nothing about the result looks wrong, which is what makes it
   * dangerous rather than merely imprecise. Surfaced so a UI can mark it, and
   * so an absent warning means "checked and homogeneous" rather than "never
   * looked".
   */
  weightBasisMixed: boolean;
  /**
   * What other instances have published about the same claims we have.
   *
   * Kept SEPARATE from local findings on purpose. A foreign finding is someone
   * else's conclusion, already aggregated from their sources — merging it into
   * the local corpus would let two instances that ingested the same data look
   * like two independent sources agreeing.
   *
   * `corroborationValue` discounts for shared evidence, so an echo adds
   * nothing however confident it sounds.
   */
  foreignAgreement: Array<{
    entityRef: string;
    authorPubkey: string;
    weight: number;
    independence: string;
    corroborationValue: number;
    /**
     * Enough to ARGUE with the claim, not merely to display it.
     *
     * A refutation is addressed by author, subject, attribute and the exact
     * publishedAt of the version being contested, and the publication gate
     * needs the subject's kind. Without these an operator can see a peer's
     * claim and has no way to disagree with it in public — which is the state
     * this app was in.
     */
    attribute: string;
    publishedAt: string;
    subjectKind: string;
  }>;
  /**
   * Claims that someone has argued with — including our own.
   *
   * The counterpart to foreignAgreement, and the more important half. An
   * interface that can only display who agrees will report consensus whether or
   * not consensus exists, and this app could do nothing else: it subscribed to
   * claims and not to refutations, so agreement was the only thing it could
   * ever have seen.
   *
   * `mine` is not a filter for hiding anything. A refutation of our own claim
   * is the single most useful thing on this list, and separating it out is so
   * it can be shown first rather than buried among other people's arguments.
   */
  contested: Array<{
    subjectRef: string;
    attribute: string;
    /** Whose claim is being argued with. */
    authorPubkey: string;
    mine: boolean;
    state: ContestedState;
    refutations: number;
    /** Why the refuters say it is wrong. Distinct grounds, in no order. */
    grounds: RefutationGround[];
  }>;
  mergeSuggestions: EntityMergeSuggestion[];
  confirmMergeSuggestion: (nameA: string, nameB: string) => void;
  rejectMergeSuggestion: (nameA: string, nameB: string) => void;
  showClusters: boolean;
  setShowClusters: (on: boolean) => void;
};

/**
 * Ceiling on observation-derived events merged into the working set.
 *
 * Introduced to bound a renderer crash whose root cause turned out to be D2 —
 * an infinite render loop in SpaceWeatherProvider, since fixed. With D2 dead I
 * could not reproduce the crash, so this is no longer load-bearing for that.
 *
 * Kept anyway, on its own merits: the number of events an external feed returns
 * is not under this app's control, and pushing an unbounded upstream response
 * into React state is worth bounding regardless of whether a specific crash
 * still follows from it. 1000 comfortably covers the recent window
 * corroboration actually uses, newest first.
 */
export const MAX_OBSERVATION_EVENTS = 1000;

/**
 * Every source an observation can come from: the six the Phase 1 gate counts,
 * and whatever else the ingest registered.
 *
 * This read REGISTERED_SOURCES alone. GLEIF and Wikidata were registered with
 * the ingest later and never added to it, so their claims were mapped as from
 * an unknown source: graded F rather than A and C, and never known to be
 * genuine, which kept every finding they made from being published. Measured
 * on the shipped data, 0 of 187 could be (owner's decision, 2026-09-30).
 */
function observationSources(): Source[] {
  const byId = new Map<string, Source>();
  for (const source of [...REGISTERED_SOURCES, ...observationIngestService.registeredSources()]) {
    if (!byId.has(source.id)) byId.set(source.id, source);
  }
  return [...byId.values()];
}

const CorrelationContext = createContext<CorrelationState | undefined>(undefined);

export const CorrelationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { reports, intelItems } = useIntelWorkspace();
  const { filters } = useFilter();

  // Which reports the lifecycle gate held back, so the UI can account for them.
  const excludedReports = useMemo(() => reportsExcludedFromCorrelation(reports), [reports]);
  const [showClusters, setShowClusters] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('intelAnalyzer.showClusters');
      return raw ? raw === 'true' : false;
    } catch { return false; }
  });

  /**
   * Open-data observations, alongside the workspace's own reports and items.
   *
   * This is the join docs/build-order.md's Phase 1 gate is about: six source
   * types feeding ONE correlation engine, rather than the globe rendering five
   * feeds that analysis never sees. Everything needed for it existed and had
   * no runtime call site until now.
   */
  const [observationEvents, setObservationEvents] = useState<Event[]>([]);
  const [fieldObservations, setFieldObservations] = useState<FieldObservation[]>([]);
  const [coverage, setCoverage] = useState<CoverageSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    registerObservationSources();
    observationIngestService.ingestAll()
      .then(({ observations, coverage: cov }) => {
        if (cancelled) return;
        // Bounded, newest first — see MAX_OBSERVATION_EVENTS. The volume an
        // external feed returns is not ours to control, and corroboration works
        // in a 24-hour window, so the recent slice is the part the engine can
        // actually use.
        const events = observationsToEvents(observations, observationSources())
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
          .slice(0, MAX_OBSERVATION_EVENTS);
        setObservationEvents(events);
        setFieldObservations(readFieldObservations(observations));
        setCoverage(cov);
      })
      .catch(() => {
        // ingestAll already records per-source failures and never rejects for
        // one source being down; reaching here means something broader failed,
        // and an empty set with no coverage is the honest result.
        if (!cancelled) setCoverage(observationIngestService.coverage());
      });
    return () => { cancelled = true; };
  }, []);

  const events = useMemo(
    // Only reports someone has stood behind feed correlation. A draft is not
    // yet asserted and a withdrawn report is not evidence — but both still
    // appear on the graph, map and timeline, because those show an analyst
    // their own work rather than the evidence pool.
    () => [...adaptWorkspaceToEvents(reports.filter(isEvidential), intelItems), ...observationEvents],
    [reports, intelItems, observationEvents]
  );

  const names = useMemo(
    () => buildReadableNames(events, observationSources()),
    [events],
  );

  const filtered = useMemo(() => {
    return events.filter(ev => {
      // By overlap, placed by event time where the record states one (decision D-E).
      if (filters.timeRange && !eventInTimeRange(ev, filters.timeRange)) return false;
      if (filters.categories?.length && !filters.categories.includes(ev.category)) return false;
      if (filters.entityRefs?.length && !ev.entityRefs?.some(id => filters.entityRefs!.includes(id))) return false;
      return true;
    });
  }, [events, filters]);

  const anomaliesByDay = useMemo(() => computeAnomaliesByDay(filtered), [filtered]);
  const cooccurrence = useMemo(() => computeCooccurrence(filtered), [filtered]);
  const tagCooccurrence = useMemo(() => computeTagCooccurrence(filtered), [filtered]);
  const placeClusters = useMemo(() => computePlaceClusters(filtered, 1), [filtered]);
  // Conflicts and corroboration are the two expensive passes; they run in a
  // worker when one can be constructed, and synchronously otherwise. The hook
  // returns the same answer either way — see useCorrelationWorker on why the
  // fallback computes rather than emptying.
  const {
    conflicts: locationConflicts,
    findings: corroboratedFindings,
    computedBy: correlationComputedBy,
    stale: correlationStale,
  } = useCorrelationWorker(filtered);

  /**
   * Claims resting on a single feed — the analysis -> collection loop-back.
   *
   * Cheap relative to the two worker passes (it reuses their conflict output
   * rather than recomputing, exactly as computeCorroboratedFindings does), so
   * it runs inline rather than earning a second worker round-trip.
   */
  const corroborationGaps = useMemo(
    () => computeCorroborationGaps(filtered, locationConflicts),
    [filtered, locationConflicts],
  );

  // entityAliasRegistry is a mutable singleton (localStorage-backed), not
  // React state — confirm()/reject() don't trigger a re-render on their
  // own, so this counter is bumped on every decision to force
  // mergeSuggestions to recompute against the registry's current contents.
  const [aliasDecisionVersion, setAliasDecisionVersion] = useState(0);

  const entityNames = useMemo(() => {
    const names = new Set<string>();
    for (const ev of filtered) {
      for (const name of ev.entityRefs || []) names.add(name);
    }
    return Array.from(names);
  }, [filtered]);

  const mergeSuggestions = useMemo(
    () => entityAliasRegistry.filterUndecided(findMergeSuggestions(entityNames)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entityNames, aliasDecisionVersion]
  );

  const confirmMergeSuggestion = (nameA: string, nameB: string) => {
    entityAliasRegistry.confirm(nameA, nameB);
    setAliasDecisionVersion(v => v + 1);
  };

  const rejectMergeSuggestion = (nameA: string, nameB: string) => {
    entityAliasRegistry.reject(nameA, nameB);
    setAliasDecisionVersion(v => v + 1);
  };

  useEffect(() => {
    try {
      localStorage.setItem('intelAnalyzer.showClusters', String(showClusters));
  } catch (_e) {
      // non-fatal persistence error
      console.warn('CorrelationContext: failed to persist showClusters');
    }
  }, [showClusters]);

  // Members are already individually memoized above; memoize the wrapping object too
  // so the context value itself has a stable reference when nothing actually changed.
  // Rounded to the precision each source stated, as corroborations already are.
  const positionIndex = useMemo(() => buildPositionIndex(filtered), [filtered]);
  const positionOf = useMemo(() => (sourceId: string) => positionIndex.get(sourceId), [positionIndex]);

  const entityIndex = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const ev of filtered) {
      if (!ev.entityRefs?.length) continue;
      const at = map.get(ev.sourceId);
      if (at) for (const e of ev.entityRefs) at.add(e);
      else map.set(ev.sourceId, new Set(ev.entityRefs));
    }
    return map;
  }, [filtered]);
  const entitiesForSource = useMemo(
    () => (sourceId: string) => [...(entityIndex.get(sourceId) ?? [])],
    [entityIndex],
  );

  const weightBasisMixed = useMemo(() => hasMixedWeightBasis(filtered), [filtered]);

  // Listen for other instances' findings. Verification happens in the store;
  // nothing here trusts a relay to have served something genuine.
  useEffect(() => {
    federationIngestService.start();
    return () => federationIngestService.stop();
  }, []);

  const foreignAgreement = useMemo(() => {
    const out: CorrelationState['foreignAgreement'] = [];
    for (const local of corroboratedFindings) {
      const slot = identifierFor(local.entityRef, local.attribute);
      for (const foreign of federationIngestService.store.forSlot(slot)) {
        const a = assessForeignFinding(foreign, local.contributingFingerprints);
        out.push({
          attribute: foreign.content.claim.attribute,
          publishedAt: foreign.content.publishedAt,
          subjectKind: foreign.content.claim.subjectKind,
          entityRef: local.entityRef,
          authorPubkey: foreign.authorPubkey,
          weight: a.weight,
          independence: a.independence,
          corroborationValue: a.corroborationValue,
        });
      }
    }
    return out;
  }, [corroboratedFindings]);

  /**
   * Recomputed whenever the local findings change, which is also when a fresh
   * batch of relay traffic has most likely landed. There is no subscription to
   * the refutation store itself: it is read on render, so the worst case is a
   * refutation displayed one interaction late rather than a stream of renders
   * driven by other people's publishing rate.
   */
  const contested = useMemo(() => {
    const out: CorrelationState['contested'] = [];
    const seen = new Set<string>();

    const consider = (
      subjectRef: string, attribute: string, authorPubkey: string, mine: boolean,
      claim: { method: unknown; publishedAt: string },
    ) => {
      const refutes = { subjectRef, attribute, authorPubkey, publishedAt: claim.publishedAt };
      const held = federationIngestService.refutations.forClaim(refutes);
      if (held.length === 0) return;
      const key = `${authorPubkey}:${subjectRef}:${attribute}:${claim.publishedAt}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        subjectRef, attribute, authorPubkey, mine,
        state: federationIngestService.refutations.contestedFor(claim, refutes),
        refutations: held.length,
        grounds: [...new Set(held.map((r) => r.refutation.ground))],
      });
    };

    // Ours first — a claim we are still asserting that somebody has argued with.
    for (const published of publishedFindingsLedger.live()) {
      // Claims recorded before the ledger stored its signing key cannot be
      // addressed, so they cannot be checked. Skipped rather than guessed at.
      if (!published.authorPubkey) continue;
      consider(published.content.claim.subjectRef, published.content.claim.attribute,
        published.authorPubkey, true, published.content);
    }

    // Then peers' claims we are relying on.
    for (const local of corroboratedFindings) {
      const slot = identifierFor(local.entityRef, local.attribute);
      for (const foreign of federationIngestService.store.forSlot(slot)) {
        consider(foreign.content.claim.subjectRef, foreign.content.claim.attribute,
          foreign.authorPubkey, false, foreign.content);
      }
    }

    return out;
  }, [corroboratedFindings]);

  const value: CorrelationState = useMemo(() => ({
    anomaliesByDay, cooccurrence, tagCooccurrence, placeClusters, locationConflicts, corroboratedFindings,
    corroborationGaps,
    names,
    fieldObservations,
    excludedReports,
    correlationComputedBy, correlationStale, sourceCoverage: coverage, positionOf, entitiesForSource, weightBasisMixed, foreignAgreement, contested,
    mergeSuggestions, confirmMergeSuggestion, rejectMergeSuggestion, showClusters, setShowClusters
  }), [anomaliesByDay, cooccurrence, tagCooccurrence, placeClusters, locationConflicts, corroboratedFindings, corroborationGaps, names, fieldObservations, excludedReports, correlationComputedBy, correlationStale, coverage, positionOf, entitiesForSource, weightBasisMixed, foreignAgreement, contested, mergeSuggestions, showClusters]);
  return <CorrelationContext.Provider value={value}>{children}</CorrelationContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useCorrelation = () => {
  const ctx = useContext(CorrelationContext);
  if (!ctx) throw new Error('useCorrelation must be used within CorrelationProvider');
  return ctx;
};
