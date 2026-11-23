#!/usr/bin/env node
/**
 * Minimal NIP-01 relay, for local federation testing.
 *
 * It exists so two Starcom instances can be proven to federate over the real
 * protocol without publishing test findings to public relays. Littering
 * someone else's infrastructure with fixture data would be a poor way for a
 * project about contributing to a commons to test itself.
 *
 * Implements only what the Phase 3 gate needs: EVENT, REQ with kind/since
 * filters, EOSE, CLOSE, and parameterized-replaceable semantics for the
 * 30000-39999 range — which findings depend on, since a retraction replaces
 * the claim it withdraws in the same slot.
 *
 * NOT a real relay: no persistence, no auth, no rate limiting, no NIP-11, and
 * no signature verification. It is deliberately credulous, which makes it a
 * BETTER test target — an instance must reject a bad finding on its own
 * judgement rather than because the relay did it first.
 *
 * Usage: node scripts/dev-relay.mjs [port]
 */
import { WebSocketServer } from 'ws';

const port = Number(process.argv[2] ?? 7447);
const events = [];
const subscriptions = new Map(); // ws -> Map<subId, filters[]>

const isReplaceable = (kind) => kind >= 30000 && kind < 40000;
const dTag = (event) => event.tags?.find((t) => t[0] === 'd')?.[1] ?? '';

function matches(event, filter) {
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (filter.since && event.created_at < filter.since) return false;
  if (filter.until && event.created_at > filter.until) return false;
  if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
  if (filter.ids && !filter.ids.includes(event.id)) return false;
  for (const [key, values] of Object.entries(filter)) {
    if (!key.startsWith('#')) continue;
    const tagName = key.slice(1);
    const present = event.tags?.filter((t) => t[0] === tagName).map((t) => t[1]) ?? [];
    if (!present.some((v) => values.includes(v))) return false;
  }
  return true;
}

function store(event) {
  if (isReplaceable(event.kind)) {
    // Latest per (pubkey, kind, d) wins — the mechanism retraction relies on.
    const i = events.findIndex(
      (e) => e.kind === event.kind && e.pubkey === event.pubkey && dTag(e) === dTag(event),
    );
    if (i >= 0) {
      if (events[i].created_at > event.created_at) return false;
      events[i] = event;
      return true;
    }
  }
  events.push(event);
  return true;
}

const wss = new WebSocketServer({ port });
console.log(`dev-relay listening on ws://localhost:${port}`);

wss.on('connection', (ws) => {
  subscriptions.set(ws, new Map());

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const [type] = msg;

    if (type === 'EVENT') {
      const event = msg[1];
      const stored = store(event);
      ws.send(JSON.stringify(['OK', event.id, true, '']));
      if (!stored) return;
      // Fan out to every matching live subscription, including other clients.
      for (const [client, subs] of subscriptions) {
        if (client.readyState !== client.OPEN) continue;
        for (const [subId, filters] of subs) {
          if (filters.some((f) => matches(event, f))) {
            client.send(JSON.stringify(['EVENT', subId, event]));
          }
        }
      }
      return;
    }

    if (type === 'REQ') {
      const [, subId, ...filters] = msg;
      subscriptions.get(ws).set(subId, filters);
      for (const event of events) {
        if (filters.some((f) => matches(event, f))) {
          ws.send(JSON.stringify(['EVENT', subId, event]));
        }
      }
      ws.send(JSON.stringify(['EOSE', subId]));
      return;
    }

    if (type === 'CLOSE') {
      subscriptions.get(ws)?.delete(msg[1]);
    }
  });

  ws.on('close', () => subscriptions.delete(ws));
});
