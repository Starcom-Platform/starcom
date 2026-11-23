import { placePick } from '../../services/intel/place/placePick';

/**
 * A click on the globe, told apart from a drag and from a click on something over it.
 *
 * Three rules, all from measurements in the running app on 2026-09-13:
 *
 * - The pointer must come back up near where it went down. Picking a country or a
 *   cable landing point happened on pointerdown, so every drag that rotated the globe
 *   from over a country opened that country's panel.
 * - The press and the release must both land on the globe's canvas. The handlers
 *   listen on window, so the country panel's own Close button picked the country
 *   behind it and opened that country's panel instead. Over the globe the canvas is
 *   the topmost element, so a real click on it always targets it.
 * - Only the primary button picks. A right-click is a request for the globe menu, but
 *   pointerdown and pointerup fire for every button, so right-clicking over a country
 *   also opened that country's popup, whose backdrop then covered the menu and took
 *   its clicks; over an RLSH marker it opened the marker's popup and no menu at all.
 *
 * The tolerance is the one Enhanced3DGlobeInteractivity already uses for the same
 * distinction, so the globe's layers agree on what counts as a click.
 */
export const CLICK_TOLERANCE_PX = 5;

export interface PointerAt {
  x: number;
  y: number;
}

/** True when the pointer came up within the tolerance of where it went down. */
export function isGlobeClick(down: PointerAt | null, up: PointerAt, tolerancePx = CLICK_TOLERANCE_PX): boolean {
  return down !== null && Math.hypot(up.x - down.x, up.y - down.y) <= tolerancePx;
}

/** The primary button: a left click, a touch or a pen tap. Never the menu button. */
export function isPrimaryButton(event: { button: number }): boolean {
  return event.button === 0;
}

/**
 * What a layer nearer the viewer has under the pointer (BA9): the nearer thing takes
 * the click. An Intel Report's glyph, the nearest of all, takes every click; a
 * territory outlined for the reports about it takes a click that would pick an
 * area, a country, but not one that would pick a point drawn on it.
 *
 * The country layer picked a country on every click on the globe, so a click on a
 * report's glyph opened the report and the country's panel over it, and with a menu
 * at the click (K8) the panel covered the menu. Measured on the built app, 2026-10-04.
 */
export interface GlobeClickClaim {
  mark: boolean;
  area: boolean;
}

/**
 * How near a claiming layer stands, when two area layers lie one over the other
 * (2026-10-12): a Zone's Sector is nearer than the Spheres it lies in, and both
 * are nearer than the country under them. A layer asks only about the layers
 * ranked above its own, so its own claim, and those of the layers beneath it,
 * never stop it. A claim given no rank is the nearest of all, as every claim was
 * before ranks: a report's glyph.
 */
export const CLAIM_RANK = { nearest: 100, places: 50, zones: 20, spheres: 10 } as const;
/*
 * `places` (2026-10-13): Diplomacy's marks where events happened (D-DP, DP8). A click on one opens its
 * place in the drawer, not the Zone, Sphere or country under it; a report's glyph is nearer still.
 */

const claims = new Map<() => GlobeClickClaim, number>();

/** Say what is under the pointer, for as long as the layer is there; the returned function stops. */
export function claimGlobeClicks(claim: () => GlobeClickClaim, rank: number = CLAIM_RANK.nearest): () => void {
  claims.set(claim, rank);
  return () => { claims.delete(claim); };
}

/**
 * Whether a nearer layer takes what the pointer is over: then a layer beneath picks
 * nothing there, and does not light it up or offer a click it would not get.
 * `above` is the asking layer's own rank: only claims ranked above it count. The
 * country layer, which claims nothing, asks about every claim.
 */
export function nearerLayerTakes(picks: 'mark' | 'area', above = Number.NEGATIVE_INFINITY): boolean {
  for (const [claim, rank] of claims) {
    if (rank <= above) continue;
    const under = claim();
    if (picks === 'mark' ? under.mark : under.area) return true;
  }
  return false;
}

/**
 * The country under a click a nearer layer took (BA20). A territory or an area
 * outlined for the reports about it takes the click inside it (BA9, BA16), and
 * an area the size of a continent took every country's panel on it. So the
 * country layer offers the country under a click, named, with the way to open
 * its panel, and the menu at that click lists it last.
 */
export interface YieldedCountry {
  name: string;
  open: () => void;
}

type CountryOffer = (at: PointerAt) => YieldedCountry | null;
const countryOffers: CountryOffer[] = [];

/** Offer the country under a click, for as long as the layer is there; the returned function stops. The newest offer is asked. */
export function offerCountryAt(offer: CountryOffer): () => void {
  countryOffers.push(offer);
  return () => {
    const i = countryOffers.lastIndexOf(offer);
    if (i >= 0) countryOffers.splice(i, 1);
  };
}

/** The country under a click, in the viewport's pixels, or null where no country layer offers one. */
export function countryAt(at: PointerAt): YieldedCountry | null {
  const offer = countryOffers[countryOffers.length - 1];
  return offer ? offer(at) : null;
}

/**
 * Where a press that could become a pick began, or null when it cannot: a press that
 * started over something other than the globe's canvas, or with any button but the
 * primary one, or while a report's place is being picked, or over something a nearer
 * layer takes (claimGlobeClicks). The place-picking click gives the place
 * (useGlobePlacePick); a country's or a cable's panel opened by it stayed open over
 * the report form, since popups belong to the whole app.
 *
 * `picks` is what the caller would pick: a point (a mark) or an area (a country).
 */
export function pressOn(
  event: { button: number; clientX: number; clientY: number; target: EventTarget | null },
  canvas: Element | null | undefined,
  picks: 'mark' | 'area' = 'mark',
  above?: number,
): PointerAt | null {
  return canvas && event.target === canvas && isPrimaryButton(event) && !placePick.isPending() && !nearerLayerTakes(picks, above)
    ? { x: event.clientX, y: event.clientY }
    : null;
}
