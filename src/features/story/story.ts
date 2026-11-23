/**
 * Stories (D-ST, docs/missions/01-architecture-decisions/stories.md; UX plan E4, OR34).
 *
 * A story is steps; a step is the view as it was when added (ST1): the camera, the layers drawn and each one's choices,
 * the window shown or live, with a caption and a hold of 4, 6 or 10 s. Kept in this browser, as watches are (ST2); its
 * link carries the whole story in its address, compressed, so it opens anywhere and nothing is published.
 *
 * Read and set through the share handle, as a link is applied (useApplyDeeplink): a step's choices are set for this
 * page only and given back to the person's when the story ends, never saved over theirs. One thing a step cannot hold:
 * a moment paused with no window, which the handle reads as live.
 */
import { useSyncExternalStore } from 'react';

export const HOLD_CHOICES_S = [4, 6, 10] as const;
export type HoldS = (typeof HOLD_CHOICES_S)[number];
export const DEFAULT_HOLD_S: HoldS = 6;
/** A story's steps, at most: a minute of clip holds about this many (ST3). */
export const STEPS_MAX = 12;
export const STORIES_MAX = 20;
export const CAPTION_MAX = 280;

export interface StoryStep {
  /** The camera: latitude, longitude and altitude in Earth radii, as the handle's view. */
  view: { lat: number; lng: number; altitude: number };
  /** The layer the view is of, and those pinned beside it. */
  layer: string;
  pins: string[];
  /** Each drawn layer's choices in force, by layer. */
  choices: Record<string, Record<string, unknown>>;
  /** The window shown, unix seconds, or null for live. */
  window: { from: number; until: number } | null;
  caption: string;
  holdS: HoldS;
}

export interface Story {
  id: string;
  title: string;
  steps: StoryStep[];
  madeMs: number;
}

/** What a step is read from and set through: the share handle's own methods (useGlobeShareCard.ts). */
export interface StoryHandle {
  getView(): { lat: number; lng: number; altitude: number };
  listLayers(): Array<{ id: string; label?: string; active: boolean; primary: boolean; pinned: boolean }>;
  getLayerChoices(layer: string): { choices: Record<string, unknown> };
  getTimeWindow(): { from: number | null; until: number | null; live: boolean };
  setLayer(layer: string, options?: { clearOtherPins?: boolean }): unknown;
  pinLayers(layers: string[]): unknown;
  setLayerChoices(layer: string, choices: Record<string, unknown> | null): unknown;
  setTimeWindow(window: { from: number; until: number } | null): Promise<unknown>;
  setView(view: { lat: number; lng: number; altitude: number }, options?: { transitionMs?: number; settleMs?: number }): Promise<unknown>;
  whenReady(options?: { timeoutMs?: number }): Promise<unknown>;
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** The view as it is, as a step (ST1): nothing said yet, held for the default. */
export function captureStep(handle: StoryHandle): StoryStep {
  const view = handle.getView();
  const layers = handle.listLayers();
  const primary = layers.find((l) => l.primary)?.id ?? layers.find((l) => l.active)?.id;
  if (!primary) throw new Error('No layer is drawn: a step is a view of one.');
  const pins = layers.filter((l) => l.pinned && l.id !== primary).map((l) => l.id).slice(0, 4);
  const choices: StoryStep['choices'] = {};
  for (const layer of [primary, ...pins]) {
    try {
      const held = handle.getLayerChoices(layer).choices;
      if (held && Object.keys(held).length) choices[layer] = { ...held };
    } catch { /* a layer with no choices of its own */ }
  }
  const time = handle.getTimeWindow();
  const window = !time.live && time.from !== null && time.until !== null ? { from: time.from, until: time.until } : null;
  return {
    view: { lat: round(view.lat, 2), lng: round(view.lng, 2), altitude: round(view.altitude, 2) },
    layer: primary, pins, choices, window, caption: '', holdS: DEFAULT_HOLD_S,
  };
}

/**
 * Sets a step's view: its layers, each one's choices for this page only, its window, then the camera over
 * `transitionMs`; resolves once the globe has drawn it. A choice a layer refuses is passed over: the rest stands.
 */
export async function applyStep(
  handle: StoryHandle, step: StoryStep, options: { transitionMs?: number; ready?: boolean; camera?: boolean } = {},
): Promise<void> {
  handle.setLayer(step.layer, { clearOtherPins: true });
  if (step.pins.length) handle.pinLayers(step.pins);
  for (const [layer, choices] of Object.entries(step.choices)) {
    try { handle.setLayerChoices(layer, choices); } catch { /* refused: a choice the layer keeps in its own settings */ }
  }
  await handle.setTimeWindow(step.window);
  // A clip's camera is its track's (storyClip.ts): the step's world only.
  if (options.camera !== false) await handle.setView(step.view, { transitionMs: options.transitionMs ?? 0, settleMs: 0 });
  if (options.ready !== false) await handle.whenReady({ timeoutMs: 30_000 });
}

/** Gives every layer a story set choices on back to the person's own. */
export function releaseChoices(handle: StoryHandle, steps: readonly StoryStep[]): void {
  for (const layer of new Set(steps.flatMap((s) => Object.keys(s.choices)))) {
    try { handle.setLayerChoices(layer, null); } catch { /* the layer is gone */ }
  }
}

// ── Kept in this browser (ST2) ───────────────────────────────────────────────
const KEY = 'starcom:stories';
const NONE: readonly Story[] = [];
let list: readonly Story[] | null = null;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((listener) => listener());

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** A step as kept or carried, or null for anything that is not one. */
export function stepFrom(value: unknown): StoryStep | null {
  const s = value as Partial<StoryStep> | null;
  if (!s || typeof s !== 'object') return null;
  const v = s.view as StoryStep['view'] | undefined;
  if (!v || !isNum(v.lat) || !isNum(v.lng) || !isNum(v.altitude) || typeof s.layer !== 'string' || !s.layer) return null;
  const w = s.window as StoryStep['window'] | undefined;
  const window = w && isNum(w.from) && isNum(w.until) && w.until > w.from ? { from: w.from, until: w.until } : null;
  const choices = s.choices && typeof s.choices === 'object' && !Array.isArray(s.choices)
    ? Object.fromEntries(Object.entries(s.choices).filter(([, c]) => c && typeof c === 'object' && !Array.isArray(c))) as StoryStep['choices']
    : {};
  return {
    view: { lat: v.lat, lng: v.lng, altitude: v.altitude },
    layer: s.layer,
    pins: Array.isArray(s.pins) ? s.pins.filter((p): p is string => typeof p === 'string').slice(0, 4) : [],
    choices, window,
    caption: typeof s.caption === 'string' ? s.caption.slice(0, CAPTION_MAX) : '',
    holdS: (HOLD_CHOICES_S as readonly unknown[]).includes(s.holdS) ? s.holdS as HoldS : DEFAULT_HOLD_S,
  };
}

/** A story as kept or carried, or null; steps it cannot read are passed over. */
export function storyFrom(value: unknown): Story | null {
  const s = value as Partial<Story> | null;
  if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !Array.isArray(s.steps)) return null;
  const steps = s.steps.map(stepFrom).filter((x): x is StoryStep => x !== null).slice(0, STEPS_MAX);
  return { id: s.id, title: typeof s.title === 'string' ? s.title.slice(0, 120) : '', steps, madeMs: isNum(s.madeMs) ? s.madeMs : 0 };
}

function read(): readonly Story[] {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(kept) ? kept.map(storyFrom).filter((x): x is Story => x !== null).slice(0, STORIES_MAX) : NONE;
  } catch { return NONE; }
}

function write(next: readonly Story[]): void {
  list = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* kept for this page only */ }
  tell();
}

export function stories(): readonly Story[] {
  list ??= read();
  return list;
}

export function subscribeStories(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const useStories = (): readonly Story[] => useSyncExternalStore(subscribeStories, stories, () => NONE);

export const storyById = (id: string): Story | null => stories().find((s) => s.id === id) ?? null;

const newId = (nowMs: number) => `s${nowMs.toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A new story, kept first; null past twenty (the oldest is never dropped for it). */
export function newStory(title: string, nowMs = Date.now()): Story | null {
  if (stories().length >= STORIES_MAX) return null;
  const story: Story = { id: newId(nowMs), title: title.slice(0, 120), steps: [], madeMs: nowMs };
  write([story, ...stories()]);
  return story;
}

/** Keeps a story as given (a link's, or one changed): replaces the one with its id, or is kept first. */
export function keepStory(story: Story): void {
  const others = stories().filter((s) => s.id !== story.id);
  write([story, ...others].slice(0, STORIES_MAX));
}

/** Changes a story by a function of it; a story not kept is left alone. */
export function changeStory(id: string, change: (story: Story) => Story): void {
  const story = storyById(id);
  if (!story) return;
  write(stories().map((s) => (s.id === id ? change(s) : s)));
}

export function removeStory(id: string): void {
  write(stories().filter((s) => s.id !== id));
}

/** Moves a step up (-1) or down (+1). */
export const moveStep = (steps: readonly StoryStep[], index: number, by: -1 | 1): StoryStep[] => {
  const to = index + by;
  if (to < 0 || to >= steps.length) return [...steps];
  const next = [...steps];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
};

// ── The link (ST2, ST6) ──────────────────────────────────────────────────────
export const STORY_PARAM = 'story';

const toBase64Url = (bytes: Uint8Array): string => {
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (text: string): Uint8Array => {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const input = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } });
  const reader = input.pipeThrough(stream).getReader();
  const parts: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** A story as its link carries it: the steps, deflated, in base64url. */
export async function encodeStory(story: Story): Promise<string> {
  const json = JSON.stringify({ v: 1, id: story.id, title: story.title, steps: story.steps, madeMs: story.madeMs });
  return toBase64Url(await through(new TextEncoder().encode(json), new CompressionStream('deflate-raw')));
}

/** A link's story, or null for anything it cannot read; never more than the steps a story may hold. */
export async function decodeStory(param: string): Promise<Story | null> {
  try {
    if (param.length > 60_000) return null;
    const json = new TextDecoder().decode(await through(fromBase64Url(param), new DecompressionStream('deflate-raw')));
    const value = JSON.parse(json) as { v?: unknown };
    return value?.v === 1 ? storyFrom(value) : null;
  } catch {
    return null;
  }
}

/** A story's link: this page's address with the story in it, and nothing else of the view. */
export async function storyLink(story: Story, origin: string, path = '/'): Promise<string> {
  return `${origin}${path}?${STORY_PARAM}=${await encodeStory(story)}`;
}

export function resetStoriesForTests(): void {
  list = null;
  listeners.clear();
}
