/**
 * A NIP-05 address checked against a key (decision D-MF, MF4): the badge says a domain lists the key that
 * signed, as Mecha Jono's profile names mecha@mecha.jono.archangel.agency and that domain lists its key.
 */
import { describe, it, expect, vi } from 'vitest';
import { nip05Answer, nip05Lists, parseNip05 } from '../nip05';

const KEY = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const listing = (names: Record<string, string>) => vi.fn(async () => ({ names }));

describe('parseNip05', () => {
  it('reads a name and a domain, in lower case', () => {
    expect(parseNip05('Mecha@Mecha.Jono.ArchAngel.Agency')).toEqual({ name: 'mecha', domain: 'mecha.jono.archangel.agency' });
  });
  it('reads a bare domain as its root name', () => {
    expect(parseNip05('starcom.app')).toEqual({ name: '_', domain: 'starcom.app' });
  });
  it('refuses what is not an address', () => {
    for (const bad of ['', 'no-domain@', '@nobody.example', 'a@b', 'a@evil.example/path', 'a@evil.example:8080', 'a b@x.example']) {
      expect(parseNip05(bad)).toBeNull();
    }
  });
});

describe('nip05Lists', () => {
  it('asks the domain for the name, and is true when it lists the key', async () => {
    const fetchJson = listing({ mecha: KEY });
    expect(await nip05Lists('mecha@mecha.jono.archangel.agency', KEY, fetchJson)).toBe(true);
    expect(fetchJson).toHaveBeenCalledWith('https://mecha.jono.archangel.agency/.well-known/nostr.json?name=mecha', expect.anything());
  });
  it('compares the key without case', async () => {
    expect(await nip05Lists('mecha@x.example', KEY, listing({ mecha: KEY.toUpperCase() }))).toBe(true);
  });
  it('is false when the domain lists another key, or none, under that name', async () => {
    expect(await nip05Lists('mecha@x.example', KEY, listing({ mecha: 'f'.repeat(64) }))).toBe(false);
    expect(await nip05Lists('mecha@x.example', KEY, listing({ other: KEY }))).toBe(false);
  });
  it('is false when the domain does not answer, answers nonsense, or the address is not one', async () => {
    expect(await nip05Lists('mecha@x.example', KEY, vi.fn(async () => { throw new Error('offline'); }))).toBe(false);
    expect(await nip05Lists('mecha@x.example', KEY, vi.fn(async () => 'not json'))).toBe(false);
    expect(await nip05Lists('nonsense', KEY, listing({ mecha: KEY }))).toBe(false);
  });
  it('gives up on a domain that does not answer in time', async () => {
    vi.useFakeTimers();
    const never = vi.fn((_url: string, init: { signal: AbortSignal }) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))));
    const asked = nip05Lists('mecha@x.example', KEY, never, 6000);
    await vi.advanceTimersByTimeAsync(6001);
    expect(await asked).toBe(false);
    vi.useRealTimers();
  });
});

describe('nip05Answer', () => {
  it('gives the relays the domain names for the key it lists, and none for a key it does not', async () => {
    const get = vi.fn(async () => ({ names: { mecha: KEY }, relays: { [KEY]: ['wss://relay.primal.net', 'wss://nos.lol', 7] } }));
    expect(await nip05Answer('mecha@mecha.jono.archangel.agency', KEY, get)).toEqual({ listed: true, relays: ['wss://relay.primal.net', 'wss://nos.lol'] });
    expect(await nip05Answer('mecha@mecha.jono.archangel.agency', 'f'.repeat(64), get)).toEqual({ listed: false, relays: [] });
  });
});
