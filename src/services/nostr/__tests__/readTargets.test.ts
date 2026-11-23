/**
 * Where a channel LISTENS, which is not where it sends.
 *
 * ─── THE GAP THIS CLOSES ───────────────────────────────────────────────────
 *
 * MissionPackageIngest subscribed to `publishRelays('MISSION')` — a list of
 * publish destinations, used as a read set. That resolves to the five public
 * relays, and Mecha Jono publishes their board to `wss://record.cosmiccodex.app`,
 * so their 22 open threads were invisible here. Not refused, not counted:
 * never asked for.
 *
 * The registry already draws this distinction. FEDERATION_READ_RELAYS is The
 * Record plus the public set, and both the globe's intel ingest and
 * FederationIngestService already read from it. Only the package path was
 * still reading a write list.
 *
 * ─── WHY READS ARE WIDER THAN WRITES ───────────────────────────────────────
 *
 * Asymmetric on purpose. Listening to another node's archive costs a socket
 * and tells them nothing; publishing into it puts our records in someone
 * else's store, which is a decision with different consequences and is not
 * made here.
 *
 * @vitest-environment node
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readRelays, publishRelays, DEFAULT_READ_RELAYS, DEFAULT_PUBLISH_RELAYS } from '../publishTargets';
import { THE_RECORD_RELAY } from '../../../config/publicInfrastructure';

const KEYS = [
  'VITE_NOSTR_MISSION_RELAYS', 'VITE_NOSTR_MISSION_RELAYS_EXCLUSIVE',
  'VITE_NOSTR_INTEL_RELAYS', 'VITE_NOSTR_INTEL_RELAYS_EXCLUSIVE',
];
afterEach(() => { for (const k of KEYS) delete process.env[k]; });

describe('readRelays', () => {
  it('listens to The Record, which is where a peer publishes', () => {
    expect(readRelays('MISSION')).toContain(THE_RECORD_RELAY);
  });

  it('does not make us PUBLISH there — reading is not writing', () => {
    // Putting our packages in someone else's archive is a separate decision.
    expect(publishRelays('MISSION')).not.toContain(THE_RECORD_RELAY);
  });

  it('defaults to the federation read set', () => {
    expect(readRelays('MISSION')).toEqual([...DEFAULT_READ_RELAYS]);
  });

  it('honours the same env override, so a local relay still isolates a channel', () => {
    process.env.VITE_NOSTR_MISSION_RELAYS = 'ws://127.0.0.1:7447';
    process.env.VITE_NOSTR_MISSION_RELAYS_EXCLUSIVE = 'true';
    expect(readRelays('MISSION')).toEqual(['ws://127.0.0.1:7447']);
  });

  it('adds a configured relay rather than replacing it, like publishRelays', () => {
    process.env.VITE_NOSTR_MISSION_RELAYS = 'ws://127.0.0.1:7447';
    const relays = readRelays('MISSION');
    expect(relays).toContain('ws://127.0.0.1:7447');
    expect(relays).toContain(THE_RECORD_RELAY);
    expect(relays.length).toBe(DEFAULT_READ_RELAYS.length + 1);
  });

  it('keeps channels independent', () => {
    process.env.VITE_NOSTR_MISSION_RELAYS = 'ws://127.0.0.1:7447';
    process.env.VITE_NOSTR_MISSION_RELAYS_EXCLUSIVE = 'true';
    expect(readRelays('MISSION')).toEqual(['ws://127.0.0.1:7447']);
    expect(readRelays('INTEL')).toEqual([...DEFAULT_READ_RELAYS]);
  });

  it('reads at least everything it publishes to', () => {
    // A node that cannot hear its own channel cannot see a reply on it.
    for (const relay of DEFAULT_PUBLISH_RELAYS) {
      expect(DEFAULT_READ_RELAYS).toContain(relay);
    }
  });
});
