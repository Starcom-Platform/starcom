// @vitest-environment node
/**
 * Test files on the node environment have no `window`, and Node 22 has a real
 * WebSocket of its own: the block has to replace the global itself.
 */
import { describe, expect, it } from 'vitest';
import { refusedSocketUrls } from '../blockPublicSockets';

describe('test WebSockets reach only this machine, on the node environment too', () => {
  it('refuses a public relay', async () => {
    expect(typeof window).toBe('undefined');
    expect((globalThis.WebSocket as unknown as { refusesPublicHosts?: boolean }).refusesPublicHosts).toBe(true);
    const url = 'wss://relay.example.invalid/';
    const ws = new WebSocket(url);
    const failed = await new Promise<boolean>((resolve) => { ws.onerror = () => resolve(true); ws.onopen = () => resolve(false); });
    expect(failed).toBe(true);
    expect(refusedSocketUrls).toContain(url);
  });
});
