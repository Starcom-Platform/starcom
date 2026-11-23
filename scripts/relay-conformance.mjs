#!/usr/bin/env node
/**
 * Checks a relay before a team trusts it (plan item 2.3a): the six checks the
 * app runs before it uses a relay for a team, run from outside against any
 * relay, so whoever runs one can see what Starcom will make of it.
 *
 *   npm run relay:check -- wss://relay.example.org
 *
 * It signs in only with keys made for the check and thrown away, and writes
 * only an ephemeral event (APP_KINDS.RELAY_PROBE), which no relay keeps.
 * Exits 0 when every check holds, 1 otherwise.
 */
import { checkRelayConformance } from '../src/services/nostr/relayConformance.ts';

const url = process.argv.slice(2).find((a) => /^wss?:\/\//.test(a));
if (!url) {
  console.error('Usage: npm run relay:check -- wss://relay.example.org');
  process.exit(2);
}

const MARK = { holds: '✓', fails: '✗', unknown: '?' };
const report = await checkRelayConformance(url);
console.log(`${url}${report.info?.name ? ` (${report.info.name})` : ''}`);
for (const r of report.results) {
  console.log(`${MARK[r.outcome]} ${r.check}: ${r.says}`);
  if (r.relaySaid) console.log(`    the relay said: ${r.relaySaid}`);
}
console.log(report.keepsItToMembers
  ? '\nIt keeps what a team sends it to the team.'
  : '\nStarcom will not use it for a team until every check above holds.');
process.exit(report.keepsItToMembers ? 0 : 1);
