/**
 * The moment each layer that follows the timeline last drew (decision D-W, step 5c): Earth
 * Weather's, and Space Weather's ENLIL, CMEs and the magnetopause and bow shock (D-SW, SW9, SW22, SW30).
 *
 * A layer notes it where it sets its shader's moment, and forgets it when it
 * is switched off. A clip that sweeps the forecast hours moves the shared
 * cursor for each frame and captures the frame only once every layer drawing
 * has drawn that frame's moment: the cursor reaches a layer through React,
 * a render later, and a frame captured before then would show the moment
 * before.
 */
export type WeatherLayer = 'heat' | 'wind' | 'rain' | 'clouds' | 'enlil' | 'cmes' | 'boundaries';

const drawn = new Map<WeatherLayer, number>();

/** This layer's shader now shows this moment. */
export function noteDrawn(layer: WeatherLayer, at: number): void {
  drawn.set(layer, at);
}

/** This layer is off: it draws no moment. */
export function forgetDrawn(layer: WeatherLayer): void {
  drawn.delete(layer);
}

/** Whether every layer drawing has drawn this moment. True when none is drawing. */
export function allDrawnFor(at: number): boolean {
  for (const moment of drawn.values()) if (moment !== at) return false;
  return true;
}

/** Tests only: no layer drawing. */
export function resetDrawnForTest(): void {
  drawn.clear();
}
