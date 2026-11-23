/**
 * Mecha Jono's key change (2 Nov 2026; their thread of 24 Oct, Starcom's reply of 25 Oct). At the cut-over its
 * standing notes are re-signed under the new key, each with ["carried", <old event id>, <old created_at>], while
 * Starcom still reads both keys. The carried copy and its old-key original are one note, the carried copy kept and the
 * original withdrawn from every reader; and a note is placed by when it was first published, not by its re-signing.
 */
import { describe, it, expect } from 'vitest';
import { NostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';
import { MECHA_JONO_KEYS } from '../../../config/publicInfrastructure';

type Handler = (event: unknown, relay: string) => void;
const handle = (ingest: NostrStarcomIntelIngest, event: unknown) =>
  (ingest as unknown as { readEvent: Handler }).readEvent(event, 'wss://test');

const [NEW_KEY, OLD_KEY] = MECHA_JONO_KEYS;
const STRANGER = 'b'.repeat(64);
const D = 'starcom-intel-ic-uei-141438126d';
const FIRST_SIGNED = 1_790_000_000;
const CARRIED_AT = 1_793_631_600;
const OLD_ID = 'c'.repeat(64);

const note = (over: { id?: string; pubkey?: string; at?: number; extra?: string[][]; content?: string } = {}) => ({
  id: over.id ?? `evt-${Math.random().toString(36).slice(2, 10)}`,
  pubkey: over.pubkey ?? OLD_KEY,
  created_at: over.at ?? FIRST_SIGNED,
  kind: 30023,
  sig: '',
  tags: [['t', 'starcom_intel'], ['jurisdiction', 'us-va'], ['d', D], ...(over.extra ?? [])],
  content: over.content ?? 'Open: a thread about a federal award.',
});
const carried = (over: { at?: number; extra?: string[][] } = {}) =>
  note({ pubkey: NEW_KEY, at: over.at ?? CARRIED_AT, extra: [['carried', OLD_ID, String(FIRST_SIGNED)], ...(over.extra ?? [])] });

const collect = () => {
  const ingest = new NostrStarcomIntelIngest({ relays: [], searchRelays: [] });
  const withdrawn: string[][] = [];
  ingest.onWithdrawn((ids) => withdrawn.push(ids));
  const held = () => {
    const out: Array<{ id: string; author: string; createdAt: Date; updatedAt: Date }> = [];
    ingest.replayAccepted((r) => out.push(r as never));
    return out;
  };
  return { ingest, withdrawn, held };
};

describe('a note carried to its publisher\'s new key', () => {
  it('replaces its old-key original, which every reader is told is gone', () => {
    const { ingest, withdrawn, held } = collect();
    handle(ingest, note({ id: OLD_ID }));
    handle(ingest, carried());
    expect(held()).toHaveLength(1);
    expect(held()[0].author).toBe(NEW_KEY);
    expect(held()[0].id).toBe(`30023:${NEW_KEY}:${D}`);
    expect(withdrawn).toEqual([[`30023:${OLD_KEY}:${D}`]]);
  });

  it('is kept when its old-key original arrives after it, from a slower relay', () => {
    const { ingest, withdrawn, held } = collect();
    handle(ingest, carried());
    handle(ingest, note({ id: OLD_ID }));
    expect(held().map((r) => r.author)).toEqual([NEW_KEY]);
    expect(withdrawn).toEqual([]);
    expect(ingest.getMetrics().droppedSuperseded).toBe(1);
  });

  it('is placed by when it was first published, and keeps when this copy was signed', () => {
    const { ingest, held } = collect();
    handle(ingest, carried());
    expect(held()[0].createdAt.getTime()).toBe(FIRST_SIGNED * 1000);
    expect(held()[0].updatedAt.getTime()).toBe(CARRIED_AT * 1000);
    // A stated published_at comes first.
    const other = collect();
    handle(other.ingest, carried({ extra: [['published_at', '1789000000']] }));
    expect(other.held()[0].createdAt.getTime()).toBe(1_789_000_000 * 1000);
  });

  it('is not merged with a stranger\'s note at the same d', () => {
    const { ingest, withdrawn, held } = collect();
    handle(ingest, note({ pubkey: STRANGER }));
    handle(ingest, carried());
    expect(held()).toHaveLength(2);
    expect(withdrawn).toEqual([]);
  });
});
