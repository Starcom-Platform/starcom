/**
 * How the named relay sets relate to one another.
 *
 * The sets are built from each other so they cannot drift apart silently; these
 * pin the relationships the code that dials them relies on, so a change to one
 * is a decision somebody makes on purpose.
 */
import { describe, it, expect } from 'vitest';
import {
  PUBLIC_NOSTR_RELAYS,
  NAVCOM_SURFACE_RELAYS,
  THE_RECORD_RELAY,
  FEDERATION_READ_RELAYS,
  EXTRA_PUBLIC_RELAYS,
  CHAT_PROVIDER_RELAYS,
  RETIRED_NOSTR_RELAYS,
} from '../publicInfrastructure';

const ACTIVE: Record<string, readonly string[]> = {
  PUBLIC_NOSTR_RELAYS,
  NAVCOM_SURFACE_RELAYS,
  FEDERATION_READ_RELAYS,
  EXTRA_PUBLIC_RELAYS,
  CHAT_PROVIDER_RELAYS,
};

describe('the named relay sets', () => {
  it('the NAVCOM surface is drawn from the measured pool', () => {
    for (const url of NAVCOM_SURFACE_RELAYS) expect(PUBLIC_NOSTR_RELAYS).toContain(url);
  });

  it('the extra set is exactly the pool beyond the surface — so it adds redundancy, not repeats', () => {
    expect(EXTRA_PUBLIC_RELAYS.length).toBeGreaterThan(0);
    for (const url of EXTRA_PUBLIC_RELAYS) expect(NAVCOM_SURFACE_RELAYS as readonly string[]).not.toContain(url);
    expect(new Set([...NAVCOM_SURFACE_RELAYS, ...EXTRA_PUBLIC_RELAYS])).toEqual(new Set(PUBLIC_NOSTR_RELAYS));
  });

  it('federation reads The Record first, then the surface', () => {
    expect(FEDERATION_READ_RELAYS[0]).toBe(THE_RECORD_RELAY);
    expect(FEDERATION_READ_RELAYS.slice(1)).toEqual([...NAVCOM_SURFACE_RELAYS]);
  });

  it("the NAVCOM surface is Navcom's relays and does not include The Record", () => {
    // Whether the globe reads The Record (D-F 4.5) is a choice of set in the
    // intake, pinned in NostrStarcomIntelIngest.relays.test.ts — not a reason to
    // add The Record to a set that describes Navcom's defaults.
    expect(NAVCOM_SURFACE_RELAYS as readonly string[]).not.toContain(THE_RECORD_RELAY);
  });

  it('no set dials a relay that was probed dead and retired', () => {
    const retired = RETIRED_NOSTR_RELAYS.map((r) => r.url);
    for (const [name, set] of Object.entries(ACTIVE)) {
      for (const url of set) expect(retired, `${name} dials retired ${url}`).not.toContain(url);
    }
    expect(retired).not.toContain(THE_RECORD_RELAY);
  });

  it('every set names each relay once, as a secure WebSocket address', () => {
    for (const [name, set] of Object.entries(ACTIVE)) {
      expect(new Set(set).size, `${name} repeats a relay`).toBe(set.length);
      for (const url of set) expect(new URL(url).protocol, `${name}: ${url}`).toBe('wss:');
    }
  });
});
