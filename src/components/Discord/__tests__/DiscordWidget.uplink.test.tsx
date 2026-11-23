/**
 * The Discord widget's uplink light says what Discord answered (plan item 8.3b).
 *
 * When the request failed, the widget filled in a stand-in server ("Discord
 * Server (Widget Disabled)", 0 online), and the light read the stand-in's
 * count: "Discord Uplink Online", in green, for a request that had failed. A
 * request that threw left the header saying ONLINE.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import DiscordWidget from '../DiscordWidget';

const answer = (ok: boolean, status: number, body: unknown = {}) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok, status, json: async () => body } as Response);
const open = () => render(<DiscordWidget isOpen onClose={() => {}} />);

describe('DiscordWidget, its uplink light', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is not online when Discord refuses, and invents no server', async () => {
    answer(false, 503);
    open();
    await waitFor(() => expect(screen.getByText('Discord unavailable (HTTP 503)')).toBeTruthy());
    expect(screen.queryByText(/Uplink Online/i)).toBeNull();
    expect(screen.queryByText('ONLINE')).toBeNull();
    expect(screen.queryByText(/Widget Disabled/i)).toBeNull();
  });

  it('is not online when the request never reaches Discord', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    open();
    await waitFor(() => expect(screen.getByText('Discord unavailable (no answer)')).toBeTruthy());
    expect(screen.queryByText('ONLINE')).toBeNull();
  });

  it('is not online when the answer cannot be read', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token'); } } as unknown as Response);
    open();
    await waitFor(() => expect(screen.getByText('Discord unavailable (unreadable answer)')).toBeTruthy());
    expect(screen.queryByText('ONLINE')).toBeNull();
  });

  it('is online when Discord answers', async () => {
    answer(true, 200, { name: 'Starcom', instant_invite: '', channels: [], members: [], presence_count: 4 });
    open();
    await waitFor(() => expect(screen.getByText('Discord Uplink Online')).toBeTruthy());
    expect(screen.getByText('ONLINE')).toBeTruthy();
  });

  it('says it is checking while it waits, and nothing else', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => {}));
    open();
    expect(screen.getByText('Checking Discord…')).toBeTruthy();
    expect(screen.queryByText(/Uplink (Online|Offline)|unavailable/)).toBeNull();
  });
});
