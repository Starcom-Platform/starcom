/**
 * The event chart open on the left (decision D-PW, PW60, PW85, PW86): for an item with a time and a place, opened by
 * the inspector's "Chart"; one of the left panels, with Story and RLSH. The frame is chosen here, the Galactic Centre's
 * by default (PW5), tropical on a switch; this page only.
 */
import { useSyncExternalStore } from 'react';
import { openingLeftPanel, registerLeftPanel } from '../globe/leftPanels';
import { DEFAULT_FRAME, type ZodiacFrame } from '../../services/psiWatch/astro/frames';

export interface ChartSubject {
  title: string;
  /** When it happened, ms. */
  timeMs: number;
  place: { lat: number; lng: number };
  /** The layer it was drawn by, named. */
  layer?: string | null;
}

export interface EventChartState {
  open: boolean;
  subject: ChartSubject | null;
  frame: ZodiacFrame;
}

let state: EventChartState = { open: false, subject: null, frame: DEFAULT_FRAME };
const listeners = new Set<() => void>();
const set = (next: EventChartState) => { state = next; listeners.forEach((l) => l()); };

export const eventChart = (): EventChartState => state;

/** Opens the chart of an item; the other left panels close. */
export function openEventChart(subject: ChartSubject): void {
  openingLeftPanel('chart');
  set({ ...state, open: true, subject });
}

export const closeEventChart = (): void => { if (state.open) set({ ...state, open: false }); };
export const setEventChartFrame = (frame: ZodiacFrame): void => { if (state.frame !== frame) set({ ...state, frame }); };
// One of the left panels: another opening closes it.
registerLeftPanel('chart', closeEventChart);

export function useEventChart(): EventChartState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, eventChart, eventChart);
}

export function resetEventChartForTests(): void {
  state = { open: false, subject: null, frame: DEFAULT_FRAME };
}
