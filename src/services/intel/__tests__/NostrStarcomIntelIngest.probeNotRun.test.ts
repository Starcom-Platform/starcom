/**
 * A relay nobody probed reads as not probed (plan item 8.3b). It read
 * 'pending', stamped with the time of the asking, as if a probe were under way.
 * Probes run in development builds only, so in production every relay said so
 * for the whole visit.
 */
import { describe, it, expect } from 'vitest';
import { NostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';

describe('NostrStarcomIntelIngest, relay probes', () => {
  it('says a relay nobody probed was not probed, with no time', () => {
    const ingest = new NostrStarcomIntelIngest({ relays: ['wss://relay-a.example.invalid', 'wss://relay-b.example.invalid'] });
    const probes = ingest.getRelayProbeStatus();
    expect(probes.map((p) => p.status)).toEqual(['not-run', 'not-run']);
    expect(probes.every((p) => p.ts === undefined)).toBe(true);
  });
});
