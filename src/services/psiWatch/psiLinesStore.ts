/**
 * Which sky event Planet lines draw (decision D-PW, PW20–PW21): the panel says which is open, the globe draws its
 * bodies' lines. One small store between the two, as the globe's other panels and layers share theirs; a card opens
 * one here too (PW62, the share handle's `psiEvent`), and the panel follows it.
 */
import { useSyncExternalStore } from 'react';
import type { AstroBody } from './astro/sky';

export interface PsiLinesEvent {
  /** Its address, when it is one of the kit's or the live notes' sky events. */
  address?: string;
  title: string;
  bodies: AstroBody[];
  /** Unix seconds: the window's edges and its exact moment. */
  from: number;
  until: number;
  exact: number;
}

/** The lines standing on the globe now (PW83): their moment, ms, their bodies, and whether their bands are drawn. */
export interface PsiLinesDrawn {
  at: number;
  bodies: AstroBody[];
  bands: boolean;
}

export interface PsiLinesState {
  event: PsiLinesEvent | null;
  /** The sky event the panel shows open, by address: a person's pick or a card's; null for the soonest. */
  opened: string | null;
  /** Every body's lines, not only the event's (PW20's switch). */
  allBodies: boolean;
  /** What the globe draws now, or null. */
  drawn: PsiLinesDrawn | null;
}

let state: PsiLinesState = { event: null, opened: null, allBodies: false, drawn: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export const getPsiLinesState = (): PsiLinesState => state;

export function setPsiLinesEvent(event: PsiLinesEvent | null): void {
  const same = state.event === event
    || (state.event !== null && event !== null && state.event.title === event.title && state.event.exact === event.exact
      && state.event.address === event.address);
  if (same) return;
  state = { ...state, event };
  emit();
}

/** Open a sky event in the panel by its address, or none for the soonest. */
export function setPsiOpened(opened: string | null): void {
  if (state.opened === opened) return;
  state = { ...state, opened };
  emit();
}

export function setPsiLinesAllBodies(allBodies: boolean): void {
  if (state.allBodies === allBodies) return;
  state = { ...state, allBodies };
  emit();
}

/** Set by the globe's Planet lines as they stand, null when none do. */
export function setPsiLinesDrawn(drawn: PsiLinesDrawn | null): void {
  const was = state.drawn;
  if (was === drawn || (was && drawn && was.at === drawn.at && was.bands === drawn.bands && was.bodies.join() === drawn.bodies.join())) return;
  state = { ...state, drawn };
  emit();
}

export function subscribePsiLines(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const usePsiLines = (): PsiLinesState => useSyncExternalStore(subscribePsiLines, getPsiLinesState, getPsiLinesState);

export function resetPsiLinesForTests(): void {
  state = { event: null, opened: null, allBodies: false, drawn: null };
  emit();
}
