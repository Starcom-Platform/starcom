/**
 * Whether the RLSH panel is open, and on which tab (D-RF, RF1, RF6): the person's own card, or the list of cards.
 * Opened by the RLSH rail's card button and a marker's "Your RLSH card", where a form elsewhere used to open.
 */
import { useSyncExternalStore } from 'react';
import { openingLeftPanel, registerLeftPanel } from '../globe/leftPanels';

export type RlshTab = 'mine' | 'list';

export interface RlshPanelState {
  open: boolean;
  tab: RlshTab;
}

let state: RlshPanelState = { open: false, tab: 'mine' };
const listeners = new Set<() => void>();
const set = (next: RlshPanelState) => { state = next; listeners.forEach((l) => l()); };

export const rlshPanel = (): RlshPanelState => state;
/** Opens on `tab`; the other left panels close. */
export const openRlshPanel = (tab: RlshTab = state.tab): void => {
  openingLeftPanel('rlsh');
  set({ open: true, tab });
};
export const closeRlshPanel = (): void => { if (state.open) set({ ...state, open: false }); };
// One of the left panels: another opening closes it.
registerLeftPanel('rlsh', closeRlshPanel);

export function useRlshPanel(): RlshPanelState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, rlshPanel, rlshPanel);
}

export function resetRlshPanelForTests(): void {
  state = { open: false, tab: 'mine' };
}
