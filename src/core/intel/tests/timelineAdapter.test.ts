/**
 * Unit tests for TimelineAdapter, backed by the unified Intel substrate
 * (IntelWorkspaceManager) instead of storageOrchestrator/intelDataStore.
 * Timeline events are IntelItemUI records with eventDate set — an item
 * without eventDate simply isn't a timeline event.
 */
import { timelineAdapter } from '../adapters/timelineAdapter';
import type { IntelItemUI } from '../../../types/intel/IntelItemUI';
import { vi } from 'vitest';

const { ensureInitialized, getIntelItems, getIntelItem, addIntelItem, updateIntelItem, subscribe, emit, on } = vi.hoisted(() => ({
  ensureInitialized: vi.fn(),
  getIntelItems: vi.fn(),
  getIntelItem: vi.fn(),
  addIntelItem: vi.fn(),
  updateIntelItem: vi.fn(),
  emit: vi.fn(),
  on: vi.fn(() => ({ unsubscribe: vi.fn() })),
  subscribe: vi.fn()
}));

vi.mock('../../../services/intel/IntelWorkspaceManager', () => ({
  intelWorkspaceManager: { ensureInitialized, getIntelItems, getIntelItem, addIntelItem, updateIntelItem, subscribe }
}));

vi.mock('../events/enhancedEventEmitter', () => ({
  enhancedEventEmitter: { emit, on }
}));

function makeItem(overrides: Partial<IntelItemUI> = {}): IntelItemUI {
  return {
    id: '1', title: 'Test Event 1', type: 'ATTACK',
    source: 'test-source', reliability: 'B', confidence: 0.9, tags: ['attack', 'test'],
    categories: [], content: 'Test Description 1', createdAt: new Date('2025-07-01T09:00:00Z'),
    updatedAt: new Date('2025-07-01T09:00:00Z'), verified: true,
    eventDate: '2025-07-01T10:00:00Z', eventEndDate: '2025-07-01T11:00:00Z',
    isEstimated: false, importance: 80, relatedIds: ['entity1', 'entity2'],
    ...overrides
  };
}

describe('TimelineAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureInitialized.mockResolvedValue(undefined);
  });

  describe('subscribeToUpdates', () => {
    it('calls back on any change the workspace reports, not only writes through this adapter', () => {
      const stop = vi.fn();
      subscribe.mockReturnValue(stop);
      const callback = vi.fn();

      const unsubscribe = timelineAdapter.subscribeToUpdates(callback);
      // An item dated by ingest or the workspace console reaches the workspace, not this adapter.
      subscribe.mock.calls[0][0]();
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();
      expect(stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTimelineData', () => {
    it('should transform IntelItemUI records with an eventDate into TimelineItems', async () => {
      const items = [
        makeItem({ id: '1', eventDate: '2025-07-01T10:00:00Z' }),
        makeItem({
          id: '2', title: 'Test Event 2', type: 'DETECTION', eventDate: '2025-07-02T10:00:00Z',
          eventEndDate: undefined, isEstimated: true, importance: 60, relatedIds: ['entity3']
        })
      ];
      getIntelItems.mockReturnValue(items);

      const result = await timelineAdapter.getTimelineData();

      expect(result.items.length).toBe(2);
      expect(result.groups.length).toBe(2);
      expect(result.items[0].id).toBe('1');
      expect(result.items[0].title).toBe('Test Event 1');
      expect(result.items[0].startTime).toEqual(new Date('2025-07-01T10:00:00Z'));
      expect(result.items[0].endTime).toEqual(new Date('2025-07-01T11:00:00Z'));
      expect(result.items[0].group).toBe('ATTACK');
      expect(result.items[0].importance).toBe(80);

      expect(result.items[1].id).toBe('2');
      expect(result.items[1].isEstimated).toBe(true);
      expect(result.items[1].endTime).toBeUndefined();

      expect(result.groups[0].id).toBe('ATTACK');
      expect(result.groups[1].id).toBe('DETECTION');
    });

    it('excludes IntelItemUI records with no eventDate — those are not timeline events', async () => {
      getIntelItems.mockReturnValue([
        makeItem({ id: '1', eventDate: '2025-07-01T10:00:00Z' }),
        makeItem({ id: '2', eventDate: undefined })
      ]);

      const result = await timelineAdapter.getTimelineData();
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('1');
    });

    it('should apply filters in-memory, aliasing legacy "startDate" to the real eventDate field', async () => {
      const filters = [
        { property: 'startDate', operator: 'after' as const, value: '2025-07-01' }
      ];
      getIntelItems.mockReturnValue([
        makeItem({ id: '1', eventDate: '2025-07-05T10:00:00Z' }),
        makeItem({ id: '2', eventDate: '2025-06-01T10:00:00Z' })
      ]);

      const result = await timelineAdapter.getTimelineData(filters);
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe('1');
    });

    it('reports a storage failure instead of returning an empty timeline', async () => {
      // An empty result is indistinguishable from "no dated items", which is how
      // a failed read used to reach the screen as "no intel events".
      getIntelItems.mockImplementation(() => { throw new Error('storage unavailable'); });
      await expect(timelineAdapter.getTimelineData()).rejects.toThrow('storage unavailable');
      await expect(timelineAdapter.getTimelineStats()).rejects.toThrow('storage unavailable');
    });

    it('supports sorting and pagination', async () => {
      const items = Array.from({ length: 10 }, (_, i) =>
        makeItem({ id: String(i), eventDate: `2025-07-${String(i + 1).padStart(2, '0')}T00:00:00Z`, importance: 90 - i * 5 })
      );
      getIntelItems.mockReturnValue(items);

      const result = await timelineAdapter.getTimelineData([], {
        sort: { field: 'importance', direction: 'desc' },
        pagination: { page: 1, pageSize: 5 }
      });

      expect(result.items).toHaveLength(5);
      expect(result.items[0].importance).toBe(90);
      expect(result.pagination).toEqual({ total: 10, page: 1, pageSize: 5, totalPages: 2 });
    });
  });

  describe('addEvent', () => {
    it('creates a real, persisted timeline event', async () => {
      addIntelItem.mockReturnValue(makeItem({ id: 'new-id', eventDate: undefined }));

      const result = await timelineAdapter.addEvent({
        title: 'New Event', description: 'New Description', eventType: 'INCIDENT',
        startDate: '2025-07-03T10:00:00Z', isEstimated: false, importance: 90
      });

      expect(addIntelItem).toHaveBeenCalledWith(expect.objectContaining({ title: 'New Event', type: 'INCIDENT' }));
      expect(updateIntelItem).toHaveBeenCalledWith(expect.objectContaining({
        id: 'new-id', eventDate: '2025-07-03T10:00:00Z', importance: 90
      }));
      expect(result).toBe('new-id');
      expect(emit).toHaveBeenCalledWith('timeline:event:created', expect.any(Object));
    });

    it('refuses to create an event with no startDate', async () => {
      const result = await timelineAdapter.addEvent({ title: 'No Date' });
      expect(result).toBeNull();
      expect(addIntelItem).not.toHaveBeenCalled();
    });
  });

  describe('updateEvent', () => {
    it('updates an existing timeline event', async () => {
      getIntelItem.mockReturnValue(makeItem({ id: '1' }));

      const result = await timelineAdapter.updateEvent('1', { title: 'Updated Title', importance: 95 });

      expect(updateIntelItem).toHaveBeenCalledWith(expect.objectContaining({ title: 'Updated Title', importance: 95 }));
      expect(result).toBe(true);
    });

    it('returns false for an id that does not exist', async () => {
      getIntelItem.mockReturnValue(null);
      const result = await timelineAdapter.updateEvent('missing', { title: 'x' });
      expect(result).toBe(false);
    });
  });

  describe('deleteEvent', () => {
    it('clears eventDate so the item drops off the timeline (honest limitation: items cannot yet be removed outright)', async () => {
      getIntelItem.mockReturnValue(makeItem({ id: '1' }));

      const result = await timelineAdapter.deleteEvent('1');

      expect(updateIntelItem).toHaveBeenCalledWith(expect.objectContaining({ id: '1', eventDate: undefined }));
      expect(result).toBe(true);
      expect(emit).toHaveBeenCalledWith('timeline:event:deleted', { id: '1' });
    });
  });

  describe('addEventsInTransaction', () => {
    it('creates every event and returns their ids', async () => {
      addIntelItem
        .mockReturnValueOnce(makeItem({ id: 'a', eventDate: undefined }))
        .mockReturnValueOnce(makeItem({ id: 'b', eventDate: undefined }));

      const ids = await timelineAdapter.addEventsInTransaction([
        { title: 'Event 1', eventType: 'INCIDENT', startDate: '2025-07-01T00:00:00Z' },
        { title: 'Event 2', eventType: 'INCIDENT', startDate: '2025-07-02T00:00:00Z' }
      ]);

      expect(ids).toEqual(['a', 'b']);
    });

    it('rolls back (deletes) already-created events if a later one fails', async () => {
      addIntelItem.mockReturnValueOnce(makeItem({ id: 'a', eventDate: undefined }));
      getIntelItem.mockReturnValue(makeItem({ id: 'a' }));

      await expect(timelineAdapter.addEventsInTransaction([
        { title: 'Event 1', eventType: 'INCIDENT', startDate: '2025-07-01T00:00:00Z' },
        { title: 'Event 2 (no startDate)', eventType: 'INCIDENT' } // missing startDate -> addEvent returns null -> throws
      ])).rejects.toThrow();

      // The first event's id ('a') should have been rolled back via deleteEvent.
      expect(updateIntelItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', eventDate: undefined }));
    });
  });
});
