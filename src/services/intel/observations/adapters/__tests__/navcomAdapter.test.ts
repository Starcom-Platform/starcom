/**
 * NavCom kind-1911 → Observation, as NavCom publishes it (its contract
 * `/.well-known/navcom-intel.json`, version 0.1.0, and its builder,
 * packages/core/src/directory/observation.ts, read 2026-10-06).
 *
 * This file was rewritten that day. The first version was built against an
 * earlier draft: a `spec` tag, vocabulary in `t` tags, the method in `m`, the
 * anchor in `a` and a geohash in `g`. NavCom's events carry none of that. Their
 * only tags are `g`, the anchor's REGION SLUG ("never a geohash; a few slugs
 * happen to parse as one; decode none of them"), and `d`, the anchor id. The
 * rest, position included, is in the content. Built against the draft, the
 * adapter would have dropped every real observation.
 *
 * What still holds from the first version: the signature first, nothing outside
 * the contract accepted, the refined release set aside, and one operator one
 * feed, the defect NavCom found: their 48-hour precise release is a SECOND
 * event, so dedupe-on-event-id cannot catch it, and only the operator's key as
 * the feed keeps one person from corroborating themselves.
 */
import { describe, it, expect } from 'vitest';
import {
  createNavcomAdapter, NAVCOM_OBSERVATION_KIND, NAVCOM_SOURCE,
  type NavcomRawEvent,
} from '../navcomAdapter';
import { runAdapterContract } from '../adapterContract';

const PUBKEY_A = 'a'.repeat(64);
const PUBKEY_B = 'b'.repeat(64);
const ANCHOR = 'st-louis-overture-3ec355b9';
/** 2026-09-01T12:00:00Z, in unix seconds as NavCom writes `observed_at`. */
const OBSERVED = 1788264000;
/** A four-character geohash cell in St. Louis. */
const AREA = '9yzg';

/** A well-formed event, as NavCom's buildObservation makes one. Overrides break exactly one thing. */
const event = (over: Partial<NavcomRawEvent> & { contentObj?: Record<string, unknown> } = {}): NavcomRawEvent => {
  const { contentObj, ...rest } = over;
  return {
    id: 'e'.repeat(64),
    kind: NAVCOM_OBSERVATION_KIND,
    pubkey: PUBKEY_A,
    created_at: OBSERVED + 3600,
    sig: 'f'.repeat(128),
    content: JSON.stringify({
      anchor: ANCHOR,
      observed_at: OBSERVED,
      tags: ['alpha_one'],
      method: 'saw',
      callsign: 'anonymous',
      precision: 'area',
      area: AREA,
      ...(contentObj ?? {}),
    }),
    tags: [['g', 'st-louis'], ['d', ANCHOR]],
    ...rest,
  };
};

/**
 * NavCom's vocabulary groups its members by namespace. Every member here is
 * invented: NavCom asked that its list never be copied into Starcom, fixtures
 * included, because a stale copy rejects the real one the day it changes.
 */
const VOCABULARY = {
  tags: new Set(['alpha_one', 'alpha_two', 'beta_one', 'gamma_none']),
  namespaceOf: new Map([['alpha_one', 'alpha'], ['alpha_two', 'alpha'], ['beta_one', 'beta'], ['gamma_none', 'gamma']]),
  status: 'settled for the purposes of this test',
};

const adapter = createNavcomAdapter({ verifySignature: () => true, vocabulary: () => VOCABULARY });
const run = (events: NavcomRawEvent[]) => adapter.toObservations(events);
const reasons = (events: NavcomRawEvent[]) => run(events).dropped.map((d) => d.reason);
const withTags = (tags: unknown[][]) => event({ tags });

describe('the shared adapter contract', () => {
  runAdapterContract(adapter, [event()]);
});

describe('an observation as NavCom publishes it', () => {
  it('becomes one observation per tag, about its anchor, dated when seen, signed by its operator', () => {
    const [obs] = run([event()]).observations;
    expect(obs).toMatchObject({
      sourceId: 'navcom',
      upstreamSourceId: PUBKEY_A,
      sourceRecordId: 'e'.repeat(64),
      subjectEntityRef: ANCHOR,
      claim: { attribute: 'alpha', value: 'alpha_one' },
      timestamp: '2026-09-01T12:00:00.000Z',
      method: 'saw',
      subjectKind: 'place',
    });
  });

  it('places it in its four-character cell from the content, with the cell as its precision', () => {
    const [obs] = run([event()]).observations;
    // 9yzg is St. Louis: about 38.6 N, 90.2 W.
    expect(obs.geo!.lat).toBeGreaterThan(38);
    expect(obs.geo!.lat).toBeLessThan(39.5);
    expect(obs.geo!.lon).toBeLessThan(-89.5);
    expect(obs.geo!.lon).toBeGreaterThan(-91);
    expect(obs.geoPrecisionM).toBeGreaterThan(10_000);
  });

  it('never decodes g, the region slug, as a place, even one that parses as a geohash', () => {
    // dr5r is a geohash in New York; as a region slug it must place nothing.
    const [obs] = run([withTags([['g', 'dr5r'], ['d', ANCHOR]])]).observations;
    expect(obs.geo!.lat).toBeLessThan(39.5);
    expect(obs.geo!.lon).toBeLessThan(-89.5);
  });

  it('dates it by observed_at, never by publication', () => {
    const [obs] = run([event({ created_at: 1799999999 })]).observations;
    expect(obs.timestamp).toBe('2026-09-01T12:00:00.000Z');
  });

  it('makes two claims of two tags, each with the retrievable event id', () => {
    const out = run([event({ contentObj: { tags: ['alpha_one', 'beta_one'] } })]);
    expect(out.observations.map((o) => `${o.claim.attribute}:${o.claim.value}`).sort()).toEqual(['alpha:alpha_one', 'beta:beta_one']);
    for (const obs of out.observations) expect(obs.sourceRecordId).toBe('e'.repeat(64));
  });

  it('names its operator for reading by their callsign and their key, short, so two anonymous operators read apart', () => {
    const [a] = run([event({ pubkey: PUBKEY_A })]).observations;
    const [b] = run([event({ id: '2'.repeat(64), pubkey: PUBKEY_B })]).observations;
    expect(a.upstreamSourceLabel).toMatch(/^anonymous · npub1[a-z0-9]{9}…[a-z0-9]{6}$/);
    expect(a.upstreamSourceLabel).not.toBe(b.upstreamSourceLabel);
    const [named] = run([event({ contentObj: { callsign: '  Kestrel ' } })]).observations;
    expect(named.upstreamSourceLabel).toMatch(/^Kestrel · npub1/);
  });

  it('grades the source F, because an unregistered key has no history to judge', () => {
    expect(NAVCOM_SOURCE.trustBaseline).toBe('F');
    expect(NAVCOM_SOURCE.recordIdScheme).toBe('nostr-event');
  });
});

describe('what it refuses', () => {
  it('refuses what does not verify, before anything else', () => {
    const strict = createNavcomAdapter({ verifySignature: () => false });
    expect(strict.toObservations([event()]).dropped[0].reason).toBe('signature did not verify');
  });

  it('refuses another kind', () => {
    expect(reasons([event({ kind: 1 })])[0]).toMatch(/kind 1 is not 1911/);
  });

  it('refuses tags that do not say what the content says: d must name its anchor', () => {
    expect(reasons([withTags([['g', 'st-louis'], ['d', 'somewhere-else']])])[0]).toMatch(/d tag .* is not the anchor/);
    expect(reasons([withTags([['g', 'st-louis']])])[0]).toMatch(/no d \(anchor\) tag/);
  });

  it('refuses content that is not JSON, or that carries a field outside the contract', () => {
    expect(reasons([event({ content: 'not json' })])[0]).toMatch(/not valid JSON/);
    expect(reasons([event({ contentObj: { notes: 'a tall man in a red coat' } })])[0]).toMatch(/outside the contract: notes/);
  });

  it('refuses an observed_at that is not unix seconds', () => {
    expect(reasons([event({ contentObj: { observed_at: '2026-09-01T12:00:00Z' } })])[0]).toMatch(/observed_at/);
    expect(reasons([event({ contentObj: { observed_at: 0 } })])[0]).toMatch(/observed_at/);
  });

  it('refuses a method outside saw, told, inferred, and an observation with no tag', () => {
    expect(reasons([event({ contentObj: { method: 'heard' } })])[0]).toMatch(/method/);
    expect(reasons([event({ contentObj: { tags: [] } })])[0]).toMatch(/no tags/);
  });

  it('refuses an area that is not a four-character geohash, finer included', () => {
    expect(reasons([event({ contentObj: { area: '9yzgq' } })])[0]).toMatch(/4 characters/);
    expect(reasons([event({ contentObj: { area: 'aaaa' } })])[0]).toMatch(/not a geohash/);
  });

  it('refuses a tag not in the fetched vocabulary, saying the list status', () => {
    expect(reasons([event({ contentObj: { tags: ['tall_man'] } })])[0]).toMatch(/not in the fetched list: tall_man \(list status: settled/);
  });

  it('checks only the shape of tags when the vocabulary has not loaded, and keeps each as its own claim', () => {
    const loose = createNavcomAdapter({ verifySignature: () => true, vocabulary: () => null });
    const [obs] = loose.toObservations([event({ contentObj: { tags: ['anything_shaped_right'] } })]).observations;
    // No namespace known, so the member stands alone: two different ones never read as a contradiction.
    expect(obs.claim).toEqual({ attribute: 'anything_shaped_right', value: 'observed' });
    expect(loose.toObservations([event({ contentObj: { tags: ['Not A Tag'] } })]).dropped[0].reason).toMatch(/shape/);
  });
});

describe('the refined release, and an author changing their account', () => {
  it('sets aside an exact-precision event and a refinement, until a pair can be read as one', () => {
    expect(reasons([event({ contentObj: { precision: 'exact', area: undefined, lat: 38.6, lon: -90.2 } })])[0]).toMatch(/precision "exact": the refined release, set aside/);
    expect(reasons([withTags([['d', ANCHOR], ['refines', '1'.repeat(64)]])])[0]).toMatch(/refinement/);
  });

  it('keeps the later of an author\'s own two accounts, dropping the one it supersedes', () => {
    const first = event({ id: '1'.repeat(64) });
    const second = event({ id: '2'.repeat(64), contentObj: { tags: ['alpha_two'], supersedes: '1'.repeat(64) } });
    const out = run([first, second]);
    expect(out.observations.map((o) => o.sourceRecordId)).toEqual(['2'.repeat(64)]);
    expect(out.dropped.map((d) => d.reason)).toContain(`superseded by its author in ${'2'.repeat(64)}`);
  });

  it('never lets one operator supersede another\'s account', () => {
    const first = event({ id: '1'.repeat(64), pubkey: PUBKEY_B });
    const second = event({ id: '2'.repeat(64), contentObj: { supersedes: '1'.repeat(64) } });
    expect(run([first, second]).observations).toHaveLength(2);
  });
});

describe('the defect NavCom found: self-corroboration across two events', () => {
  const feedIdOf = (o: { upstreamSourceId?: string; sourceId: string }) => o.upstreamSourceId ?? o.sourceId;

  it('puts two events from ONE operator in one feed, so they cannot corroborate', () => {
    const out = run([event({ id: '1'.repeat(64) }), event({ id: '2'.repeat(64) })]);
    expect(new Set(out.observations.map(feedIdOf)).size).toBe(1);
  });

  it('puts two DIFFERENT operators in different feeds, so they can', () => {
    const out = run([event({ id: '1'.repeat(64), pubkey: PUBKEY_A }), event({ id: '2'.repeat(64), pubkey: PUBKEY_B })]);
    expect(new Set(out.observations.map(feedIdOf)).size).toBe(2);
  });
});
