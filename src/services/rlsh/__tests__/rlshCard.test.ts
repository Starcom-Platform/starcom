/**
 * An RLSH profile is NavCom's card (D-RF, RF1, RF4, RF7): kind 10911, content `callsign`, `region` and `doing` only,
 * `region: "earth"` and no `d` tag, the Zone as an `area` tag, up to three of NavCom's terms, and the labels for how
 * it can be found; read as NavCom reads one, refused whole on any other content field.
 */
import { describe, it, expect } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools';
import {
  DOES, DOES_MAX, DOING_MAX, KIND_CARD, NAVCOM_PUBLIC_LABEL, RLSH_LABEL, cardTemplate, deletionTemplate, keyPrint, readCard,
  type RlshCardDraft,
} from '../rlshCard';

const draft: RlshCardDraft = {
  callsign: '  Night Beacon ', doing: 'Walks the river path on Fridays with water.', zone: { id: 'zone:atlas', name: 'Atlas Zone' },
  does: ['patrol', 'supplies'], finding: 'starcom',
};
const PK = 'a'.repeat(64);
const event = (over: Partial<{ kind: number; pubkey: string; content: string; tags: string[][]; created_at: number }> = {}) => {
  const t = cardTemplate(draft);
  return { kind: t.kind, pubkey: PK, content: t.content, tags: t.tags, created_at: 100, ...over };
};

describe('cardTemplate', () => {
  it('writes only the fields NavCom reads, region earth, and no d tag', () => {
    const t = cardTemplate(draft);
    expect(t.kind).toBe(KIND_CARD);
    expect(JSON.parse(t.content)).toEqual({ callsign: 'Night Beacon', region: 'earth', doing: 'Walks the river path on Fridays with water.' });
    expect(t.tags.find((x) => x[0] === 'd')).toBeUndefined();
    expect(t.tags).toEqual([['area', 'zone', 'zone:atlas', 'Atlas Zone'], ['t', 'patrol'], ['t', 'supplies'], ['l', RLSH_LABEL]]);
  });

  it('labels a card for how it can be found: Starcom, Starcom and navcom.app, or nowhere', () => {
    const labels = (finding: RlshCardDraft['finding']) => cardTemplate({ ...draft, finding }).tags.filter((t) => t[0] === 'l').map((t) => t[1]);
    expect(labels('starcom')).toEqual([RLSH_LABEL]);
    expect(labels('public')).toEqual([RLSH_LABEL, NAVCOM_PUBLIC_LABEL]);
    expect(labels('address')).toEqual([]);
  });

  it('keeps three known terms at most, no empty doing, and no Zone when none was given', () => {
    const t = cardTemplate({ ...draft, doing: '  ', zone: null, does: ['patrol', 'invented', 'patrol', 'comms', 'search', 'observe'] });
    expect(JSON.parse(t.content)).toEqual({ callsign: 'Night Beacon', region: 'earth' });
    expect(t.tags.filter((x) => x[0] === 't').map((x) => x[1])).toEqual(['patrol', 'comms', 'search']);
    expect(t.tags.some((x) => x[0] === 'area')).toBe(false);
    expect(DOES_MAX).toBe(3);
  });

  it('refuses a card without an alias', () => {
    expect(() => cardTemplate({ ...draft, callsign: '  ' })).toThrow(/alias/);
  });
});

describe('readCard', () => {
  it('reads a card back as it was written', () => {
    expect(readCard(event())).toEqual({
      pubkey: PK, callsign: 'Night Beacon', doing: 'Walks the river path on Fridays with water.', zone: { id: 'zone:atlas', name: 'Atlas Zone' },
      does: ['patrol', 'supplies'], labels: [RLSH_LABEL], agent: false, at: 100,
    });
  });

  it('refuses a card whose content carries any other field, as NavCom refuses it, never trimming it', () => {
    expect(readCard(event({ content: JSON.stringify({ callsign: 'X', region: 'earth', team: 'Blue' }) }))).toBeNull();
    expect(readCard(event({ content: 'not json' }))).toBeNull();
    expect(readCard(event({ content: JSON.stringify({ region: 'earth' }) }))).toBeNull();
    expect(readCard(event({ kind: 0 }))).toBeNull();
    expect(readCard(event({ pubkey: 'nope' }))).toBeNull();
  });

  it('drops a term this build does not know, and caps what it shows', () => {
    const tags = [['t', 'patrol'], ['t', 'flying'], ['t', 'comms'], ['t', 'search'], ['t', 'observe']];
    expect(readCard(event({ tags }))?.does).toEqual(['patrol', 'comms', 'search']);
    expect(readCard(event({ content: JSON.stringify({ callsign: 'X', doing: 'y'.repeat(300) }) }))?.doing).toHaveLength(DOING_MAX);
  });

  it('reads a card NavCom itself signs, with its lightning field', () => {
    const secret = generateSecretKey();
    const signed = finalizeEvent({ kind: KIND_CARD, created_at: 1, content: JSON.stringify({ callsign: 'Ridge', region: 'earth', lightning: 'ridge@example.com' }), tags: [['l', NAVCOM_PUBLIC_LABEL]] }, secret);
    expect(verifyEvent(signed)).toBe(true);
    expect(readCard(signed)).toMatchObject({ pubkey: getPublicKey(secret), callsign: 'Ridge', doing: null, zone: null, labels: [NAVCOM_PUBLIC_LABEL] });
  });
});

describe('keyPrint and deletion', () => {
  it('prints a key as NavCom does: its first sixteen hex characters in fours', () => {
    expect(keyPrint('0123456789abcdef'.repeat(4))).toBe('0123 4567 89ab cdef');
    expect(keyPrint('xyz')).toBeNull();
  });

  it('asks relays to drop the card by its address, with its kind', () => {
    expect(deletionTemplate(PK)).toEqual({ kind: 5, tags: [['a', `10911:${PK}:`], ['k', '10911']], content: '' });
  });

  it('keeps NavCom\'s list of terms as it stands, each an activity', () => {
    expect(DOES.map((d) => d.id)).toEqual(['patrol', 'supplies', 'firstaid', 'transport', 'comms', 'search', 'observe', 'welfare', 'answers', 'station', 'teaches', 'gear', 'crew']);
  });
});
