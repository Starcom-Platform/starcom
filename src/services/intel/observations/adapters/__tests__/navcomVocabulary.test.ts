/**
 * Fetched, never pinned — and the tests must not pin it either.
 *
 * Navcom's list is a stub awaiting a human with local knowledge and WILL
 * change. So every tag in this file is invented. If a real member name ever
 * appears in Starcom's tree, the thing Navcom asked us not to do has happened.
 */
import { describe, it, expect, vi } from 'vitest';
import { NavcomVocabularySource, CONTRACT_TTL_MS, CONTRACT_MAX_STALE_MS } from '../navcomVocabulary';

/** NavCom groups its members by namespace, `Record<string, string[]>`; every member here is invented. */
const doc = (over: Record<string, unknown> = {}) => ({
  vocabulary: {
    tags: { alpha: ['alpha_one', 'alpha_two'], beta: ['beta_one'] },
    status: 'settled for the purposes of this test',
    ...over,
  },
});

describe('NavcomVocabularySource', () => {
  it('reads the members grouped by namespace, and carries Navcom\'s own status word', async () => {
    const src = new NavcomVocabularySource(async () => doc());
    const vocab = await src.get();
    expect([...vocab!.tags].sort()).toEqual(['alpha_one', 'alpha_two', 'beta_one']);
    expect(vocab!.namespaceOf.get('alpha_two')).toBe('alpha');
    expect(vocab!.namespaceOf.get('beta_one')).toBe('beta');
    expect(vocab!.status).toBe('settled for the purposes of this test');
    expect(vocab!.isProvisional).toBe(false);
  });

  it('flags a stub list as provisional rather than swallowing the word', async () => {
    // Navcom publishes this deliberately instead of hiding it, so a consumer
    // that quietly treated it as settled would be discarding a stated caveat.
    const src = new NavcomVocabularySource(async () =>
      doc({ status: 'stub — needs local knowledge, and is deliberately not generated' }));
    expect((await src.get())!.isProvisional).toBe(true);
  });

  it('caches within the TTL and refetches after it', async () => {
    let clock = 1_000_000;
    const fetcher = vi.fn(async () => doc());
    const src = new NavcomVocabularySource(fetcher, () => clock);

    await src.get();
    await src.get();
    expect(fetcher).toHaveBeenCalledTimes(1);

    clock += CONTRACT_TTL_MS + 1;
    await src.get();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('takes the TTL from the contract rather than a local constant', async () => {
    // A number copied into a consumer drifts from the contract that owns it.
    let clock = 1_000_000;
    const fetcher = vi.fn(async () => doc({ cache: { ttl_seconds: 60, max_stale_seconds: 600 } }));
    const src = new NavcomVocabularySource(fetcher, () => clock);
    const vocab = await src.get();
    expect(vocab!.ttlMs).toBe(60_000);
    expect(vocab!.maxStaleMs).toBe(600_000);

    clock += 61_000;                 // past the stated TTL, not the default
    await src.get();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('refuses a TTL outside the bounds the contract itself states, and uses its own default', async () => {
    const src = new NavcomVocabularySource(async () => doc({ cache: { ttl_seconds: 30, ttl_seconds_min: 60, ttl_seconds_max: 86400 } }));
    expect((await src.get())!.ttlMs).toBe(CONTRACT_TTL_MS);
    const inBounds = new NavcomVocabularySource(async () => doc({ cache: { ttl_seconds: 120, ttl_seconds_min: 60, ttl_seconds_max: 86400 } }));
    expect((await inBounds.get())!.ttlMs).toBe(120_000);
  });

  it('refuses a non-positive TTL from the wire rather than honouring it', async () => {
    // ttl 0 would mean refetch on every call, which is a denial of service
    // against the publisher.
    const src = new NavcomVocabularySource(async () => doc({ cache: { ttl_seconds: 0 } }));
    expect((await src.get())!.ttlMs).toBe(CONTRACT_TTL_MS);
  });

  it('serves a stale list through a SHORT outage, rather than nothing', async () => {
    let clock = 1_000_000;
    let fail = false;
    const src = new NavcomVocabularySource(
      async () => { if (fail) throw new Error('relay unreachable'); return doc(); },
      () => clock,
    );
    await src.get();
    fail = true;
    clock += CONTRACT_TTL_MS + 1;

    // An hour-old list Navcom published beats no list: the alternative is
    // dropping valid observations because of a network failure.
    const vocab = await src.get();
    expect(vocab!.tags.has('alpha_one')).toBe(true);
    expect(src.error).toMatch(/relay unreachable/);
  });

  it('STOPS ENFORCING past the staleness ceiling, rather than serving it forever', async () => {
    /*
     * The divergence Navcom found. Serving a stale list through a short outage
     * is right; enforcing one indefinitely is not, because the published
     * vocabulary is a placeholder awaiting a human — so the day the real one
     * lands is the day a stale copy starts rejecting every valid observation,
     * silently, in the shape of malformed input.
     *
     * Degrade permissive, not restrictive. Null means "membership not checked"
     * and the adapter says so; a stale allowlist says nothing at all.
     */
    let clock = 1_000_000;
    let fail = false;
    const src = new NavcomVocabularySource(
      async () => { if (fail) throw new Error('offline'); return doc(); },
      () => clock,
    );
    await src.get();
    fail = true;

    clock += CONTRACT_TTL_MS + 1;                 // stale, still enforced
    expect(src.current).not.toBeNull();
    expect(await src.get()).not.toBeNull();

    clock += CONTRACT_MAX_STALE_MS;               // past the ceiling
    expect(src.current, 'a list this old must stop being enforced').toBeNull();
    expect(await src.get()).toBeNull();
  });

  it('returns null rather than an empty set for an unusable document', async () => {
    // The distinction matters at the drop site. Null means "membership not
    // checked" and the adapter says so; an empty set would mean "nothing is
    // permitted" and would reject every observation.
    for (const bad of [
      null, {}, { vocabulary: {} }, { vocabulary: { tags: 'x' } }, { vocabulary: { tags: [] } }, { vocabulary: { tags: {} } },
      { vocabulary: { tags: { alpha: 'alpha_one' } } }, { vocabulary: { tags: { alpha: ['Not A Member'] } } },
    ]) {
      const src = new NavcomVocabularySource(async () => bad);
      expect(await src.get(), JSON.stringify(bad)).toBeNull();
      expect(src.error).toBeTruthy();
    }
  });

  it('does not treat a network failure as an empty vocabulary', async () => {
    const src = new NavcomVocabularySource(async () => { throw new Error('offline'); });
    expect(await src.get()).toBeNull();
    expect(src.error).toBe('offline');
  });
});

describe('the list is not vendored into Starcom', () => {
  it('declares no local vocabulary list anywhere in the adapters directory', async () => {
    /*
     * Navcom asked that the members not be pinned or vendored into fixtures,
     * because a stale copy rejects the real list the day it lands and does it
     * in the shape of malformed input.
     *
     * The check is STRUCTURAL and names no member, because naming them here to
     * search for them would be the very thing it forbids — my first version of
     * this test spelled out two real tags and so vendored them itself. It looks
     * instead for the SHAPE of a vendored list: several namespace.value string
     * literals collected together in one declaration.
     */
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.resolve(__dirname, '..');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));

    // A quoted 'namespace.value' token, the shape a member takes.
    const MEMBER_LITERAL = /'[a-z][a-z0-9_]*\.[a-z0-9_]+'/g;

    for (const file of files) {
      const body = fs.readFileSync(path.join(dir, file), 'utf8');
      for (const decl of body.split(/\n\s*\n/)) {
        const hits = decl.match(MEMBER_LITERAL) ?? [];
        expect(
          hits.length,
          `${file} declares ${hits.length} vocabulary-shaped literals together `
          + `(${hits.slice(0, 4).join(', ')}) — the list is fetched, never pinned`,
        ).toBeLessThan(4);
      }
    }
  });
});
