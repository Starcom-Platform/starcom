/**
 * What the inspector's buttons do (critique-2026-11-01, OR23; plan A5), lent by the globe that can do them: make a
 * card of the view, turn the camera to a place, the link to this view, the camera's height, the time window shown and
 * a move of the time cursor. The inspector sits in the dock, outside the globe's tree, so it reads them here; a button
 * whose action the globe has not lent is not shown.
 */
import { useSyncExternalStore } from 'react';
import type { LatLng } from './relatedMarks';

export interface InspectorActions {
  /** Composes a card of the view as it is and hands it to the person (Globe's share button). */
  makeCard?: () => Promise<void>;
  /** Turns the camera to centre a place, close in. */
  flyTo?: (at: LatLng) => void;
  /** This view's address, at a place, with an item to reopen. */
  linkTo?: (at: LatLng, noteId: string) => string;
  /** The camera's height above the ground, in Earth radii: how far "related" reaches. */
  altitude?: () => number;
  /** The window shown, or null while live. */
  window?: () => { start: number; end: number } | null;
  /** Moves the time cursor to a moment, with the UTC day around it as the window. */
  showAround?: (timeMs: number) => void;
  /** The point at the middle of the view: where "watch around here" watches (D-WL, WL9). */
  centre?: () => LatLng | null;
}

let actions: InspectorActions = {};
const listeners = new Set<() => void>();

/** The globe lends its actions; null takes them back. */
export function setInspectorActions(next: InspectorActions | null): void {
  actions = next ?? {};
  for (const listener of listeners) listener();
}

export function getInspectorActions(): InspectorActions {
  return actions;
}

export function useInspectorActions(): InspectorActions {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => actions,
    () => actions,
  );
}
