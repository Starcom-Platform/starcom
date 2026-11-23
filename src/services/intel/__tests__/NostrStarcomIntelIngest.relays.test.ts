/**
 * Which relays the globe's intel intake reads, by default.
 *
 * The Record first, then the NAVCOM surface set — decision D-F 4.5, "The Record
 * joins the globe's intel read set, with the public relays kept". The step
 * exists because four of five public relays connected and delivered zero
 * reports in 104 seconds, so the globe cannot rely on that set alone.
 *
 * Both halves are pinned. Dropping The Record undoes the decision; dropping the
 * public relays would quietly turn "joins" into "replaces", which is the reading
 * the record explicitly rules out.
 */
import { describe, it, expect } from 'vitest';
import { NostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';
import {
  NAVCOM_SURFACE_RELAYS,
  FEDERATION_READ_RELAYS,
  THE_RECORD_RELAY,
} from '../../../config/publicInfrastructure';

const defaultRelays = () => new NostrStarcomIntelIngest().getRelayStatus().map((r) => r.url);

describe('NostrStarcomIntelIngest — relays', () => {
  it('reads the federation set, from the registry', () => {
    expect(defaultRelays()).toEqual([...FEDERATION_READ_RELAYS]);
  });

  it('reads The Record (D-F 4.5)', () => {
    expect(defaultRelays()).toContain(THE_RECORD_RELAY);
  });

  it('keeps every public relay — 4.5 adds, it does not replace', () => {
    const urls = defaultRelays();
    for (const relay of NAVCOM_SURFACE_RELAYS) expect(urls).toContain(relay);
  });

  it('puts The Record first, which is what reaches the discovery fallback', () => {
    // Order is not decoration here: activateDiscoveryFallback takes
    // `relays.slice(0, 2)`, so only the first two are asked again when twelve
    // seconds pass with no events. That silence is the exact condition 4.5 was
    // decided on, so The Record must be inside that pair, not behind it.
    expect(defaultRelays()[0]).toBe(THE_RECORD_RELAY);
  });

  it("leaves the search surface as Navcom's, without The Record", () => {
    // Search is a separate surface from the tag subscription, and NIP-50 is off
    // by default; widening it here would be a change 4.5 did not ask for.
    const ingest = new NostrStarcomIntelIngest() as unknown as {
      config: { searchRelays: string[] };
    };
    expect(ingest.config.searchRelays).toEqual([...NAVCOM_SURFACE_RELAYS]);
    expect(ingest.config.searchRelays).not.toContain(THE_RECORD_RELAY);
  });
});
