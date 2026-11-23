/**
 * The intel pipeline, declared — because until now it was not declared anywhere.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * Starcom has objects and it has services. What it did not have was any
 * statement of what CONNECTS to what. The joins lived in doc comments, in
 * scattered runtime checks, and — the only structured form — in a UI
 * onboarding hint whose job is teaching newcomers.
 *
 * One absence, and it produced the same defect repeatedly, each time
 * discoverable only by somebody going and looking:
 *
 *   - corroboration computed per entity bucket and never carried to a Case
 *   - the findings track never reaching a mission at all
 *   - nothing consuming kind 30079, so packages could be sent and not read
 *   - Cases reachable only at a route, inside no registered application
 *   - seven of fourteen activity actions with no producer
 *   - delegation specified, tested, and impossible to perform
 *   - a verifier, a relay accessor and an ingest, each wired to nothing
 *
 * The twenty-one guard scripts in `scripts/` are the response to that pattern:
 * each is a hand-rolled instance of "the join must exist", written after the
 * corresponding defect was found the hard way. They are a scar record rather
 * than a safety net.
 *
 * ─── WHY A MODULE AND NOT A DOCUMENT ───────────────────────────────────────
 *
 * A document describing the pipeline becomes the twenty-second artifact that
 * goes stale and starts lying. This follows the one pattern in this codebase
 * that has held: kindRegistry.ts is imported BY the code it governs and has a
 * test asserting every module agrees with it, so it cannot drift quietly.
 *
 * So: this is imported by real consumers, and `scripts/guard-pipeline-joins.mjs`
 * checks every claim below against the source. A join whose producer or
 * consumer stops existing fails the build. A stage claiming a surface that is
 * not registered fails the build.
 *
 * ─── WHAT IT IS NOT ────────────────────────────────────────────────────────
 *
 * Not a workflow engine and not a runtime. Nothing here executes. It is the
 * answer to "what must be true for this pipeline to be connected", written
 * where it can be checked instead of where it can be believed.
 */

/**
 * A connection between stages.
 *
 * Both halves are required and that is the point: a producer with no consumer
 * is a write nobody reads, and a consumer with no producer is a reader waiting
 * on nothing. Both shipped in this codebase, repeatedly, and each looked like
 * working code in isolation.
 */
export interface PipelineJoin {
  /** What the connection is, for a failure message a human can act on. */
  name: string;
  /** Symbol that writes it. Must exist and be referenced outside its own file and outside tests. */
  producer: string;
  /** Symbol that reads it. Same requirement. */
  consumer: string;
  /** Why this join matters, quoted in the guard's failure output. */
  because: string;
}

export interface PipelineStage {
  id: string;
  /** What an operator does here, in their terms — not the screen's name. */
  label: string;
  /**
   * Where this stage is reachable. `app` must be a registered ApplicationId;
   * a stage reachable only by route is recorded as such rather than assumed,
   * because Cases lived that way and read as absent to everyone outside.
   */
  /**
   * Where the stage is done: an app, and the tab within it when it has tabs;
   * or a route. The mission stages named OpsCenter alone, which opens on
   * Overview, not on Missions where the work is (critique audit of 2026-10-01).
   */
  surface: { kind: 'app'; app: string; tab?: string } | { kind: 'route'; path: string };
  /** Joins INTO this stage. */
  restsOn: PipelineJoin[];
  /** Named enforcement that must pass to advance. Each must exist in source. */
  advanceInvariants: string[];
  /** What leaves this machine here, if anything. Absent means nothing does. */
  crosses?: { kind: number; carries: string };
}

/**
 * The dispatch spine: an observation becomes an action.
 *
 * Declared in order. Each stage's `restsOn` names the joins that must exist
 * for the previous stage's output to reach it.
 */
export const PIPELINE: PipelineStage[] = [
  {
    id: 'collect',
    label: 'Collect intel',
    surface: { kind: 'app', app: 'inteldashboard' },
    restsOn: [
      {
        name: 'the grid\'s own reports arrive',
        producer: 'nostrStarcomIntelIngest',
        consumer: 'useGlobeIntelReportPipeline',
        because:
          'Collection is not only what an operator types. Reports published by other '
          + 'nodes arrive over relays, and if nothing surfaces them the network is '
          + 'write-only from our side.',
      },
      {
        name: 'collection works without a key or a host',
        producer: 'certificateTransparency',
        consumer: 'ReconPanel',
        because:
          'NetRunner was built around four commercial adapters and three public CORS '
          + 'proxies. The proxies are dead and the adapters need keys an analyst with no '
          + 'income does not have, so the tool could not gather intelligence for the '
          + 'person it most needed to serve. Certificate Transparency, DNS and RDAP all '
          + 'answer a plain browser tab with no key, and — being genuinely different '
          + 'observation methods run by different operators — they corroborate one '
          + 'another in a way two commercial scanners of the same internet cannot.',
      },
      {
        name: 'a bot scan becomes a report',
        producer: 'convertAndStoreIntelReport',
        consumer: 'createReport',
        because:
          'NetRunner produced findings for a long time with no declared path into the '
          + 'workspace, so automated collection and human collection were two systems '
          + 'that happened to share a database.',
      },
      {
        name: 'the native host reaches collection',
        producer: 'nativeHost',
        consumer: 'WebsiteScannerService',
        because:
          'starcom-desktop shipped five capabilities — cross-origin fetch, evidence '
          + 'capture, sockets and TLS, local inference, an instrumented browsing view — '
          + 'and this application called none of them. Each typechecked, each passed a '
          + 'smoke suite written alongside it, and each had no reachable trigger, which '
          + 'is the exact defect this module exists to catch. A capability nothing '
          + 'consumes is a capability that does not exist.',
      },
      {
        name: 'Starcom Uplink reaches collection',
        producer: 'fetchThroughUplink',
        consumer: 'WebsiteScannerService',
        because:
          'The page scan was written against the desktop app, so in a browser it '
          + 'could only refuse. Uplink reads a site the person allowed and answers '
          + 'in the desktop\'s shape, through the one fetch slot the scanner reads '
          + '(siteFetcher, D-EX EX32), so the scan works in a browser with no '
          + 'second path to drift from the first.',
      },
    ],
    advanceInvariants: ['isEvidential'],
  },
  {
    id: 'investigate',
    label: 'Open a case',
    surface: { kind: 'app', app: 'cases' },
    restsOn: [
      {
        name: 'reports become a case\'s evidence',
        producer: 'linkEntitiesToCase',
        consumer: 'computeMissionCorroboration',
        because: 'A case that cannot cite what it rests on is a folder.',
      },
      {
        name: 'collected pages become things a case can link',
        producer: 'storeExtractedEntities',
        consumer: 'getIntelItems',
        because:
          'NetRunner produced reports for a long time and none could reach a case. '
          + 'linkEntitiesToCase takes entity ids, CasesDashboard offers reports and '
          + 'intel items as candidates, and NetRunner emitted neither — its '
          + 'subdomains, addresses and technologies were flattened into a markdown '
          + 'blob and lost their structure on the way in. The data existed; the '
          + 'conversion did not.',
      },
      {
        name: 'what a case still needs reaches the people who collect',
        producer: 'collectionQueue',
        consumer: 'RequirementsQueue',
        because:
          'Cases could record what they still needed and no collection surface '
          + 'could see one — verified by raising a requirement and finding it nowhere '
          + 'in NetRunner. Investigation emitted demand and collection never received '
          + 'it, so what got collected was bounded by what an analyst happened to '
          + 'remember. That is a ceiling on throughput no amount of faster scanning '
          + 'raises.',
      },
      {
        name: 'a case states what it concluded',
        producer: 'statePosition',
        consumer: 'CasePosition',
        because:
          'The aggregation tier had no field for the aggregate; conclusion vocabulary '
          + 'sat one tier down on the object recording a single observation.',
      },
    ],
    advanceInvariants: [],
  },
  {
    id: 'assemble',
    label: 'Assemble a mission',
    surface: { kind: 'app', app: 'teamworkspace', tab: 'missions' },
    restsOn: [
      {
        name: 'a mission rests on cases and reports',
        producer: 'attachCase',
        consumer: 'assertRestsOnEvidence',
        because:
          'relatedReports and relatedCases were optional and read by nothing but a '
          + 'counter, so a package could be dispatched from a title and a briefing alone.',
      },
      {
        name: 'corroboration reaches the dispatch decision',
        producer: 'findingForBucket',
        consumer: 'computeMissionCorroboration',
        because:
          'Corroboration was computed for a long time and never once consulted by a '
          + 'mission. The two tracks did not meet.',
      },
    ],
    advanceInvariants: ['assertRestsOnEvidence', 'destinationsOf'],
  },
  {
    id: 'publish',
    label: 'Publish Mission Package',
    surface: { kind: 'app', app: 'teamworkspace', tab: 'missions' },
    restsOn: [
      {
        name: 'a mission becomes a signed package',
        producer: 'buildMissionPackageManifest',
        consumer: 'verifyMissionPackageEvent',
        because:
          'Starcom published kind 30079 and consumed nothing, so the conformance '
          + 'checklist handed to a second node was impossible on our side.',
      },
    ],
    advanceInvariants: ['assertMayDispatch'],
    crosses: { kind: 30079, carries: 'briefing, objectives count, evidence counts — never linked content' },
  },
];

/**
 * The analysis track, which produces the network's other published product.
 *
 * Kept separate rather than folded into the spine above, because it genuinely
 * is separate: it terminates in its own publication and does not feed a
 * mission. Declaring that plainly is better than implying a connection that
 * has never existed — the join between them is `findingForBucket` above, and
 * it is one-way.
 */
export const ANALYSIS_TRACK: PipelineStage[] = [
  {
    id: 'correlate',
    label: 'Corroborate across feeds',
    surface: { kind: 'app', app: 'intelanalyzer' },
    restsOn: [
      {
        name: 'reports become correlatable events',
        producer: 'adaptReportsToEvents',
        consumer: 'findingForBucket',
        because: 'Independence is measured in feeds, which only exists once reports are events.',
      },
    ],
    advanceInvariants: ['evaluatePublication'],
    crosses: { kind: 30082, carries: 'claim and method — never source identities' },
  },
  {
    id: 'refute',
    label: 'Contest a claim',
    surface: { kind: 'app', app: 'intelanalyzer' },
    restsOn: [
      {
        name: 'a refutation is published and can be read back',
        producer: 'publishRefutation',
        consumer: 'RefutationStore',
        because:
          'The format, the d-tag derivation, the grounds vocabulary and the weight '
          + 'comparison were all built and tested, and nothing imported any of them. '
          + 'Every claim this node published was, in practice, unfalsifiable.',
      },
      {
        name: 'disagreement reaches the operator',
        producer: 'contestedFor',
        consumer: 'PeerClaimsPanel',
        because:
          'Foreign findings were ingested, verified and assessed for independence, and '
          + 'displayed nowhere. An interface that can only show who agrees reports '
          + 'consensus whether or not consensus exists.',
      },
    ],
    advanceInvariants: ['evaluatePublication'],
    crosses: { kind: 30083, carries: "the refuter's own method — never their sources" },
  },
];

/**
 * Reachable, real, and not steps in the dispatch sequence.
 *
 * Kept out of PIPELINE deliberately. The spine is ordered — each stage rests on
 * the one before it — and folding these in would assert a sequence that does not
 * hold: a mission does not have to be delegated before it is published, and
 * receiving a package is not something the publishing operator does at all.
 *
 * They are declared because they are the two places where this node's behaviour
 * is visible to the rest of the network, and both were built before anything
 * checked they connected.
 */
export const OFF_SPINE: PipelineStage[] = [
  {
    id: 'delegate',
    label: 'Delegate dispatch to a teammate',
    surface: { kind: 'app', app: 'teamworkspace', tab: 'missions' },
    restsOn: [
      {
        name: 'a grant is minted and can be re-read',
        // Since the publish review (plan 0.1): the grant is built, shown, and
        // then signed and published as shown.
        producer: 'publishPreparedDelegation',
        consumer: 'fetchGrantChain',
        because:
          'Delegation was specified, tested, and impossible to perform: the chain '
          + 'could be verified but never issued. A grant nobody can fetch back is a '
          + 'capability that only its holder believes in.',
      },
    ],
    advanceInvariants: ['assertMayDispatch'],
    crosses: { kind: 30081, carries: 'the grant and its chain — never the mission content' },
  },
  {
    id: 'receive',
    label: 'Read packages from other nodes',
    surface: { kind: 'app', app: 'teamworkspace', tab: 'missions' },
    restsOn: [
      {
        name: 'a foreign package is verified and counted',
        producer: 'MissionPackageIngest',
        consumer: 'useReceivedPackages',
        because:
          'Starcom published kind 30079 and consumed nothing. Asking a second node to '
          + 'conform to a format this one could not read is not a specification, it is '
          + 'a demand.',
      },
    ],
    advanceInvariants: ['verifyMissionPackageEvent'],
  },
];

/**
 * Built, tested, and reaching nothing.
 *
 * ─── WHY RECORD AN ABSENCE ─────────────────────────────────────────────────
 *
 * The failure this whole module exists to catch is code that typechecks, passes
 * its tests, and has no reachable trigger. Leaving such code undeclared makes
 * the declaration above a partial truth that reads as a complete one — a green
 * guard on four fifths of a pipeline says "verified", and that is worse than
 * saying nothing.
 *
 * ─── WHY THE GUARD CHECKS THE INVERSE ──────────────────────────────────────
 *
 * A known-gaps list is normally where things go to be forgotten. This one
 * cannot be, because `guard-pipeline-joins.mjs` asserts each entry below still
 * has NO consumer outside its own file and tests. The moment somebody wires one
 * up, the build fails and tells them to promote it to a declared stage.
 *
 * The list can therefore only shrink, and only deliberately.
 */
export interface UnwiredCapability {
  id: string;
  /** The symbol that exists, is tested, and is imported by nothing. */
  symbol: string;
  /** Where it lives, for the failure message. */
  module: string;
  /** What promoting it to a stage would require. */
  missing: string;
  because: string;
}

export const UNWIRED: UnwiredCapability[] = [
  /**
   * Empty, and that is a state rather than an absence of one.
   *
   * Refutation was the entry here: built, tested, imported by nothing. It was
   * promoted to a declared stage above once it acquired a producer and a
   * consumer, which is the only way an entry may leave this list — the guard
   * refuses to let one be deleted quietly.
   */
];
