import { SimplePool, type Event, type EventTemplate, type Filter, type VerifiedEvent } from 'nostr-tools';
import type { SubCloser, SubscribeManyParams } from 'nostr-tools/abstract-pool';
import type { AbstractRelay } from 'nostr-tools/abstract-relay';
import { normalizeURL } from 'nostr-tools/utils';
import { hasJoined, relayMirrors } from './publishTargets';
import { retiredKey } from './publisherKeys';
import { mjNoteShown } from '../../legal/noteLicence';
/**
 * Every relay connection Starcom opens goes through here (plan item 0.3).
 *
 * ─── WHY ───────────────────────────────────────────────────────────────────
 *
 * Starcom opened eleven relay pools with no options and answered no sign-in
 * challenge (NIP-42). A relay with access control, the kind a team runs behind
 * its tunnel, therefore refused everything Starcom sent it.
 *
 * ─── WHAT A POOL FROM HERE DOES ────────────────────────────────────────────
 *
 *   - Signs in when a relay the person has JOINED says a read or a write needs
 *     it ("auth-required"), then tries that read or write again. A sign-in
 *     tells a relay who is reading, so a relay nobody joined is never signed in
 *     to, whatever it asks. Each connection has its own challenge, so a
 *     reconnect signs in again.
 *   - Signs in as the identity already here and never creates one. Nobody asked
 *     for the sign-in in person, and code that runs on its own may use an
 *     identity but must not make one.
 *   - Pings, so a tunnel does not drop a quiet connection, and a dead one is
 *     noticed instead of waited on.
 *   - Never closes a connection for being idle. nostr-tools 2.25 does after 20
 *     seconds, going by its count of open subscriptions. A subscription closed
 *     twice (by the relay, then by its owner) is counted twice, and the timer
 *     then closes the connection under a live one. Measured on 2.25.2.
 *   - Waits 4.4 seconds for a connection, as nostr-tools 2.16 did, so the
 *     upgrade does not quietly change which relays count as reachable.
 *   - Closes a relay without sending on the socket it is closing. nostr-tools
 *     sends CLOSE for each open subscription after the socket has begun to
 *     close: the "WebSocket is already in CLOSING or CLOSED state" errors seen
 *     while building plan item 0.1, one per relay.
 *
 *   - Reads a relay's read-only mirror in its place when the relay does not
 *     answer: The Record's, blackpi (decision D-MX, MX27). Only a read: a write,
 *     or a check of a relay's own connection, sees the relay as it is, and the
 *     mirror refuses writes anyway.
 *
 * It does not answer a challenge before a read or a write needs it, although
 * nostr-tools can (`automaticallyAuth`). When a relay turns such a sign-in
 * down, the library rethrows the refusal where nothing can catch it. Signing in
 * for a read or a write hands the refusal to that read or write, which can say
 * so.
 */

type SignIn = (template: EventTemplate) => Promise<VerifiedEvent>;

/** How long a write waits on a sign-in: long enough for a person to answer an extension's prompt. */
const SIGN_IN_WAIT_MS = 30_000;
/** nostr-tools 2.16's wait for a connection. 2.25 waits 3 seconds. */
const CONNECTION_WAIT_MS = 4_400;

/** What signing in needs from the identity: whether there is one, and a signature that never creates one. */
export interface RelaySignInIdentity {
  hasExtension(): boolean;
  getPubkey(): string | null;
  signWithExisting(event: EventTemplate): Promise<Event>;
}

let signingIdentity: RelaySignInIdentity | null = null;

/**
 * Who signs in, set once by the identity service as it loads. It is handed
 * over rather than imported because the identity service reaches nostrService,
 * which builds its pool here: importing it back would make a cycle, and a
 * cycle breaks at load in whichever order the bundle happens to meet them.
 * Until it is set, nothing is signed in to.
 */
export function signInToRelaysAs(identity: RelaySignInIdentity): void {
  signingIdentity = identity;
}

/**
 * The sign-in, when there is an identity to sign it with; null when there is
 * none, because an automatic path may use an identity and must not create one.
 */
function signInAsYou(): SignIn | null {
  const identity = signingIdentity;
  if (!identity || (!identity.hasExtension() && !identity.getPubkey())) return null;
  return (template) => identity.signWithExisting(template) as Promise<VerifiedEvent>;
}

export interface RelayPoolOptions {
  /** How long a write to a joined relay waits for its sign-in before giving up on that relay. */
  signInWaitMs?: number;
  /** Read-only mirrors, by the relay they mirror. The app's own, unless given. */
  mirrors?: Readonly<Record<string, readonly string[]>>;
}

type RelayPoolClass = new (signInWaitMs: number, mirrors: Readonly<Record<string, readonly string[]>>) => SimplePool;
let relayPoolClass: RelayPoolClass | undefined;

/**
 * Defined on first use rather than on import, so that importing a service does
 * not reach for SimplePool before anything has asked for a connection.
 */
function poolClass(): RelayPoolClass {
  if (relayPoolClass) return relayPoolClass;

  class RelayPool extends SimplePool {
    /** Each relay's read-only mirrors, by its normalised address. */
    private readonly mirrors: Map<string, string[]>;
    /**
     * What nostr-tools is connecting for: it asks allowConnectingToRelay with
     * the operation, then calls ensureRelay, in one synchronous step, so the
     * answer belongs to the very next connection asked for.
     */
    private connectingFor: 'read' | 'write' | null = null;

    constructor(private readonly signInWaitMs: number, mirrors: Readonly<Record<string, readonly string[]>>) {
      super({ enablePing: true });
      this.idleTimeout = 0;
      this.maxWaitForConnection = CONNECTION_WAIT_MS;
      this.mirrors = new Map(Object.entries(mirrors).map(([url, copies]) => [normalizeURL(url), copies.map(normalizeURL)]));
      this.allowConnectingToRelay = (_url, [operation]) => {
        this.connectingFor = operation;
        return true;
      };
    }

    /**
     * A relay's connection, or for a read its mirror's when the relay does not
     * answer (D-MX, MX27). A write never falls back, and neither does a call
     * made directly, such as a check of whether the relay itself is up.
     */
    override async ensureRelay(url: string, params?: { connectionTimeout?: number; abort?: AbortSignal }): Promise<AbstractRelay> {
      const reading = this.connectingFor === 'read';
      this.connectingFor = null;
      try {
        return await super.ensureRelay(url, params);
      } catch (error) {
        if (!reading) throw error;
        for (const mirror of this.mirrors.get(normalizeURL(url)) ?? []) {
          try {
            return await super.ensureRelay(mirror, params);
          } catch {
            // The next mirror, or the relay's own failure.
          }
        }
        throw error;
      }
    }

    // subscribe, subscribeMany, subscribeEose, querySync and get all come here.
    override subscribeMap(requests: Array<{ url: string; filter: Filter }>, given: SubscribeManyParams): SubCloser {
      // Nothing signed by a retired key reaches any reader (MX31): an exposed key, once its publisher's next speaks.
      const params: SubscribeManyParams = given.onevent
        // In the commercial build, one of Mecha Jono's notes reaches no reader unless its licence allows it (D-CS, CS6).
        ? { ...given, onevent: (event) => { if (!retiredKey(event.pubkey, Math.floor(Date.now() / 1000)) && mjNoteShown(event)) given.onevent!(event); } }
        : given;
      const joined = params.onauth ? [] : requests.filter((r) => hasJoined(r.url));
      const signIn = joined.length > 0 ? signInAsYou() : null;
      if (!signIn) return super.subscribeMap(requests, params);
      if (joined.length === requests.length) return super.subscribeMap(requests, { ...params, onauth: signIn });
      return this.subscribeInTwo(joined, requests.filter((r) => !hasJoined(r.url)), params, signIn);
    }

    /**
     * One read across joined and other relays, reported as one: a single end of
     * stored events, a single close carrying every relay's reason, and no event
     * delivered twice.
     */
    private subscribeInTwo(
      joined: Array<{ url: string; filter: Filter }>,
      others: Array<{ url: string; filter: Filter }>,
      params: SubscribeManyParams,
      signIn: SignIn,
    ): SubCloser {
      const seen = new Set<string>();
      const reasons: Array<{ url: string; reason: string }> = [];
      let ended = 0;
      let closed = 0;
      const part = (requests: Array<{ url: string; filter: Filter }>, extra: Partial<SubscribeManyParams>) =>
        super.subscribeMap(requests, {
          ...params,
          ...extra,
          alreadyHaveEvent: (id) => {
            if (params.alreadyHaveEvent?.(id) || seen.has(id)) return true;
            seen.add(id);
            return false;
          },
          oneose: () => { if (++ended === 2) params.oneose?.(); },
          onclose: (partReasons) => {
            reasons.push(...partReasons);
            if (++closed === 2) params.onclose?.(reasons);
          },
        });
      const signedIn = part(joined, { onauth: signIn });
      const plain = part(others, {});
      return {
        close: (reason) => {
          signedIn.close(reason);
          plain.close(reason);
        },
      };
    }

    override publish(...args: Parameters<SimplePool['publish']>): Promise<string>[] {
      const [relays, event, params] = args;
      const joinedAt: number[] = [];
      const otherAt: number[] = [];
      relays.forEach((url, i) => (hasJoined(url) ? joinedAt : otherAt).push(i));
      const signIn = !params?.onauth && joinedAt.length > 0 ? signInAsYou() : null;
      if (!signIn) return super.publish(...args);

      const signedIn = super.publish(joinedAt.map((i) => relays[i]), event, { ...params, onauth: signIn });
      const plain = otherAt.length > 0 ? super.publish(otherAt.map((i) => relays[i]), event, params) : [];
      // Each relay's result stays at its own place in the list.
      const results: Promise<string>[] = new Array(relays.length);
      joinedAt.forEach((i, k) => { results[i] = this.givingUpOnSignIn(signedIn[k], relays[i]); });
      otherAt.forEach((i, k) => { results[i] = plain[k]; });
      return results;
    }

    /**
     * nostr-tools' relay close() sends CLOSE for each open subscription, then
     * closes the socket before those sends run, so each lands on a closing
     * socket: a browser logs one error per subscription. Closing the socket ends
     * the subscriptions anyway, so they are marked closed first and nothing is
     * sent. Their readers are still told.
     */
    override close(relays: string[]): void {
      // A relay's mirror, read in its place, closes with it.
      const closing = relays.flatMap((url) => [normalizeURL(url), ...(this.mirrors.get(normalizeURL(url)) ?? [])]);
      for (const url of closing) this.endSubscriptionsQuietly(url);
      super.close(closing);
    }

    override destroy(): void {
      // A pool built on a test's stand-in SimplePool has no relay map.
      for (const url of this.relays?.keys() ?? []) this.endSubscriptionsQuietly(url);
      super.destroy();
    }

    private endSubscriptionsQuietly(url: string): void {
      for (const sub of this.relays?.get(url)?.openSubs.values() ?? []) sub.closed = true;
    }

    /**
     * nostr-tools waits forever on a sign-in whose signer refuses, as it does
     * when a person declines an extension's prompt. A write does not.
     */
    private givingUpOnSignIn(write: Promise<string>, url: string): Promise<string> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const giveUp = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`The sign-in to ${url} did not finish, so that relay has not accepted it.`)), this.signInWaitMs);
      });
      return Promise.race([write, giveUp]).finally(() => clearTimeout(timer));
    }
  }

  relayPoolClass = RelayPool;
  return relayPoolClass;
}

/** A relay pool for any part of Starcom that reads from or writes to relays. */
export function createRelayPool(options: RelayPoolOptions = {}): SimplePool {
  const RelayPool = poolClass();
  return new RelayPool(options.signInWaitMs ?? SIGN_IN_WAIT_MS, options.mirrors ?? relayMirrors());
}

