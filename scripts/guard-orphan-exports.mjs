#!/usr/bin/env node
/**
 * @asserts No runtime export is referenced solely by its own file and its own tests.
 *
 * Guard script: orphan exports.
 *
 * Rule: a runtime export that nothing outside its own file and its own tests
 * ever references is not finished work. It is a capability that exists in the
 * test suite and nowhere else.
 *
 * This exists because the same failure produced four separate bugs in a single
 * session, each one passing every other check:
 *
 *   1. useGlobeIntelLayer was never called by any component. The layer
 *      contract, adapter, store, consumer and renderer were all built and all
 *      tested; the globe stayed empty because the first link was missing.
 *   2. SupportFunnelRoot destructured markSnooze and markDismiss and called
 *      neither, so closing the support modal persisted nothing and it
 *      reappeared over the navigation bar.
 *   3. Six source adapters, observationsToEvents and REGISTERED_SOURCES had no
 *      runtime call sites at all — "six sources feed one engine" was true of
 *      the test suite only.
 *   4. drainFindingsOutbox was never invoked, so findings that failed to
 *      broadcast were queued and never retried.
 *
 * Every one was a wiring failure between correctly-implemented, individually
 * verified units. Tests, typecheck, five capability-honesty rules and green
 * production builds caught none of them.
 *
 * SCOPE is deliberately narrow. A whole-repo sweep on 1200 files would report
 * hundreds of legitimately-unreferenced exports and be switched off within a
 * day. It covers the directories where wiring is the actual risk, and the scope
 * is meant to grow as areas are cleaned rather than to start impossible.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { sync: globSync } = require('glob');

/**
 * Directories this guard governs. Add to it as areas get wired.
 *
 * Starting narrow on purpose. A sweep of all of src/services/intel reports 41
 * exports, and most of the difference between the real findings and the noise
 * is one distinction: a published CONSTANT with no importer (a schema version,
 * a Nostr event kind) is a documented fact that tests and specs refer to, while
 * a FUNCTION with no importer is a capability that exists nowhere but the test
 * suite. Rather than encode that distinction as a fragile naming heuristic —
 * REGISTERED_SOURCES is SCREAMING_CASE and genuinely unwired — the scope starts
 * where the wiring debt provably is, and widens as areas are cleaned.
 */
const SCOPE = [
  'src/services/intel/observations/**/*.ts',
  'src/services/intel/globe/**/*.ts',
  'src/services/intel/outbox/**/*.ts',
  'src/services/intel/findings/**/*.ts',
  'src/services/intel/federation/**/*.ts',
  'src/services/intel/attention/**/*.ts',
  'src/services/intel/intake/**/*.ts',
  'src/services/intel/structural/**/*.ts',
  'src/services/intel/harm/**/*.ts',
  'src/services/intel/replay/**/*.ts',
  'src/services/intel/migration/**/*.ts',
  'src/services/intel/*.ts',
  /*
   * Widened once these were clean, which is what the note above means by the
   * scope growing as areas are cleaned. All three are places this project has
   * been actively adding exports, so they were the parts least covered by the
   * guard and most likely to accumulate exactly what it looks for.
   */
  'src/services/intel/capability/**/*.ts',
  'src/services/intel/collection/**/*.ts',
  'src/services/intel/pipeline/**/*.ts',
  'src/i18n/**/*.ts',
];

/**
 * Importers include scripts/, not only src/.
 *
 * The guard's actual question is "is this capability reachable, or does it
 * exist only in the test suite?" — and a script invoked by an npm script is
 * reachable. Vector generation, the gates and the commons build are entry
 * points people run; treating them as non-existent would have forced a
 * justified-looking allowlist entry for an export with a genuine live caller,
 * which is exactly the kind of quiet dishonesty this guard exists to prevent.
 *
 * Tests remain excluded via IGNORE below, so the "tested and unreachable"
 * detection is unchanged.
 *
 * Starcom Uplink's own pages and helpers (extension/entrypoints, extension/lib)
 * import from src/ too, and ship in the extension: reachable for the same
 * reason a script is (decision D-ML, L5, which first gave src/ an export only
 * Uplink's pages read). Never its node_modules or its build output.
 */
const ALL_SOURCES = '{src,scripts,extension/entrypoints,extension/lib}/**/*.{ts,tsx,mjs}';

const IGNORE = [
  'node_modules/**', 'dist/**', 'build/**', 'coverage/**',
  '**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx',
  '**/__tests__/**', '**/__mocks__/**', '**/__fixtures__/**', 'src/testing/**',
];

/**
 * Exemptions. Each MUST state why, and the reason is checked — an exemption
 * without a justification is how a guard becomes decoration.
 */
const ALLOWLIST = [
  {
    symbol: 'NavcomVocabularySource',
    reason:
      'Fetches Navcom\'s closed vocabulary from /.well-known/navcom-intel.json and caches it. '
      + 'Unreachable for the same reason NavcomAdapter is — the adapter it feeds is not '
      + 'registered until Navcom emits kind-1911 events. It exists as a fetcher rather than a '
      + 'constant at Navcom\'s explicit request: the published list is a stub awaiting local '
      + 'knowledge and will change, and a pinned copy would reject the real vocabulary the day '
      + 'it lands, dropping valid observations in the exact shape of malformed input. Comes '
      + 'out with the NavcomAdapter entry.',
  },
  {
    symbol: 'NAVCOM_WELL_KNOWN_PATH',
    reason: 'The contract path. Named so the fetch target is greppable rather than a literal inside a URL join. See NavcomVocabularySource.',
  },
  {
    symbol: 'CONTRACT_TTL_MS',
    reason: "Fallback refresh cadence, from Navcom's vocabulary.cache table. Read out of the fetched document in preference to this constant; exported so a document omitting the table has a stated default rather than an invented one. See NavcomVocabularySource.",
  },
  {
    symbol: 'CONTRACT_MAX_STALE_MS',
    reason: "The age past which a cached vocabulary stops being ENFORCED rather than merely refreshed — the point at which a stale allowlist would begin rejecting valid observations in the shape of malformed input. Exported because it is the constant the degrade-permissive behaviour turns on. See NavcomVocabularySource.",
  },
  {
    symbol: 'NavcomAdapter',
    reason:
      'The kind-1911 field-observation adapter, built to a contract Navcom has agreed but '
      + 'not yet published events against. It is deliberately NOT registered in '
      + 'registerSources: that file only registers sources with a working fetch path, on the '
      + 'stated grounds that a registered source returning nothing reports as "empty" and '
      + 'that reads as a broken feed rather than an absent publisher. Two items are still '
      + 'open on Navcom\'s side and both change parsing — the geohash cell is being pinned '
      + 'to 4 characters after their draft disagreed with its own example by eight-fold, and '
      + 'the 48-hour refinement is being respecified as replace-not-add. Wiring the '
      + 'subscription is the next step once they emit; this entry comes out then.',
  },
  {
    symbol: 'createNavcomAdapter',
    reason: 'Constructor for NavcomAdapter — see that entry. Kept separate so a verifier must be injected rather than defaulted, since a default is how a verification step becomes optional.',
  },
  {
    symbol: 'NAVCOM_SOURCE',
    reason: 'The Source descriptor NavcomAdapter emits under, including the F trust baseline that makes an unregistered key unable to corroborate itself into credibility. See NavcomAdapter.',
  },
  {
    symbol: 'NAVCOM_SPEC_VERSION',
    reason: 'The one contract version the adapter will ingest, per Navcom obligation 4 (fail closed on an unrecognised spec). A named constant so the version gate is greppable rather than a literal buried in a comparison. See NavcomAdapter.',
  },
  {
    symbol: 'NAVCOM_OBSERVATION_KIND',
    reason: 'Nostr kind 1911. Named for the same reason the other kind constants in this codebase are: a bare number in a filter is unsearchable when a collision needs investigating. See NavcomAdapter.',
  },
  {
    symbol: 'ACCEPTED_GEOHASH_LENGTHS',
    reason: 'The geohash cell sizes the adapter will accept, currently {4}. Exported because it is the number the operator-location privacy claim is a function of, and it should be inspectable rather than inlined. See NavcomAdapter.',
  },
  {
    symbol: 'defaultContainment',
    reason:
      'The entry point for containment, whose CONSUMER does not exist inside Starcom yet. '
      + 'It encodes the policy decision that a person-subject defaults to held-in-workspace, '
      + 'and deleting it would lose that statement while keeping the machinery that depends '
      + 'on it. What would call it is a person-research capture flow — an OSINT crawler '
      + 'producing candidates, or a report path that carries a containment field; neither '
      + 'exists today. Listed rather than wired because the only honest wiring would be to '
      + 'default every finding to contained, which would block publishing person subjects '
      + 'through a release UI that has not been built.',
  },
  {
    symbol: 'MemoryOutboxStore',
    reason: 'Test double and last-resort fallback for environments with neither IndexedDB nor localStorage; used by createDefaultOutboxStore at runtime only in that case.',
  },
  {
    symbol: 'MISSION_PACKAGE_KIND',
    reason:
      'A published Nostr event kind (30079) — a documented protocol fact, not a capability. '
      + 'Three other files name 30079 in prose specifically to avoid colliding with it '
      + '(FindingsBroadcastService, RealTimeTeamService), which is the kind of reference a '
      + 'constant like this earns. This is the published-constant carve-out this guard\'s '
      + 'own header describes.',
  },
  {
    symbol: 'buildMissionPackageComposeInput',
    reason:
      'Used inside its own file by buildMissionPackageManifest; exported so tests can assert '
      + 'the Navcom redaction boundary directly (Locked Decision #7 — related reports and '
      + 'cases cross as counts only, never content). That boundary is the single most '
      + 'security-relevant behaviour in the mission-package path, and testing it through the '
      + 'composed manifest would assert it far more weakly than testing the ComposeInput.',
  },
  {
    symbol: 'intelRelationshipService',
    reason:
      'GENUINELY UNWIRED, recorded here rather than hidden. Its intended consumer, '
      + 'core/intel/adapters/nodeWebAdapter, opens with a doc comment saying it is backed by '
      + 'this service — and then calls intelWorkspaceManager.getRelationships()/'
      + 'addRelationship() directly, going around it. So the service is a correct abstraction '
      + 'that its own documented consumer bypasses. Two honest fixes, neither done here '
      + 'because both are behaviour changes rather than cleanup: route nodeWebAdapter through '
      + 'the service (making the code match its documentation, and matching how Reports, '
      + 'Cases and Missions all reach the substrate), or delete the service and correct that '
      + 'doc comment. Reports/Cases/Missions all use their service layer; relationships are '
      + 'the lone exception.',
  },
  {
    symbol: 'refutationIdentifier',
    reason:
      'The `d`-tag derivation for refutations (kind 30083), which nothing publishes yet — '
      + 'no code outside tests constructs a `refutes` payload. Kept rather than deleted '
      + 'because its doc comment records a spec correction found by implementing it: an '
      + 'ISO-8601 timestamp contains colons, so the four-part identifier proposed in the '
      + 'defect report split into six on the separator and stopped being decomposable. '
      + 'Deleting the function would lose that finding while the type it serves '
      + '(FindingRefutation, already in signFinding\'s signable union) stays. Wire this by '
      + 'building a refutation publish path; it is a designed, unbuilt capability, not neglect.',
  },
  {
    symbol: 'deriveAttestationWeight',
    reason: 'The CONSUMER-side derivation. It is meant to be run by parties who are not this codebase — a peer instance, a journalist\'s script — so having no internal caller is its normal state, not neglect.',
  },
  {
    symbol: 'explainAttestationWeight',
    reason: 'Decomposition of a derived weight, for a consumer answering \'why does this rank here\'. Same consumer-facing role as deriveAttestationWeight.',
  },
  {
    symbol: 'ATTESTATION_HALF_LIFE_DAYS',
    reason: 'Published decay constant a consumer needs in order to reproduce the derivation, and asserted by tests at the half-life boundary.',
  },
  {
    symbol: 'FINDING_SCHEMA_VERSION',
    reason: 'v1 wire-shape version. A published fact consumers use to tell v1 from v2, which is precisely how the migration is meant to work.',
  },
  {
    symbol: 'FINDING_KIND',
    reason: 'Nostr event kind 30082 — a published fact in the interchange spec, not an internal call site.',
  },
  {
    symbol: 'buildRetraction',
    reason: 'Retraction builder, landed ahead of the publisher switch alongside Finding v2. Remove this entry when publishRetraction is wired.',
  },
  {
    symbol: 'isRetraction',
    reason: 'Type guard for CONSUMERS reading a 30082 payload, which may now be a claim or a withdrawal — an external-facing helper, so no internal caller is its normal state.',
  },
  {
    symbol: 'UNKNOWN_SUBJECTS_ARE_ALLOWED',
    reason: 'Documented policy constant recording a deliberate decision and its cost; referenced by the spec rather than by code.',
  },
  {
    symbol: 'buildRefutation',
    reason: 'Refutation builder, landed with Finding v2 ahead of the publisher switch. Remove this entry when publishRefutation is wired.',
  },
  {
    symbol: 'contestedState',
    reason: 'Resolution rule run by CONSUMERS holding a claim and refutations for it — an external-facing function whose normal state is having no internal caller.',
  },
  {
    symbol: 'en',
    reason: 'The source locale, typed as Messages. Its JOB is to fail compilation when a locale JSON drifts from the catalogue shape — verified by deleting a key and watching tsc reject it. The static commons builder reads the same JSON directly, so the TypeScript module is a type gate rather than a runtime consumer. Remove this entry when the app itself renders translated strings.',
  },
  {
    symbol: 'es',
    reason: 'Spanish locale, same type-gate role as `en`. Consumed at build time by scripts/build-commons.mjs via its JSON, which is the point: one catalogue both toolchains read, so they cannot drift.',
  },
  {
    symbol: 'interpolate',
    reason: 'Named-placeholder substitution for catalogue strings. Awaiting an in-app rendering surface; the commons builder has its own copy because it is plain Node and cannot import TypeScript. Remove when the app renders translated strings.',
  },
  {
    symbol: 'LOCALES',
    reason: 'The list of locales that exist, for a language picker that does not exist yet. Remove this entry when one does.',
  },
  {
    symbol: 'replayCase',
    reason: 'The reconstruction primitive. Consumed by replayTimeline and exportReplay in its own module, and by any external checker rebuilding a case from a log — that external use is the point of it being exported.',
  },
  {
    symbol: 'digestLog',
    reason: 'Digest of the ordered activity log, so an exported replay can be matched to the log it came from. Consumed by exportReplay and by any external checker; that external use is the point.',
  },
  {
    symbol: 'weighHarm',
    reason: 'Harm accounting model (III.5). Deliberately has no consumer yet: wiring it into ranking would require this codebase to choose severity weights on everyone\'s behalf, which is the one thing its design refuses. A caller must supply and publish its own weights. Remove this entry when a surface that states its weights exists.',
  },
  {
    symbol: 'comparableOn',
    reason: 'The refusal half of the harm model — states when two accounts CANNOT honestly be compared. Same status as weighHarm: no consumer until a surface exists that is prepared to state its judgements.',
  },
  {
    symbol: 'gapsIn',
    reason: 'Lists what a harm account failed to establish, so one number cannot pass for an account. Same status as weighHarm.',
  },
  {
    symbol: 'isKnown',
    reason: 'Type guard separating an established quantity from an unmeasured one, which is the distinction the whole harm model exists to preserve. Same status as weighHarm.',
  },
  {
    symbol: 'stripImageMetadata',
    reason: 'Phase III.5 GATE-OPEN deliverable: the plan requires EXIF stripping to exist and be tested BEFORE any intake surface is built, so having no caller yet is the specified state rather than an oversight. Remove this entry when the intake surface lands in III.5 Step 2 — if it is still here when intake ships, intake is accepting unstripped files.',
  },
  {
    symbol: 'recordCustody',
    reason: 'Phase III.5 gate-open deliverable, same as stripImageMetadata — the custody record exists before the surface that produces one. Remove this entry when intake lands.',
  },
  {
    symbol: 'FORBIDDEN_CUSTODY_FIELDS',
    reason: 'The named list of fields a custody record must never carry, asserted by its guard test. Exported so the test checks a list rather than a snapshot of today\'s shape, which would pass forever and say nothing about a field added later.',
  },
  {
    symbol: 'MAX_SHOWN',
    reason: 'Documented display budget for the attention queue — how many items are rendered before the rest are reported as a backlog. Named so the number is arguable rather than buried in a slice(); same category as DEFAULT_MAX_MARKS.',
  },
  {
    symbol: 'MAX_RETAINED',
    reason: 'Documented memory ceiling for the attention queue, separate from the display budget. Named so the eviction policy is inspectable; same category as DEFAULT_MAX_MARKS.',
  },
  {
    symbol: 'RECHECK_WEIGHT_THRESHOLD',
    reason: 'Documented policy constant — the derived weight below which a standing claim wants revisiting. Named so the number is arguable rather than buried in a comparison, and consumed as its own default; same category as DECISION_TTL_MS.',
  },
  {
    symbol: 'MemoryPublishedFindingsStore',
    reason: 'The no-browser-storage fallback for the published-findings ledger and its test seam — same role as MemoryOutboxStore, selected inside its own module.',
  },
  {
    symbol: 'BrowserPublishedFindingsStore',
    reason: 'The localStorage-backed published-findings store, selected inside its own module — same role as BrowserOutboxStore.',
  },
  {
    symbol: 'parseLeiCoverageAsset',
    reason: 'The validation seam for the joined coverage asset, exercised directly because its refusals are the point — most of all that the boundary must name BOTH joined snapshots, since a reader who did not know this was a join would read the count as a property of one register alone. loadLeiCoverageFindings is the wired caller.',
  },
  {
    symbol: 'LEI_COVERAGE_ASSET_URL',
    reason: 'The committed coverage-asset path, named so the default argument is stated once and assertable rather than duplicated between loader and test. Same category as REGISTER_ASSET_URL and PSC_ASSET_URL.',
  },
  {
    symbol: 'parsePscAsset',
    reason: 'The validation seam between the PSC asset and a claim, exercised directly because its refusals are the point — an asset that does not assert completeness, or whose boundary stops stating that individuals are excluded, must not yield a count. loadControlFindings is the wired caller.',
  },
  {
    symbol: 'PSC_ASSET_URL',
    reason: 'The committed control-asset path, named so the default argument is stated once and assertable rather than duplicated between loader and test. Same category as REGISTER_ASSET_URL.',
  },
  {
    symbol: 'NATIONAL_REGISTER_SOURCE_IDS',
    reason: 'The register source ids GLEIF declares itself downstream of, consumed by GLEIF_SOURCE.derivesFrom in its own module and asserted by the corroboration tests. Named rather than inlined so adding a register source means adding its id in one visible place — an id missing from this list is a source that silently counts as independent of GLEIF again.',
  },
  {
    symbol: 'parseRegisterAsset',
    reason: 'The validation seam between a data asset and a claim, exercised directly because its refusals are the point — a register that does not assert completeness must not yield a count. loadStructuralFindings is the wired caller; this is tested separately so the refusal paths can be asserted without a fetch.',
  },
  {
    symbol: 'REGISTER_ASSET_URLS',
    reason: 'The list of committed register assets, consumed as loadStructuralFindings\' own default argument and asserted in its test. Named so adding a jurisdiction is one edit in one place rather than a string threaded through the loader and its callers.',
  },
  {
    symbol: 'REGISTER_ASSET_URL',
    reason: 'The committed register slice path, named so the default argument is stated once and assertable, rather than a string literal duplicated between the loader and its test.',
  },
  {
    symbol: 'STRUCTURAL_ALGORITHM_VERSION',
    reason: 'Published in every enumeration attestation as method.algorithmVersion. Named so a consumer re-deriving a count knows which clustering logic produced it; same category as CORROBORATION_ALGORITHM_VERSION.',
  },
  {
    symbol: 'IncompleteRegisterError',
    reason: 'The distinct error type for "this register does not cover its whole boundary". Its own class so a caller can tell refusal from failure — an incomplete register must never be retried into a published count, unlike a transient fetch error.',
  },
  {
    symbol: 'DEFAULT_MIN_COMPANIES',
    reason: 'The cluster-size floor. Named so it reads as what it is — an output bound, NOT a significance threshold — rather than an unexplained 50 buried in a filter. Same category as DEFAULT_MAX_MARKS.',
  },
  {
    symbol: 'RELAY_DISCOUNT',
    reason: 'Documented judgement: what an extra source is worth when it shares a delivery path with the others. Named so the number is arguable rather than buried in an expression, and published in the NIP so a consumer who weighs relay differently can see what we chose. Same category as DECISION_TTL_MS.',
  },
  {
    symbol: 'DECISION_TTL_MS',
    reason: 'Documented retention policy — how long an analyst\'s dismissal outlives the concern it was about. Recorded as a named constant so the number is arguable rather than buried in a filter, and consumed as its own default; same category as UNKNOWN_SUBJECTS_ARE_ALLOWED.',
  },
  {
    symbol: 'DEFAULT_MAX_MARKS',
    reason: 'The globe layer contract\'s published mark budget (I.A.5) — a number a fork implements against and a caller overrides via BuildLayerOptions.maxMarks, so its normal state is having no internal caller beyond the default it supplies.',
  },
  {
    symbol: 'ANALYSIS_TRACK',
    reason: 'A pipeline declaration, consumed by guard-pipeline-joins.mjs, which reads pipeline.ts as TEXT and regex-matches the name/producer/consumer triples inside it rather than importing the binding. So the contents are checked on every build and the binding legitimately has no importer — a documented fact, in the guard\'s own terms, not an unwired capability.',
  },
  {
    symbol: 'OFF_SPINE',
    reason: 'The same: stages declared as deliberately off the main spine, consumed textually by guard-pipeline-joins.mjs. Deleting the export to satisfy this guard would delete the declaration that guard verifies.',
  },
  {
    symbol: 'REFUTATION_KIND',
    reason: 'Nostr event kind 30083, a published fact in the interchange spec rather than an internal call site.',
  },
  {
    symbol: 'observationFingerprint',
    reason: 'Single-observation hash, reimplemented independently by scripts/verify-finding.mjs — a CONSUMER computing it over their own data is the whole point, so no internal caller is expected.',
  },
  {
    symbol: 'attemptReproduction',
    reason: 'The consumer half of falsifiability: run by a third party against evidence they already hold. Proven in use by scripts/verify-finding.mjs, which reimplements it from the spec rather than importing it.',
  },
  {
    symbol: 'identifierFor',
    reason: 'The d-tag derivation itself, exported so a caller building a retraction or refutation produces byte-identical slots rather than reimplementing the normalisation.',
  },
  {
    symbol: 'fingerprintSet',
    reason: 'Batch fingerprinting for CONSUMERS comparing their own evidence against a published envelope; the publisher path uses the per-observation hash computed at ingest.',
  },
  {
    symbol: 'buildFindingsLayer',
    reason: 'Composed by buildIntelLayer in the same module, and unit-tested directly so the corroboration-only projection is covered independently of conflicts.',
  },
  {
    symbol: 'buildConflictMarks',
    reason: 'Composed by buildIntelLayer in the same module; exported so the both-halves-or-neither rule can be asserted on its own.',
  },
  {
    symbol: 'runAdapterContract',
    reason: 'Shared contract suite deliberately consumed only by adapter test files; that is its entire purpose.',
  },
  {
    symbol: 'UcdpAdapter',
    reason: 'Class export so tests can construct the adapter against a mock Source (e.g. isMock: true); the singleton ucdpAdapter is the runtime entry point.',
  },
  {
    symbol: 'NaturalEventAdapter',
    reason: 'Class export used to build the USGS/GDACS/EONET singletons in this same file and to construct mock-source variants in tests.',
  },
  {
    symbol: 'ReliefWebAdapter',
    reason: 'Class export for tests. The singleton has no fetch path registered — ReliefWeb\'s only fetcher was deleted with FeedsService.',
  },
  {
    symbol: 'NetRunnerAdapter',
    reason: 'Class export so its test can construct a fresh adapter; the singleton netrunnerAdapter is the runtime entry point and one of REGISTERED_SOURCES.',
  },
  {
    symbol: 'UCDP_SOURCE',
    reason: 'Source definition, referenced by the adapter it configures and by tests asserting its trust grade.',
  },
  {
    symbol: 'USGS_SOURCE',
    reason: 'Source definition; see UCDP_SOURCE. Its grade (A/measured) is asserted by tests as a deliberate contrast with GDACS.',
  },
  {
    symbol: 'GDACS_SOURCE',
    reason: 'Source definition; its C/derived grade exists specifically to differ from USGS and is asserted as such.',
  },
  {
    symbol: 'EONET_SOURCE',
    reason: 'Source definition for curated remote sensing, B/observed.',
  },
  {
    symbol: 'NETRUNNER_SOURCE',
    reason: 'Source definition. NetRunner is fed by BotMissionExecutor on demand rather than polled, so it is deliberately not registered with the poller.',
  },
  {
    symbol: 'RELIEFWEB_SOURCE',
    reason: 'Source definition for an adapter with no fetch path yet; kept so the pipe can be connected without re-deriving the grade.',
  },
  {
    symbol: 'clampObservedTrust',
    reason: 'Internal rule (a collector cannot grade itself upward) exported so it can be unit-tested directly rather than only through an adapter.',
  },
  {
    symbol: 'observationId',
    reason: 'Deterministic id derivation, exported for direct unit testing; callers go through createObservation.',
  },
  {
    symbol: 'BrowserOutboxStore',
    reason: 'Reached at runtime through createDefaultOutboxStore, which selects it when browser storage exists.',
  },
  {
    symbol: 'MAX_ATTEMPTS',
    reason: 'Retry budget constant, asserted by tests so the abandonment threshold is not silently changed.',
  },
  {
    symbol: 'DEFAULT_WEIGHT',
    reason: 'Engine default, asserted by tests to keep it aligned with correlationUtils\' own fallback.',
  },
  {
    symbol: 'DEFAULT_HALF_LIFE_DAYS',
    reason: 'Stated-guess decay constant, exported so a caller can reason about it and tests can assert the half-life boundary.',
  },
  {
    symbol: 'OBSERVATION_WEIGHT_ALGORITHM_VERSION',
    reason: 'Version stamp on derived weight; a published fact consumers use to interpret a score, same role as CONFIDENCE_ALGORITHM_VERSION.',
  },
  {
    symbol: 'GLOBE_INTEL_LAYER_VERSION',
    reason: 'Wire-shape version for the globe layer contract; a published fact rather than a call site.',
  },
  {
    symbol: 'INTEL_FINDINGS_OVERLAY',
    reason: 'Overlay key for the globe layer, part of the contract with the renderer.',
  },
  {
    symbol: 'shortestLonDelta',
    reason: 'Geometry helper exported for direct unit testing of the antimeridian case; crossesAntimeridian is its runtime counterpart.',
  },
  {
    symbol: 'crossesAntimeridian',
    reason: 'Used inside buildConflictMarks in the same file, and asserted directly by tests covering the date-line case.',
  },
  {
    symbol: 'explainWeight',
    reason: 'Weight decomposition intended for the UI\'s \'why does this rank here\' answer. NOT yet surfaced — a real outstanding item, exempted so the guard reports genuine regressions rather than this known gap.',
  },
];

const stripComments = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Re-exports forward a name without using it. A barrel file is not a call site. */
const stripReExports = (t) => t.replace(/export\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?/g, '');

// Runtime exports only. A type or interface with no importer is a documentation
// choice, not an unwired capability.
const EXPORT_RE = /^export\s+(?:async\s+)?(?:function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm;

const scopeFiles = SCOPE.flatMap((p) => globSync(p, { ignore: IGNORE }));
const allFiles = globSync(ALL_SOURCES, { ignore: IGNORE });

const unjustified = ALLOWLIST.filter((a) => !a.reason || a.reason.trim().length < 20);
if (unjustified.length) {
  console.error('\nOrphan-export guard failed: allowlist entries without a stated reason:');
  for (const a of unjustified) console.error(` - ${a.symbol}`);
  process.exit(1);
}
/**
 * An exemption for a symbol that no longer exists is the same failure this
 * guard exists to catch, one level up: an artifact that outlived the thing it
 * described and quietly kept asserting something untrue. (This is not
 * hypothetical — MemoryAuditSink sat here after AgentAuditLog.ts was deleted,
 * and nothing noticed, because the guard checked that reasons were WRITTEN but
 * never that their subjects were REAL.)
 *
 * Checked against the whole source tree, not just SCOPE: an allowlisted symbol
 * that still exists but has moved out of scope is fine, while one that exists
 * nowhere is stale.
 */
const declaredAnywhere = new Set();
for (const f of globSync(ALL_SOURCES, { ignore: IGNORE })) {
  const text = stripComments(fs.readFileSync(f, 'utf8'));
  for (const m of text.matchAll(EXPORT_RE)) declaredAnywhere.add(m[1]);
}
const stale = ALLOWLIST.filter((a) => !declaredAnywhere.has(a.symbol));
if (stale.length) {
  console.error('\nOrphan-export guard failed: allowlist exempts symbols that no longer exist:');
  for (const a of stale) console.error(` - ${a.symbol}`);
  console.error('\nDelete these entries. An exemption for deleted code is a stale claim, which is');
  console.error('the same class of problem this guard was built to prevent.\n');
  process.exit(1);
}

const exempt = new Set(ALLOWLIST.map((a) => a.symbol));

// Index every non-test file's referencing text once.
const bodies = new Map();
for (const f of allFiles) {
  bodies.set(f.replaceAll('\\', '/'), stripReExports(stripComments(fs.readFileSync(f, 'utf8'))));
}

const orphans = [];
for (const file of scopeFiles) {
  const f = file.replaceAll('\\', '/');
  const text = stripComments(fs.readFileSync(file, 'utf8'));

  for (const m of text.matchAll(EXPORT_RE)) {
    const symbol = m[1];
    if (exempt.has(symbol)) continue;

    let referenced = false;
    for (const [other, body] of bodies) {
      if (other === f) continue;
      // Word-boundary match, so `weightOf` does not match `weightOfThing`.
      if (new RegExp(`\\b${symbol}\\b`).test(body)) { referenced = true; break; }
    }
    if (!referenced) orphans.push({ file: f, symbol });
  }
}

if (orphans.length) {
  console.error(`\nOrphan-export guard FAILED — ${orphans.length} export(s) that nothing outside their own file uses.\n`);
  const byFile = new Map();
  for (const o of orphans) byFile.set(o.file, [...(byFile.get(o.file) ?? []), o.symbol]);
  for (const [file, symbols] of byFile) {
    console.error(`  ${file}`);
    console.error(`    ${symbols.join(', ')}\n`);
  }
  console.error('These are tested and unreachable — a capability that exists in the test suite and nowhere else.');
  console.error('Wire it, delete it, or add it to ALLOWLIST in this file WITH a reason.\n');
  process.exit(1);
}

console.log(`Orphan-export guard passed: ${scopeFiles.length} files in scope, ${ALLOWLIST.length} justified exemption(s).`);
