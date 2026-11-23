/**
 * Starts the isolated relay the publish spec needs, so it runs by default.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * mission-publish.spec.ts was skipped unless PW_MISSION_PUBLISH_RELAY was set
 * by hand. That skip was a safety interlock — the spec publishes for real, and
 * must never be aimed at public relays — but it had a second effect nobody
 * chose: the one test that drives a complete story stopped running.
 *
 * It was broken for 39 minutes short of a day before anyone noticed, because
 * an evidence gate landed after the spec was written and disabled the very
 * button the spec clicks. A skipped test cannot report that. It reports
 * nothing, which reads identically to passing.
 *
 * So the interlock moves from "the operator remembered" to "the harness
 * guarantees it", and the spec runs like every other.
 *
 * ─── WHY THIS IS STILL SAFE ────────────────────────────────────────────────
 *
 * The relay below is the guarantee's first half; the second half is in the
 * spec itself, and it is the half that actually protects anyone. Before the
 * publish button is clicked, the spec asserts the destination disclosure names
 * this relay, says "nothing leaves your network", and does NOT say "PUBLIC
 * relays". A build that is not isolated fails those assertions and never
 * reaches the click.
 *
 * That is why removing the skip does not remove the protection: a
 * misconfigured run now fails loudly instead of quietly not happening.
 */
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';

const PORT = Number(process.env.PW_RELAY_PORT ?? 7447);
export const RELAY_URL = `ws://127.0.0.1:${PORT}`;

function portOpen(port) {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host: '127.0.0.1' })
      .on('connect', () => { sock.end(); resolve(true); })
      .on('error', () => resolve(false));
  });
}

export default async function globalSetup() {
  process.env.PW_MISSION_PUBLISH_RELAY = RELAY_URL;

  // Someone already has one running — reuse rather than fight over the port.
  if (await portOpen(PORT)) {
    console.log(`  [relay] reusing what is already on ${RELAY_URL}`);
    return async () => {};
  }

  const relay = spawn('node', ['scripts/dev-relay.mjs', String(PORT)], {
    stdio: ['ignore', 'pipe', 'inherit'],
    detached: false,
  });
  relay.unref?.();

  // Wait for it to actually accept connections. Publishing into a socket that
  // is not listening yet fails as a broadcast error, which the spec would
  // correctly report as "packaged and stranded" — a real distinction it makes,
  // and a confusing way to learn the relay was slow to start.
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await portOpen(PORT)) {
      console.log(`  [relay] listening on ${RELAY_URL}`);
      return async () => { relay.kill(); };
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  relay.kill();
  throw new Error(
    `The isolated relay did not start on ${RELAY_URL} within 15s.\n`
    + '  mission-publish.spec.ts publishes for real and refuses to aim at public relays,\n'
    + '  so this is a hard failure rather than a reason to skip the test.',
  );
}
