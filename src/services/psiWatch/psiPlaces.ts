/**
 * Psi Watch's places at a moment (decision D-PW, build step 5, PW32–PW33): what each of its three Zone layers draws
 * from the kit's notes. Psi Alerts (PsiRifts) while each alert holds; Windows (PsiWindows) at the strength their
 * window's curve stands at the cursor, none outside it; Tested places (PsiZones) always, as where a registered test
 * looked. A place is its area's outline (areas-lod0): a 1.0 Zone the swap retired is the Zones that now hold it
 * (ZR28), and says so; a place with no outline, a Sector of the first Zones, is counted, not drawn.
 *
 * A span brushed on the Timestream (PW50) lights every alert and window that touches it, a window at its strongest
 * there; what the cursor holds outside the span is kept, dimmed.
 */
import type { PolygonGeometry } from '../geoint/pointInPolygon';
import { areaByCode } from '../../features/globe/areas/areaRegistry';
import type { AreaShapes } from '../../features/globe/areas/areaShapes';
import { readAlert, readScryResult, readWindowNote, type PsiFixture } from './psiEvents';
import type { PsiFamily } from './psiEvents';
import { windowWeightAt, type EventWindow } from './windowProfile';

export type PsiPlaceLayer = 'PsiRifts' | 'PsiWindows' | 'PsiZones';

export interface PsiPlace {
  layer: PsiPlaceLayer;
  /** The note it is drawn for. */
  address: string;
  title: string;
  /** The place as the note names it, and its area's name. */
  code: string;
  name: string;
  geometry: PolygonGeometry;
  /** A retired 1.0 Zone: how many Zones now hold it. */
  retiredInto?: number;
  /** A window's curve at the cursor, 0–1. */
  weight?: number;
  /** An alert's end, unix seconds. */
  until?: number;
  /** A tested place's result there, as published. */
  result?: { registration: string; rr: number; p: number };
  /** Outside a brushed span: drawn, dimmed. */
  dim?: boolean;
}

export interface PsiPlaces {
  places: PsiPlace[];
  /** Places named that have no outline to draw, by layer. */
  unmatched: { layer: PsiPlaceLayer; code: string }[];
}

/** Below this share of its peak, a window is not drawn. */
export const WINDOW_SHOWN_FROM = 0.02;
/** A window's curve read this many times across a brushed span, for its strongest there. */
const SPAN_SAMPLES = 48;

/** A window's strongest across a span, unix seconds: its peak where the span holds it. */
function strongestIn(window: EventWindow, from: number, until: number): number {
  const a = Math.max(from, window.from);
  const b = Math.min(until, window.until);
  if (a > b) return 0;
  if (window.peak >= a && window.peak <= b) return windowWeightAt(window, window.peak) ?? 1;
  let most = 0;
  for (let i = 0; i <= SPAN_SAMPLES; i++) most = Math.max(most, windowWeightAt(window, a + ((b - a) * i) / SPAN_SAMPLES) ?? 1);
  return most;
}

const FAMILY_LAYER: Partial<Record<PsiFamily, PsiPlaceLayer>> = {
  psi_alert: 'PsiRifts',
  psi_window: 'PsiWindows',
  psi_scry_result: 'PsiZones',
};

export function psiPlacesAt(
  fixtures: readonly (PsiFixture & { family: PsiFamily })[],
  cursor: number,
  shapes: AreaShapes | undefined,
  layers: ReadonlySet<PsiPlaceLayer>,
  /** A brushed span, unix seconds. */
  span?: { from: number; until: number } | null,
): PsiPlaces {
  const places: PsiPlace[] = [];
  const unmatched: PsiPlaces['unmatched'] = [];
  const place = (layer: PsiPlaceLayer, code: string, more: Partial<PsiPlace> & { address: string; title: string }) => {
    const shape = shapes?.get(code);
    if (!shape) {
      unmatched.push({ layer, code });
      return;
    }
    const area = areaByCode(code);
    places.push({
      layer,
      code,
      name: shape.name,
      geometry: shape.geometry,
      ...(area?.from === 'covered' ? { retiredInto: area.coveredBy.length } : {}),
      ...more,
    });
  };
  for (const fixture of fixtures) {
    const layer = FAMILY_LAYER[fixture.family];
    if (!layer || !layers.has(layer)) continue;
    if (layer === 'PsiRifts') {
      const alert = readAlert(fixture.event);
      if (!alert.zone.id) continue;
      const holds = (from: number, until: number) => (alert.validFrom === undefined || until >= alert.validFrom) && (alert.validUntil === undefined || from <= alert.validUntil);
      const inSpan = span ? holds(span.from, span.until) : false;
      if (!inSpan && !holds(cursor, cursor)) continue;
      place(layer, alert.zone.id, {
        address: alert.address, title: alert.title, ...(alert.validUntil !== undefined ? { until: alert.validUntil } : {}), ...(span && !inSpan ? { dim: true } : {}),
      });
    } else if (layer === 'PsiWindows') {
      const note = readWindowNote(fixture.event);
      if (!note) continue;
      // Null is inside a band, which has no curve: the window holds at full strength from edge to edge.
      const inSpan = span ? strongestIn(note.window, span.from, span.until) : 0;
      const weight = inSpan >= WINDOW_SHOWN_FROM ? inSpan : windowWeightAt(note.window, cursor) ?? 1;
      if (weight < WINDOW_SHOWN_FROM) continue;
      const dim = span && inSpan < WINDOW_SHOWN_FROM ? { dim: true } : {};
      for (const zone of note.zones) place(layer, zone.id, { address: note.address, title: note.title, weight: Math.min(1, weight), ...dim });
    } else {
      const result = readScryResult(fixture.event);
      for (const zone of result.zones) {
        place(layer, zone.zone, {
          address: result.address, title: result.title, result: { registration: result.registration, rr: zone.rr, p: zone.p },
        });
      }
    }
  }
  return { places, unmatched };
}
