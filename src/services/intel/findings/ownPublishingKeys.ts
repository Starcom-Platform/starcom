/**
 * Every ML-DSA key this node has published under.
 *
 * Both federation stores ask "did we publish this?" so that our own events,
 * returning from the relays we broadcast to, are not counted as somebody
 * else's agreement or disagreement. Both asked the WRONG THING: they compared
 * against the Nostr identity — a 64-character secp256k1 key — while a signed
 * finding carries a 3904-character ML-DSA-65 key. Those can never be equal, so
 * the check never fired once. This instance corroborated itself, and contested
 * itself, and reported both as independent peers.
 *
 * A set, not a single value, because a node legitimately publishes under more
 * than one key across its life: the desktop host's seed-derived key, the
 * browser key when no host is present, and whatever came before a rotation.
 * Every one of those is still us, and a claim signed by a key we retired last
 * month is no more foreign than one signed this morning.
 *
 * Public keys only. Nothing here is secret — the point is recognising our own
 * voice, not proving anything with it.
 */
import { createLogger } from '@utils/logger';
import { NODE_CLAIM_PUBKEYS } from '../../../config/nodeIdentity';

const log = createLogger({ prefix: 'OwnKeys' });
const STORAGE_KEY = 'starcom.ownPublishingKeys.v1';
const MAX_KEYS = 16;

class OwnPublishingKeys {
  private keys = new Set<string>();
  /*
   * Keys this build DECLARES are ours, as distinct from keys this browser has
   * happened to sign with.
   *
   * ─── WHY A SECOND SET RATHER THAN SEEDING THE FIRST ──────────────────────
   *
   * Two reasons, and the first is a bug waiting to happen. `remember()` evicts
   * the oldest entry past MAX_KEYS, so a seeded node key could be pushed off
   * the end by ordinary browser signing — the recognition would work for a
   * fortnight and then quietly stop. Declared keys are not evictable.
   *
   * The second is that they come from different places and fail differently.
   * A remembered key is an observation: this browser signed with it. A declared
   * key is a build-time fact from src/config/nodeIdentity.ts, present before
   * anything is signed and identical in every instance.
   *
   * ─── WHY THIS MATTERS AT ALL ─────────────────────────────────────────────
   *
   * Every claim this project has actually published was signed by the COMMAND
   * LINE, and the command line never calls `remember`. So the node's own claims,
   * arriving back off the relays, were about to be counted as a stranger's
   * agreement — the precise defect described at the top of this file, returning
   * through the one door that was never closed.
   */
  private readonly declared = new Set<string>(NODE_CLAIM_PUBKEYS);
  private loaded = false;

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) for (const k of JSON.parse(raw) as string[]) this.keys.add(k);
    } catch {
      // A browser that refuses storage still recognises keys used THIS session,
      // which is the case that matters most: our own live echo off the relays.
      log.warn('Could not read remembered publishing keys; recognising this session only.');
    }
  }

  /** Called after every successful sign, whichever route produced it. */
  remember(pubkey: string): void {
    if (!pubkey) return;
    this.load();
    if (this.keys.has(pubkey)) return;
    this.keys.add(pubkey);
    // Bounded: a rotation every day for a fortnight is still recognised, and an
    // unbounded list would grow without limit if a key were somehow unstable.
    while (this.keys.size > MAX_KEYS) this.keys.delete(this.keys.values().next().value as string);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.keys]));
    } catch { /* recognising it this session is still worth doing */ }
  }

  /** Did WE publish this? Synchronous, because ingest cannot wait. */
  has(pubkey: string | null | undefined): boolean {
    if (!pubkey) return false;
    // Declared first: it needs no storage, so it answers even in a browser that
    // refuses localStorage entirely.
    if (this.declared.has(pubkey)) return true;
    this.load();
    return this.keys.has(pubkey);
  }

  /** What this build declares, for tests and for anything that reports identity. */
  declaredKeys(): readonly string[] {
    return [...this.declared];
  }

  /**
   * Test seam.
   *
   * Clears only what was REMEMBERED. Declared keys are a build fact, not state,
   * and a reset that forgot them would let a test pass while the shipped
   * behaviour differed.
   */
  reset(): void {
    this.keys.clear();
    this.loaded = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing to clear */ }
  }
}

export const ownPublishingKeys = new OwnPublishingKeys();
