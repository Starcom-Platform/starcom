import { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { IntelItemUI } from '../../../types/intel/IntelItemUI';
import type { SubjectKind } from '../../../types/intel/SourceObservation';
import { intelItemTime, overlapsWindow, reportTime, type RecordTime, type TimeBasis } from '../../../services/intel/recordTime';

/**
 * Event interface as defined in data-models.md
 */
export interface Event {
  id: string;
  title: string;
  timestamp: string;
  category: string;
  tags: string[];
  lat?: number;
  lon?: number;
  confidence?: number;
  /**
   * Where `confidence` came from. 'derived' means computed from provenance
   * (source reliability, method, age); 'declared' means a person typed it.
   *
   * Undefined on legacy events, which is itself informative — it means the
   * basis was never recorded. Read it through weightOf() rather than directly,
   * so a comparison between a derived and a declared number is detectable
   * instead of silent.
   */
  confidenceBasis?: 'derived' | 'declared';
  /**
   * What kind of thing `entityRefs` names, when the source knows.
   *
   * Contradiction detection asks whether an entity can be in two places at
   * once — a question that only means anything for subjects occupying one
   * place at a time. Undefined is treated as exclusive, preserving existing
   * behaviour for analyst-authored reports.
   */
  subjectKind?: SubjectKind;
  /**
   * Width of the uncertainty on `timestamp`, in ms, when the source states one.
   * Undefined means unstated — treated as day precision, since a date with no
   * time is a day rather than a midnight.
   */
  timePrecisionMs?: number;
  /**
   * Which time places this event (decision D-E): 'event' when its record states
   * when the event happened, 'written' when it fell back to when the record was
   * written. Observations are their event time by nature and leave it unset.
   */
  timeBasis?: TimeBasis;
  /** Where the event's stated end starts, in ms, when it was a span. */
  timeEndMs?: number;
  /**
   * Cross-instance fingerprintof the observation behind this event.
   *
   * Computed where the Observation is still in scope, because an Event has
   * lost the claim attribute/value the fingerprint covers — reconstructing it
   * later would produce a hash no other instance could match, defeating the
   * only purpose fingerprints have.
   *
   * Absent on analyst-authored reports, which are not observations and have no
   * counterpart another instance could hold.
   */
  fingerprint?: string;
  /**
   * 'OBSERVATION' added for the open-data sources (UCDP, USGS, GDACS, EONET,
   * ReliefWeb). The union was closed to the first two shapes this app happened
   * to have, which is precisely the failure ADR-0003 warned about — "the shape
   * of the first two sources quietly becomes the permanent shape of the API".
   */
  /**
   * Whether the evidence behind this event is fabricated.
   *
   * UNDEFINED MEANS UNMEASURED, and is deliberately not the same as `false`.
   * Observation-derived events inherit a required flag from their Source;
   * report- and item-derived ones have no such concept yet, and defaulting
   * those to `false` would assert every analyst-authored record is real
   * because nobody asked.
   *
   * Read through provenanceOf() rather than directly, so "we did not measure"
   * cannot be silently collapsed into "it is real".
   */
  isMock?: boolean;
  sourceType: 'REPORT' | 'INTEL_ITEM' | 'OBSERVATION';
  /**
   * The RECORD this event came from. Unique per record.
   *
   * Used to exclude a record corroborating or contradicting itself. NOT a
   * measure of independence — see `feedId`.
   */
  sourceId: string;
  /**
   * The independent SOURCE this record came from — a feed, or a human author.
   *
   * Split from `sourceId` because conflating them overstated corroboration.
   * Corroboration counted distinct `sourceId`s, and for observations that is
   * the record id, so two rows from one feed counted as two independent
   * sources. Measured on the real UCDP asset: 1,795 records produced 38
   * corroborated findings, every one of them from a single feed, each
   * publishing `sourceCount` >= 2 on the wire.
   *
   * The interchange spec's own rationale for a saturating corroboration term
   * is that "linear growth rewards splitting one source into many" — and the
   * implementation was doing the splitting itself.
   *
   * For observations this is the Source id (`ucdp-ged`, `usgs-earthquakes`).
   *
   * For a report or intel item it is the AUTHOR — or the item's `source` —
   * never the record id. This paragraph used to say the opposite: "each is
   * authored independently, so the record IS the source." That carve-out left
   * the reports half of the pipeline with exactly the defect the observations
   * half had just been fixed for. One author writes many reports the same way
   * one feed publishes many rows, so counting records counted the splitting,
   * and the measurement quoted above is the same shape the reports path was
   * quietly reproducing. Unknown authorship collapses to a single shared feed
   * rather than splitting — see reportFeedId.
   */
  feedId?: string;
  /**
   * A Nostr event id a third party can fetch to see this event's origin.
   *
   * Set only when the source declared `recordIdScheme: 'nostr-event'`, so an
   * unresolvable register key never reaches an `e` tag on a published Finding.
   * A citation that resolves to nothing is worse than none — it looks
   * checkable.
   */
  sourceEventId?: string;
  /**
   * Uncertainty on `lat`/`lon`, as a radius in metres.
   *
   * The spatial twin of `timePrecisionMs` beside it, and needed for the same
   * reason: without it a position known to within 20km is indistinguishable
   * from a surveyed one, and corroborates or contradicts inside a distance
   * threshold as though it were exact.
   */
  geoPrecisionM?: number;
  /**
   * Feed ids this event's feed republishes or derives from — Source.derivesFrom.
   *
   * Carried on the event so corroboration stays a pure function of its input
   * rather than needing a registry lookup. See findingForBucket, which uses it
   * to refuse counting a feed and its upstream as two sources.
   */
  derivesFrom?: string[];
  /**
   * The claim this event asserts, for attributes compared by EQUALITY.
   *
   * Location is not carried here — it lives in `lat`/`lon` and is compared by
   * distance, because two observers of one physical thing report nearby
   * coordinates rather than identical ones.
   *
   * Everything else is the opposite: two registries either say a company is
   * registered in Berlin or they do not. There is no "5km" for a jurisdiction,
   * and inventing a distance metric for one would be inventing precision.
   *
   * `value` is pre-normalised (trimmed, case-folded) at the adapter, so the
   * engine compares without needing to know what the attribute means.
   */
  claim?: { attribute: string; value: string };
  /**
   * The aggregator this observation reached us through, when it was relayed.
   *
   * `feedId` names who OBSERVED the thing; this names who CARRIED it. A
   * Wikidata statement citing SIRENE is SIRENE's observation relayed by
   * Wikidata, and both facts matter: SIRENE is what makes it independent of
   * the other registries, and Wikidata is a shared path all of them travelled,
   * which is a real limit on how independent they are.
   *
   * Undefined when the source observed directly.
   */
  relayedVia?: string;
  entityRefs: string[];
  /**
   * Names for what this event identifies by id, for a person to read (plan
   * item 3.6): the subject's name, the name of the claim's value, and the name
   * of the source `feedId` names. Never compared, so two spellings of one
   * name cannot split a subject, and two names cannot join one.
   */
  subjectName?: string;
  valueLabel?: string;
  feedLabel?: string;
}

/**
 * Adapter to convert IntelReportUI and IntelItemUI to Event format
 */
/**
 * Report statuses whose contents may act as evidence.
 *
 * DRAFT is excluded because a draft is, by definition, not yet asserted — an
 * analyst's half-written note should not corroborate anything, and until now it
 * did. ARCHIVED is excluded because archiving is an act of withdrawal.
 *
 * SUBMITTED counts alongside REVIEWED and APPROVED. Requiring APPROVED would be
 * defensible and is the wrong call in practice: if approval is rare, correlation
 * silently empties and the tool looks broken, which is how safety machinery
 * teaches people to route around it. Submission is the point at which someone
 * stands behind a report, and that is enough to be evidence.
 *
 * WHY THIS IS THE RIGHT PLACE, and the publication gate is not: a
 * CorroboratedFinding carries `sourceCount` and deliberately never the source
 * identities, so analyst identities cannot leak into published claims. That
 * means the wire has no way to ask what status a contributing report held. The
 * lifecycle has to govern what ENTERS the evidence pool, because after that the
 * link is intentionally severed.
 */
export const EVIDENTIAL_STATUSES: ReadonlySet<string> = new Set([
  'SUBMITTED', 'REVIEWED', 'APPROVED',
]);

/**
 * Whether a report may act as evidence for a corroborated finding.
 *
 * Applied by CorrelationContext only. Every view that shows an analyst their own
 * workspace shows everything — filtering there would make the workspace look
 * emptier than the work actually is.
 */
export function isEvidential(report: Pick<IntelReportUI, 'status'>): boolean {
  return EVIDENTIAL_STATUSES.has(String(report.status ?? 'DRAFT'));
}

/**
 * Reports excluded from correlation, and why.
 *
 * Exported so a panel can SAY so. An analyst whose drafts stopped corroborating
 * should see "4 drafts not contributing" rather than wonder where their data
 * went — the same reasoning globeIntelLayer applies when it refuses to let the
 * globe look emptier than the analysis actually was.
 */
export function reportsExcludedFromCorrelation(
  reports: IntelReportUI[],
): Array<{ id: string; title: string; status: string }> {
  return reports
    .filter(r => !EVIDENTIAL_STATUSES.has(String(r.status ?? 'DRAFT')))
    .map(r => ({ id: r.id, title: r.title, status: String(r.status ?? 'DRAFT') }));
}

/**
 * EVERY report becomes an event, whatever its status.
 *
 * The lifecycle filter was briefly applied here and that was wrong: this adapter
 * also feeds GraphView, MapView, TimelineView and AnalysisWorkbench, so filtering
 * here hid an analyst's own drafts from their own workspace. Two integration
 * tests caught it immediately.
 *
 * Visibility and evidentiality are different questions. A draft belongs on your
 * graph — it is your work — and does not belong in the pool that corroborates a
 * publishable finding. The gate lives in CorrelationContext, which is the only
 * consumer that needs it. See isEvidential below.
 */
/**
 * What could be independently wrong.
 *
 * `feedId` answers that question — NOT "which record is this". Corroboration
 * counts distinct feeds (correlationUtils' independentFeeds), so a feed is a
 * claim about shared failure modes: two reports by one analyst can both be
 * wrong for the same reason, and so can two events from one Nostr pubkey.
 *
 * This used to be `report.id`, commented "a report is its own independent
 * source: authored separately, by a person." True of the person, false of the
 * record — one person writes many reports. The effect was that "corroborated by
 * two independent sources" meant only "two reports exist", and two posts from
 * the same publisher corroborated each other. The observations pipeline never
 * had this problem: observationsToEvents uses upstreamSourceId and its adapters
 * populate derivesFrom, and the corroboration tests assume that model — three
 * rows sharing feedId 'ucdp-ged' count as one feed.
 *
 * The author is the publisher in both directions that matter: for a
 * Nostr-ingested report NostrStarcomIntelIngest sets author to the event
 * pubkey, and for a hand-authored one it is the analyst.
 *
 * UNKNOWN AUTHORSHIP COLLAPSES, deliberately. Falling back to the record id
 * would make every unattributed report its own feed, which is the inflating
 * error; grouping them is the deflating one. Under the evidentiary-display
 * stance, claiming corroboration that does not exist is worse than missing
 * corroboration that does, so we decline to assert an independence we never
 * established.
 */
const UNKNOWN_FEED = 'unattributed-author';

const reportFeedId = (report: IntelReportUI): string => report.author?.trim() || UNKNOWN_FEED;

/** Items carry provenance in `source` rather than an author. Same rule. */
const itemFeedId = (item: IntelItemUI): string => item.source?.trim() || UNKNOWN_FEED;

/**
 * An event's place in time, from its record (decision D-E): the event time when
 * the record states one, else when it was written, and which of the two. The
 * analyzer's timeline, histogram and time filter used `updatedAt ?? createdAt`
 * for every record. A record with neither time readable is read the old way.
 */
const eventTimeFields = (
  time: RecordTime | null,
  written: Date
): Pick<Event, 'timestamp' | 'timeBasis' | 'timeEndMs' | 'timePrecisionMs'> =>
  time
    ? {
        timestamp: new Date(time.start).toISOString(),
        timeBasis: time.basis,
        ...(time.statedEnd !== undefined ? { timeEndMs: time.statedEnd } : {}),
        ...(time.precisionMs !== undefined ? { timePrecisionMs: time.precisionMs } : {}),
      }
    : { timestamp: written.toISOString() };

/**
 * The time an event covers. Only observations leave the basis unset, and they
 * are event time by nature.
 */
export const eventRecordTime = (
  ev: Pick<Event, 'timestamp' | 'timeBasis' | 'timeEndMs' | 'timePrecisionMs'>
): RecordTime | null => {
  const start = Date.parse(ev.timestamp);
  if (!Number.isFinite(start)) return null;
  return {
    basis: ev.timeBasis ?? 'event',
    start,
    ...(ev.timeEndMs !== undefined ? { statedEnd: ev.timeEndMs } : {}),
    ...(ev.timePrecisionMs !== undefined ? { precisionMs: ev.timePrecisionMs } : {}),
  };
};

/**
 * Whether an event falls in the analyzer's time filter: by overlap, so a span
 * counts wherever it meets the range (decision D-E). Each view compared one
 * instant against the range.
 */
export const eventInTimeRange = (
  ev: Pick<Event, 'timestamp' | 'timeBasis' | 'timeEndMs' | 'timePrecisionMs'>,
  range: { start: Date; end: Date }
): boolean => {
  const time = eventRecordTime(ev);
  return time !== null && overlapsWindow(time, range);
};

/** How many of these events were placed by when their record was written. */
export const placedByWritten = (events: Array<Pick<Event, 'timeBasis'>>): number =>
  events.filter((ev) => ev.timeBasis === 'written').length;

export const adaptReportsToEvents = (reports: IntelReportUI[]): Event[] => {
  return reports
    .map(report => ({
    id: `evt-report-${report.id}`,
    title: report.title,
    ...eventTimeFields(reportTime(report), report.updatedAt ?? report.createdAt),
    category: report.category || 'GENERAL',
    tags: report.tags,
    lat: report.latitude,
    lon: report.longitude,
    confidence: report.confidence,
    // Human-authored, therefore not fabricated.
    //
    // `isMock` asks whether the RECORD is synthetic — generated by a fixture
    // or a demo feed — not whether its contents are accurate. A person typing
    // a report may be mistaken; they are not a mock. Setting it explicitly
    // rather than leaving it undefined matters, because publicationPolicy
    // refuses unmeasured provenance, and leaving it blank would block
    // publishing the primary path forever for want of a statement nobody was
    // ever going to make.
    //
    // A demo seed or a tutorial marks what it writes (`sample`, plan item 0.9),
    // at the point of creation, and that is what this reads. Nothing a person
    // writes is marked.
    isMock: report.sample === true,
    sourceType: 'REPORT',
    sourceId: report.id,
    feedId: reportFeedId(report),
    entityRefs: report.entityRefs || []
  }));
};

export const adaptIntelItemsToEvents = (intelItems: IntelItemUI[]): Event[] => {
  return intelItems.map(item => ({
    id: `evt-item-${item.id}`,
    title: item.title,
    ...eventTimeFields(intelItemTime(item), item.updatedAt ?? item.createdAt),
    category: item.categories[0] || 'GENERAL',
    tags: item.tags,
    lat: item.latitude,
    lon: item.longitude,
    confidence: item.confidence,
    // Same reasoning as adaptReportsToEvents above.
    isMock: false,
    sourceType: 'INTEL_ITEM',
    sourceId: item.id,
    feedId: itemFeedId(item),
    entityRefs: item.entityRefs || []
  }));
};

/**
 * Combine and sort events from both sources
 */
export const adaptWorkspaceToEvents = (reports: IntelReportUI[], intelItems: IntelItemUI[]): Event[] => {
  const reportEvents = adaptReportsToEvents(reports);
  const itemEvents = adaptIntelItemsToEvents(intelItems);
  const allEvents = [...reportEvents, ...itemEvents];

  // Sort by timestamp descending (newest first)
  return allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};
