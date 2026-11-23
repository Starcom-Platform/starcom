/**
 * Which of the globe's own hover cards is showing, so the generic ones hold back (owner, 1 Nov: "conflicting popup
 * tooltips"). A report's card (Enhanced3DGlobeInteractivity), an arc's label (react-globe.gl's own) and a comm hub's
 * card each say more than the point tooltip (useGlobePointTooltips) or the country's (CountryInfoTooltip) could; while
 * one shows, those two wait. Found on the live site by .local/scripts/tooltip-probe.mjs: a report hovered showed its
 * card and the point tooltip with the same title, an arc its label over its war country's tooltip, a hub its card over
 * a country's.
 */
import { useSyncExternalStore } from 'react';

/** `sky`: Sky from a place is open, where a hover would name the ground under the sky (D5). */
export type HoverOwner = 'reportCard' | 'arc' | 'commHub' | 'sky';

const showing = new Set<HoverOwner>();
const listeners = new Set<() => void>();
let any = false;

/** A card showing (true) or gone (false). */
export function setHoverOwner(owner: HoverOwner, on: boolean): void {
  if (showing.has(owner) === on) return;
  if (on) showing.add(owner); else showing.delete(owner);
  any = showing.size > 0;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getAny = () => any;

/** Whether any of the globe's own hover cards is showing. */
export const useHoverOwned = (): boolean => useSyncExternalStore(subscribe, getAny, getAny);

/** Test-only: none showing. */
export function resetHoverOwnersForTests(): void { showing.clear(); any = false; }
