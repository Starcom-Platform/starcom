/**
 * NavCom's raw intel, registered (decision D-MX, MX3): kind 1911 read from the
 * relays, each checked by its signature and against the vocabulary NavCom
 * publishes, which is fetched from NavCom and never pinned. Real keys sign real
 * events here, so this runs in node.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import { ObservationIngestService } from '../ObservationIngestService';

const relays = vi.hoisted(() => ({
  events: [] as unknown[], asked: [] as unknown[], askedOf: [] as string[],
  /** Answers by filter when set; otherwise every ask gets `events`. */
  answer: undefined as undefined | ((filter: { authors?: string[] }) => unknown[]),
}));
vi.mock('../../../nostr/relayPool', () => ({
  createRelayPool: () => ({
    querySync: async (asked: string[], filter: { authors?: string[] }) => {
      relays.asked.push(filter);
      relays.askedOf.push(...asked);
      return relays.answer ? relays.answer(filter) : relays.events;
    },
    close: () => {},
  }),
}));
vi.mock('../../../GeoEventsService', () => ({ fetchNaturalEvents: vi.fn(async () => []) }));

const { registerObservationSources, readCitedObservations, readOperatorStanding } = await import('../registerSources');
const { readRelays } = await import('../../../nostr/publishTargets');

describe("NavCom's observations, read", () => {
  it('reads kind 1911 from the relays, checked by signature and against the vocabulary NavCom publishes', async () => {
    const operator = generateSecretKey();
    const now = Math.floor(Date.now() / 1000);
    const anchor = 'st-louis-anchor-1';
    const signed = finalizeEvent({
      kind: 1911, created_at: now,
      tags: [['g', 'st-louis'], ['d', anchor]],
      // Invented member, as NavCom asked: its list is never copied into Starcom.
      content: JSON.stringify({ anchor, observed_at: now - 600, tags: ['alpha_one'], method: 'saw', callsign: 'anonymous', precision: 'area', area: '9yzg' }),
    }, operator);
    const forged = { ...signed, id: 'f'.repeat(64) };
    relays.events = [signed, forged];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === 'https://navcom.app/.well-known/navcom-intel.json'
      ? { ok: true, status: 200, json: async () => ({ vocabulary: { tags: { alpha: ['alpha_one'], beta: ['beta_one'] }, status: 'for this test' } }) }
      : { ok: false, status: 404, json: async () => ({}) })));
    try {
      const svc = new ObservationIngestService();
      registerObservationSources(svc);
      expect(svc.registeredSourceIds()).toContain('navcom');

      const { observations } = await svc.ingestAll();
      const navcom = observations.filter((o) => o.sourceId === 'navcom');
      expect(navcom).toHaveLength(1);
      expect(navcom[0]).toMatchObject({
        sourceRecordId: signed.id,
        upstreamSourceId: getPublicKey(operator),
        subjectEntityRef: anchor,
        claim: { attribute: 'alpha', value: 'alpha_one' },
      });
      expect(relays.asked[0]).toMatchObject({ kinds: [1911] });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('an observation a report cites, looked up (MX23)', () => {
  it('is asked for by id of the relays this node reads, and of no other, and checked by its signature', async () => {
    const operator = generateSecretKey();
    const now = Math.floor(Date.now() / 1000);
    const anchor = 'st-louis-anchor-2';
    const signed = finalizeEvent({
      kind: 1911, created_at: now, tags: [['g', 'st-louis'], ['d', anchor]],
      content: JSON.stringify({ anchor, observed_at: now - 600, tags: ['alpha_one'], method: 'told', callsign: 'Kestrel', precision: 'area', area: '9yzg' }),
    }, operator);
    relays.events = [signed, { ...signed, id: 'f'.repeat(64) }];
    relays.asked = [];
    relays.askedOf = [];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    try {
      const found = await readCitedObservations([signed.id, 'f'.repeat(64)]);
      expect(found.map((o) => o.sourceRecordId)).toEqual([signed.id]);
      expect(relays.asked[0]).toEqual({ ids: [signed.id, 'f'.repeat(64)], kinds: [1911] });
      expect(new Set(relays.askedOf)).toEqual(new Set(readRelays('MISSION')));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('asks no relay when nothing is cited', async () => {
    relays.asked = [];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    try {
      expect(await readCitedObservations([])).toEqual([]);
      expect(relays.asked).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("an operator's Intel standing (MX8, MX25, MX26)", () => {
  it('counts their observations as Starcom reads them, and those another key cited, asking only the relays it reads', async () => {
    const operator = generateSecretKey();
    const other = generateSecretKey();
    const now = Math.floor(Date.now() / 1000);
    const made = (anchor: string, tags = ['alpha_one']) => finalizeEvent({
      kind: 1911, created_at: now, tags: [['g', 'st-louis'], ['d', anchor]],
      content: JSON.stringify({ anchor, observed_at: now - 600, tags, method: 'saw', callsign: 'anonymous', precision: 'area', area: '9yzg' }),
    }, operator);
    const first = made('anchor-a');
    // Two tags: two claims, one observation.
    const second = made('anchor-b', ['alpha_one', 'beta_one']);
    const forgedObservation = { ...made('anchor-c'), id: 'e'.repeat(64) };
    const citedByOther = finalizeEvent({ kind: 1, created_at: now, tags: [['e', first.id, '', 'cites']], content: 'A report.' }, other);
    const citedByThemselves = finalizeEvent({ kind: 1, created_at: now, tags: [['e', second.id, '', 'cites']], content: 'Their own.' }, operator);
    const forgedCitation = { ...finalizeEvent({ kind: 1, created_at: now, tags: [['e', second.id, '', 'cites']], content: 'Forged.' }, other), content: 'Altered after signing.' };
    relays.asked = [];
    relays.askedOf = [];
    relays.events = [];
    const answer = vi.fn((filter: { authors?: string[] }) => (filter.authors ? [first, second, forgedObservation] : [citedByOther, citedByThemselves, forgedCitation]));
    relays.answer = answer;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    try {
      expect(await readOperatorStanding(getPublicKey(operator))).toEqual({ submitted: 2, refined: 1 });
      expect(new Set(relays.askedOf)).toEqual(new Set(readRelays('MISSION')));
    } finally {
      relays.answer = undefined;
      vi.unstubAllGlobals();
    }
  });
});

