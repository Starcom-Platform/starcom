#!/usr/bin/env node
/**
 * @asserts No relay or gateway that was probed dead and retired has been re-added.
 *
 * RETIRED-INFRASTRUCTURE GUARD
 *
 * config/publicInfrastructure.ts records public relays and gateways that were
 * PROBED and found dead, each with a reason and a date, and says in as many
 * words: "Do not re-add without re-probing" and "so nobody re-adds one from an
 * old tutorial."
 *
 * Five files had re-added them anyway. relay.snort.social (503) and
 * relay.nostr.band (unreachable) were hardcoded across nostrService,
 * SecureChatIntegrationService, NostrChatAdapter, RealTimeTeamService and
 * geoint/config — so nostrService failed to reach ANY relay, degraded, and put
 * "Network connectivity issues detected" in front of every arriving user, while
 * a correct list sat in the same repo being ignored.
 *
 * A registry nothing enforces is a document, not a configuration. This makes it
 * load-bearing: re-adding a retired endpoint fails the build, and the failure
 * names the reason and the date it was observed, so the next person re-probes
 * instead of guessing.
 *
 * Retiring an endpoint that is genuinely back is fine — re-probe it, move it out
 * of RETIRED_NOSTR_RELAYS, and this passes.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const REGISTRY = 'src/config/publicInfrastructure.ts';

const src = readFileSync(join(ROOT, REGISTRY), 'utf8');

/** Pull `{ url: '...', reason: '...', observed: '...' }` out of every RETIRED_* list. */
const retired = [];
for (const block of src.matchAll(/export const RETIRED_[A-Z_]+\s*=\s*\[([\s\S]*?)\];/g)) {
  for (const entry of block[1].matchAll(/\{\s*url:\s*'([^']+)'[^}]*?reason:\s*'([^']+)'[^}]*?observed:\s*'([^']+)'/g)) {
    retired.push({ url: entry[1], reason: entry[2], observed: entry[3] });
  }
}
/**
 * Which lines of the registry are the RETIRED_* declarations themselves.
 *
 * The guard used to skip the registry file wholesale, on the reasoning that
 * it "names them by design". But the registry also holds PUBLIC_NOSTR_RELAYS
 * — an ACTIVE dial list that PublicInfrastructureService, RealTimeTeamService
 * and NostrChatAdapter all use — so the one file most likely to contain the
 * mistake was the one file the guard could not see. It was: four retired
 * endpoints sat in the active list while this reported a clean tree.
 *
 * Only the retired declarations are exempt now, not the file around them.
 */
const registryExemptLines = new Set();
for (const block of src.matchAll(/export const RETIRED_[A-Z_]+\s*=\s*\[([\s\S]*?)\];/g)) {
  const startLine = src.slice(0, block.index).split('\n').length;
  const endLine = startLine + block[0].split('\n').length - 1;
  for (let l = startLine; l <= endLine; l++) registryExemptLines.add(l);
}

if (retired.length === 0) {
  console.error(`\n  RETIRED-INFRASTRUCTURE GUARD — FAILED\n\n  Parsed no entries from ${REGISTRY}.\n  The registry's shape changed and this guard is now blind; fix the parser.\n`);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|mjs|js|json)$/.test(name)) out.push(full);
  }
  return out;
}

const offences = [];
/*
 * public/ too, not only src/. public/config.json listed cloudflare-ipfs.com — retired, in
 * RETIRED_IPFS_GATEWAYS — for as long as this guard existed, because it only ever walked
 * src/. Shipped JSON is dialable configuration as much as a .ts constant is.
 */
// public/ is optional: a checkout, a fixture or a stripped deploy tree may not have one,
// and a guard that crashes on a missing folder reports nothing about the code it guards.
const roots = ['src', 'public'].filter((d) => existsSync(join(ROOT, d)));
for (const file of roots.flatMap((d) => walk(join(ROOT, d)))) {
  const rel = relative(ROOT, file).split('\\').join('/');
  const text = readFileSync(file, 'utf8');
  text.split('\n').forEach((line, i) => {
    // Only the RETIRED_* declarations are exempt — see registryExemptLines.
    if (rel === REGISTRY && registryExemptLines.has(i + 1)) return;
    for (const r of retired) {
      // Match the URL as a QUOTED STRING, which is what makes it a value the
      // app can dial rather than prose explaining why it must not.
      //
      // Stripping `//` comments first was the obvious approach and is wrong:
      // `wss://` contains `//`, so it deleted every URL before the check and
      // the guard reported a clean tree over five real offences. Caught only
      // because the count disagreed with a grep run moments earlier.
      if (line.includes(`'${r.url}'`) || line.includes(`\"${r.url}\"`) || line.includes(`\`${r.url}\``)) {
        offences.push({ rel, line: i + 1, ...r });
      }
    }
  });
}

if (offences.length) {
  console.error(
    `\n  RETIRED-INFRASTRUCTURE GUARD — FAILED\n\n` +
    `  ${offences.length} reference(s) to endpoints probed and found dead:\n\n` +
    offences.map(o =>
      `    ${o.rel}:${o.line}\n      ${o.url}\n      ${o.reason} (observed ${o.observed})`
    ).join('\n\n') +
    `\n\n  Use PUBLIC_NOSTR_RELAYS / PUBLIC_IPFS_GATEWAYS from ${REGISTRY}.\n` +
    `  If one of these is genuinely back, re-probe it and move it out of the\n` +
    `  RETIRED list — do not just delete this check.\n`
  );
  process.exit(1);
}

console.log(
  `\n  RETIRED-INFRASTRUCTURE GUARD\n\n` +
  `  ${retired.length} endpoint(s) recorded as dead, none referenced in src/.\n` +
  `  The measured registry is what the app actually uses.\n`
);
