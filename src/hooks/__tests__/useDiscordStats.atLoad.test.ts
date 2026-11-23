/**
 * Discord's "high activity" notice is for the online count crossing 50 between two
 * fetches. It also fired on the first fetch whenever 50 or more were online, which
 * would put a toast on the globe at page load.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const doubles = vi.hoisted(() => ({
  getServerStats: vi.fn(),
  showHighActivity: vi.fn(),
  showMemberJoined: vi.fn(),
}));
vi.mock('../../services/pollerRegistry', () => ({
  pollerRegistry: { register: () => ({ stop: () => {} }), stop: () => {} },
}));
vi.mock('../../services/DiscordService', () => ({ DiscordService: { getServerStats: doubles.getServerStats } }));
vi.mock('../../utils/discordNotifications', () => ({
  DiscordNotifications: { showHighActivity: doubles.showHighActivity, showMemberJoined: doubles.showMemberJoined },
}));

import { useDiscordStats } from '../useDiscordStats';

const online = (count: number) => ({ presence_count: count, members: [] });

describe('useDiscordStats: the high activity notice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is not raised by the first fetch, however many are online', async () => {
    doubles.getServerStats.mockResolvedValueOnce(online(60));
    const { result } = renderHook(() => useDiscordStats({ autoRefresh: false }));

    await act(async () => { await result.current.refresh(); });

    expect(result.current.onlineCount).toBe(60);
    expect(doubles.showHighActivity).not.toHaveBeenCalled();
  });

  it('is raised when the count crosses 50 between two fetches', async () => {
    doubles.getServerStats.mockResolvedValueOnce(online(49)).mockResolvedValueOnce(online(51));
    const { result } = renderHook(() => useDiscordStats({ autoRefresh: false }));

    await act(async () => { await result.current.refresh(); });
    await act(async () => { await result.current.refresh(); });

    expect(doubles.showHighActivity).toHaveBeenCalledTimes(1);
    expect(doubles.showHighActivity).toHaveBeenCalledWith(51);
  });

  it('is not raised again while the count stays at 50 or more', async () => {
    doubles.getServerStats.mockResolvedValueOnce(online(49)).mockResolvedValueOnce(online(51)).mockResolvedValueOnce(online(55));
    const { result } = renderHook(() => useDiscordStats({ autoRefresh: false }));

    for (let fetch = 0; fetch < 3; fetch += 1) {
      await act(async () => { await result.current.refresh(); });
    }

    expect(doubles.showHighActivity).toHaveBeenCalledTimes(1);
  });
});
