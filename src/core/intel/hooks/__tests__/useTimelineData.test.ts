import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockGetTimelineData = vi.fn();
const mockGetTimelineStats = vi.fn();
const mockAddEvent = vi.fn();
const mockUpdateEvent = vi.fn();
const mockDeleteEvent = vi.fn();

vi.mock('../../adapters/timelineAdapter', () => ({
  timelineAdapter: {
    getTimelineData: (...args: unknown[]) => mockGetTimelineData(...args),
    getTimelineStats: (...args: unknown[]) => mockGetTimelineStats(...args),
    addEvent: (...args: unknown[]) => mockAddEvent(...args),
    updateEvent: (...args: unknown[]) => mockUpdateEvent(...args),
    deleteEvent: (...args: unknown[]) => mockDeleteEvent(...args),
    subscribeToUpdates: () => () => {}
  }
}));

import { useTimelineData } from '../useTimelineData';

describe('useTimelineData — persistence wiring', () => {
  beforeEach(() => {
    mockGetTimelineData.mockReset().mockResolvedValue({ items: [], groups: [] });
    mockGetTimelineStats.mockReset().mockResolvedValue({
      totalEvents: 0, eventsByType: {}, eventsByMonth: {},
      eventsImportance: { high: 0, medium: 0, low: 0 }
    });
    mockAddEvent.mockReset().mockResolvedValue('new-id');
    mockUpdateEvent.mockReset().mockResolvedValue(true);
    mockDeleteEvent.mockReset().mockResolvedValue(true);
  });

  it('reports a failed read as an error, not as an empty timeline', async () => {
    mockGetTimelineData.mockReset().mockRejectedValue(new Error('storage unavailable'));
    const { result } = renderHook(() => useTimelineData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('storage unavailable');
  });

  it('addEvent delegates straight to the adapter — every write through the unified substrate is real now, no separate persistence-options opt-in', async () => {
    const { result } = renderHook(() => useTimelineData());
    await waitFor(() => expect(mockGetTimelineData).toHaveBeenCalled());

    await act(async () => {
      await result.current.addEvent({ title: 'New Event' });
    });

    expect(mockAddEvent).toHaveBeenCalledWith({ title: 'New Event' });
  });

  it('updateEvent delegates straight to the adapter', async () => {
    const { result } = renderHook(() => useTimelineData());
    await waitFor(() => expect(mockGetTimelineData).toHaveBeenCalled());

    await act(async () => {
      await result.current.updateEvent('event-1', { title: 'Updated' });
    });

    expect(mockUpdateEvent).toHaveBeenCalledWith('event-1', { title: 'Updated' });
  });

  it('deleteEvent delegates straight to the adapter', async () => {
    const { result } = renderHook(() => useTimelineData());
    await waitFor(() => expect(mockGetTimelineData).toHaveBeenCalled());

    await act(async () => {
      await result.current.deleteEvent('event-1');
    });

    expect(mockDeleteEvent).toHaveBeenCalledWith('event-1');
  });
});
