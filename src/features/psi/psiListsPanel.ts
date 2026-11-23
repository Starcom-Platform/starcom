/**
 * Psi Watch's Lists panel (decision D-PW, PW88): one of the left panels, with Story, RLSH and a chart; its tab the
 * daily notes, the registrations, the ledger, Intel in the open window, or the psi missions (PW91).
 */
import { useSyncExternalStore } from 'react';
import { openingLeftPanel, registerLeftPanel } from '../globe/leftPanels';

export type PsiListTab = 'notes' | 'registrations' | 'ledger' | 'intel' | 'missions';
export const PSI_LIST_TABS: readonly PsiListTab[] = ['notes', 'registrations', 'ledger', 'intel', 'missions'];

/** Open or not, on which tab, and the psi mission chosen in the Missions tab (PW91, PW92), by its address. */
export interface PsiListsState { open: boolean; tab: PsiListTab; mission: string | null }

let state: PsiListsState = { open: false, tab: 'notes', mission: null };
const listeners = new Set<() => void>();
const set = (next: PsiListsState) => { state = next; listeners.forEach((l) => l()); };

export const psiLists = (): PsiListsState => state;
/** Opens on `tab`, with a psi mission chosen when one is named; the other left panels close. */
export function openPsiLists(tab: PsiListTab = state.tab, options: { mission?: string | null } = {}): void {
  openingLeftPanel('psiLists');
  set({ open: true, tab, mission: options.mission !== undefined ? options.mission : state.mission });
}
/** Chooses a psi mission in the Missions tab, or none. */
export const choosePsiMission = (mission: string | null): void => { if (state.mission !== mission) set({ ...state, mission }); };
export const closePsiLists = (): void => { if (state.open) set({ ...state, open: false }); };
registerLeftPanel('psiLists', closePsiLists);

export function usePsiLists(): PsiListsState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, psiLists, psiLists);
}

export function resetPsiListsForTests(): void {
  state = { open: false, tab: 'notes', mission: null };
}
