/**
 * No test reaches a public relay (blockPublicSockets.ts). A chat test
 * published a prekey bundle to relay.primal.net on every run of the suite.
 *
 * The addresses here are under `.invalid`, which never resolves: if the guard
 * were gone, these tests would fail on what the guard records, and still reach
 * nobody.
 */
import { describe, expect, it } from 'vitest';
import { Relay } from 'nostr-tools/relay';
import { guardWebSocket, refusedSocketUrls } from '../blockPublicSockets';

describe('test WebSockets reach only this machine', () => {
  it('is installed for every test file', () => {
    expect((globalThis.WebSocket as unknown as { refusesPublicHosts?: boolean }).refusesPublicHosts).toBe(true);
  });

  it('refuses a public relay as an unreachable host: an error, a close, never an open', async () => {
    const url = 'wss://relay.example.invalid/';
    const events: string[] = [];
    const ws = new WebSocket(url);
    ws.onopen = () => events.push('open');
    ws.onerror = () => events.push('error');
    ws.onclose = (ev) => events.push(`close ${(ev as CloseEvent).code}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(['error', 'close 1006']);
    expect(ws.readyState).toBe(WebSocket.CLOSED);
    expect(() => ws.send('["EVENT",{}]')).toThrow();
    expect(refusedSocketUrls).toContain(url);
  });

  it("refuses nostr-tools' relays too, which capture WebSocket when they load", async () => {
    const url = 'wss://nostr.example.invalid/';
    await expect(Relay.connect(url)).rejects.toBeTruthy();
    expect(refusedSocketUrls).toContain(url);
  });

  it('passes a local address to the real implementation', () => {
    const made: string[] = [];
    class Original { constructor(public url: string) { made.push(url); } }
    const Guarded = guardWebSocket(Original as unknown as typeof WebSocket);
    expect(new Guarded('ws://127.0.0.1:7777')).toBeInstanceOf(Original);
    expect(new Guarded('ws://localhost:7777/')).toBeInstanceOf(Original);
    expect(new Guarded('wss://relay.example.invalid')).not.toBeInstanceOf(Original);
    expect(new Guarded('wss://localhost.example.invalid')).not.toBeInstanceOf(Original);
    expect(made).toEqual(['ws://127.0.0.1:7777', 'ws://localhost:7777/']);
  });

  it('keeps the methods of a subclass of it, on a local address', () => {
    // relayConformance.ts extends the global WebSocket so that a second close()
    // cannot recurse in Node. Built as a function that returned the original's
    // socket, the guard dropped the subclass's close(), and the recursion it
    // exists to stop overflowed the stack in the suite.
    class Original { constructor(public url: string) {} close() { return 'original'; } }
    const Guarded = guardWebSocket(Original as unknown as typeof WebSocket);
    class ClosesOnce extends Guarded { close() { return 'subclass'; } }
    const socket = new ClosesOnce('ws://127.0.0.1:9') as unknown as { close: () => string };
    expect(socket).toBeInstanceOf(Original);
    expect(socket.close()).toBe('subclass');
  });
});
