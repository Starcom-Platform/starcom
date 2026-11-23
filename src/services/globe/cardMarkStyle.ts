/**
 * The mark style a card or clip asks for (plan H4, 25 Oct): one style for every
 * layer that honours a choice, while the capture runs, whatever the person picked.
 *
 * Unlike the territories' style (territoryLook.ts), a mark style is not switched
 * render by render: it is a shader define (stylePropsFor in screenPoints.ts), so a
 * switch recompiles each layer's material. So the globe draws the card's style on
 * screen too, from the moment the shot asks until it ends, as it shows the shot's
 * layers and camera, and the person's own choices come back when it ends. Never
 * saved: an agent never changes a person's setting (as the report look, BA7).
 *
 * Globe.tsx notes each style it has drawn once every layer's effects have run, and
 * a shot waits for that note before it frames, so no card is taken mid-switch.
 */
import { DEFAULT_MARKER_STYLES, type MarkerStyle, type MarkerStyleChoices } from '../../components/Globe/markerStyles';
import type { GlobeLayerId } from '../../components/Globe/Hooks/useGlobeLayerControl';

let asked: MarkerStyle | null = null;
let drawn: MarkerStyle | null = null;
const listeners = new Set<() => void>();

/** The style the next cards and clips draw on every layer, or null for each layer's own. */
export function setCardMarkStyle(style: MarkerStyle | null): void {
  if (style === asked) return;
  asked = style;
  listeners.forEach((listener) => listener());
}

/** The style a capture asks for now, or null when none does. */
export function cardMarkStyle(): MarkerStyle | null {
  return asked;
}

export function subscribeCardMarkStyle(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * The styles the globe draws: the card's on every layer while one is asked for,
 * else the person's choices as they stand (each layer's default where they made none).
 */
export function withCardMarkStyle(choices: MarkerStyleChoices, card: MarkerStyle | null): MarkerStyleChoices {
  if (card === null) return choices;
  return Object.fromEntries((Object.keys(DEFAULT_MARKER_STYLES) as GlobeLayerId[]).map((id) => [id, card]));
}

/** The globe, once every layer has been drawn in a style: the card's, or null for the person's own. */
export function noteMarkStyleDrawn(style: MarkerStyle | null): void {
  drawn = style;
}

/** Until the globe draws the style asked for, or why not. */
export async function untilMarkStyleDrawn(timeoutMs: number, pollMs = 50): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (drawn !== asked && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, pollMs));
  if (drawn !== asked) {
    throw new Error(`The marks were not redrawn ${asked ?? 'in their own styles'} in time: the globe is not showing. Try again.`);
  }
}

/** Back to a first visit's state. */
export function resetCardMarkStyleForTest(): void {
  asked = null;
  drawn = null;
  listeners.clear();
}
