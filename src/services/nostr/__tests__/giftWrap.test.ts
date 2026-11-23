/**
 * A gift wrap (NIP-59), written over the signer's NIP-44 (plan item 2.4,
 * slice d). nostr-tools' nip59 needs the secret key's bytes, which a signing
 * extension never hands over, so the seal is made and opened through the
 * signer: an extension's nip44 when there is one, this browser's key when
 * there is not.
 *
 * What it must do: only the recipient reads it; the sender is known to the
 * recipient and to nobody else (the outer event is signed by a key used once);
 * and anything changed, or a rumor claiming another author, is refused.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, nip44, type Event } from 'nostr-tools';
import { SealRefused, sealAndWrap, unwrapGift } from '../giftWrap';
import nostrService from '../../nostrService';

function installStorageShim(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}

/** A NIP-07 extension holding a key this app never sees. */
function installExtension(secret: Uint8Array, withNip44 = true): string {
  const pubkey = getPublicKey(secret);
  (globalThis as { nostr?: unknown }).nostr = {
    getPublicKey: async () => pubkey,
    signEvent: async (e: Parameters<typeof finalizeEvent>[0]) => finalizeEvent(e, secret),
    ...(withNip44 ? {
      nip44: {
        encrypt: async (peer: string, text: string) => nip44.encrypt(text, nip44.getConversationKey(secret, peer)),
        decrypt: async (peer: string, payload: string) => nip44.decrypt(payload, nip44.getConversationKey(secret, peer)),
      },
    } : {}),
  };
  return pubkey;
}

/** Becomes a person holding this key in this browser. */
async function become(secret: Uint8Array): Promise<string> {
  nostrService.forgetIdentity();
  return nostrService.importNsec((await import('nostr-tools')).nip19.nsecEncode(secret));
}

const rumor = { kind: 20094, tags: [['bundle', 'abc']], content: '{"part":0}' };

beforeEach(() => { installStorageShim(); nostrService.forgetIdentity(); delete (globalThis as { nostr?: unknown }).nostr; });
afterEach(() => { delete (globalThis as { nostr?: unknown }).nostr; });

describe('a gift wrap', () => {
  it('is read by its recipient, who learns the sender; the relay sees only a key used once', async () => {
    const priyaKey = generateSecretKey();
    const aishaKey = generateSecretKey();
    const priya = await become(priyaKey);
    const aisha = getPublicKey(aishaKey);
    const wrap = await sealAndWrap(rumor, aisha);

    expect(wrap.kind).toBe(1059);
    expect(wrap.tags).toEqual([['p', aisha]]);
    expect(wrap.pubkey).not.toBe(priya);
    expect(JSON.stringify(wrap)).not.toContain('part');
    expect(wrap.created_at).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));

    await become(aishaKey);
    const opened = await unwrapGift(wrap);
    expect(opened).toMatchObject({ sender: priya, rumor: { kind: 20094, content: '{"part":0}', tags: [['bundle', 'abc']], pubkey: priya } });
  });

  it('reads nothing for anyone else', async () => {
    await become(generateSecretKey());
    const wrap = await sealAndWrap(rumor, getPublicKey(generateSecretKey()));
    await become(generateSecretKey());
    expect(await unwrapGift(wrap)).toEqual({ refused: expect.stringMatching(/not addressed to you/) });
  });

  it('works through a signing extension, both ways, without this app holding the key', async () => {
    const priyaKey = generateSecretKey();
    const aishaKey = generateSecretKey();
    const priya = installExtension(priyaKey);
    const wrap = await sealAndWrap(rumor, getPublicKey(aishaKey));
    expect(nostrService.hasIdentity()).toBe(false);

    installExtension(aishaKey);
    expect(await unwrapGift(wrap)).toMatchObject({ sender: priya, rumor: { content: '{"part":0}' } });
  });

  it('says a signing extension that cannot encrypt cannot send one', async () => {
    installExtension(generateSecretKey(), false);
    await expect(sealAndWrap(rumor, getPublicKey(generateSecretKey()))).rejects.toThrow(/cannot encrypt \(NIP-44\)/);
  });

  it('refuses a wrap whose content was changed', async () => {
    const aishaKey = generateSecretKey();
    await become(generateSecretKey());
    const wrap = await sealAndWrap(rumor, getPublicKey(aishaKey));
    await become(aishaKey);
    const changed: Event = { ...wrap, content: wrap.content.slice(0, -8) + 'AAAAAAAA' };
    expect(await unwrapGift(changed)).toMatchObject({ refused: expect.any(String) });
    // Only its time changed, as it would arrive: it still opens, but its
    // signature no longer holds. (Through JSON, since verifyEvent caches its
    // answer on the object, and a spread copy would carry the cache along.)
    const retimed = { ...JSON.parse(JSON.stringify(wrap)), created_at: wrap.created_at - 60 };
    expect(await unwrapGift(retimed)).toEqual({ refused: expect.stringMatching(/was changed/) });
  });

  it('refuses a rumor that claims an author other than the one who sealed it', async () => {
    const malloryKey = generateSecretKey();
    const aishaKey = generateSecretKey();
    const aisha = getPublicKey(aishaKey);
    const priya = getPublicKey(generateSecretKey());
    // Mallory seals a rumor saying it is Priya's.
    const forged = { ...rumor, pubkey: priya, created_at: Math.floor(Date.now() / 1000) };
    const { getEventHash } = await import('nostr-tools');
    const seal = finalizeEvent({ kind: 13, tags: [], created_at: forged.created_at, content: nip44.encrypt(JSON.stringify({ ...forged, id: getEventHash(forged) }), nip44.getConversationKey(malloryKey, aisha)) }, malloryKey);
    const once = generateSecretKey();
    const wrap = finalizeEvent({ kind: 1059, tags: [['p', aisha]], created_at: forged.created_at, content: nip44.encrypt(JSON.stringify(seal), nip44.getConversationKey(once, aisha)) }, once);

    await become(aishaKey);
    expect(await unwrapGift(wrap)).toEqual({ refused: expect.stringMatching(/not the one who sealed it/) });
  });

  it('refuses a seal changed after its sender signed it, even rewrapped', async () => {
    const aishaKey = generateSecretKey();
    const aisha = getPublicKey(aishaKey);
    await become(generateSecretKey());
    const wrap = await sealAndWrap(rumor, aisha);
    // Someone able to open the wrap alters the seal and wraps it again.
    const seal = JSON.parse(nip44.decrypt(wrap.content, nip44.getConversationKey(aishaKey, wrap.pubkey)));
    const altered = { ...seal, created_at: seal.created_at + 60 };
    const once = generateSecretKey();
    const rewrapped = finalizeEvent({ kind: 1059, tags: [['p', aisha]], created_at: wrap.created_at, content: nip44.encrypt(JSON.stringify(altered), nip44.getConversationKey(once, aisha)) }, once);

    await become(aishaKey);
    expect(await unwrapGift(rewrapped)).toEqual({ refused: expect.stringMatching(/seal inside was changed/) });
  });

  it("refuses a rumor whose id is not its own hash, since a rumor is referred to by its id", async () => {
    const priyaKey = generateSecretKey();
    const aishaKey = generateSecretKey();
    const aisha = getPublicKey(aishaKey);
    const inner = { ...rumor, pubkey: getPublicKey(priyaKey), created_at: Math.floor(Date.now() / 1000), id: 'f'.repeat(64) };
    const seal = finalizeEvent({ kind: 13, tags: [], created_at: inner.created_at, content: nip44.encrypt(JSON.stringify(inner), nip44.getConversationKey(priyaKey, aisha)) }, priyaKey);
    const once = generateSecretKey();
    const wrap = finalizeEvent({ kind: 1059, tags: [['p', aisha]], created_at: inner.created_at, content: nip44.encrypt(JSON.stringify(seal), nip44.getConversationKey(once, aisha)) }, once);

    await become(aishaKey);
    expect(await unwrapGift(wrap)).toEqual({ refused: expect.stringMatching(/inside was changed/) });
  });

  it('seals nothing to a key whose secret is out, and signs nothing on the way (NavCom §5.0, rev 7)', async () => {
    const signed: unknown[] = [];
    installExtension(generateSecretKey());
    const extension = (globalThis as { nostr: { signEvent: (e: unknown) => Promise<unknown> } }).nostr;
    const sign = extension.signEvent;
    extension.signEvent = async (e) => { signed.push(e); return sign(e); };
    // Mecha Jono's first key, exposed on 28 September 2026: whoever holds it could open the wrap and see who sealed it.
    const exposed = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
    await expect(sealAndWrap(rumor, exposed)).rejects.toThrow(SealRefused);
    await expect(sealAndWrap(rumor, exposed.toUpperCase())).rejects.toThrow(/exposed on 2026-09-28.*Nothing was sent/);
    expect(signed).toHaveLength(0);
    // Anyone else is sealed to as before.
    await expect(sealAndWrap(rumor, getPublicKey(generateSecretKey()))).resolves.toMatchObject({ kind: 1059 });
  });

  it('says a rumor too large for one wrap is too large, before sending anything', async () => {
    await become(generateSecretKey());
    await expect(sealAndWrap({ ...rumor, content: 'x'.repeat(60_000) }, getPublicKey(generateSecretKey()))).rejects.toThrow(/too large/);
  });
});
