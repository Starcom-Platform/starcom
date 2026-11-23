#!/usr/bin/env node
/**
 * Publishes Starcom's machine-readable node descriptor and NIP-05 mapping.
 *
 * THE GAP THIS CLOSES
 *
 * Earth Alliance News committed to consume Starcom's attested claims and
 * RevNow committed to cite them by identifier. Neither is implementable,
 * because Starcom has never published an identity. A consumer watching a public
 * relay sees every claim from everyone; without a pubkey to filter on it cannot
 * tell a Starcom claim from anyone else's.
 *
 * Three consensus rounds, fifteen artifacts and a ratified wire format did not
 * surface this. Everyone reviewed the FORMAT and nobody tried to be a consumer.
 * It is the same lesson as the first publication candidate: build the artifact
 * and it tells you what the review could not.
 *
 * WHAT IT EMITS
 *
 *   /.well-known/nostr.json      NIP-05. Resolves starcom.app to a pubkey, so
 *                                a consumer can subscribe to the right author.
 *   /.well-known/starcom-node.json
 *                                What Starcom publishes, in which event kinds,
 *                                through which relays, and what it refuses.
 *
 * IDENTITY
 *
 * Both public keys live in src/config/nodeIdentity.ts, which the application
 * imports too — one fact, one place. That module carries the reasoning for why
 * they are committed rather than configured. STARCOM_NOSTR_PUBKEY still
 * overrides for forks and staging deployments that must not sign as Starcom.
 *
 * Either way this script sees only a PUBLIC key. Publishing an identity
 * requires nothing private, and a malformed value is refused rather than
 * published.
 *
 * Usage: node scripts/publish-node-descriptor.mjs
 */
import fs from 'node:fs';
import { NODE_NOSTR_PUBKEY, NODE_CLAIM_PUBKEYS, NODE_CLAIM_ALG } from '../src/config/nodeIdentity.ts';
import { FEDERATION_READ_RELAYS } from '../src/config/publicInfrastructure.ts';
import { KIND_USE } from '../src/services/nostr/kindRegistry.ts';
import PUBLISHERS_DATA from '../src/config/publishers.json' with { type: 'json' };
import path from 'node:path';

const OUT = path.join(process.cwd(), 'public/.well-known');
fs.mkdirSync(OUT, { recursive: true });


const pubkey = (process.env.STARCOM_NOSTR_PUBKEY ?? NODE_NOSTR_PUBKEY).trim().toLowerCase();
const valid = /^[0-9a-f]{64}$/.test(pubkey);

if (pubkey && !valid) {
  console.error('  STARCOM_NOSTR_PUBKEY is set but is not 64 hex characters. Refusing to publish a malformed identity.');
  process.exit(1);
}

// Where a consumer should listen for Starcom's claims.
//
// The Record is a peer-operated, kind-scoped, allowlist-write archive; the rest
// are public relays nobody in this network runs. All six are listed because
// claims minted through the command-line path (scripts/claim.mjs) go to all
// six, and those published from the browser go to the five public relays
// (publishTargets.ts): listening to the six finds both. This said both kinds
// went to both until the EIN transition audit of 21 Nov 2026 (finding 3).
//
// Read from the registry, not listed here: this file kept its own copy until
// 2026-09-19, and a descriptor is exactly the document that goes wrong quietly
// when the app's set moves and its copy does not.
const RELAYS = FEDERATION_READ_RELAYS;

/*
 * Every other kind this node sends, reads or only signs, from the kind registry's KIND_USE (the EIN transition
 * audit, 21 Nov 2026, finding 1). The five kinds this node specifies keep their own entries, with builder and
 * identifier, below; these follow them. Until then the descriptor listed those five alone, and a peer reading it
 * learned of none of the reports, labels, comments, sealed messages and NavCom kinds that pass through this node.
 */
const SPECIFIED_HERE = new Set([30079, 30081, 30082, 30083, 30084]);
const KIND_ROWS = Object.entries(KIND_USE).map(([kind, use]) => ({ kind: Number(kind), ...use }))
  .filter((row) => !SPECIFIED_HERE.has(row.kind));
const SENT_TOO = KIND_ROWS.filter((r) => r.publishes).map((r) => ({ kind: r.kind, name: r.name, description: r.publishes }));
const READ_TOO = KIND_ROWS.filter((r) => r.reads).map((r) => ({ kind: r.kind, name: r.name, note: r.reads }));
const SIGNED_ONLY = KIND_ROWS.filter((r) => r.signs && !r.publishes).map((r) => ({ kind: r.kind, name: r.name, note: r.signs }));

if (valid) {
  fs.writeFileSync(path.join(OUT, 'nostr.json'), JSON.stringify({
    names: { starcom: pubkey, _: pubkey },
    relays: { [pubkey]: RELAYS },
  }, null, 2) + '\n');
}

const descriptor = {
  node: 'starcom',
  role: 'sense-making — attested claims over public record',
  identity: valid
    ? {
        pubkey,
        nip05: 'starcom@starcom.app',
        relays: RELAYS,
        /*
         * The keys the INNER signature is made with, which is the one the
         * attested-claims design rests on.
         *
         * Publishing only `pubkey` meant a consumer could check which node
         * relayed a claim and not which key attested it: the ML-DSA public key
         * rides inside every event, so its signature could be confirmed
         * self-consistent and never confirmed as ours. security-policy.md told
         * readers they could check what this node published; for that layer,
         * they could not.
         *
         * Newest first. A claim signed by a key retired last month is still
         * ours, so this is a list and not a value.
         */
        claimKeys: [...NODE_CLAIM_PUBKEYS],
        claimKeyAlg: NODE_CLAIM_ALG,
      }
    : {
        pubkey: null,
        reason: 'No stable publishing identity yet. The key was per-browser and per-install, so there was nothing for a consumer to subscribe to. Set STARCOM_NOSTR_PUBKEY to publish one.',
      },
  /**
   * WHO SIGNS WHAT — the question a consumer actually has, answered here
   * because the obvious inference from `identity` above is half wrong.
   *
   * `identity.pubkey` plus /.well-known/nostr.json resolves starcom@starcom.app
   * to exactly one key, and a reader reasonably concludes that a claim signed
   * by that key is Starcom's and a claim signed by anything else is not. The
   * first half is true. The second half is false, and believing it produces
   * confident errors in both directions.
   *
   * TWO PATHS MINT KIND 30082, and they are not the same act:
   *
   *   The command-line path (scripts/claim.mjs, scripts/emit-signed-events.mjs)
   *   signs with the node key, held offline and used deliberately. That IS this
   *   project speaking, and the signature is checkable proof of it.
   *
   *   The browser application signs with the OPERATOR'S key. It holds no key of
   *   its own — signEvent takes a caller-supplied secret or a NIP-07 extension
   *   and throws with neither — so a finding published there is that person's
   *   claim, under their own key and in their own jurisdiction.
   *
   * So the node signature is sound evidence of presence and NO evidence of
   * absence. A claim not signed by it may be a good-faith operator or a hostile
   * forgery in this format, and no signature check separates those two. What
   * separates them is the disclosed method — which is why every entry below
   * derives weight from method and never from the author.
   */
  signing: {
    nodeKeySigns:
      'Attested claims minted through the command-line path (scripts/claim.mjs, scripts/emit-signed-events.mjs), where the secret is held offline. Nothing in the browser application can produce this signature.',
    operatorKeySigns:
      'Everything published from the browser application: every kind in `publishes` below, among them findings, refutations, mission packages, dispatch capabilities, roster items and people\'s reports. The publishing path ships no key of this node\'s — it signs with a secret the operator supplies or a NIP-07 extension holds, and refuses to publish with neither. Those claims carry that person\'s key, made in their own name and their own jurisdiction.',
    absenceProvesNothing:
      'A claim NOT signed by the node key is not thereby an impersonation. Legitimate operator claims and hostile forgeries are indistinguishable by signature, and this node will not assert otherwise.',
    noRoster:
      'There is no register of legitimate operators and there will not be one. Refusal R-1 forbids gating on a credential and a roster functions as one: appearing on it would read as endorsement, making this node answerable for claims it did not make and cannot check.',
    doNotFilterOn:
      'Do not filter claims by identity.pubkey expecting to find Starcom\'s output. It would exclude nearly all of it. Narrow by kind plus `d`/`t` tag, then derive weight from the disclosed method.',
    weightIsUnaffected:
      'A claim signed by the node key carries no additional weight. A method does not become better evidence because of who signed it, and the derivation has no author term.',
  },
  publishes: [
    {
      kind: 30079,
      builder: 'buildMissionPackageManifest',
      name: 'Mission Package',
      description: 'A signed, redacted mission handoff to Navcom. Linked report and case content never crosses; only counts do. Carries an ML-DSA-65 signature over the canonical manifest, independent of the outer Nostr signature.',
      identifier: '"starcom_mission_package_" + manifest.id',
    },
    {
      kind: 30081,
      builder: 'buildGrantEvent',
      name: 'Dispatch Capability',
      description: 'A signed, delegable grant of authority to dispatch one mission, rooted in the mission creator rather than issued by any body. Published when a dispatch is delegated, so that authority is checkable by anyone rather than asserted by its holder.',
      identifier: '"cap:" + resource + ":" + holderPubkey',
    },
    {
      kind: 30082,
      builder: 'buildFindingAttestation',
      name: 'Attested Claim',
      description: 'A statement about a subject, with the method that produced it. Weight is DERIVED by the consumer from the disclosed method and is never asserted by this node.',
      identifier: 'percentEncode(subjectRef) + ":" + percentEncode(attribute)',
    },
    {
      kind: 30083,
      builder: 'buildRefutation',
      name: 'Refutation',
      description: 'A contradiction of a claim, carrying its own method. Anyone may publish one; this node does not adjudicate between them.',
    },
    {
      kind: 30084,
      builder: 'rosterTemplate',
      name: 'Roster Item',
      description: 'A larger kind of work, one shape for every kind (a Directive, an Epic, a Campaign, a Quest, an Adventure, a Story and the rest), each made and signed by a person or a desk, never by this node. Posted publicly, to a team\'s own relay, or sealed by NIP-59 to each invitee; links say what it works toward and what its author counts as part of it.',
      identifier: 'the kind of work and twelve random hex digits, e.g. "directive-3f9a0c1d2e4b"',
    },
    ...SENT_TOO,
  ],
  consumes: [
    {
      kind: 30079,
      note: 'Mission Packages from any author. The outer Nostr signature and the inner ML-DSA-65 manifest signature are both verified before a package is counted; neither is taken on trust from the relay that served it.',
    },
    {
      kind: 30081,
      note: 'Dispatch capability grants, fetched when a local chain is insufficient to justify a dispatch. A grant is authority only if its chain roots in the mission\'s creator.',
    },
    {
      kind: 30082,
      note: 'Claims from any author are weighed by disclosed method. Nothing is gated on the identity of the publisher.',
    },
    {
      kind: 30084,
      note: 'Roster items from any author, the newest at each address standing and a retraction there withdrawing it. None is marked as authoritative: whom to follow is each person\'s choice, kept on their device.',
    },
    {
      kind: 30083,
      note: 'Refutations of claims this node holds, weighed by the same derivation used on the claim they contest — a refutation IS an attestation, so one well-evidenced refutation outweighs ten empty ones. A refutation carrying no derivable method is refused, because the cheapest possible message ("wrong") must not outweigh expensive evidence.',
    },
    ...READ_TOO,
  ],
  // Signed and carried in a link or a file, never sent to a relay: listed so a peer handed one knows what it is.
  signsWithoutSending: SIGNED_ONLY,

  /**
   * Why a future NIP taking one of these numbers is not an emergency.
   *
   * Kind numbers are a shared namespace and nothing binds anyone to a registry.
   * The stake this node makes is the tag namespace, the published spec and the
   * dated vectors — not the integer, which is an address, and addresses are
   * shared. guard-kind-collision.mjs enforces the property that makes this safe.
   */
  kindPolicy: {
    claim: 'None of these numbers are owned, by this node or anyone.',
    rationale: 'Nostr kind numbers are a shared namespace. Any number above may later be allocated by a NIP to something unrelated, and that would not be a conflict to resolve — it would be two protocols sharing an integer. Nothing here treats a kind number as sufficient to identify a record: every subscription for a kind this node mints narrows by `d` tag, `t` tag or author, and every payload is validated by shape before it is stored. A foreign event at one of these numbers is filtered out rather than misread.',
    identity: 'What identifies these records is the `d`/`t` tag namespace, the published specification, and the dated conformance vectors — not the integer.',
    onCollision: 'If a NIP later claims one of these numbers, this node does not intend to migrate. Migration would break every peer and every archived event to solve a problem the filters already solve. It would relocate only if the collision were semantic — if the same number came to mean something a consumer could confuse with these records despite the tags.',
    borrowed: '30023 (NIP-23 long-form) and 30078 (NIP-78 application-specific data) are NOT claimed. This node is a guest at those numbers and behaves accordingly. Nor is any other kind listed without a builder or an identifier of this node\'s: those are defined by a NIP or by NavCom, and are listed so a peer can see everything this node sends and reads.',
  },
  /**
   * What Starcom depends on that it does not operate.
   *
   * Published as a worked answer to an open question in the network's
   * architecture review: whether correlated dependencies should be tracked in a
   * central map, and whether maintaining that map becomes a new correlated
   * dependency itself.
   *
   * It does, which is why this is not a map. Each node states its own; anyone
   * who wants the picture aggregates. No maintainer, no registry, nothing to go
   * down. That is derived trust applied to infrastructure — publish the facts,
   * let the consumer compute — and it is the same reason weight is never
   * asserted by a publisher.
   *
   * Listed because it was NOT free to discover: this project lost five months
   * of deploys to a build failure nobody was watching for, and the network only
   * counted its shared exposure after a peer had already lost five days of CI
   * to the same class of thing. Each of these was chosen independently, for
   * good local reasons, by someone not counting.
   */
  dependencies: [
    { name: 'Vercel', role: 'hosting and build', losing_it: 'the interface and every /spec and /.well-known path stop resolving; published claims are unaffected' },
    {
      name: 'GitHub',
      role: 'source hosting. NOT continuous integration, and NOT a scheduled publisher.',
      note:
        'Stated flatly because the previous wording here read "CI, and the scheduled publisher", and a peer believing it would wait for a nightly republish that does not come. There is no CI and no scheduled publisher: the owner chose on 23 Nov 2026 to run none, and the nightly workflow that once sat unused here was removed. Publishing is operator-initiated: `scripts/claim.mjs publish-set --confirm`. Every guard this project rests on therefore runs locally before a commit rather than in CI.',
      losing_it:
        'Source hosting would move. Nothing about publishing would change, because no part of publishing runs here.',
    },
    { name: 'Filebase', role: 'IPFS pinning', losing_it: 'nothing immediately — CIDs and hashes are recorded so anyone can re-pin identical bytes elsewhere' },
    { name: 'Public Nostr relays', role: 'claim transport', losing_it: 'nothing structural; none is privileged and any can be replaced' },
    { name: 'record.cosmiccodex.app', role: 'peer-operated archive, via a Cloudflare Tunnel', losing_it: 'nothing structural; Starcom publishes to public relays as well, by design' },
  ],
  specification: '/spec/nip-draft-attested-claims.md',
  conformanceVectors: '/spec/vectors/index.json',
  // The dispatch side. Advertised separately because it is a different format
  // family with its own spec and its own vectors — a peer implementing Navcom
  // handoff needs these, and a peer consuming claims does not.
  interchange: {
    specification: '/spec/starcom-navcom-interchange.spec.md',
    conformanceVectors: '/spec/mission-vectors/index.json',
    // The ingest direction: what this consumer does with a kind 1911 field
    // observation. Navcom produces these; the vectors describe our decisions,
    // not their wire format, which is theirs.
    observationVectors: '/spec/observation-vectors/index.json',
  },
  /**
   * How often this node re-reads a claim's slot, which is what decides how long
   * a retraction can go unnoticed here.
   *
   * Published because the specification asks consumers to state it rather than
   * fixing a number in the document: a cadence suiting an interactive client
   * and one suiting an archival mirror are different, and a figure in the spec
   * would be obeyed by implementations it does not fit and ignored by the rest.
   */
  revalidation: {
    cadence:
      'On every session start, plus a live subscription held open for the duration of that session.',
    lookback: 'P7D',
    whyThatIsEnoughHere:
      'Nothing is persisted between sessions. The foreign-finding store is in memory and is rebuilt each time from the current contents of each slot, so there is no cached copy that can outlive a withdrawal. Because these kinds are parameterized-replaceable, a slot retracted longer ago than the lookback yields neither the claim nor the retraction — it is simply absent, which is the reading the specification requires.',
    honestLimit:
      'A session left running relies on the open subscription. If a relay drops it without the client noticing, retractions published after that point are missed until the app is restarted. This is a real gap, stated rather than covered by the sentence above.',
  },
  refusals: '/.well-known/ein-refusals.json',
  // Whose notes each layer reads by default, and their keys: a reading choice, published as the app reads it
  // (src/config/publishers.json; the EIN transition audit, finding 4). Not a register of who may publish.
  publishers: '/.well-known/starcom-publishers.json',
  // Every self-check this repository runs, with what each asserts and whether it
  // is in the gate — generated, so it cannot overstate our rigour to the people
  // security-policy.md invites to audit exactly these claims.
  guards: '/.well-known/starcom-guards.json',
  health: '/.well-known/starcom-health.json',
  notes: [
    'Verification is the consumer\'s responsibility. A relay serving a payload whose signature does not verify is a relay to stop using, not a reason to trust the payload.',
    'A valid signature proves who published a claim, never that the claim is true.',
    'This node operates no trust API and no scoring service. Confidence is computed by each consumer from what the claim discloses.',
  ],
};

fs.writeFileSync(path.join(OUT, 'starcom-node.json'), JSON.stringify(descriptor, null, 2) + '\n');
fs.writeFileSync(path.join(OUT, 'starcom-publishers.json'), JSON.stringify(PUBLISHERS_DATA, null, 2) + '\n');

console.log(`  node descriptor: ${valid ? `identity ${pubkey.slice(0, 16)}…` : 'NO IDENTITY — descriptor states why'}`);
console.log(`  wrote .well-known/starcom-node.json${valid ? ' and .well-known/nostr.json' : ' (nostr.json skipped: no pubkey)'}`);
