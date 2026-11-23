#!/usr/bin/env node
/**
 * Probes every external endpoint this project is configured to depend on.
 *
 * Ratified EIN practice: declare dead dependencies, and specify them to fail
 * loud rather than as a silent, wrong success. Every node that looked found at
 * least one integration reporting success without ever meeting a real
 * counterparty.
 *
 * Starcom's was this file's inputs. A config asserting "high-availability,
 * reliable public relays" had seven of fourteen endpoints unreachable,
 * including one in the tier it called primary — DNS gone, certificates
 * expired, one turned into a paid relay returning 403.
 *
 * DELIBERATELY NOT A CI GATE. This project already learned what wiring
 * live-network checks into a required build costs: the suite goes red because
 * somebody else's server is down, and people learn to ignore red. Run it when
 * you touch the endpoint lists, or on a schedule that nobody's merge depends
 * on.
 *
 * Usage: npm run probe:endpoints
 * Exit:  0 always — this reports, it does not judge.
 */
import { PUBLIC_NOSTR_RELAYS, PUBLIC_IPFS_GATEWAYS, RETIRED_NOSTR_RELAYS, RETIRED_IPFS_GATEWAYS }
  from '../src/config/publicInfrastructure.ts';

const TIMEOUT_MS = 8000;
// A widely-pinned object; any healthy gateway resolves it.
const PROBE_CID = 'QmQPeNsJPyVWPFDVHb77w8G42Fvo15z4bG2X8D2GhfbSXc';

async function probeHttp(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow' });
    return r.ok ? 'ok' : `HTTP ${r.status}`;
  } catch (e) {
    return `unreachable — ${String(e.message).slice(0, 40)}`;
  } finally { clearTimeout(t); }
}

async function probeWs(url) {
  const { default: WebSocket } = await import('ws');
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; clearTimeout(timer); try { ws.close(); } catch { /* already closed */ } resolve(v); } };
    const timer = setTimeout(() => finish('unreachable — timeout'), TIMEOUT_MS);
    let ws;
    try { ws = new WebSocket(url); } catch (e) { return finish(`unreachable — ${e.message}`); }
    ws.on('open', () => finish('ok'));
    ws.on('error', (e) => finish(`unreachable — ${String(e.message).slice(0, 40)}`));
  });
}

const report = async (label, items, probe) => {
  console.log(`\n  ${label}`);
  const results = await Promise.all(items.map(async (u) => [u, await probe(u)]));
  let down = 0;
  for (const [u, s] of results) {
    if (s !== 'ok') down++;
    console.log(`    ${s === 'ok' ? 'ok  ' : 'DOWN'}  ${u.padEnd(38)} ${s === 'ok' ? '' : s}`);
  }
  return { down, total: results.length };
};

console.log('\n  External endpoints — measured, not assumed');

const relays = await report('Nostr relays in rotation', PUBLIC_NOSTR_RELAYS, probeWs);
const gws = await report('IPFS gateways in rotation', PUBLIC_IPFS_GATEWAYS.map((g) => g + PROBE_CID), probeHttp);

console.log(`\n  relays  ${relays.total - relays.down}/${relays.total} reachable`);
console.log(`  gateways ${gws.total - gws.down}/${gws.total} reachable`);
console.log(`  retired and not probed: ${RETIRED_NOSTR_RELAYS.length} relay(s), ${RETIRED_IPFS_GATEWAYS.length} gateway(s)`);

if (relays.down || gws.down) {
  console.log('\n  Endpoints reported DOWN should be moved to the RETIRED lists in');
  console.log('  src/config/publicInfrastructure.ts, with the reason and the date, so');
  console.log('  nobody re-adds one from an old tutorial.\n');
} else {
  console.log('\n  Every configured endpoint answered.\n');
}

// Sockets that answered can keep the event loop alive after we are done
// reporting, and a diagnostic that never returns is its own dead dependency.
process.exit(0);
