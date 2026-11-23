#!/usr/bin/env node
/**
 * @asserts No security, safety, presence or agent-status surface renders a value that originated from a mock, a fallback, or a self-report.
 *
 * Guard script: capability honesty.
 *
 * Rule: no security, safety, presence, or agent-status surface may render a
 * value that originated from a mock, a fallback, or a self-report.
 *
 * This exists because the same bug has now been found by hand three times:
 *
 *   1. opsecService returned a fabricated "VPN through London, fingerprint
 *      protection on, DNS secure" object whenever its backend was
 *      unreachable — which, since that host does not resolve, was the
 *      production path. An operator researching a hostile target saw a green
 *      protection panel that had checked nothing.
 *   2. CollaborationSidebar's roster showed a simulated presence indicator
 *      that reflected nobody's actual online state.
 *   3. Classification/clearance renders as though enforced while nothing
 *      checks it.
 *
 * Each was caught by a person reading code. This catches the fourth.
 *
 * The rule set is data (RULES below), not logic, so adding a rule is an entry
 * rather than a rewrite. Every allowlist entry requires a stated reason —
 * an allowlist that can grow silently is not a guard.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { sync: globSync } = require('glob');

/**
 * Scan root. Defaults to src/. Overridable so the guard's own detection can be
 * tested against fixture files — a guard whose rules are never proven to match
 * anything provides false assurance, which is the exact failure mode this
 * script exists to prevent.
 */
const ROOT = process.env.GUARD_ROOT || 'src';
const SCANNING_FIXTURES = ROOT !== 'src';

const IGNORE = [
  'node_modules/**',
  'dist/**',
  'build/**',
  'coverage/**',
  'public/**',
  '.git/**',
  'storybook-static/**',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/__tests__/**',
  '**/__mocks__/**',
  // Test and fixture paths are excluded from a normal scan — a mock is
  // supposed to look like a mock. They are NOT excluded when the guard is
  // pointed at a fixture root, which is how its own detection is proven.
  ...(SCANNING_FIXTURES ? [] : ['**/__fixtures__/**', 'src/testing/**', 'scripts/**']),
];

/**
 * Each rule: which files it governs, what it forbids, and what to do instead.
 *
 * `forbid` patterns are matched against source text with comments stripped —
 * a comment explaining why a fabrication was removed must not itself trip the
 * guard.
 */
const RULES = [
  {
    id: 'security-no-simulated-controls',
    describes: 'the security-hardening surface',
    files: [/src\/security\//, /AdvancedSecurityService/, /SecurityHardening/],
    forbid: [
      /*
       * ─── WHY THIS RULE EXISTS ──────────────────────────────────────────────
       *
       * This guard's five original rules reached services/intel, services/agents
       * and the OSINT opsec panel. They did not reach src/security/, which held
       * the densest fabrication surface in the repository:
       *
       *   allocateSecure()   returned `address: Math.random() * 1000000`,
       *                      commented "Simulated address", with
       *                      `protected: true` and `guard.isValid: true`.
       *   wipePage()         body was a comment plus a log event recording a
       *                      SUCCESSFUL memory wipe.
       *   checkIntegrity()   scanned for `!guard.isValid` on regions whose
       *                      allocator always set it true — a buffer-overflow
       *                      detector that could not detect one.
       *   validateUser()     ignored its userId and returned five hardcoded
       *                      trust factors; real weighted arithmetic over them
       *                      produced a permanent 0.7430, which LOOKED derived.
       *   validateDevice/Network/Operation/continuousValidation
       *                      0.85 / 0.8 / 0.9 / 0.88, hardcoded.
       *   complianceScore    0.95, initialised once, never updated, never read.
       *   generateEventSignature()
       *                      returned a template string under "would use
       *                      cryptographic signature", so every audit event
       *                      carried a `signature` field with no crypto behind it.
       *
       * The user-visible consequence: closing a secure chat called a simulated
       * wipe on a scratch buffer and logged "Chat data securely deleted" for a
       * chat it never touched.
       *
       * JavaScript cannot allocate protected memory, place guard pages, run
       * constant-time primitives, or read power draw. A field claiming any of
       * those is unfalsifiable by construction, which is why the patterns below
       * forbid the CLAIM rather than asking for an implementation.
       */
      { re: /\b(wipePage|allocateSecure|deallocateSecure|enforceGuards)\s*\(/,
        why: 'memory control JavaScript cannot perform' },
      { re: /(constantTimeOperations|cacheLineProtection|powerAnalysisProtection|stackCanaries|heapIntegrity|guardPages|secureWiping)\s*:/,
        why: 'a side-channel or memory countermeasure not expressible in JavaScript' },
      { re: /complianceScore\s*:\s*[0-9.]/,
        why: 'a hardcoded compliance score; only an auditor can produce one' },
      { re: /performanceImpact\s*:\s*[0-9.]/,
        why: 'a hardcoded performance measurement' },
      { re: /\btrustLevel\s*:\s*0?\.[0-9]/,
        why: 'a hardcoded trust level — derive it or do not report one' },
      { re: /generateEventSignature|signature:\s*`sig_/,
        why: 'a signature field with no cryptography behind it' },
      { re: /Simulated (address|secure memory|memory wiping)/i,
        why: 'a simulated security primitive, which is indistinguishable from a real one to a caller' },
    ],
  },
  {
    id: 'opsec-no-fabricated-status',
    describes: 'operational-security surfaces',
    files: [/src\/pages\/OSINT\/services\/opsec\//, /OPSECPanel/, /useOPSECSecurity/],
    forbid: [
      { re: /\bgetMock[A-Za-z]*\s*\(/, why: 'returns invented security state' },
      { re: /\bmockConnectionStatus\b|\bmockThreatScan\b|\bmockSecurityChecks\b/, why: 'invented security state' },
      { re: /isSecure:\s*true/, why: 'hardcodes a protected posture rather than reporting a checked one' },
      { re: /fingerprintProtection:\s*true/, why: 'hardcodes a protection claim' },
      { re: /dnsSecure:\s*true/, why: 'hardcodes a protection claim' },
    ],
    instead: 'Fail closed: return verified:false with every protective property false. See opsecService.unverifiedConnectionStatus().',
  },
  {
    id: 'presence-must-be-real',
    describes: 'presence and "who is here" surfaces',
    files: [/Collaboration/, /Presence/, /TeamRoster/, /RealTimeTeamService/],
    forbid: [
      // Matched against code with comments stripped, so these must describe
      // BEHAVIOUR, not annotations. The original bug carried the comment
      // "// Simulate real-time presence updates" — but a comment saying so is
      // the honest part; the dishonest part was the timer underneath it
      // driving an indicator nobody's actual status fed.
      { re: /\bfakePresence\b|\bmockPresence\b|\bsimulatedPresence\b/, why: 'simulated presence' },
      { re: /(isOnline|online|presence|status)\s*:\s*true\b/i, why: 'hardcodes someone as present rather than reporting observed state' },
      { re: /Math\.random\(\)[\s\S]{0,120}?(online|presence|active)/i, why: 'randomised presence is invented presence' },
      { re: /(online|presence|active)[\s\S]{0,120}?Math\.random\(\)/i, why: 'randomised presence is invented presence' },
    ],
    instead: 'Show presence only from a real source. If none exists, say so — Navcom doctrine: implying a capability you do not have is a line, not a trade-off.',
  },
  {
    id: 'agent-self-report-grants-nothing',
    describes: 'AI agent capability and status',
    files: [/src\/services\/agents\//],
    forbid: [
      { re: /tier\s*=\s*['"](?!advisory)[a-z_]+['"]/, why: 'assigns a capability tier locally instead of from the external authority' },
      { re: /selfReported(Tier|Capability)/, why: 'an agent account of its own status grants it nothing' },
    ],
    instead: 'Tier comes from the Archangel Knights portal, or falls back to MECHA_JONO_DEFAULT_TIER. Starcom never promotes locally.',
  },
  {
    id: 'no-synthesized-positions',
    describes: 'globe intelligence layers',
    files: [/src\/services\/intel\/globe\//],
    forbid: [
      // A mark placed at a made-up coordinate is a claim that something was
      // observed somewhere it was not. On the globe, position IS the claim, so
      // a fallback coordinate is not a rendering convenience — it is a
      // fabricated observation.
      { re: /lat:\s*0\s*,\s*lon:\s*0/, why: 'null-island fallback places a mark where nothing was observed' },
      { re: /(lat|lon):\s*Math\.random\(\)/, why: 'randomised coordinates are invented observations' },
      { re: /jitter|nudge/i, why: 'moving a mark to make it visible puts it where nothing was observed — report coincidence instead' },
    ],
    instead: 'Exclude and COUNT the unplaceable item (see GlobeIntelLayer.unplaceable), and report coincident marks rather than separating them.',
  },
  {
    id: 'attestation-weight-is-derived',
    describes: 'published findings and attestations',
    files: [/src\/services\/intel\/findings\//, /src\/services\/intel\/observations\//],
    forbid: [
      // Any LITERAL numeric confidence/weight/score in this path is a declared
      // value. Computed ones (`weight: Number(...)`, `confidence: f.confidence`)
      // are unaffected — the pattern requires a number literal.
      //
      // Previously anchored to line start, which missed
      // `return { schemaVersion: 2, confidence: 0.82 }` — exactly the shape a
      // Finding v2 regression would take, since v1's declared confidence is
      // what v2 exists to remove. Verified against that probe.
      { re: /\b(confidence|weight|score)\s*:\s*\d+(\.\d+)?\b/, why: 'a literal numeric confidence/weight is an assertion, not a derivation — publish the method and let the consumer derive it' },
    ],
    instead: 'Weight is derived from method and age, never declared. See docs/build-order.md, "The primitive: attestation".',
  },
];

/**
 * Allowlist. Every entry MUST carry a reason — this is checked, not just
 * conventional. Entries are { rule, file, reason }.
 */
const ALLOWLIST = [
  {
    rule: 'attestation-weight-is-derived',
    file: 'src/services/intel/findings/FindingContent.ts',
    reason: 'Wire-shape constant FINDING_SCHEMA_VERSION only; carries no confidence literal. Kept as an explicit entry so the rule can tighten without silently exempting the directory.',
  },
];

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function isAllowlisted(ruleId, file) {
  return ALLOWLIST.some((a) => a.rule === ruleId && a.file === file.replaceAll('\\', '/'));
}

// An allowlist entry without a reason defeats the purpose of the allowlist.
const unjustified = ALLOWLIST.filter((a) => !a.reason || a.reason.trim().length < 20);
if (unjustified.length) {
  console.error('\nCapability-honesty guard failed: allowlist entries without a stated reason:');
  for (const a of unjustified) console.error(` - ${a.rule} :: ${a.file}`);
  console.error('\nAn allowlist that can grow silently is not a guard. State why the exemption is correct.');
  process.exit(1);
}

const violations = [];
const files = globSync(`${ROOT}/**/*.{ts,tsx}`, { ignore: IGNORE });

for (const file of files) {
  const f = file.replaceAll('\\', '/');
  const raw = fs.readFileSync(file, 'utf8');
  const text = stripComments(raw);

  for (const rule of RULES) {
    if (!rule.files.some((re) => re.test(f))) continue;
    if (isAllowlisted(rule.id, f)) continue;

    for (const { re, why } of rule.forbid) {
      const m = re.exec(text);
      if (m) {
        violations.push({ file: f, line: lineOf(text, m.index), rule, match: m[0].trim(), why });
      }
    }
  }
}

if (violations.length) {
  console.error(`\nCapability-honesty guard FAILED — ${violations.length} violation(s).\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    rule    ${v.rule.id}  (${v.rule.describes})`);
    console.error(`    found   ${v.match}`);
    console.error(`    why     ${v.why}`);
    console.error(`    instead ${v.rule.instead}\n`);
  }
  console.error('A surface may not claim a capability it did not verify.');
  console.error('If an exemption is genuinely correct, add it to ALLOWLIST in this file WITH a reason.\n');
  process.exit(1);
}

console.log(`Capability-honesty guard passed: ${files.length} files, ${RULES.length} rules, ${ALLOWLIST.length} justified exemption(s).`);
