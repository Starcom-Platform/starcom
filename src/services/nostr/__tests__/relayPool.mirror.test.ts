/**
 * The Record's read-only mirror (decision D-MX, MX27): a read falls back to it
 * when The Record does not answer, and only then. A write never does, and a
 * check of The Record's own connection still sees The Record.
 *
 * Real sockets against stand-in relays on this machine. Each connection to a
 * stand-in is challenged once, so its challenges count its connections.
 *
 * @vitest-environment node
 */
import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { finalizeEvent, generateSecretKey, type Event, type SimplePool } from 'nostr-tools';
import { normalizeURL } from 'nostr-tools/utils';
import { WebSocket as NodeSocket } from 'ws';
import { createRelayPool } from '../relayPool';
import { standInRelay, stopStandInRelays } from './standInRelay';
import { THE_RECORD_RELAY, THE_RECORD_MIRROR } from '../../../config/publicInfrastructure';

const author = generateSecretKey();
const note = (content: string): Event =>
  finalizeEvent({ kind: 1, created_at: Math.floor(Date.now() / 1000), tags: [], content }, author);
/**
 * A relay that does not answer, as The Record looks when its machine is down
 * behind Cloudflare: the WebSocket upgrade is refused with a 502.
 */
let downServer: Server;
let DOWN = '';
beforeAll(async () => {
  downServer = createServer((_req, res) => { res.writeHead(502); res.end(); });
  downServer.on('upgrade', (_req, socket) => socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n'));
  await new Promise<void>((resolve) => downServer.listen(0, '127.0.0.1', resolve));
  DOWN = `ws://127.0.0.1:${(downServer.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => downServer.close(() => resolve())));

const pools: SimplePool[] = [];
const pool = (mirrors: Record<string, string[]>) => {
  const created = createRelayPool({ mirrors });
  /*
   * The `ws` package's socket, which fails a refused connection as a browser
   * does. Node's own (undici) answers nostr-tools' close() on a connection
   * that just failed with another error event, and the two trade them until
   * the stack overflows; a browser closes once.
   */
  (created as unknown as { _WebSocket: unknown })._WebSocket = NodeSocket;
  pools.push(created);
  return created;
};
const read = async (from: SimplePool, relays: string[]) =>
  (await from.querySync(relays, { kinds: [1] }, { maxWait: 3000 })).map((e) => e.content);
const connected = (from: SimplePool) => [...(from as unknown as { relays: Map<string, unknown> }).relays.keys()];

afterEach(async () => {
  pools.splice(0).forEach((p) => p.destroy());
  await stopStandInRelays();
});

describe("The Record's mirror", () => {
  it("is read in The Record's place when The Record does not answer", async () => {
    const mirror = await standInRelay({ requiresSignIn: false, held: [note('from the mirror')] });
    expect(await read(pool({ [DOWN]: [mirror.url] }), [DOWN])).toEqual(['from the mirror']);
  });

  it('is never asked while The Record answers', async () => {
    const record = await standInRelay({ requiresSignIn: false, held: [note('from The Record')] });
    const mirror = await standInRelay({ requiresSignIn: false, held: [note('from the mirror')] });
    expect(await read(pool({ [record.url]: [mirror.url] }), [record.url])).toEqual(['from The Record']);
    expect(mirror.challenges).toEqual([]);
  });

  it('is never written to, even when The Record does not answer', async () => {
    const mirror = await standInRelay({ requiresSignIn: false });
    const [sent] = pool({ [DOWN]: [mirror.url] }).publish([DOWN], note('a write'));
    await expect(sent).rejects.toBeDefined();
    expect(mirror.challenges).toEqual([]);
    expect(mirror.held).toEqual([]);
  });

  it("leaves a check of The Record's own connection to The Record, even after a read used the mirror", async () => {
    const mirror = await standInRelay({ requiresSignIn: false, held: [note('from the mirror')] });
    const checking = pool({ [DOWN]: [mirror.url] });
    await expect(checking.ensureRelay(DOWN)).rejects.toBeDefined();
    expect(mirror.challenges).toEqual([]);
    expect(await read(checking, [DOWN])).toEqual(['from the mirror']);
    await expect(checking.ensureRelay(DOWN)).rejects.toBeDefined();
  });

  it("is the app's own, by default: The Record's is blackpi", () => {
    const own = createRelayPool();
    pools.push(own);
    const mirrors = (own as unknown as { mirrors: Map<string, string[]> }).mirrors;
    expect(mirrors.get(normalizeURL(THE_RECORD_RELAY))).toEqual([normalizeURL(THE_RECORD_MIRROR)]);
  });

  it('is closed with The Record', async () => {
    const mirror = await standInRelay({ requiresSignIn: false, held: [note('from the mirror')] });
    const reading = pool({ [DOWN]: [mirror.url] });
    await read(reading, [DOWN]);
    expect(connected(reading)).toContain(normalizeURL(mirror.url));
    reading.close([DOWN]);
    expect(connected(reading)).not.toContain(normalizeURL(mirror.url));
  });
});
