/**
 * The reading half of the return path.
 *
 * Signed with real keys rather than stubbed: the point of the signature check
 * is that a forged reply cannot put words under someone's name in a thread
 * about our own package, and a fake verifier would prove nothing about that.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, type Event as NostrEvent } from 'nostr-tools';
import { MissionPackageReplyIngest, type PackageReply } from '../MissionPackageReplyIngest';
import { coordinateFor, packageIdentifier } from '../missionPackageThread';

const packageCoordinate = (pubkey: string, packageId: string) =>
  coordinateFor(pubkey, packageIdentifier(packageId));
/** The tag shape a conformant reply carries. */
const replyTags = (coordinate: string) => [['a', coordinate]];

const subs = vi.hoisted(() => ({ filters: [] as unknown[], handlers: [] as Array<(e: NostrEvent) => void>, closed: 0 }));

vi.mock('nostr-tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('nostr-tools')>();
  return {
    ...actual,
    SimplePool: class {
      // One filter per call, as nostr-tools 2.25 takes it.
      subscribeMany(_relays: string[], filter: unknown, handlers: { onevent: (e: NostrEvent) => void }) {
        subs.filters.push(filter);
        subs.handlers.push(handlers.onevent);
        return { close: () => { subs.closed += 1; } };
      }
      close() { /* nothing to close in the fake */ }
    },
  };
});

const authorKey = generateSecretKey();
const publisherKey = generateSecretKey();
const COORD = packageCoordinate(getPublicKey(publisherKey), 'mission-1');
const OTHER = packageCoordinate(getPublicKey(publisherKey), 'mission-2');

const reply = (coordinate: string, content = 'I can take the desk half of this.'): NostrEvent =>
  finalizeEvent({ kind: 1, created_at: Math.floor(Date.now() / 1000), tags: replyTags(coordinate), content }, authorKey);

const deliver = (event: NostrEvent) => subs.handlers.forEach((h) => h(event));

const collect = () => {
  const ingest = new MissionPackageReplyIngest(['wss://test']);
  const seen: PackageReply[] = [];
  ingest.subscribe((r) => seen.push(r));
  return { ingest, seen };
};

beforeEach(() => { subs.filters = []; subs.handlers = []; subs.closed = 0; });

describe('watching for replies', () => {
  it('asks only about the coordinates it was given', () => {
    const { ingest } = collect();
    ingest.start([COORD]);
    expect(subs.filters[0]).toMatchObject({ kinds: [1], '#a': [COORD] });
  });

  it('subscribes to nothing when nothing of ours is published', () => {
    // An empty `#a` is, on most relays, no constraint at all — this would
    // become a firehose of every note on the network.
    const { ingest } = collect();
    ingest.start([]);
    expect(subs.filters).toHaveLength(0);
  });

  it('ignores blank coordinates rather than asking about them', () => {
    const { ingest } = collect();
    ingest.start(['', '   ']);
    expect(subs.filters).toHaveLength(0);
  });

  it('does not reopen an unchanged subscription', () => {
    const { ingest } = collect();
    ingest.start([COORD]);
    ingest.start([COORD]);
    // One open is two subscriptions: kind 1 replies and NIP-22 comments.
    expect(subs.filters).toHaveLength(2);
  });

  it('reopens when the watched set changes, since a filter is fixed once open', () => {
    const { ingest } = collect();
    ingest.start([COORD]);
    ingest.start([COORD, OTHER]);
    expect(subs.filters).toHaveLength(4);
    expect(subs.filters[2]).toMatchObject({ '#a': [COORD, OTHER] });
    expect(subs.filters[3]).toMatchObject({ '#A': [COORD, OTHER] });
  });
});

describe('what arrives', () => {
  it('delivers a signed reply that names a package we published', () => {
    const { ingest, seen } = collect();
    ingest.start([COORD]);
    deliver(reply(COORD));

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      coordinate: COORD,
      pubkey: getPublicKey(authorKey),
      content: 'I can take the desk half of this.',
      relay: 'wss://test',
    });
  });

  it('refuses a reply whose signature does not verify', () => {
    // Tampered after signing: the content says one thing, the signature covers
    // another. Anyone could otherwise answer in anyone's name.
    const { ingest, seen } = collect();
    ingest.start([COORD]);
    const forged = { ...reply(COORD), content: 'Approved by the publisher.' } as NostrEvent;
    deliver(forged);

    expect(seen).toHaveLength(0);
    expect(ingest.getCounters().refused).toBe(1);
  });

  it('refuses a reply to a package we did not ask about', () => {
    // A relay is not obliged to honour a filter faithfully.
    const { ingest, seen } = collect();
    ingest.start([COORD]);
    deliver(reply(OTHER));

    expect(seen).toHaveLength(0);
    expect(ingest.getCounters().refused).toBe(1);
  });

  it('counts a reply once, however many times a relay sends it', () => {
    const { ingest, seen } = collect();
    ingest.start([COORD]);
    const one = reply(COORD);
    deliver(one);
    deliver(one);

    expect(seen).toHaveLength(1);
    expect(ingest.getCounters()).toMatchObject({ seen: 1, accepted: 1 });
  });

  it('keeps the event time rather than the arrival time', () => {
    const { ingest, seen } = collect();
    ingest.start([COORD]);
    const when = Math.floor(Date.UTC(2026, 8, 20, 12, 0, 0) / 1000);
    deliver(finalizeEvent({ kind: 1, created_at: when, tags: replyTags(COORD), content: 'hi' }, authorKey));

    expect(seen[0].createdAt.toISOString()).toBe('2026-09-20T12:00:00.000Z');
  });

  it('stops delivering once stopped', () => {
    const { ingest, seen } = collect();
    ingest.start([COORD]);
    ingest.stop();
    expect(subs.closed).toBe(2);
    // The watched set is cleared, so anything a lingering socket delivers is
    // no longer a coordinate we asked about.
    deliver(reply(COORD));
    expect(seen).toHaveLength(0);
  });
});

describe('replies as NIP-22 comments (plan item 5.1)', () => {
  // A reply is now sent as a comment on the package: kind 1111, the package
  // as its root in an A tag. Kind 1 replies from before are still read.
  const comment = (coordinate: string, content = 'Two of the five sites look closed.'): NostrEvent =>
    finalizeEvent({ kind: 1111, created_at: Math.floor(Date.now() / 1000), tags: [['A', coordinate], ['K', '30079']], content }, authorKey);

  it('asks for comments on its packages as well as kind 1 replies', () => {
    const { ingest } = collect();
    ingest.start([COORD]);
    expect(subs.filters).toEqual(expect.arrayContaining([
      expect.objectContaining({ kinds: [1], '#a': [COORD] }),
      expect.objectContaining({ kinds: [1111], '#A': [COORD] }),
    ]));
  });

  it('takes a comment whose root is one of its packages as a reply, and one on another package not at all', () => {
    const { ingest, seen } = collect();
    ingest.start([COORD]);
    deliver(comment(COORD));
    deliver(comment(OTHER, 'Not about this one.'));
    expect(seen.map((r) => [r.coordinate, r.content])).toEqual([[COORD, 'Two of the five sites look closed.']]);
  });
});
