/**
 * The note or notes a click on the globe opened (decision D-CT, CT3), in one module as the
 * Zones' panel state is (zonesStore.ts): read by the globe's click, and by the panel docked
 * beside the Zone panel, which share no parent nearer than the app.
 *
 * Built for the marks that had a hover and nothing behind it: AI Watch's notes, Hero Watch's
 * stations, relief and field missions, Raver Watch's and War & Conflict's notes. A layer hangs a
 * GlobeNoteSet on each mark (`opens`, beside its tooltip), and a click on the mark opens it here.
 * A mark that stands for several notes opens all of them, the first shown.
 *
 * Nothing here is kept: the panel closes with the page.
 */
import { useSyncExternalStore } from 'react';
import type { LensId } from '../../../services/intel/bigThreeLenses';

/** One note, as the panel shows it. Every field is the note's own: nothing is inferred. */
export interface GlobeNote {
  /** Stable within its set: the note's address, or its event id. */
  id: string;
  /** What it is, in a few words: "AI Watch note", "Field mission". */
  kind: string;
  title: string;
  /** Its text, shown as text, never as markup. */
  text: string;
  /** When it was published, in ms, or null when it says nothing readable. */
  timeMs: number | null;
  /** Its `r` tags in order, the original first; read again when drawn (sourceLinkItems). */
  sources: readonly string[];
  /** The big-three lenses it carries. */
  lenses?: readonly LensId[];
  /** A field mission's safety limits: a mission is never shown without them (D-HW). */
  limits?: string;
  /** Who posted it, by key: named at first sight, and labelled an AI agent when its key says so. */
  author?: string;
  /** It names a person, as its source names them (decision D-NP): labelled beside its title (NP1). */
  namesPeople?: boolean;
  /** A period its source states in place of a moment, when `timeMs` is null: a figure's year, "2025". */
  when?: string;
}

/** What one mark opens: a heading for the place or the mark, and its notes, newest or soonest first as the layer orders them. */
export interface GlobeNoteSet {
  heading: string;
  notes: readonly GlobeNote[];
  /**
   * The panel that shows it, when not this one's: Missions shows a place's missions as cards, each with
   * "Take this mission" (D-MF, MF17); Operations opens a campaign or an operation in its tab (D-RS, RS25).
   * Escape closes it all the same.
   */
  panel?: 'missions' | 'operations';
  /** Where it was opened: the mark's own place, or the point clicked on an area (the inspector, A5). */
  at?: { lat: number; lng: number };
  /** The layer that drew it, as it names itself. */
  layer?: string | null;
}

export interface GlobeNoteState {
  open: GlobeNoteSet | null;
  /** Which of its notes is shown. */
  index: number;
}

type Listener = () => void;
let state: GlobeNoteState = { open: null, index: 0 };
const listeners = new Set<Listener>();

function set(next: GlobeNoteState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function getGlobeNoteState(): GlobeNoteState {
  return state;
}

export function subscribeGlobeNotes(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Open a mark's notes in the panel, the first shown, or the one at `index`. An empty set closes it. Where it was
 * opened, and by which layer, come with the click (`at`, `layer`): the inspector flies, links and finds what is
 * near from them.
 */
export function openGlobeNotes(open: GlobeNoteSet, opened: { at?: { lat: number; lng: number }; layer?: string | null; index?: number } = {}): void {
  const { index = 0, ...where } = opened;
  const withPlace = where.at ? { ...open, ...where } : open;
  set(open.notes.length ? { open: withPlace, index: index >= 0 && index < open.notes.length ? index : 0 } : { open: null, index: 0 });
}

/** Show another of the open notes. */
export function showGlobeNote(index: number): void {
  if (!state.open || index < 0 || index >= state.open.notes.length || index === state.index) return;
  set({ ...state, index });
}

export function closeGlobeNotes(): void {
  if (state.open) set({ open: null, index: 0 });
}

export function useGlobeNotes(): GlobeNoteState {
  return useSyncExternalStore(subscribeGlobeNotes, getGlobeNoteState, getGlobeNoteState);
}
