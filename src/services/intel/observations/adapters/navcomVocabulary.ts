/**
 * The Navcom closed vocabulary, fetched — never pinned.
 *
 * Navcom's instruction, and the reasoning is theirs because it is their list:
 *
 *   "Fetch it at runtime. Do not pin it, and do not vendor it into fixtures.
 *    Read `vocabulary.status` before you trust the list — it currently reads
 *    'stub — needs local knowledge, and is deliberately not generated', and
 *    that is the honest state. These twenty are a placeholder awaiting a human
 *    with local knowledge, and they WILL change."
 *
 * The failure a pinned copy produces is the reason this file exists rather than
 * a constant: it would reject the real vocabulary the day it lands, and it
 * would fail in the worst available direction — valid field observations
 * dropped as unknown tags, looking exactly like malformed input. A stale
 * allowlist and a malicious event are indistinguishable at the drop site.
 *
 * So there is no copy of the twenty members anywhere in this repository, not
 * even in a test fixture. The tests here use invented tags precisely so that
 * nothing in Starcom encodes what Navcom's list currently says.
 */

/** Where the contract lives. Origin is configurable; the path is not. */
export const NAVCOM_WELL_KNOWN_PATH = '/.well-known/navcom-intel.json';

/**
 * Cache policy, as stated in the contract's own `vocabulary.cache` table.
 *
 * These are the values Navcom published, and they are read out of the fetched
 * document in preference to these constants — a number copied into a consumer
 * is a number that drifts from the contract that owns it. They exist as
 * fallbacks for a document that omits the table.
 */
export const CONTRACT_TTL_MS = 3600 * 1000;

/**
 * The ceiling past which a stale list stops being ENFORCED, not merely
 * refreshed. This is the divergence Navcom found in the first version of this
 * file, and their reasoning is the whole design:
 *
 *   "Past 24 hours, a stale list must stop being enforced entirely — because
 *    the real vocabulary is a placeholder awaiting a human, and the day it
 *    lands is exactly the day a stale copy starts rejecting every valid
 *    observation, silently, looking identical to malformed input.
 *    Degrade permissive, not restrictive. The visible error beats the
 *    invisible loss."
 *
 * Serving a stale list through a short outage is right; enforcing one
 * indefinitely converts a network problem into silent data loss.
 */
export const CONTRACT_MAX_STALE_MS = 86400 * 1000;

export interface NavcomVocabulary {
  /** Every member, bare, as an observation carries it on the wire. */
  tags: ReadonlySet<string>;
  /** The namespace each member is grouped under in the contract. */
  namespaceOf: ReadonlyMap<string, string>;
  /**
   * Navcom's own word for how much the list can be trusted. Carried rather
   * than interpreted — a consumer that silently swallowed "stub" would be
   * making a judgement Navcom deliberately published instead of hiding.
   */
  status: string;
  /** True when `status` says the list is a placeholder rather than settled. */
  isProvisional: boolean;
  fetchedAt: number;
  /** From `vocabulary.cache.ttl_seconds`, or the contract default. */
  ttlMs: number;
  /** From `vocabulary.cache.max_stale_seconds`, or the contract default. */
  maxStaleMs: number;
}

export interface VocabularyFetchResult {
  vocabulary: NavcomVocabulary | null;
  /** Present when nothing usable was obtained. Callers report, never invent. */
  error?: string;
}

/** Shape of the parts of navcom-intel.json this reads. */
interface WellKnownDocument {
  vocabulary?: {
    tags?: unknown;
    status?: unknown;
    cache?: CacheTable;
  };
}

interface CacheTable {
  ttl_seconds?: unknown;
  max_stale_seconds?: unknown;
  ttl_seconds_min?: unknown;
  ttl_seconds_max?: unknown;
}

/** A vocabulary member as it travels on the wire: bare, lower case, words joined by underscores. */
const MEMBER = /^[a-z][a-z0-9_]*$/;

function parseVocabulary(doc: unknown, now: number): VocabularyFetchResult {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { vocabulary: null, error: 'navcom-intel.json is not a JSON object' };
  }
  const vocab = (doc as WellKnownDocument).vocabulary;
  if (!vocab || typeof vocab !== 'object') {
    return { vocabulary: null, error: 'navcom-intel.json has no vocabulary object' };
  }
  const { tags, status } = vocab as { tags?: unknown; status?: unknown };
  /*
   * Members grouped by namespace, `Record<string, string[]>`, as NavCom
   * publishes them: "grouping is part of the contract a consumer already
   * receives". An observation carries the bare member; the namespace is known
   * only from here.
   */
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) {
    return { vocabulary: null, error: 'vocabulary.tags is not members grouped by namespace' };
  }
  const namespaceOf = new Map<string, string>();
  for (const [namespace, members] of Object.entries(tags as Record<string, unknown>)) {
    if (!Array.isArray(members) || members.some((m) => typeof m !== 'string' || !MEMBER.test(m))) {
      return { vocabulary: null, error: `vocabulary.tags.${namespace} is not a list of members` };
    }
    for (const member of members as string[]) namespaceOf.set(member, namespace);
  }
  if (namespaceOf.size === 0) {
    /*
     * An empty list is refused rather than treated as "nothing is allowed".
     * Accepting it would drop every observation, which is the same wrong
     * direction a pinned copy fails in.
     */
    return { vocabulary: null, error: 'vocabulary.tags is empty' };
  }

  const statusText = typeof status === 'string' ? status : '(no status stated)';
  const cache = (vocab as { cache?: CacheTable }).cache;
  // A positive finite number or nothing. A zero or negative TTL from the wire
  // would mean "refetch every call", which is a denial of service against the
  // publisher, so it falls back rather than being honoured.
  const seconds = (v: unknown, fallbackMs: number) =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v * 1000 : fallbackMs;
  // NavCom bounds its own TTL, and says what to do outside them: "refuse the
  // value and use your own default. A ttl outside these bounds is a defect in
  // this document, not an instruction."
  const bound = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const [lo, hi] = [bound(cache?.ttl_seconds_min), bound(cache?.ttl_seconds_max)];
  const ttl = bound(cache?.ttl_seconds);
  const ttlInBounds = ttl === undefined || ((lo === undefined || ttl >= lo) && (hi === undefined || ttl <= hi));

  return {
    vocabulary: {
      tags: new Set(namespaceOf.keys()),
      namespaceOf,
      status: statusText,
      // Substring rather than equality: Navcom writes prose here, and the
      // current value is a sentence beginning "stub — ...".
      isProvisional: /\bstub\b|\bprovisional\b|\bdraft\b/i.test(statusText),
      fetchedAt: now,
      ttlMs: ttlInBounds ? seconds(cache?.ttl_seconds, CONTRACT_TTL_MS) : CONTRACT_TTL_MS,
      maxStaleMs: seconds(cache?.max_stale_seconds, CONTRACT_MAX_STALE_MS),
    },
  };
}

/**
 * Fetches and caches the vocabulary.
 *
 * The fetcher is injected rather than calling `fetch` directly, for the same
 * reason the signature verifier is: so this is testable without a network and
 * so a caller whose transport differs is not forced through a global.
 */
export class NavcomVocabularySource {
  private cached: NavcomVocabulary | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly fetchDocument: () => Promise<unknown>,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * True when the cached list is past the contract's staleness ceiling.
   *
   * Beyond it the list is not merely old, it is no longer trustworthy as an
   * allowlist: the published vocabulary is a placeholder awaiting a human, so
   * the day the real one lands is the day a stale copy begins rejecting every
   * valid observation — silently, and in the shape of malformed input.
   */
  private isUnenforceable(vocab: NavcomVocabulary, now: number): boolean {
    return now - vocab.fetchedAt > vocab.maxStaleMs;
  }

  /**
   * The current vocabulary, refetching when the cache has expired.
   *
   * Returns null when nothing usable has ever been obtained. It does NOT
   * substitute an empty set, because the adapter's behaviour on null (validate
   * shape, and say in the drop reason that membership was not checked) is
   * honest, while its behaviour on an empty set would be to reject everything.
   */
  async get(): Promise<NavcomVocabulary | null> {
    const now = this.now();
    if (this.cached && now - this.cached.fetchedAt < this.cached.ttlMs) return this.cached;

    let doc: unknown;
    try {
      doc = await this.fetchDocument();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      /*
       * Serve a stale copy through a SHORT outage — an hour-old list Navcom
       * published is better evidence than none, and the alternative is
       * dropping observations because of a network failure.
       *
       * But only up to the ceiling. Past `max_stale_seconds` this returns
       * null, which the adapter treats as "membership not checked" and says so
       * in its drop reasons. Degrade permissive, not restrictive: a visible
       * unchecked-membership note beats invisible loss of every valid
       * observation.
       */
      return this.current;
    }

    const result = parseVocabulary(doc, now);
    if (!result.vocabulary) {
      this.lastError = result.error ?? 'vocabulary could not be parsed';
      return this.current;
    }
    this.lastError = null;
    this.cached = result.vocabulary;
    return this.cached;
  }

  /**
   * The cached vocabulary, without fetching.
   *
   * `SourceAdapter.toObservations` is synchronous, so the adapter reads this
   * while refresh happens on its own cadence. Null before the first successful
   * fetch, which the adapter reports as "membership not checked" rather than
   * treating as an empty allowlist.
   */
  get current(): NavcomVocabulary | null {
    if (!this.cached) return null;
    return this.isUnenforceable(this.cached, this.now()) ? null : this.cached;
  }

  /** Why the last fetch produced nothing, for reporting rather than guessing. */
  get error(): string | null {
    return this.lastError;
  }
}
