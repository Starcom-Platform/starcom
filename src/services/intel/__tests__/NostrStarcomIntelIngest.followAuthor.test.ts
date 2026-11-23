/**
 * Everything a key published, asked for by name (plan item 9.14, decision
 * G6). The globe's intake reads a year of the newest reports from everyone,
 * so a package's cited report, or anything else its signer published, may
 * never have been asked for. Following the key asks each read relay for all
 * of it, through the same intake, so it is checked and stored as any report.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const subscriptions = vi.hoisted(() => [] as Array<{ relay: string; filter: Record<string, unknown> }>);
vi.mock('nostr-tools', () => ({
  SimplePool: class {
    subscribeMany(relays: string[], filter: Record<string, unknown>) {
      subscriptions.push({ relay: relays[0], filter });
      return { close() {} };
    }
    close() {}
  },
}));

import { NostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';

const MECHA = 'a'.repeat(64);
const RELAYS = ['wss://one.example', 'wss://two.example'];
const byAuthor = () => subscriptions.filter((s) => Array.isArray(s.filter.authors));

let ingest: NostrStarcomIntelIngest;
beforeEach(() => {
  subscriptions.length = 0;
  ingest = new NostrStarcomIntelIngest({ relays: RELAYS, enableRelaySearch: false });
});
afterEach(() => ingest.stop());

describe('NostrStarcomIntelIngest.followAuthor', () => {
  it('asks every read relay for all that key published, with no time limit', async () => {
    await ingest.start();
    ingest.followAuthor(MECHA);
    expect(byAuthor()).toEqual(RELAYS.map((relay) => ({
      relay, filter: expect.objectContaining({ kinds: [1, 30023], authors: [MECHA], '#t': expect.arrayContaining(['starcom_intel']) }),
    })));
    expect(byAuthor().every((s) => !('since' in s.filter))).toBe(true);
  });

  it('asks once per key', async () => {
    await ingest.start();
    ingest.followAuthor(MECHA);
    ingest.followAuthor(MECHA);
    expect(byAuthor()).toHaveLength(RELAYS.length);
  });

  it('remembers a key asked for before it starts, and asks when it does', async () => {
    ingest.followAuthor(MECHA);
    expect(byAuthor()).toHaveLength(0);
    await ingest.start();
    expect(byAuthor()).toHaveLength(RELAYS.length);
  });

  it('ignores what is not a key', async () => {
    await ingest.start();
    ingest.followAuthor('not-a-key');
    expect(byAuthor()).toHaveLength(0);
  });
});
