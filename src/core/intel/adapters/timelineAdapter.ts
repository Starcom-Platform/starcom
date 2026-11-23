/**
 * TimelineAdapter - Adapter for Timeline visualization
 *
 * Backed by the unified Intel substrate (services/intel/IntelWorkspaceManager)
 * instead of core/intel's storageOrchestrator/intelDataStore. Timeline events
 * are IntelItemUI records using the eventDate/eventEndDate/isEstimated/
 * importance/relatedIds fields added to that type specifically for this
 * migration — a timeline event IS an intel item that happens to represent
 * something that occurred at a particular time.
 *
 * Public API (types and method signatures) is unchanged from the previous
 * storageOrchestrator-backed version, so useTimelineData.ts and
 * TimeScrubber.tsx/TimelineView.tsx need no changes.
 */

import { EventType } from '../types/intelDataModels';
import { intelWorkspaceManager } from '../../../services/intel/IntelWorkspaceManager';
import type { IntelItemUI, CreateIntelItemInput } from '../../../types/intel/IntelItemUI';
import { enhancedEventEmitter } from '../events/enhancedEventEmitter';
import { timelineStats } from '../utils/timelineSummary';

// Types for Timeline visualization (unchanged)
export interface TimelineItem {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime?: Date;
  group?: string;
  type: string;
  importance: number;
  isEstimated: boolean;
  relatedIds: string[];
  color?: string;
  icon?: string;
  location?: {
    description?: string;
    coordinates?: [number, number]; // [longitude, latitude]
  };
  metadata: Record<string, any>;
  tags: string[];
}

export interface TimelineGroup {
  id: string;
  title: string;
  color?: string;
}

export interface TimelineData {
  items: TimelineItem[];
  groups: TimelineGroup[];
  pagination?: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface TimelineFilter {
  property: string;
  operator: 'equals' | 'contains' | 'before' | 'after' | 'between' | 'gte' | 'lte';
  value: any;
}

export interface TimelineStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsByMonth: Record<string, number>;
  eventsImportance: {
    high: number;
    medium: number;
    low: number;
  };
}

/**
 * Timeline adapter class, backed by the unified Intel substrate.
 */
export class TimelineAdapter {
  /**
   * Fetch timeline data based on filters
   */
  async getTimelineData(
    filters?: TimelineFilter[],
    options?: {
      sort?: { field: string; direction: 'asc' | 'desc' };
      pagination?: { page: number; pageSize: number }
    }
  ): Promise<TimelineData> {
    try {
      await intelWorkspaceManager.ensureInitialized();

      // Only items that actually represent a dated event belong on the
      // timeline — an IntelItemUI without an eventDate isn't one.
      let events = intelWorkspaceManager.getIntelItems().filter(item => !!item.eventDate);

      if (filters && filters.length > 0) {
        events = events.filter(event => this.matchesTimelineFilters(event, filters));
      }

      // Sort — defaults to eventDate ascending, matching the previous
      // createQueryOptions() default of sortBy: 'startDate'.
      const sortField = options?.sort?.field || 'eventDate';
      const sortDirection = options?.sort?.direction || 'asc';
      events = [...events].sort((a, b) => {
        const av = (a as unknown as Record<string, unknown>)[sortField];
        const bv = (b as unknown as Record<string, unknown>)[sortField];
        const cmp = String(av ?? '').localeCompare(String(bv ?? ''));
        return sortDirection === 'asc' ? cmp : -cmp;
      });

      const timelineItems = events.map(event => this.transformItemToTimelineItem(event));

      const groupMap = new Map<string, TimelineGroup>();
      events.forEach(event => {
        if (event.type && !groupMap.has(event.type)) {
          groupMap.set(event.type, {
            id: event.type,
            title: this.formatEventType(event.type),
            color: this.getEventTypeColor(event.type)
          });
        }
      });

      const response: TimelineData = {
        items: timelineItems,
        groups: Array.from(groupMap.values())
      };

      if (options?.pagination) {
        const { page, pageSize } = options.pagination;
        const start = (page - 1) * pageSize;
        response.items = timelineItems.slice(start, start + pageSize);
        response.pagination = {
          total: events.length,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(events.length / pageSize))
        };
      }

      return response;
    } catch (error) {
      // Rethrown, not swallowed. An empty list here rendered a failed read as
      // "no intel events" with advice to ingest data; useTimelineData reports it.
      console.error('Error in getTimelineData:', error);
      throw error;
    }
  }

  /**
   * Get statistics about the timeline events
   */
  async getTimelineStats(filters?: TimelineFilter[]): Promise<TimelineStats> {
    try {
      const timelineData = await this.getTimelineData(filters);
      // The same counts useTimelineData gives every view, from the same function.
      return timelineStats(timelineData.items);
    } catch (error) {
      // Rethrown for the same reason: zero events is a claim, and after a failed
      // read nobody knows how many there are.
      console.error('Error in getTimelineStats:', error);
      throw error;
    }
  }

  /**
   * Add an event to the timeline. `options` is accepted for backward
   * compatibility with callers built against the storageOrchestrator-era
   * signature (persistenceMode etc.) but is no longer a "persist or not"
   * switch — every write through this adapter is real and persisted now,
   * there's no separate ephemeral in-memory path to opt out into.
   */
  async addEvent(eventData: Partial<TimelineEventInput>): Promise<string | null> {
    try {
      await intelWorkspaceManager.ensureInitialized();
      if (!eventData.startDate) {
        console.error('Error adding timeline event: startDate is required');
        return null;
      }
      const input: CreateIntelItemInput = {
        title: eventData.title || 'Untitled Event',
        type: eventData.eventType || EventType.CUSTOM,
        source: eventData.source || 'timeline',
        reliability: 'F',
        confidence: 0.5,
        tags: eventData.tags || [],
        categories: [],
        latitude: eventData.location?.latitude,
        longitude: eventData.location?.longitude,
        content: eventData.description || '',
        verified: false
      };
      const created = intelWorkspaceManager.addIntelItem(input);
      // Carry over the fields CreateIntelItemInput doesn't accept directly.
      const withEventFields: IntelItemUI = {
        ...created,
        eventDate: eventData.startDate,
        eventEndDate: eventData.endDate,
        isEstimated: eventData.isEstimated ?? false,
        importance: eventData.importance ?? 50,
        relatedIds: eventData.relatedEntities || []
      };
      intelWorkspaceManager.updateIntelItem(withEventFields);

      enhancedEventEmitter.emit('timeline:event:created', { event: withEventFields });
      return created.id;
    } catch (error) {
      console.error('Error adding timeline event:', error);
      return null;
    }
  }

  /**
   * Update an event in the timeline
   */
  async updateEvent(id: string, updates: Partial<TimelineEventInput>): Promise<boolean> {
    try {
      await intelWorkspaceManager.ensureInitialized();
      const existing = intelWorkspaceManager.getIntelItem(id);
      if (!existing) return false;

      const updated: IntelItemUI = {
        ...existing,
        title: updates.title ?? existing.title,
        type: updates.eventType ?? existing.type,
        tags: updates.tags ?? existing.tags,
        content: updates.description ?? existing.content,
        latitude: updates.location?.latitude ?? existing.latitude,
        longitude: updates.location?.longitude ?? existing.longitude,
        eventDate: updates.startDate ?? existing.eventDate,
        eventEndDate: updates.endDate ?? existing.eventEndDate,
        isEstimated: updates.isEstimated ?? existing.isEstimated,
        importance: updates.importance ?? existing.importance,
        relatedIds: updates.relatedEntities ?? existing.relatedIds
      };
      intelWorkspaceManager.updateIntelItem(updated);
      enhancedEventEmitter.emit('timeline:event:updated', { event: updated });
      return true;
    } catch (error) {
      console.error('Error updating timeline event:', error);
      return false;
    }
  }

  /**
   * Delete an event from the timeline.
   *
   * NOTE: same honest limitation as nodeWebAdapter.deleteNode() —
   * IntelWorkspaceManager doesn't yet support removing an intel item
   * outright (items are currently append/update-oriented). Marks the item
   * as excluded from the timeline (clears eventDate, the field
   * getTimelineData() filters on) rather than silently no-op-ing or
   * pretending to delete something that's still there.
   */
  async deleteEvent(id: string): Promise<boolean> {
    try {
      await intelWorkspaceManager.ensureInitialized();
      const existing = intelWorkspaceManager.getIntelItem(id);
      if (!existing) return false;
      intelWorkspaceManager.updateIntelItem({ ...existing, eventDate: undefined });
      enhancedEventEmitter.emit('timeline:event:deleted', { id });
      return true;
    } catch (error) {
      console.error('Error deleting timeline event:', error);
      return false;
    }
  }

  /**
   * Transform an IntelItemUI (with event fields set) to TimelineItem format
   */
  private transformItemToTimelineItem(event: IntelItemUI): TimelineItem {
    return {
      id: event.id,
      title: event.title || '',
      description: event.content,
      startTime: new Date(event.eventDate!),
      endTime: event.eventEndDate ? new Date(event.eventEndDate) : undefined,
      group: event.type,
      type: event.type,
      importance: event.importance ?? 50,
      isEstimated: event.isEstimated ?? false,
      relatedIds: event.relatedIds || [],
      color: this.getEventTypeColor(event.type),
      icon: this.getEventTypeIcon(event.type),
      location: (event.latitude !== undefined && event.longitude !== undefined) ? {
        coordinates: [event.longitude, event.latitude]
      } : undefined,
      metadata: {},
      tags: event.tags || []
    };
  }

  /**
   * Evaluate a single TimelineFilter against a timeline-item property value.
   */
  private evaluateTimelineFilter(value: unknown, filter: TimelineFilter): boolean {
    switch (filter.operator) {
      case 'equals': return value === filter.value;
      case 'contains': return typeof value === 'string' && value.includes(String(filter.value));
      case 'before': return typeof value === 'string' && new Date(value) < new Date(filter.value);
      case 'after': return typeof value === 'string' && new Date(value) > new Date(filter.value);
      case 'gte': return typeof value === 'string' && new Date(value) >= new Date(filter.value);
      case 'lte': return typeof value === 'string' && new Date(value) <= new Date(filter.value);
      case 'between': {
        if (!Array.isArray(filter.value) || filter.value.length < 2 || typeof value !== 'string') return false;
        const d = new Date(value);
        return d >= new Date(filter.value[0]) && d <= new Date(filter.value[1]);
      }
      default: return true;
    }
  }

  private matchesTimelineFilters(event: IntelItemUI, filters: TimelineFilter[]): boolean {
    // Filters written against the old TimelineEvent shape used 'startDate';
    // the unified item stores this as 'eventDate' — alias it so existing
    // filter definitions built by callers keep working.
    return filters.every(filter => {
      const property = filter.property === 'startDate' ? 'eventDate' : filter.property;
      const value = (event as unknown as Record<string, unknown>)[property];
      return this.evaluateTimelineFilter(value, filter);
    });
  }

  private formatEventType(type: string): string {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private getEventTypeColor(type: string): string {
    const colorMap: Record<string, string> = {
      [EventType.INCIDENT]: '#e74c3c',
      [EventType.ATTACK]: '#c0392b',
      [EventType.DETECTION]: '#3498db',
      [EventType.COMMUNICATION]: '#2980b9',
      [EventType.ACCESS]: '#9b59b6',
      [EventType.MODIFICATION]: '#8e44ad',
      [EventType.CREATION]: '#2ecc71',
      [EventType.DELETION]: '#e67e22',
      [EventType.RECONNAISSANCE]: '#f1c40f',
      [EventType.EXFILTRATION]: '#d35400',
      [EventType.MITIGATION]: '#27ae60',
      [EventType.CUSTOM]: '#7f8c8d'
    };
    return colorMap[type] || '#7f8c8d';
  }

  private getEventTypeIcon(type: string): string {
    const iconMap: Record<string, string> = {
      [EventType.INCIDENT]: 'error',
      [EventType.ATTACK]: 'warning',
      [EventType.DETECTION]: 'search',
      [EventType.COMMUNICATION]: 'message',
      [EventType.ACCESS]: 'login',
      [EventType.MODIFICATION]: 'edit',
      [EventType.CREATION]: 'add_circle',
      [EventType.DELETION]: 'delete',
      [EventType.RECONNAISSANCE]: 'visibility',
      [EventType.EXFILTRATION]: 'cloud_download',
      [EventType.MITIGATION]: 'security',
      [EventType.CUSTOM]: 'more_horiz'
    };
    return iconMap[type] || 'event';
  }

  /**
   * Calls back whenever the intel items the timeline reads may have changed, by
   * any path: this adapter, ingest, the workspace console, the sample data.
   * Returns the unsubscribe.
   *
   * It listened only for this adapter's own timeline:event:* emits, so an item
   * dated by any other path went unheard (decision D-E: every view hears about
   * new events). Nothing called it until useTimelineData.
   */
  subscribeToUpdates(callback: () => void): () => void {
    const unsubscribe = intelWorkspaceManager.subscribe(() => callback());
    return () => {
      unsubscribe();
    };
  }

  /**
   * Add multiple events, rolling back (best-effort) any already-created
   * ones if a later one fails. IntelWorkspaceManager doesn't yet have a
   * transaction primitive — storageOrchestrator's version applied to a pure
   * in-memory store in the old implementation, so real atomicity wasn't
   * actually guaranteed before this either.
   */
  async addEventsInTransaction(events: Partial<TimelineEventInput>[]): Promise<string[]> {
    const eventIds: string[] = [];
    try {
      for (const eventData of events) {
        const id = await this.addEvent(eventData);
        if (!id) {
          throw new Error(`Failed to create event: ${eventData.title || '(untitled)'}`);
        }
        eventIds.push(id);
      }
      return eventIds;
    } catch (error) {
      for (const id of eventIds) {
        await this.deleteEvent(id);
      }
      console.error('Error in batch event creation:', error);
      throw error;
    }
  }
}

/** Input shape for addEvent/updateEvent, matching the fields core/intel's TimelineEvent used to carry. */
export interface TimelineEventInput {
  title: string;
  description?: string;
  eventType: string;
  startDate: string;
  endDate?: string;
  isEstimated?: boolean;
  location?: { latitude?: number; longitude?: number };
  relatedEntities?: string[];
  importance?: number;
  tags?: string[];
  source?: string;
}

// Export a singleton instance
export const timelineAdapter = new TimelineAdapter();
