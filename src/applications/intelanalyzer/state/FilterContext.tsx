import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { useTemporalStateOptional } from '../../../context/TemporalContext';

/**
 * Filter Context for Analysis Workbench
 *
 * Manages filters applied across views.
 * Based on data-models.md filters.
 */

export interface FilterState {
  timeRange?: {
    start: Date;
    end: Date;
  };
  tags?: string[];
  entityRefs?: string[];
  categories?: string[];
  confidence?: { min: number; max: number };
  geo?: { polygon: [number, number][] };
  // Add more as per data-models.md
}

interface FilterContextType {
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  updateFilter: (key: keyof FilterState, value: unknown) => void;
  clearFilters: () => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

interface FilterProviderProps {
  children: ReactNode;
}

/**
 * The time range is the shared window (decision D-E, settled 2026-09-14 for step
 * 8, docs/missions/01-architecture-decisions/time-model.md). While the shared
 * time is paused, its window is the range every view here filters by; a range
 * chosen here sets that window, paused at its end, and clearing it returns to
 * live. It was the analyzer's own filter, so the analyzer and the globe could
 * show different stretches of time with nothing to say so. Without a shared
 * time state, as when a view is rendered on its own, the range stays local.
 */
export const FilterProvider: React.FC<FilterProviderProps> = ({ children }) => {
  const temporal = useTemporalStateOptional();
  const shared = temporal !== null;
  const sharedWindow = temporal?.timeWindow ?? null;
  const sharedIsLive = temporal?.isLive ?? true;
  const sharedMoment = temporal?.currentTime;
  const setTimeWindow = temporal?.setTimeWindow;
  const setIsLive = temporal?.setIsLive;
  const [localFilters, setLocalFilters] = useState<FilterState>({});

  const setSharedRange = useCallback((range: FilterState['timeRange']) => {
    if (!setTimeWindow || !setIsLive) return;
    if (!range) {
      if (!sharedIsLive) setIsLive(true);
      return;
    }
    const start = Math.min(range.start.getTime(), range.end.getTime());
    const end = Math.max(range.start.getTime(), range.end.getTime());
    // Already the window, so a view that sends the same range again from an effect
    // re-renders nothing and cannot loop.
    const already = !sharedIsLive && (start === end
      ? sharedMoment === start
      : sharedWindow !== null && sharedWindow.start.getTime() === start && sharedWindow.end.getTime() === end);
    if (!already) setTimeWindow(start, end);
  }, [setTimeWindow, setIsLive, sharedIsLive, sharedMoment, sharedWindow]);

  const updateFilter = useCallback((key: keyof FilterState, value: unknown) => {
    if (key === 'timeRange' && shared) {
      setSharedRange(value as FilterState['timeRange']);
      return;
    }
    setLocalFilters(prev => ({
      ...prev,
      [key]: value
    }));
  }, [shared, setSharedRange]);

  // Restoring saved filters (a board, a saved view, a deep link) restores their
  // range too: none returns to live.
  const setFilters = useCallback((next: FilterState) => {
    if (!shared) {
      setLocalFilters(next);
      return;
    }
    const { timeRange, ...rest } = next;
    setLocalFilters(rest);
    setSharedRange(timeRange);
  }, [shared, setSharedRange]);

  const clearFilters = useCallback(() => {
    setLocalFilters({});
    setSharedRange(undefined);
  }, [setSharedRange]);

  const filters = useMemo<FilterState>(() => {
    if (!shared || !sharedWindow) return localFilters;
    return { ...localFilters, timeRange: sharedWindow };
  }, [shared, localFilters, sharedWindow]);

  // Memoized so consumers (and anything depending on this whole context value,
  // e.g. usePrimaryMarqueeData's signals useMemo) don't see a new reference on
  // every render of an unrelated ancestor — an unmemoized value here previously
  // caused a "Maximum update depth exceeded" cascade through the provider stack.
  const value = useMemo<FilterContextType>(() => ({
    filters,
    setFilters,
    updateFilter,
    clearFilters
  }), [filters, setFilters, updateFilter, clearFilters]);

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
};

export const useFilter = () => {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useFilter must be used within a FilterProvider');
  }
  return context;
};
