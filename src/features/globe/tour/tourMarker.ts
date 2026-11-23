/**
 * The item a briefing tour holds, for the globe to draw the eye to (critique C34: "something that draws the eye to
 * the item"): where it is, and how long it has been held. Told each frame by whatever is touring, the screen's tour
 * (useBriefingTour) or a clip's (recordTour, from the clip's own timeline, so the same clip draws the same pings),
 * and read each frame by the ping drawn over it (useGlobeTourPing).
 */
export interface TourMarker {
  lat: number;
  lng: number;
  /** How long the stop has been held, in ms. */
  heldForMs: number;
}

let marker: TourMarker | null = null;

export function setTourMarker(next: TourMarker | null): void {
  marker = next;
}

export function tourMarker(): TourMarker | null {
  return marker;
}
