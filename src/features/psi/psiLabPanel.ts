/**
 * Psi Watch's lab (decision D-PW, PW94–PW96): one of the left panels, with Story, RLSH, a chart and the Lists. Its tab
 * Explore (a sky configuration against an event set, PW95) or Draft (the board's form, PW96), and the configuration
 * both read, kept while the page is open so a draft starts from what was explored.
 */
import { useSyncExternalStore } from 'react';
import { openingLeftPanel, registerLeftPanel } from '../globe/leftPanels';
import type { SkySpec } from '../../services/psiWatch/timestream/echoReturns';
import type { EventSetId } from '../../services/psiWatch/timestream/eventSets';
import type { LabWindow } from '../../services/psiWatch/lab/labExplore';
import type { DraftFields } from '../../services/psiWatch/lab/hypothesisDraft';
import { DEFAULT_FRAME } from '../../services/psiWatch/astro/frames';

export type PsiLabTab = 'explore' | 'draft';
export const PSI_LAB_TABS: readonly PsiLabTab[] = ['explore', 'draft'];

export interface LabConfig {
  spec: SkySpec;
  set: EventSetId;
  window: LabWindow;
}

export interface PsiLabState {
  open: boolean;
  tab: PsiLabTab;
  config: LabConfig;
  fields: DraftFields;
}

const YEAR_MS = 365 * 86_400_000;
const initial = (): PsiLabState => ({
  open: false,
  tab: 'explore',
  config: {
    spec: { class: 'aspect', sub: 'harmonic', bodies: ['Mars', 'Saturn'], targetDeg: 90, frame: DEFAULT_FRAME },
    set: 'storms',
    window: { before: 0, after: 3, unit: 'day' },
  },
  fields: { title: '', hypothesis: '', direction: 'upper', p: 0.05, rr: 1.2, sealedEnd: new Date(Date.now() + YEAR_MS).toISOString().slice(0, 10) },
});

let state: PsiLabState = initial();
const listeners = new Set<() => void>();
const set = (next: PsiLabState) => { state = next; listeners.forEach((l) => l()); };

export const psiLab = (): PsiLabState => state;
/** Opens on `tab`; the other left panels close. */
export function openPsiLab(tab: PsiLabTab = state.tab): void {
  openingLeftPanel('psiLab');
  set({ ...state, open: true, tab });
}
export const closePsiLab = (): void => { if (state.open) set({ ...state, open: false }); };
registerLeftPanel('psiLab', closePsiLab);

export const setLabConfig = (change: Partial<LabConfig>): void => set({ ...state, config: { ...state.config, ...change } });
export const setLabFields = (change: Partial<DraftFields>): void => set({ ...state, fields: { ...state.fields, ...change } });

export function usePsiLab(): PsiLabState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, psiLab, psiLab);
}

export function resetPsiLabForTests(): void {
  state = initial();
}
