/**
 * An addressable event replaces the one it supersedes.
 *
 * ─── THE DEFECT A PEER FOUND ───────────────────────────────────────────────
 *
 * Mecha Jono publishes a companion note for each open thread as kind 30023,
 * parameterized-replaceable, `d = starcom-intel-<case_id>`. When a thread ends
 * they republish at the same `d`, and The Record serves only the ending. A
 * retraction goes out the same way and does not repeat the claim it withdraws.
 *
 * This ingest deduplicated on the raw EVENT id, so each republish arrived as a
 * brand-new report: a viewer who had loaded the open version kept it, with the
 * ending as a second report beside it. A withdrawn claim stayed on screen next
 * to its own retraction.
 *
 * NIP-01 already says what an addressable event is. Kinds 30000–39999 are
 * identified by (kind, pubkey, d); a newer one with the same three replaces the
 * older; on equal timestamps the lower id is kept. The peer offered to build to
 * whichever design we preferred. This is not a preference — it is what the kind
 * number means.
 */
import { describe, it, expect } from 'vitest';
import { NostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';

type Handler = (event: unknown, relay: string) => void;

/** readEvent, not handleEvent — the reason is in the regionSubject tests. */
const handle = (ingest: NostrStarcomIntelIngest, event: unknown) =>
  (ingest as unknown as { readEvent: Handler }).readEvent(event, 'wss://test');

const PEER = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

/**
 * Shaped like the notes the peer actually sends: plain text, the hashtag, a
 * jurisdiction, and the `d` tag that makes it addressable.
 */
const note = (over: {
  id?: string; kind?: number; pubkey?: string; d?: string | null; at?: number; content?: string;
} = {}) => {
  const tags: string[][] = [['t', 'starcom_intel'], ['jurisdiction', 'us-va']];
  if (over.d !== null) tags.push(['d', over.d ?? 'starcom-intel-ic-uei-141438126d']);
  return {
    id: over.id ?? `evt-${Math.random().toString(36).slice(2, 10)}`,
    pubkey: over.pubkey ?? PEER,
    created_at: over.at ?? 1_790_000_000,
    kind: over.kind ?? 30023,
    sig: '',
    tags,
    content: over.content ?? 'Open: a thread about a federal award.',
  };
};

const collect = () => {
  const ingest = new NostrStarcomIntelIngest({ relays: [], searchRelays: [] });
  const seen: Array<{ id: string; content: string }> = [];
  ingest.subscribe((r) => seen.push(r as never));
  const held = () => {
    const out: Array<{ id: string; content: string }> = [];
    ingest.replayAccepted((r) => out.push(r as never));
    return out;
  };
  return { ingest, seen, held };
};

describe('a republished addressable note', () => {
  it('replaces the earlier version rather than standing beside it', () => {
    const { ingest, held } = collect();
    handle(ingest, note({ at: 100, content: 'Open: the thread.' }));
    handle(ingest, note({ at: 200, content: 'Closed: supported.' }));

    expect(held()).toHaveLength(1);
    expect(held()[0].content).toBe('Closed: supported.');
  });

  it('keeps one identity across versions, so the globe and storage replace too', () => {
    // Downstream consumers replace by report id — the visualization cache by
    // marker identity, storage by importReport('overwrite'). They only see a
    // replacement if both versions carry the same id.
    const { ingest, seen } = collect();
    handle(ingest, note({ at: 100 }));
    handle(ingest, note({ at: 200 }));

    expect(seen).toHaveLength(2);
    expect(seen[0].id).toBe(seen[1].id);
  });

  it('lets a retraction withdraw the claim it does not repeat', () => {
    const { ingest, held } = collect();
    handle(ingest, note({ at: 100, content: 'Indicator fired: award during exclusion.' }));
    handle(ingest, note({ at: 200, content: 'Retracted.' }));

    expect(held().map((r) => r.content)).toEqual(['Retracted.']);
  });
});

describe('versions arriving out of order', () => {
  it('drops an older version that arrives after a newer one', () => {
    // Relays answer independently, so the ending can land before the opening.
    const { ingest, held } = collect();
    handle(ingest, note({ at: 200, content: 'Closed.' }));
    handle(ingest, note({ at: 100, content: 'Open.' }));

    expect(held().map((r) => r.content)).toEqual(['Closed.']);
  });

  it('counts the stale arrival rather than dropping it silently', () => {
    const { ingest } = collect();
    handle(ingest, note({ at: 200 }));
    handle(ingest, note({ at: 100 }));

    expect(ingest.getMetrics().droppedSuperseded).toBe(1);
  });

  it('keeps the lower id when two versions share a timestamp, as NIP-01 says', () => {
    const { ingest, held } = collect();
    handle(ingest, note({ id: 'ffff', at: 100, content: 'from ffff' }));
    handle(ingest, note({ id: '0000', at: 100, content: 'from 0000' }));

    expect(held().map((r) => r.content)).toEqual(['from 0000']);
  });

  it('does not let the higher id win a tie by arriving second', () => {
    const { ingest, held } = collect();
    handle(ingest, note({ id: '0000', at: 100, content: 'from 0000' }));
    handle(ingest, note({ id: 'ffff', at: 100, content: 'from ffff' }));

    expect(held().map((r) => r.content)).toEqual(['from 0000']);
  });
});

describe('what an address is', () => {
  it('keeps two notes with different d tags', () => {
    const { ingest, held } = collect();
    handle(ingest, note({ d: 'starcom-intel-case-a' }));
    handle(ingest, note({ d: 'starcom-intel-case-b' }));

    expect(held()).toHaveLength(2);
  });

  it('keeps two authors who happen to use the same d tag', () => {
    // The address includes the pubkey, so nobody can replace someone else's
    // note by choosing the same d.
    const { ingest, held } = collect();
    handle(ingest, note({ pubkey: PEER, content: 'mine' }));
    handle(ingest, note({ pubkey: OTHER, content: 'theirs', at: 999 }));

    expect(held().map((r) => r.content).sort()).toEqual(['mine', 'theirs']);
  });

  it('treats a missing d tag as the empty one, per NIP-01', () => {
    const { ingest, held } = collect();
    handle(ingest, note({ d: null, at: 100, content: 'first' }));
    handle(ingest, note({ d: null, at: 200, content: 'second' }));

    expect(held().map((r) => r.content)).toEqual(['second']);
  });

  it('never replaces a kind 1, which is not addressable', () => {
    // A d tag on an ordinary note means nothing. Two kind-1 events are two
    // reports whatever they carry.
    const { ingest, held } = collect();
    handle(ingest, note({ kind: 1, at: 100, content: 'one' }));
    handle(ingest, note({ kind: 1, at: 200, content: 'two' }));

    expect(held()).toHaveLength(2);
  });
});

describe('retention stays bounded under replacement', () => {
  it('holds one entry per address however many times it is republished', () => {
    const { ingest } = collect();
    for (let t = 1; t <= 10; t++) handle(ingest, note({ at: t }));

    const reportIds = (ingest as unknown as { reportIds: string[] }).reportIds;
    expect(reportIds).toHaveLength(1);
    expect(new Set(reportIds).size).toBe(reportIds.length);
  });
});

describe('the version a report was read at (plan item 5.1)', () => {
  // A verdict on a report is pinned to the exact version its reviewer read;
  // the ingest kept that only in a private map.
  it('keeps the event and kind it was read from, and moves to a newer version when one replaces it', () => {
    const { ingest, held } = collect();
    handle(ingest, note({ id: 'evt-v1', at: 100 }));
    expect(held()[0]).toMatchObject({ nostrEventId: 'evt-v1', nostrKind: 30023 });
    handle(ingest, note({ id: 'evt-v2', at: 200 }));
    expect(held()[0]).toMatchObject({ nostrEventId: 'evt-v2', nostrKind: 30023 });
  });

  it('keeps it for a note with no address too', () => {
    const { ingest, held } = collect();
    handle(ingest, note({ id: 'evt-note', kind: 1, d: null }));
    expect(held()[0]).toMatchObject({ id: 'evt-note', nostrEventId: 'evt-note', nostrKind: 1 });
  });
});
