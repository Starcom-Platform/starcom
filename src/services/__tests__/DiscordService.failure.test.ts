/**
 * A Discord request that fails says it failed (plan item 4.5). The service
 * answered every failure with a server of nobody online, so the Community menu
 * read "Discord: 0 online" with Discord unreachable: a measured-looking zero
 * that nothing measured.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DiscordService } from '../DiscordService';

describe('DiscordService.getServerStats', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rejects when Discord cannot be reached, rather than reporting nobody online', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(DiscordService.getServerStats()).rejects.toThrow();
  });

  it('rejects when Discord answers with an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503, statusText: 'Unavailable' }));
    await expect(DiscordService.getServerStats()).rejects.toThrow(/503/);
  });

  it('gives the count Discord gives', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'x', name: 'S', instant_invite: '', channels: [], members: [], presence_count: 7 }), { status: 200 }));
    await expect(DiscordService.getServerStats()).resolves.toMatchObject({ presence_count: 7 });
  });
});
