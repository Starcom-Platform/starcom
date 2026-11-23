/**
 * Whether the country names are drawn, render by render (decision K5, TS10:
 * docs/missions/01-architecture-decisions/territories.md).
 *
 * On screen the label slider decides. A card or clip draws names only when its
 * shot asks (`appearance.countryNames`), and then Natural Earth's own choice, never
 * the screen's slider: so a default card draws no names, exactly as it did before
 * there were any, and a card that asks makes the same picture on every page.
 *
 * Read as the territories' style is (territoryLook.ts): one value, set before the
 * render, read by what draws, the card's while a capture is under way. The names
 * layer notes what each capture drew, and compose reads it once the frame is taken
 * and refuses a card whose names are not what its shot asked for.
 */
import { captureUnderWay, onStill } from './captureClock';
import type { ScreenBox } from './placeNames';

/** Natural Earth's own choice: what a card that asks draws, whatever the screen's slider. */
export const CARD_NAMES_VISIBILITY = 60;

let screenVisibility = 60;
let cardAsks = false;
let cardObstacles: readonly ScreenBox[] = [];
/** A clip that asks for names: its frame rate, and which clip it is. */
let clip: { fps: number; clip: number } | null = null;
let clips = 0;

/** What the last capture drew: null until the names layer draws in it. */
interface CaptureNote { drawn: boolean; codes: readonly string[]; boxes: readonly ScreenBox[] }
let captured: CaptureNote | null = null;
onStill({ still: () => { captured = null; }, release: () => {} });

/** The screen's slider, 0–100. */
export function setScreenCountryNames(visibility: number): void {
  screenVisibility = visibility;
}

/** Whether the next cards draw names: a shot's `appearance.countryNames`, or false. */
export function setCardCountryNames(asks: boolean): void {
  cardAsks = asks;
}

export function cardCountryNames(): boolean {
  return cardAsks;
}

/**
 * A clip asking for names, from before its first frame until after its last: its
 * frames draw them as a card that asks does, and the names layer places them frame by
 * frame, fading over a fifth of a second of footage at its rate. Null when it ends.
 */
export function setClipCountryNames(fps: number | null): void {
  clip = fps === null ? null : { fps, clip: ++clips };
  cardAsks = fps !== null;
}

/** The clip asking for names, numbered so the next one starts afresh, or null. */
export function clipCountryNames(): { fps: number; clip: number } | null {
  return clip;
}

/** The card's own marks (its callout, its leader), in render px, for the next capture's names to keep clear of. */
export function setCardNameObstacles(boxes: readonly ScreenBox[]): void {
  cardObstacles = boxes;
}

export function cardNameObstacles(): readonly ScreenBox[] {
  return captureUnderWay() ? cardObstacles : [];
}

/** How many names the render under way draws, as the slider counts them: 0 draws none. */
export function namesVisibilityNow(): number {
  if (captureUnderWay()) return cardAsks ? CARD_NAMES_VISIBILITY : 0;
  return screenVisibility;
}

/** The names layer, at every render: what it drew. Kept only for a capture's render. */
export function noteCountryNamesDrawn(note: CaptureNote): void {
  if (captureUnderWay()) captured = note;
}

/**
 * Why the frame just captured does not show the names its shot asked for, or null
 * when it does. Asked and drawn with no name placed is not a refusal: a view of the
 * open ocean has none to show.
 */
export function countryNamesMissedCard(what = 'card'): string | null {
  if (cardAsks && captured === null) {
    return `The ${what} asked for country names and the names were not drawn: the territories overlay is off, or its names were not ready. Make it again with the overlay on.`;
  }
  if (!cardAsks && captured?.drawn) {
    return `Country names were drawn on a ${what} that did not ask for them. Make it again.`;
  }
  return null;
}

/** The names the last capture placed, with their boxes in render px: for the card's record and its inset. */
export function countryNamesInLastCapture(): { codes: readonly string[]; boxes: readonly ScreenBox[] } {
  return captured?.drawn ? { codes: captured.codes, boxes: captured.boxes } : { codes: [], boxes: [] };
}

/*
 * Whether the names can be drawn: 'ready' once the atlas is baked in the text face,
 * 'fallback' when the face did not come in time (the screen draws anyway; a card that
 * asks for names is refused, since another page would draw them in another face), null
 * while the territories overlay is off or its names are not made yet.
 */
let ready: 'ready' | 'fallback' | null = null;

export function setCountryNamesReady(state: 'ready' | 'fallback' | null): void {
  ready = state;
}

/**
 * Until the names can be drawn in a card, or why not: the overlay off, or the face
 * not loaded. Waits up to `timeoutMs` for the layer to come up.
 */
export async function untilCountryNames(timeoutMs: number, pollMs = 100, what = 'card'): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (ready === null && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, pollMs));
  if (ready === 'fallback') {
    throw new Error(`The ${what} asked for country names, and the text face they are drawn in did not load in time: another page would draw them differently. Try again.`);
  }
  if (ready === null) {
    throw new Error(`The ${what} asked for country names, and the territories overlay is off: names are drawn with the country borders. Turn the overlay on.`);
  }
}

/** Back to a first visit's state. */
export function resetCountryNamesLookForTest(): void {
  screenVisibility = 60;
  cardAsks = false;
  cardObstacles = [];
  clip = null;
  captured = null;
  ready = null;
}
