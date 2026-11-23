/**
 * How the ψ field is drawn (decision D-PW, PW57): four looks, each its own dimension, one on at a time or together as
 * the panel chooses: heat for ψ, contours at fixed steps of it, relief for G (the slow base drive), flow for the
 * tides' share as it moves. Kept in this browser; heat and contours at first.
 */
import { useSyncExternalStore } from 'react';

export const PSI_FIELD_LOOKS = ['heat', 'contours', 'relief', 'flow'] as const;
export type PsiFieldLook = (typeof PSI_FIELD_LOOKS)[number];
export type PsiFieldLooks = Readonly<Record<PsiFieldLook, boolean>>;

const KEY = 'starcom:psi-field-looks';
export const DEFAULT_PSI_FIELD_LOOKS: PsiFieldLooks = { heat: true, contours: true, relief: false, flow: false };

function read(): PsiFieldLooks {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Record<PsiFieldLook, unknown>> | null;
    if (!saved || typeof saved !== 'object') return DEFAULT_PSI_FIELD_LOOKS;
    const looks = Object.fromEntries(PSI_FIELD_LOOKS.map((look) => [look, typeof saved[look] === 'boolean' ? saved[look] : DEFAULT_PSI_FIELD_LOOKS[look]])) as Record<PsiFieldLook, boolean>;
    return PSI_FIELD_LOOKS.some((look) => looks[look]) ? looks : DEFAULT_PSI_FIELD_LOOKS;
  } catch {
    return DEFAULT_PSI_FIELD_LOOKS;
  }
}

let looks: PsiFieldLooks | null = null;
/**
 * A card's own looks while a shot draws (Mecha Jono, 30 Oct: a card draws the same whoever's panel is open): the
 * looks the shot names, or heat and contours. Never saved; the shot puts it back.
 */
let cardLooks: PsiFieldLooks | null = null;
const listeners = new Set<() => void>();

export const getPsiFieldLooks = (): PsiFieldLooks => cardLooks ?? (looks ??= read());

/** The looks a shot draws, or null to return to the person's. */
export function setCardPsiFieldLooks(list: readonly PsiFieldLook[] | null): void {
  const next = list ? Object.fromEntries(PSI_FIELD_LOOKS.map((look) => [look, list.includes(look)])) as Record<PsiFieldLook, boolean> : null;
  if (next === cardLooks || (next && cardLooks && PSI_FIELD_LOOKS.every((l) => next[l] === cardLooks![l]))) return;
  cardLooks = next;
  listeners.forEach((listener) => listener());
}

/** The looks drawn now, as a list in the panel's order. */
export const psiFieldLooksDrawn = (): PsiFieldLook[] => PSI_FIELD_LOOKS.filter((look) => getPsiFieldLooks()[look]);

/** One look on or off; the last one on stays on, so the layer always draws something. */
export function setPsiFieldLook(look: PsiFieldLook, on: boolean): void {
  const current = getPsiFieldLooks();
  if (current[look] === on) return;
  const next = { ...current, [look]: on };
  if (!PSI_FIELD_LOOKS.some((l) => next[l])) return;
  looks = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* kept for this page only */ }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const usePsiFieldLooks = (): PsiFieldLooks => useSyncExternalStore(subscribe, getPsiFieldLooks, getPsiFieldLooks);

/** Test-only: forget the looks read. */
export function resetPsiFieldLooksForTests(): void { looks = null; cardLooks = null; }
