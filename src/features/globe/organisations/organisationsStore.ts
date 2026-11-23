/**
 * The Organisations mode's state (decision D-ZR, ZR10; the owner, 2026-10-18: "one at a time"): whether it is on,
 * which body is shown, whether it is under the pointer, and whether its panel is open. Bodies often share many
 * members, so one is drawn at a time, as a membership map draws one.
 *
 * The bodies are the areas of kind "union" (areaRegistry.ts), by the codes reports name them by: `union:eu`. On or
 * off, and the body last shown, are kept in this browser; off until a person picks it.
 */
import { useSyncExternalStore } from 'react';
import { AREAS, type AreaDef } from '../areas/areaRegistry';

/** Every body the mode can show, in the registry's order. */
export function organisationAreas(): AreaDef[] {
  return AREAS.filter((a) => a.kind === 'union');
}

export interface OrganisationHover {
  code: string;
  x: number;
  y: number;
}

export interface OrganisationsState {
  on: boolean;
  /** The body drawn, by its code. */
  shown: string | null;
  hovered: OrganisationHover | null;
  /** Whether the shown body's panel is open. */
  open: boolean;
}

const ON_KEY = 'starcom-organisations-layer';
const SHOWN_KEY = 'starcom-organisation-shown';
type Listener = () => void;

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Kept for this visit only.
  }
};

/** The body kept from last time, while the registry still has it; else the first. */
const keptShown = (): string | null => {
  const kept = read(SHOWN_KEY);
  const codes = organisationAreas().map((a) => a.code);
  return kept && codes.includes(kept) ? kept : codes[0] ?? null;
};

let state: OrganisationsState = { on: read(ON_KEY) === 'on', shown: keptShown(), hovered: null, open: false };
const listeners = new Set<Listener>();

function set(next: Partial<OrganisationsState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export function getOrganisationsState(): OrganisationsState {
  return state;
}

export function subscribeOrganisations(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setOrganisationsOn(on: boolean): void {
  if (state.on === on) return;
  write(ON_KEY, on ? 'on' : 'off');
  set(on ? { on } : { on, hovered: null, open: false });
}

/** Show one body, turning the mode on; its panel stays as it was unless asked open. */
export function showOrganisation(code: string, open = false): void {
  if (!organisationAreas().some((a) => a.code === code)) return;
  write(SHOWN_KEY, code);
  setOrganisationsOn(true);
  set({ shown: code, open: open || (state.open && state.shown === code) });
}

export function openOrganisationPanel(open: boolean): void {
  if (state.open !== open) set({ open });
}

export function setOrganisationHover(hovered: OrganisationHover | null): void {
  const was = state.hovered;
  if (was === hovered || (was && hovered && was.code === hovered.code && was.x === hovered.x && was.y === hovered.y)) return;
  set({ hovered });
}

export function useOrganisationsState(): OrganisationsState {
  return useSyncExternalStore(subscribeOrganisations, getOrganisationsState, getOrganisationsState);
}

export function useOrganisationsValue<T extends string | boolean | null>(pick: (s: OrganisationsState) => T): T {
  return useSyncExternalStore(subscribeOrganisations, () => pick(state), () => pick(state));
}

/** Test-only: off, the first body, nothing hovered or open, nobody listening. */
export function resetOrganisationsStoreForTests(): void {
  state = { on: false, shown: organisationAreas()[0]?.code ?? null, hovered: null, open: false };
  listeners.clear();
}
