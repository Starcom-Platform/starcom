#!/usr/bin/env node
/**
 * @asserts Every native capability has a consumer or is declared as having none, and every argument the app can send is one the host's closed sets accept.
 *
 * Every native capability must have a consumer, or be declared as having none.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * starcom-desktop shipped five capabilities — cross-origin fetch, evidence
 * capture, sockets and TLS, local inference, an instrumented browsing view —
 * and this application called ZERO of them. Each typechecked. Each passed a
 * smoke suite written beside it. Each had no reachable trigger.
 *
 * That is the same defect `guard-pipeline-joins.mjs` was written for, arriving
 * from a new direction: the smoke suite made it invisible, because a producer
 * and a consumer written by the same hand in the same afternoon is not a join,
 * it is a mirror. It proves the code runs. It proves nothing about whether
 * anything in the product can reach it.
 *
 * ─── HOW IT CHECKS ─────────────────────────────────────────────────────────
 *
 * The capability list is read from the HOST (desktop/src/main/security/zones.ts)
 * rather than restated here, so a capability cannot be added there and quietly
 * escape this check. For each, a call pattern must appear somewhere in src/
 * outside tests — or the capability must appear in UNCONSUMED below with a
 * reason.
 *
 * The list can only shrink, and only deliberately: an entry that gains a
 * consumer fails the build until it is removed, exactly as pipeline.ts's
 * UNWIRED does.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ZONES = 'desktop/src/main/security/zones.ts';

/*
 * The host's CLOSED SETS, and the app-side declarations that must mirror them.
 *
 * The check above runs host -> app: every capability the host exposes has a
 * consumer. This one runs app -> host: every ARGUMENT the app can send is one
 * the host accepts. Nothing checked that direction, and the gap cost a real
 * outage — the app began sending a signing kind of 'retraction', the host's
 * SIGNABLE_KINDS had never been told about it, and the withdrawal path (the
 * only remedy for a wrong published claim about a real person) failed on
 * desktop until somebody read the allowlist.
 *
 * A union in nativeHost.ts makes the app side a compile error. It cannot see
 * the HOST changing underneath it, which is what this checks.
 */
const CONTRACTS = [
  {
    what: 'signer.sign kind',
    hostFile: 'desktop/src/signer/entry.ts',
    hostSet: /SIGNABLE_KINDS\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
    appFile: 'src/services/native/nativeHost.ts',
    appType: /export type SignableKind\s*=([\s\S]*?);/,
  },
  {
    what: 'net.fetch method',
    hostFile: 'desktop/src/main/capabilities/net.ts',
    hostSet: /ALLOWED_METHODS\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
    appFile: 'src/services/native/nativeHost.ts',
    appType: /method\?:([^;]*);/,
  },
];

/** Quoted members of a set literal or a string-union type. */
const members = (text) => new Set([...text.matchAll(/'([^']+)'/g)].map((m) => m[1]));

/**
 * Compare each closed set with the union that mirrors it.
 *
 * Both directions are reported, and they are different failures. A kind the app
 * can send and the host refuses is an outage. A kind the host accepts and the
 * app cannot name is only a narrower app — worth saying, never worth failing on,
 * or widening the host would break this repository from the outside.
 */
function contractProblems() {
  const out = [];
  for (const c of CONTRACTS) {
    if (!existsSync(c.hostFile)) continue;
    const hostMatch = readFileSync(c.hostFile, 'utf8').match(c.hostSet);
    const appMatch = readFileSync(c.appFile, 'utf8').match(c.appType);
    if (!hostMatch || !appMatch) {
      out.push(`  ${c.what}\n    Could not read one side of the contract.\n`
        + `    host ${c.hostFile}: ${hostMatch ? 'read' : 'NOT READ'}\n`
        + `    app  ${c.appFile}: ${appMatch ? 'read' : 'NOT READ'}\n`
        + '    Refusing to report agreement between things it could not compare.');
      continue;
    }
    const host = members(hostMatch[1]);
    const app = members(appMatch[1]);
    const unacceptable = [...app].filter((k) => !host.has(k));
    if (unacceptable.length) {
      out.push(`  ${c.what}\n    The app can send ${unacceptable.map((k) => `'${k}'`).join(', ')}, `
        + `which ${c.hostFile} refuses.\n`
        + '    The host answers "refusing to sign unknown kind" and the call fails for the user.\n'
        + `    Declare it in the host's set, or remove it from the union in ${c.appFile}.`);
    }
    const unnamed = [...host].filter((k) => !app.has(k));
    if (unnamed.length) {
      console.log(`  note: the host also accepts ${unnamed.map((k) => `'${k}'`).join(', ')} `
        + `for ${c.what}, which this app never sends. Not a fault.`);
    }
  }
  return out;
}

/**
 * Capabilities built and not yet reached by this application.
 *
 * Honest, and temporary by construction. Each line is a promise unkept, not a
 * design decision.
 */
const UNCONSUMED = new Map([
  ['host.capabilities', 'Nothing yet asks the host what it can do; the app infers presence from the bridge alone.'],
  ['evidence.read', 'A record can be verified and counted but its stored manifest is never read back for display.'],
]);

/** How a capability looks at a call site. */
const CALL_PATTERN = {
  'net.fetch': '\\.fetch\\(',
  'host.capabilities': '\\.capabilities\\(',
  'net.tcpProbe': '\\.tcpProbe\\(',
  'net.tlsInspect': '\\.tlsInspect\\(',
  'inference.status': 'inference\\.status\\(',
  'inference.generate': 'inference\\.generate\\(',
  'evidence.read': 'evidence\\.read\\(',
  'evidence.verify': 'evidence\\.verify\\(',
  'evidence.list': 'evidence\\.list\\(',
  'browse.open': 'browse\\.open\\(',
  'browse.navigate': 'browse\\.navigate\\(',
  'browse.setBounds': 'browse\\.setBounds\\(',
  'browse.snapshot': 'browse\\.snapshot\\(',
  'browse.observations': 'browse\\.observations\\(',
  'signer.status': 'signer\\.status\\(',
  'signer.sign': 'signer\\.sign\\(',
  'browse.capture': 'browse\\.capture\\(',
  'browse.close': 'browse\\.close\\(',
};

function declaredCapabilities() {
  if (!existsSync(ZONES)) return null;
  const source = readFileSync(ZONES, 'utf8');
  const block = source.match(/APP_CAPABILITIES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!block) throw new Error(`Could not read APP_CAPABILITIES from ${ZONES}`);
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Referenced in product code — not in tests, and not in the type declaration. */
function hasConsumer(pattern) {
  try {
    const out = execSync(
      `grep -rEl "${pattern}" src --include="*.ts" --include="*.tsx" 2>/dev/null || true`,
      { encoding: 'utf8' },
    );
    return out
      .split('\n')
      .filter(Boolean)
      .filter((f) => !/__tests__|\.test\.|\.vitest\./.test(f))
      // nativeHost.ts DECLARES the surface; declaring is not consuming.
      .filter((f) => !f.endsWith('services/native/nativeHost.ts')).length > 0;
  } catch {
    return false;
  }
}

const capabilities = declaredCapabilities();

console.log('\n  NATIVE CAPABILITIES GUARD\n');

if (capabilities === null) {
  /**
   * A guard that cannot check must not exit 0.
   *
   * This previously printed "skipping" and passed. That is the same defect this
   * script exists to catch, one level up: a mechanism reporting success while
   * verifying nothing. CI does not check out submodules and starcom-desktop is
   * private, so in CI it would have been green forever while checking nothing —
   * which is worse than not existing, because it retires the question.
   *
   * Failing closed means the skip has to be a DECISION somebody records, in the
   * open, rather than a default nobody notices.
   */
  const expected = existsSync('.gitmodules')
    && readFileSync('.gitmodules', 'utf8').includes('path = desktop');

  if (!expected) {
    console.log('  No desktop submodule is declared in .gitmodules.');
    console.log('  Nothing to check, and nothing claims there should be.\n');
    process.exit(0);
  }

  if (process.env.ALLOW_UNCHECKED_NATIVE_CAPABILITIES === '1') {
    console.log(`  ${ZONES} not present, and ALLOW_UNCHECKED_NATIVE_CAPABILITIES=1 is set.`);
    console.log('  Passing WITHOUT CHECKING ANYTHING, because that was asked for explicitly.\n');
    process.exit(0);
  }

  console.log(`  .gitmodules declares a desktop submodule and ${ZONES} is not present.`);
  console.log('  This guard cannot verify that native capabilities have consumers,');
  console.log('  and reporting success without checking is how a green build starts lying.\n');
  console.log('  Fix by checking it out:      git submodule update --init --recursive');
  console.log('  Or state the skip on purpose: ALLOW_UNCHECKED_NATIVE_CAPABILITIES=1\n');
  process.exit(1);
}

const problems = [];
let consumed = 0;

for (const capability of capabilities) {
  const pattern = CALL_PATTERN[capability];
  if (!pattern) {
    problems.push(
      `  ${capability}\n    declared by the host and unknown to this guard.\n`
      + '    Add its call pattern to CALL_PATTERN so it can be checked.',
    );
    continue;
  }

  const reached = hasConsumer(pattern);
  const declaredUnconsumed = UNCONSUMED.has(capability);

  if (reached && declaredUnconsumed) {
    problems.push(
      `  ${capability}\n    is listed as UNCONSUMED but now HAS a consumer in src/.\n`
      + '    Remove it from UNCONSUMED — the list may only shrink, and only deliberately.',
    );
  } else if (!reached && !declaredUnconsumed) {
    problems.push(
      `  ${capability}\n    is built in the host and called by nothing in src/.\n`
      + '    A capability nothing consumes is a capability that does not exist.\n'
      + '    Give it a consumer, or add it to UNCONSUMED with the reason it has none.',
    );
  }
  if (reached) consumed++;
}

problems.push(...contractProblems());

if (problems.length > 0) {
  console.log(problems.join('\n\n'));
  console.log(`\n  ${problems.length} problem(s).\n`);
  process.exit(1);
}

console.log(`  ${capabilities.length} capability(ies) declared by the host.`);
console.log(`  ${consumed} reached from src/, ${UNCONSUMED.size} declared unconsumed.`);
console.log(`  ${CONTRACTS.length} closed-set contract(s) agree with the host.\n`);
