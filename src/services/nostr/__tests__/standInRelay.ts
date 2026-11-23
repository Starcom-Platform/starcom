/**
 * A relay on this machine that speaks NIP-01 and NIP-42, for tests that need
 * the conversation on the wire. Node only: it listens on a real port.
 */
import { createServer, request } from 'node:http';
import { WebSocketServer } from 'ws';
import { verifyEvent, finalizeEvent, getPublicKey, type Event } from 'nostr-tools';
import { validateEvent as validateHttpAuth } from 'nostr-tools/nip98';

export interface StandIn {
  url: string;
  /** The challenge sent on each connection, in order. */
  challenges: string[];
  /** Every sign-in the relay received. */
  signIns: Event[];
  /** What it holds and serves to whoever may read. */
  held: Event[];
  /** Every subscription a client closed (CLOSE), by id. */
  closes: string[];
  /** Ends every open connection, as a relay restart would. */
  dropConnections(): void;
  /** The relay's own key (its NIP-11 `self`), when it has one. */
  relayPubkey?: string;
  /** Who the relay has let in through NIP-43 join requests. */
  members: string[];
  /** NIP-86 state: allowed keys, banned keys and live claims. */
  allowed: string[];
  banned: string[];
  claims: string[];
  /** Every NIP-86 call received, with who signed it. */
  managementCalls: Array<{ method: string; params: unknown[]; by: string }>;
}

let challengeCount = 0;
const running: Array<{ stop: () => Promise<void> }> = [];

export async function standInRelay(options: {
  /** Refuses reads and writes ("auth-required") until a sign-in is accepted. */
  requiresSignIn: boolean;
  /** Whether a validly signed-in key is let in. Everyone, unless given. */
  admits?: (pubkey: string) => boolean;
  /**
   * Takes any valid sign-in, then refuses reads and writes from a key that is
   * not a member ("restricted"), as zooid does: a key this says is a member,
   * or one that joined, was allowed, or manages the relay. A join request is
   * still taken from anyone signed in. Unset, a signed-in key may do both.
   */
  members?: (pubkey: string) => boolean;
  /** Never sends a sign-in challenge (NIP-42), as a relay that asks nobody. */
  asksNoSignIn?: boolean;
  /** Answers no read and no write at all, as a relay that hangs. */
  answersNothing?: boolean;
  /** Refuses every read and write with these words, as a relay that is failing. */
  refusesWith?: string;
  held?: Event[];
  /** Serves a NIP-11 document over HTTP on the same address. */
  nip11?: { name?: string; supported_nips?: number[]; self?: string | null; pubkey?: string | null };
  /**
   * Accepts NIP-43 join requests (kind 28934) carrying one of these claims, and
   * keeps a kind 13534 member list signed with the relay's own key.
   */
  claims?: string[];
  /** The relay's own secret key; one is made when NIP-11 or claims are asked for. */
  relaySecret?: Uint8Array;
  /** Publishes no member list, as a relay may. */
  noMemberList?: boolean;
  /** Accepts a join request but leaves the member list as it was. */
  forgetsMembers?: boolean;
  /**
   * Answers NIP-86 management calls, signed with NIP-98, from these keys only.
   * Allowed and banned keys and claims are kept on the StandIn.
   */
  admins?: string[];
  /** Also answers zooid's `listmethodassignees`: the admins, each with its methods. */
  listsAssignees?: boolean;
}): Promise<StandIn> {
  const relaySecret = options.relaySecret ?? (options.nip11 || options.claims ? new Uint8Array(32).map(() => Math.floor(Math.random() * 256)) : undefined);
  const relayPubkey = relaySecret ? getPublicKey(relaySecret) : undefined;
  const http = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'POST' && options.admins) {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => { void (async () => {
        const auth = String(req.headers.authorization ?? '');
        const reply = (status: number, json?: unknown) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(json === undefined ? '' : JSON.stringify(json)); };
        let event: Event;
        try { event = JSON.parse(Buffer.from(auth.replace(/^Nostr /, ''), 'base64').toString('utf8')); } catch { return reply(401); }
        const call = JSON.parse(body || '{}') as { method: string; params: unknown[] };
        const signedFor = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
        const valid = verifyEvent(event) && await validateHttpAuth(event, signedFor, 'POST', call).catch(() => false);
        if (!valid || !options.admins!.includes(event.pubkey)) return reply(401);
        relay.managementCalls.push({ method: call.method, params: call.params, by: event.pubkey });
        const [first] = call.params as string[];
        const drop = (list: string[], v: string) => list.splice(0, list.length, ...list.filter((x) => x !== v));
        switch (call.method) {
          case 'supportedmethods': return reply(200, { result: ['allowpubkey', 'unallowpubkey', 'banpubkey', 'listallowedpubkeys', 'listbannedpubkeys', 'createclaim', 'deleteclaim', 'listclaims', ...(options.listsAssignees ? ['listmethodassignees'] : [])] });
          case 'listmethodassignees':
            if (!options.listsAssignees) return reply(200, { error: 'listmethodassignees is not supported' });
            return reply(200, { result: options.admins!.map((pubkey) => ({ pubkey, methods: ['allowpubkey', 'unallowpubkey', 'createclaim'] })) });
          case 'allowpubkey':
            // An allowed key is a member (NIP-43), and the signed list says so.
            if (!relay.allowed.includes(first)) relay.allowed.push(first);
            if (!relay.members.includes(first)) relay.members.push(first);
            publishMemberList();
            return reply(200, { result: true });
          case 'unallowpubkey': drop(relay.allowed, first); drop(relay.members, first); publishMemberList(); return reply(200, { result: true });
          case 'banpubkey': if (!relay.banned.includes(first)) relay.banned.push(first); drop(relay.allowed, first); drop(relay.members, first); publishMemberList(); return reply(200, { result: true });
          case 'listallowedpubkeys': return reply(200, { result: relay.allowed.map((pubkey) => ({ pubkey })) });
          case 'listbannedpubkeys': return reply(200, { result: relay.banned.map((pubkey) => ({ pubkey })) });
          case 'createclaim': relay.claims.push(first); return reply(200, { result: true });
          case 'deleteclaim': drop(relay.claims, first); return reply(200, { result: true });
          case 'listclaims': return reply(200, { result: [...relay.claims] });
          default: return reply(200, { error: `${call.method} is not supported` });
        }
      })(); });
      return;
    }
    if (options.nip11 && req.headers.accept?.includes('application/nostr+json')) {
      res.setHeader('Content-Type', 'application/nostr+json');
      // What a test gives wins, so a relay can also describe itself without its keys.
      res.end(JSON.stringify({ name: 'Stand-in relay', supported_nips: [1, 11, 42], self: relayPubkey, pubkey: relayPubkey, ...options.nip11 }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  const wss = new WebSocketServer({ server: http });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', () => resolve()));
  const url = `ws://127.0.0.1:${(http.address() as { port: number }).port}`;
  const relay: StandIn = {
    url,
    challenges: [],
    signIns: [],
    held: [...(options.held ?? [])],
    closes: [],
    dropConnections: () => { for (const socket of wss.clients) socket.terminate(); },
    relayPubkey,
    members: [],
    allowed: [],
    banned: [],
    claims: [...(options.claims ?? [])],
    managementCalls: [],
  };
  const publishMemberList = () => {
    if (!relaySecret || options.noMemberList) return;
    relay.held = relay.held.filter((e) => e.kind !== 13534);
    relay.held.push(finalizeEvent({
      kind: 13534, created_at: Math.floor(Date.now() / 1000), content: '',
      tags: [['-'], ...relay.members.map((m) => ['member', m])],
    }, relaySecret));
  };

  wss.on('connection', (socket) => {
    const challenge = `challenge-${++challengeCount}`;
    relay.challenges.push(challenge);
    let reader: string | null = null;
    const send = (message: unknown[]) => socket.send(JSON.stringify(message));
    if (!options.asksNoSignIn) send(['AUTH', challenge]);
    const outsider = () => reader !== null && options.members !== undefined
      && !(options.members(reader) || relay.members.includes(reader) || relay.allowed.includes(reader) || (options.admins ?? []).includes(reader));

    socket.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      if (message[0] === 'AUTH') {
        const signIn = message[1] as Event;
        relay.signIns.push(signIn);
        const tag = (name: string) => signIn.tags.find((t) => t[0] === name)?.[1];
        const valid = verifyEvent(signIn) && signIn.kind === 22242
          && tag('challenge') === challenge && tag('relay')?.replace(/\/+$/, '') === url;
        const admitted = valid && (options.admits?.(signIn.pubkey) ?? true);
        if (admitted) reader = signIn.pubkey;
        send(['OK', signIn.id, admitted, admitted ? '' : valid ? 'restricted: not a member of this relay' : 'invalid: bad sign-in']);
      } else if (options.answersNothing && (message[0] === 'REQ' || message[0] === 'EVENT')) {
        return;
      } else if (options.refusesWith && message[0] === 'REQ') {
        return send(['CLOSED', message[1], options.refusesWith]);
      } else if (options.refusesWith && message[0] === 'EVENT') {
        return send(['OK', (message[1] as Event).id, false, options.refusesWith]);
      } else if (message[0] === 'REQ') {
        if (options.requiresSignIn && !reader) return send(['CLOSED', message[1], 'auth-required: sign in to read']);
        if (outsider()) return send(['CLOSED', message[1], 'restricted: you are not a member of this relay']);
        for (const event of relay.held) send(['EVENT', message[1], event]);
        send(['EOSE', message[1]]);
      } else if (message[0] === 'CLOSE') {
        relay.closes.push(message[1]);
      } else if (message[0] === 'EVENT') {
        const event = message[1] as Event;
        // NIP-70: a protected event is taken only from its signed-in author.
        const isProtected = event.tags.some((t) => t[0] === '-');
        if ((options.requiresSignIn || isProtected) && !reader) return send(['OK', event.id, false, 'auth-required: sign in to write']);
        if (isProtected && reader !== event.pubkey) return send(['OK', event.id, false, 'restricted: only its author may post a protected event']);
        if (event.kind === 28934) {
          const claim = event.tags.find((t) => t[0] === 'claim')?.[1];
          if (!claim || !relay.claims.includes(claim)) return send(['OK', event.id, false, 'restricted: that is an invalid invite code.']);
          if (relay.members.includes(event.pubkey)) return send(['OK', event.id, true, 'duplicate: you are already a member of this relay.']);
          if (!options.forgetsMembers) relay.members.push(event.pubkey);
          publishMemberList();
          return send(['OK', event.id, true, `info: welcome to ${url}!`]);
        }
        if (outsider()) return send(['OK', event.id, false, 'restricted: you are not a member of this relay']);
        relay.held.push(event);
        send(['OK', event.id, true, '']);
      }
    });
  });

  publishMemberList();
  running.push({
    stop: () => new Promise<void>((resolve) => {
      for (const socket of wss.clients) socket.terminate();
      wss.close(() => http.close(() => resolve()));
    }),
  });
  return relay;
}

/** Stops every stand-in relay started so far. */
export async function stopStandInRelays(): Promise<void> {
  await Promise.all(running.splice(0).map((r) => r.stop()));
}

/**
 * A fetch for this machine only, for reading a stand-in relay's NIP-11
 * document: the test setup replaces fetch with a mock, and these tests must
 * reach 127.0.0.1 and nothing else. Refuses any other host.
 */
export function localFetch(input: string | URL, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<Response> {
  const url = new URL(String(input));
  if (url.hostname !== '127.0.0.1') return Promise.reject(new Error(`localFetch reaches 127.0.0.1 only, not ${url.hostname}`));
  return new Promise((resolve, reject) => {
    const req = request(url, { method: init?.method ?? 'GET', headers: init?.headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({
        ok: (res.statusCode ?? 500) < 400,
        status: res.statusCode ?? 500,
        json: async () => JSON.parse(body),
        text: async () => body,
      } as Response));
    });
    req.on('error', reject);
    if (init?.body) req.write(init.body);
    req.end();
  });
}
