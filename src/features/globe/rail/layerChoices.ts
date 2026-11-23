/**
 * A layer's own choices on the second left rail (critique-2026-11-01, OR1, OR12; plan A2): whether War & Conflict
 * draws its arcs, how a point layer's marks are drawn, and the like, each layer's kept apart. Kept in this browser;
 * written into a shared link (`lc=`), so the link opens the layer as it was seen; and read by the share handle and a
 * card's provenance. A choice not made is the rail's default, which is never stored, so a link carries only what
 * differs.
 *
 * Choices a layer already keeps in its own settings (Geo Political's, in useGeoPoliticalSettings) stay there: the rail
 * binds to them (railBindings.ts) rather than keeping a second copy.
 */
import { useSyncExternalStore } from 'react';

export type ChoiceValue = string | boolean | readonly string[];
export type Choices = Readonly<Record<string, ChoiceValue>>;

const KEY = 'starcom:layer-choices';
const PARAM = 'lc';
const EMPTY: Choices = Object.freeze({});

let saved: Record<string, Record<string, ChoiceValue>> | null = null;
/** The share handle's choices, for this page only and never saved: an agent never changes a person's own. */
let page: Record<string, Record<string, ChoiceValue>> = {};
const frozen = new Map<string, Choices>();
const listeners = new Set<() => void>();

function load(): Record<string, Record<string, ChoiceValue>> {
  if (saved) return saved;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    saved = raw && typeof raw === 'object' && !Array.isArray(raw) ? clean(raw as Record<string, unknown>) : {};
  } catch {
    saved = {};
  }
  // A link's own choices, once, on the first read: the link opens the layers as they were seen.
  if (typeof window !== 'undefined') {
    const given = fromLink(window.location.search);
    if (given) {
      for (const [layer, choices] of Object.entries(given)) saved[layer] = { ...(saved[layer] ?? {}), ...choices };
      try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* kept for this page only */ }
    }
  }
  return saved;
}

/** Only layer → key → string, boolean or a list of strings: anything else a link or a stale store holds is dropped. */
function clean(raw: Record<string, unknown>): Record<string, Record<string, ChoiceValue>> {
  const out: Record<string, Record<string, ChoiceValue>> = {};
  for (const [layer, choices] of Object.entries(raw)) {
    if (!/^[A-Za-z]{2,40}$/.test(layer) || !choices || typeof choices !== 'object' || Array.isArray(choices)) continue;
    const kept: Record<string, ChoiceValue> = {};
    for (const [key, value] of Object.entries(choices as Record<string, unknown>)) {
      if (!/^[a-z][A-Za-z0-9:-]{0,40}$/.test(key)) continue;
      if (typeof value === 'string' && value.length <= 40) kept[key] = value;
      else if (typeof value === 'boolean') kept[key] = value;
      else if (Array.isArray(value) && value.length <= 40 && value.every((v) => typeof v === 'string' && v.length <= 40)) kept[key] = [...value];
    }
    if (Object.keys(kept).length) out[layer] = kept;
  }
  return out;
}

function persist(): void {
  try { localStorage.setItem(KEY, JSON.stringify(saved ?? {})); } catch { /* kept for this page only */ }
  frozen.clear();
  listeners.forEach((listener) => listener());
}

/** The choices made for a layer, without its defaults: the person's, with the share handle's for this page over them. */
export function layerChoicesOf(layer: string): Choices {
  const cached = frozen.get(layer);
  if (cached) return cached;
  const made = load()[layer];
  const over = page[layer];
  const value = made || over ? Object.freeze({ ...(made ?? {}), ...(over ?? {}) }) : EMPTY;
  frozen.set(layer, value);
  return value;
}

/** The share handle's choices for a layer, for this page only, never saved; null returns it to the person's. */
export function setPageLayerChoices(layer: string, choices: Readonly<Record<string, unknown>> | null): void {
  if (choices === null) delete page[layer];
  else page[layer] = { ...(page[layer] ?? {}), ...(clean({ [layer]: choices })[layer] ?? {}) };
  frozen.clear();
  listeners.forEach((listener) => listener());
}

/** Whether this page's handle set any of a layer's choices. */
export const pageSetLayerChoices = (layer: string): boolean => !!page[layer] && Object.keys(page[layer]).length > 0;

/** One choice, or its default where none is made. */
export function layerChoice<T extends ChoiceValue>(layer: string, key: string, fallback: T): T {
  const value = layerChoicesOf(layer)[key];
  return (value === undefined || typeof value !== typeof fallback || Array.isArray(value) !== Array.isArray(fallback) ? fallback : value) as T;
}

/** Makes one choice; the default given unmakes it, so the store and a link keep only what differs. */
export function setLayerChoice(layer: string, key: string, value: ChoiceValue, fallback?: ChoiceValue): void {
  const all = load();
  const mine = { ...(all[layer] ?? {}) };
  if (fallback !== undefined && sameChoice(value, fallback)) delete mine[key];
  else mine[key] = Array.isArray(value) ? [...value] : value;
  if (Object.keys(mine).length) all[layer] = mine; else delete all[layer];
  persist();
}

/** Several choices at once, as the share handle and a link give them; the rest of the layer's are left. */
export function setLayerChoices(layer: string, choices: Readonly<Record<string, unknown>>): void {
  const kept = clean({ [layer]: choices })[layer] ?? {};
  const all = load();
  all[layer] = { ...(all[layer] ?? {}), ...kept };
  persist();
}

/** Every layer's choices back to its defaults (a test, or "reset" on the rail). */
export function resetLayerChoices(layer?: string): void {
  const all = load();
  if (layer) delete all[layer]; else for (const k of Object.keys(all)) delete all[k];
  persist();
}

const sameChoice = (a: ChoiceValue, b: ChoiceValue) => (Array.isArray(a) && Array.isArray(b)
  ? a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i])
  : a === b);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** A layer's choices, re-rendering when any of them changes. */
export function useLayerChoices(layer: string): Choices {
  return useSyncExternalStore(subscribe, () => layerChoicesOf(layer), () => layerChoicesOf(layer));
}

/** One choice, or its default. */
export function useLayerChoice<T extends ChoiceValue>(layer: string, key: string, fallback: T): T {
  useLayerChoices(layer);
  return layerChoice(layer, key, fallback);
}

// ── Links ──

/** The `lc` value for the layers given: their choices made, as base64url JSON; empty when none differs. */
export function encodeLayerChoices(layers: readonly string[]): string {
  const all = load();
  const picked = Object.fromEntries(layers.filter((l) => all[l]).map((l) => [l, all[l]]));
  if (!Object.keys(picked).length) return '';
  const json = JSON.stringify(picked);
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A link's `lc` as layer → choices, or null when it has none or it is malformed. */
function fromLink(search: string): Record<string, Record<string, ChoiceValue>> | null {
  const value = new URLSearchParams(search).get(PARAM);
  if (!value || value.length > 4000) return null;
  try {
    const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)));
    const given = clean(JSON.parse(json) as Record<string, unknown>);
    return Object.keys(given).length ? given : null;
  } catch {
    return null;
  }
}

/** A link's `lc`, applied over this browser's choices for the layers it names; anything malformed is ignored. */
export function applyLayerChoicesFromLink(search: string): boolean {
  const given = fromLink(search);
  if (!given) return false;
  const all = load();
  for (const [layer, choices] of Object.entries(given)) all[layer] = { ...(all[layer] ?? {}), ...choices };
  persist();
  return true;
}

export const LAYER_CHOICES_PARAM = PARAM;

/** Test-only: forget what was read. */
export function resetLayerChoicesForTests(): void { saved = null; page = {}; frozen.clear(); }
