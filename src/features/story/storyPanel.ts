/**
 * Whether the Story panel is open, and on which story (D-ST, ST4, ST6): opened by the Story button beside Tour, the
 * palette, and a story's link.
 */
import { useSyncExternalStore } from 'react';
import { openingLeftPanel, registerLeftPanel } from '../globe/leftPanels';

export interface StoryPanelState {
  open: boolean;
  /** The story shown, or null for the list of stories. */
  storyId: string | null;
}

let state: StoryPanelState = { open: false, storyId: null };
const listeners = new Set<() => void>();
const set = (next: StoryPanelState) => { state = next; listeners.forEach((l) => l()); };

export const storyPanel = (): StoryPanelState => state;
export const openStoryPanel = (storyId: string | null = state.storyId): void => { openingLeftPanel('story'); set({ open: true, storyId }); };
export const showStoryList = (): void => { openingLeftPanel('story'); set({ open: true, storyId: null }); };
export const closeStoryPanel = (): void => { if (state.open) set({ ...state, open: false }); };
export const toggleStoryPanel = (): void => { if (!state.open) openingLeftPanel('story'); set({ ...state, open: !state.open }); };
// One of the left panels: another opening closes it.
registerLeftPanel('story', closeStoryPanel);

export function useStoryPanel(): StoryPanelState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, storyPanel, storyPanel);
}

export function resetStoryPanelForTests(): void {
  state = { open: false, storyId: null };
}
