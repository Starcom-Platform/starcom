#!/usr/bin/env node
/**
 * @asserts Nothing is published without the publish review: every publishing entry point is called only from src/services/publishing/, raw relay publishes happen only in the services that publish, and the review is mounted.
 *
 * ─── WHY ───────────────────────────────────────────────────────────────────
 *
 * Twelve places sent content to relays or IPFS. Only mission publishing warned
 * first, and none showed what would be sent or where (plan item 0.1, story
 * S20). The review in src/services/publishing/ shows exactly what goes and
 * where before anything is sent. This guard makes it the only way to publish:
 * a screen that calls a publishing entry point itself fails the build.
 *
 * ─── THREE RULES ───────────────────────────────────────────────────────────
 *
 *   1. A publishing entry point is called only from src/services/publishing/,
 *      or inside the module that implements it.
 *   2. A raw relay publish (`pool.publish(…)`) happens only in a service whose
 *      whole job is publishing, each listed below with the reason it may.
 *   3. src/App.tsx mounts PublishReviewRoot. Without it a review would wait for
 *      an answer nobody can see.
 *
 * ─── THE RATCHET ───────────────────────────────────────────────────────────
 *
 * scripts/publish-review-ratchet.json lists the direct calls that existed
 * when this guard was written, while their paths move behind the review one at
 * a time. It may only shrink: a direct call not listed fails, and so does a
 * listed call that is no longer there, so each entry is deleted as its path
 * moves. A missing file is an empty list, which fails closed. Empty, the guard
 * is simply rule 1.
 *
 * Test files are not scanned. Comments are not code.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { sync: globSync } = require('glob');

const REVIEW_DIR = 'src/services/publishing/';

/** Each entry point: how a call to it looks, and the modules that implement it. */
const ENTRY_POINTS = [
  { name: 'publishToNavcom', call: /\.publishToNavcom\s*\(/, home: ['src/services/intel/MissionService.ts'] },
  { name: 'retryPublish', call: /\.retryPublish\s*\(/, home: ['src/services/intel/MissionService.ts'] },
  { name: 'delegateDispatch', call: /\.delegateDispatch\s*\(/, home: ['src/services/intel/MissionService.ts'] },
  { name: 'revokeDispatch', call: /\.revokeDispatch\s*\(/, home: ['src/services/intel/MissionService.ts'] },
  { name: 'publishMissionPackage', call: /\.publishMissionPackage\s*\(/, home: ['src/services/intel/MissionService.ts', 'src/services/intel/MissionPackageBroadcastService.ts'] },
  { name: 'delegateAndPublish', call: /\bdelegateAndPublish\s*\(/, home: ['src/services/intel/MissionService.ts', 'src/services/intel/capability/capabilityDelegation.ts'] },
  { name: 'revokeAndPublish', call: /\brevokeAndPublish\s*\(/, home: ['src/services/intel/MissionService.ts', 'src/services/intel/capability/capabilityDelegation.ts'] },
  { name: 'publishFinding', call: /\bpublishFinding\s*\(/, home: ['src/services/intel/findings/FindingsPublisherService.ts', 'src/services/intel/findings/FindingsBroadcastService.ts'] },
  { name: 'publishAttestation', call: /\bpublishAttestation\s*\(/, home: ['src/services/intel/findings/FindingsPublisherService.ts'] },
  { name: 'refuteWithFinding', call: /\brefuteWithFinding\s*\(/, home: ['src/services/intel/findings/FindingsPublisherService.ts'] },
  { name: 'retractFinding', call: /\bretractFinding\s*\(/, home: ['src/services/intel/findings/FindingsPublisherService.ts'] },
  { name: 'publishCaseAdjudication', call: /\bpublishCaseAdjudication\s*\(/, home: ['src/services/intel/findings/FindingsPublisherService.ts'] },
  { name: 'publishIntelReport', call: /\.publishIntelReport\s*\(/, home: ['src/services/intel/NostrIntelBroadcastService.ts', 'src/services/intel/IntelPipelineOrchestrator.ts', 'src/applications/netrunner/integration/OsintNostrPublisher.ts'] },
  { name: 'publishOsintToNostr', call: /\bpublishOsintToNostr\s*\(/, home: ['src/applications/netrunner/integration/OsintNostrPublisher.ts'] },
  { name: 'publishAdapter.publish', call: /\bpublishAdapter\.publish\s*\(/, home: ['src/services/exchange/PublishAdapter.ts'] },
  // The halves that send what a review showed. Called from anywhere else they
  // would publish without one.
  { name: 'publishPreparedPackage', call: /\.publishPreparedPackage\s*\(/, home: ['src/services/intel/MissionService.ts'] },
  { name: 'publishPreparedDelegation', call: /\.publishPreparedDelegation\s*\(/, home: ['src/services/intel/MissionService.ts'] },
  { name: 'publishPreparedRevocation', call: /\.publishPreparedRevocation\s*\(/, home: ['src/services/intel/MissionService.ts'] },
  { name: 'publishPreparedClosing', call: /\.publishPreparedClosing\s*\(/, home: ['src/services/intel/MissionService.ts'] },
  { name: 'publishPreparedAttestation', call: /\bpublishPreparedAttestation\s*\(/, home: ['src/services/intel/findings/FindingsPublisherService.ts'] },
  { name: 'publishPreparedRefutation', call: /\bpublishPreparedRefutation\s*\(/, home: ['src/services/intel/findings/FindingsPublisherService.ts'] },
  { name: 'publishPreparedRetraction', call: /\bpublishPreparedRetraction\s*\(/, home: ['src/services/intel/findings/FindingsPublisherService.ts'] },
  { name: 'publishPreparedOsint', call: /\bpublishPreparedOsint\s*\(/, home: ['src/applications/netrunner/integration/OsintNostrPublisher.ts'] },
  { name: 'publishCapabilityEvent', call: /\bpublishCapabilityEvent\s*\(/, home: ['src/services/intel/MissionService.ts', 'src/services/intel/capability/capabilityDelegation.ts'] },
  { name: 'sendBundle', call: /\bsendBundle\s*\(/, home: ['src/services/intel/bundles/sendBundle.ts'] },
  { name: 'sendMissionReport', call: /\bsendMissionReport\s*\(/, home: ['src/services/intel/received/sendReport.ts'] },
  { name: 'sendSignedRoster', call: /\bsendSignedRoster\s*\(/, home: ['src/services/roster/sendRoster.ts'] },
  { name: 'sendSignedEvent', call: /\bsendSignedEvent\s*\(/, home: ['src/services/nostr/sendSigned.ts'] },
  { name: 'sendSealedRoster', call: /\bsendSealedRoster\s*\(/, home: ['src/services/roster/sendRoster.ts'] },
  { name: 'sendRlshCard', call: /\bsendRlshCard\s*\(/, home: ['src/services/rlsh/sendCard.ts'] },
  // An upload to IPFS publishes too: content on IPFS can be fetched by its address from anywhere,
  // and cannot be taken back. The chat window's paperclip uploaded files in the clear this way,
  // outside the review, and nothing counted it (plan 9.1). NetRunner's upload runs only inside its
  // reviewed publish.
  { name: 'uploadToIPFS', call: /\buploadToIPFS\s*\(/, home: ['src/lib/ipfs-client.ts', 'src/services/IPFSService.ts', 'src/applications/netrunner/integration/OsintIntelBridge.ts'] },
  { name: 'uploadIntelPackage', call: /\.uploadIntelPackage\s*\(/, home: ['src/services/IPFSService.ts', 'src/services/intel/IntelPipelineOrchestrator.ts'] },
  { name: 'uploadCyberTeam', call: /\.uploadCyberTeam\s*\(/, home: ['src/services/IPFSService.ts'] },
  { name: 'uploadInvestigation', call: /\.uploadInvestigation\s*\(/, home: ['src/services/IPFSService.ts'] },
  { name: 'uploadOsintPackage', call: /\buploadOsintPackage\s*\(/, home: ['src/applications/netrunner/integration/OsintIntelBridge.ts', 'src/applications/netrunner/integration/OsintNostrPublisher.ts'] },
  { name: 'publishPreparedReview', call: /\bpublishPreparedReview\s*\(/, home: ['src/services/reviews/reviewBroadcast.ts'] },
];

/** Where a raw relay publish may happen, and why. */
const RAW_PUBLISH = /\b\w*[pP]ool\.publish\s*\(/;
const MAY_PUBLISH_RAW = {
  'src/services/intel/MissionPackageBroadcastService.ts': 'broadcasts a reviewed Mission Package',
  'src/services/intel/findings/FindingsBroadcastService.ts': 'broadcasts reviewed findings, refutations and retractions, and resends what the outbox holds',
  'src/services/intel/NostrIntelBroadcastService.ts': 'broadcasts a reviewed Intel Report',
  'src/services/intel/capability/capabilityDelegation.ts': 'broadcasts a reviewed delegation or revocation',
  'src/services/nostrService.ts': 'chat: channels and messages, which the review does not cover (plan 2.7)',
  'src/lib/chat/adapters/NostrChatAdapter.ts': 'chat: direct messages, which the review does not cover (plan 2.7)',
  'src/services/crypto/PQCKeyPublisher.ts': 'publishes the prekey bundle, public key material others need to write to you',
  'src/services/intel/bundles/sendBundle.ts': 'sends a reviewed bundle, each part sealed and gift-wrapped to each recipient (plan 2.4)',
  'src/services/intel/received/sendReport.ts': 'sends a reviewed mission report, sealed and gift-wrapped to the package publisher (D-MF, MF11)',
  'src/services/roster/sendRoster.ts': 'posts a reviewed roster item: signed, public or to a team relay, or sealed to each invitee (D-RS, RS14)',
  'src/services/nostr/sendSigned.ts': 'sends a reviewed inbox list, a label on a report sealed to its sender (MX32), a Psi Watch call\'s seal or reveal (D-PW, PW72), or a report or its withdrawal (D-RP); and resends, signed as it was, what the outbox kept when no relay took it (W1)',
  'src/services/chat/sealedChat.ts': 'chat: direct and team messages sealed to each recipient, which the review does not cover (plan 2.7)',
  'src/services/reviews/reviewBroadcast.ts': 'sends a reviewed comment or verdict on a published item (plan 5.1)',
  'src/services/rlsh/sendCard.ts': 'sends a reviewed RLSH card or its withdrawal, signed by the card\'s own contact key, never the person\'s (D-RF, RF1)',
};

/** Direct calls still being moved behind the review. May only shrink. */
const RATCHET_FILE = 'scripts/publish-review-ratchet.json';
let NOT_YET_REVIEWED = {};
if (fs.existsSync(RATCHET_FILE)) {
  try {
    NOT_YET_REVIEWED = JSON.parse(fs.readFileSync(RATCHET_FILE, 'utf8')).notYetReviewed ?? {};
  } catch (err) {
    console.error(`Publish-review guard FAILED — ${RATCHET_FILE} could not be read: ${err.message}`);
    process.exit(1);
  }
}

const isTest = (file) => /\/__tests__\/|\/tests\/|\.(test|spec|vitest)\.[tj]sx?$/.test(file);

/** Comments are prose, not code: blanked, keeping line numbers. */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const files = globSync('src/**/*.{ts,tsx}', { nodir: true }).map((f) => f.split('\\').join('/')).filter((f) => !isTest(f));

if (files.length === 0) {
  console.error('Publish-review guard FAILED — no source files found under src/, so it cannot confirm anything.');
  process.exit(1);
}

const problems = [];
const directCalls = new Map(); // file -> Set of entry point names called there

for (const file of files) {
  const lines = stripComments(fs.readFileSync(file, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    for (const entry of ENTRY_POINTS) {
      if (!entry.call.test(line)) continue;
      if (file.startsWith(REVIEW_DIR) || entry.home.includes(file)) continue;
      if (!directCalls.has(file)) directCalls.set(file, new Set());
      directCalls.get(file).add(entry.name);
      if (!(NOT_YET_REVIEWED[file] ?? []).includes(entry.name)) {
        problems.push(`${file}:${i + 1}  calls ${entry.name} directly. Publish through src/services/publishing/, so the person sees what goes and where first.`);
      }
    }
    if (RAW_PUBLISH.test(line) && !(file in MAY_PUBLISH_RAW)) {
      problems.push(`${file}:${i + 1}  publishes to relays directly (\`${line.trim().slice(0, 60)}\`). Only the publishing services listed in this guard may, each for a stated reason.`);
    }
  });
}

// The ratchet only shrinks: an entry whose call has gone must be deleted.
for (const [file, names] of Object.entries(NOT_YET_REVIEWED)) {
  if (!fs.existsSync(file)) continue;
  for (const name of names) {
    if (!directCalls.get(file)?.has(name)) {
      problems.push(`${file}  no longer calls ${name} directly. Delete it from ${RATCHET_FILE}, so the list only shrinks.`);
    }
  }
}

const app = fs.existsSync('src/App.tsx') ? stripComments(fs.readFileSync('src/App.tsx', 'utf8')) : '';
if (!/<PublishReviewRoot\s*\/>/.test(app)) {
  problems.push('src/App.tsx does not mount <PublishReviewRoot />. A review would wait for an answer nobody can see.');
}

if (problems.length > 0) {
  console.error(`Publish-review guard FAILED — ${problems.length} problem(s).`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

const waiting = Object.values(NOT_YET_REVIEWED).reduce((n, names) => n + names.length, 0);
console.log(`Publish-review guard passed: ${files.length} source files scanned; every publish goes through the review${waiting ? `, except ${waiting} call(s) still being moved behind it` : ''}.`);
