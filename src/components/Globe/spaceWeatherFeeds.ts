/**
 * Space Weather's sources as a card names them (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW11): each source, when it
 * was read and whether it could be, its credits, and the notes that say what is drawn from it.
 *
 * A drawing that stands in for a source that failed is its own entry, undated, so its note is shown:
 * a note on the failed source's own entry never is (noteApplies asks that the data can be in the
 * picture). The Kp model's aurora, standing in for OVATION, and the belts at a typical brightness,
 * standing in for GOES, are such drawings.
 */
import type { FeedProvenance } from '../../features/globe/capture/shareCardProvenance';
import { CREDITS } from '../../features/globe/capture/sourceCredits';
import type { EFieldLook } from '../../hooks/useEcoNaturalSettings';
import type { T96DriverReading } from '../../services/spaceWeather/t96Drivers';
import type { GoesElectrons } from './spaceWeather/vanAllenBelts';
import { E_FIELD_NOTE, E_FIELD_NOTE_SHORT, eFieldLookNote } from './Hooks/useGlobeEField';
import { auroraNotes } from './Hooks/useGlobeAurora';
import { fieldLinesNotes } from './Hooks/useGlobeFieldLines';
import { vanAllenNotes } from './Hooks/useGlobeVanAllenBelts';
import { cuspsNotes } from './Hooks/useGlobeCusps';
import { TAIL_SHEET_NOTES } from './Hooks/useGlobeTailSheet';
import { heliosphereNotes } from './Hooks/useGlobeHeliosphere';
import { nearEarthFlowNotes } from './Hooks/useGlobeNearEarthFlow';
import { enlilNotes } from './Hooks/useGlobeEnlil';
import { cmeNotes } from './Hooks/useGlobeCmes';
import { boundaryNotes } from './Hooks/useGlobeBoundaryMoment';
import type { Cme } from '../../services/spaceWeather/donki';
import type { BoundaryWind } from '../../services/spaceWeather/boundaryWind';
import type { EnlilQuantity } from './spaceWeather/enlilDisc';

interface Source { error: string | null; loading: boolean }

export interface SpaceWeatherFeedInput {
  /** NOAA's space weather feed: the e-field files, Kp and the rest. */
  noaa: Source & { lastUpdated: string | null };
  eField: { on: boolean; look: EFieldLook };
  aurora: Source & { on: boolean; drawn: boolean; observed: string | null; curtain: boolean; kpStandsIn: boolean };
  fieldLines: Source & { on: boolean; drawn: boolean; reading: T96DriverReading | null };
  vanAllen: Source & { on: boolean; drawn: boolean; electrons: GoesElectrons | null };
  /** The cusps, traced from the field lines' drivers: no source of their own. */
  cusps?: { on: boolean; drawn: boolean; reading: T96DriverReading | null };
  /** The tail's current sheet, from the same drivers: no source of its own. */
  tailSheet?: { on: boolean; drawn: boolean };
  /** The solar wind past the magnetosphere, from the field lines' wind: no source of its own. */
  nearEarthFlow?: { on: boolean; drawn: boolean; reading: T96DriverReading | null };
  /** The solar wind from the Sun to the Earth: its 7 days of wind, and the hindcast's moment. */
  heliosphere?: Source & { on: boolean; drawn: boolean; moment: number | null; lastArrival: number | null };
  /** NOAA's ENLIL model: the moment drawn, the quantity, and whether it is a forecast. */
  enlil?: Source & { on: boolean; drawn: boolean; at: number | null; quantity: EnlilQuantity; forecast: boolean };
  /** NASA DONKI's CMEs: those in flight at the moment drawn. */
  cmes?: Source & { on: boolean; drawn: boolean; at: number | null; inFlight: readonly Cme[] };
  /** The wind the magnetopause and bow shock stand off from at a paused moment; on only while paused. */
  boundaries?: Source & { on: boolean; wind: BoundaryWind | null };
}

/** Space Weather's entries, in the order a card names them. */
export function spaceWeatherFeeds(input: SpaceWeatherFeedInput): FeedProvenance[] {
  const { noaa, eField, aurora, fieldLines, vanAllen, cusps, tailSheet, nearEarthFlow, heliosphere, enlil, cmes, boundaries } = input;
  const feeds: FeedProvenance[] = [{
    name: 'NOAA space weather',
    lastUpdated: noaa.lastUpdated,
    error: noaa.error,
    loading: noaa.loading,
    credits: [CREDITS.noaaSwpc],
    // What the geoelectric field is, and that its streaks are sped up (SW1, SW11).
    ...(eField.on ? { note: [E_FIELD_NOTE, eFieldLookNote(eField.look)].filter(Boolean).join(' '), noteShort: E_FIELD_NOTE_SHORT } : {}),
  }];
  // The aurora's forecast, a source of its own (SW3).
  if (aurora.on) {
    feeds.push({
      name: 'NOAA SWPC OVATION aurora forecast',
      shortName: 'OVATION',
      lastUpdated: aurora.observed,
      error: aurora.error,
      loading: aurora.loading,
      credits: [CREDITS.noaaSwpc],
      ...(aurora.drawn ? auroraNotes(aurora.curtain) : {}),
    });
    if (aurora.kpStandsIn) {
      feeds.push({
        name: 'The aurora modelled from Kp',
        shortName: 'Kp aurora',
        lastUpdated: null,
        timestamped: false,
        credits: [CREDITS.noaaSwpc],
        note: 'The aurora drawn is modelled from Kp alone, a near-circle round the geographic pole, while OVATION cannot be read.',
        noteShort: 'The aurora is modelled from Kp: OVATION could not be read.',
      });
    }
  }
  // The field lines' drivers, and the models they drive (SW4, SW11).
  if (fieldLines.on) {
    feeds.push({
      name: 'NOAA SWPC solar wind, driving T96',
      shortName: 'T96 wind',
      lastUpdated: fieldLines.reading?.wind?.observed ?? null,
      error: fieldLines.error,
      loading: fieldLines.loading,
      credits: [CREDITS.noaaSwpc, CREDITS.tsyganenkoT96, CREDITS.igrf14],
      ...(fieldLines.drawn && fieldLines.reading ? fieldLinesNotes(fieldLines.reading) : {}),
    });
  }
  // The electrons that brighten the outer belt, and the belts drawn without them where GOES failed (SW5).
  if (vanAllen.on) {
    feeds.push({
      name: 'NOAA SWPC GOES ≥2 MeV electrons',
      shortName: 'GOES electrons',
      lastUpdated: vanAllen.electrons?.at ?? null,
      error: vanAllen.error,
      loading: vanAllen.loading,
      credits: [CREDITS.noaaSwpc],
      ...(vanAllen.drawn && vanAllen.electrons ? vanAllenNotes(vanAllen.electrons) : {}),
    });
    if (vanAllen.drawn && !vanAllen.electrons) {
      feeds.push({ name: 'The Van Allen belts, at a typical brightness', shortName: 'Van Allen belts', lastUpdated: null, timestamped: false, ...vanAllenNotes(null) });
    }
  }
  // The cusps, drawn from the field lines' drivers: an entry of their own for their note (SW5).
  if (cusps?.on && cusps.drawn && cusps.reading) {
    feeds.push({ name: 'The cusps, traced from T96', shortName: 'Cusps', lastUpdated: null, timestamped: false, ...cuspsNotes(cusps.reading) });
  }
  // The tail's current sheet, likewise (SW5).
  if (tailSheet?.on && tailSheet.drawn) {
    feeds.push({ name: 'The tail\'s current sheet, from T96', shortName: 'Tail sheet', lastUpdated: null, timestamped: false, ...TAIL_SHEET_NOTES });
  }
  // The solar wind past the magnetosphere: the wind now, its flow a model (SW17).
  if (nearEarthFlow?.on && nearEarthFlow.drawn && nearEarthFlow.reading) {
    feeds.push({ name: 'The solar wind near the Earth', shortName: 'Near-Earth flow', lastUpdated: null, timestamped: false, ...nearEarthFlowNotes(nearEarthFlow.reading) });
  }
  // The solar wind from the Sun to the Earth: NOAA's 7 days of wind, and what the hindcast is (SW16).
  if (heliosphere?.on) {
    feeds.push({
      name: 'NOAA SWPC solar wind, 7 days',
      shortName: '7-day wind',
      lastUpdated: heliosphere.lastArrival !== null ? new Date(heliosphere.lastArrival).toISOString() : null,
      error: heliosphere.error,
      loading: heliosphere.loading,
      credits: [CREDITS.noaaSwpc],
      ...(heliosphere.drawn && heliosphere.moment !== null ? heliosphereNotes(heliosphere.moment) : {}),
    });
  }
  // NOAA's ENLIL model: its values read off SWPC's frames, a forecast when ahead (SW9, SW18). A run, not
  // a reading: undated, so its note says which moment it is for.
  if (enlil?.on) {
    feeds.push({
      name: 'NOAA SWPC WSA-ENLIL model',
      shortName: 'ENLIL',
      lastUpdated: null,
      timestamped: false,
      error: enlil.error,
      loading: enlil.loading,
      credits: [CREDITS.wsaEnlil],
      ...(enlil.drawn && enlil.at !== null ? enlilNotes(enlil.at, enlil.quantity, enlil.forecast) : {}),
    });
  }
  // NASA DONKI's CMEs: their fronts the drag-based model's, their arrivals CCMC's ENLIL estimates (SW20, SW21).
  if (cmes?.on) {
    feeds.push({
      name: 'NASA CCMC DONKI CMEs',
      shortName: 'CMEs',
      lastUpdated: null,
      timestamped: false,
      error: cmes.error,
      loading: cmes.loading,
      credits: [CREDITS.donki],
      ...(cmes.drawn && cmes.at !== null ? cmeNotes(cmes.inFlight, cmes.at) : {}),
    });
  }
  // The magnetopause and bow shock at a paused moment: the wind measured then, or past the measurements the last,
  // pushed in by a CME's sheath, modelled (SW30). While live they stand off from the latest, as NOAA's entry says.
  if (boundaries?.on) {
    feeds.push({
      name: 'NOAA SWPC solar wind at the bow shock',
      shortName: 'Magnetopause',
      lastUpdated: boundaries.wind ? new Date(boundaries.wind.measuredAt).toISOString() : null,
      error: boundaries.error,
      loading: boundaries.loading,
      credits: boundaries.wind?.pushedBy ? [CREDITS.noaaSwpc, CREDITS.donki] : [CREDITS.noaaSwpc],
      ...(boundaries.wind ? boundaryNotes(boundaries.wind) : {}),
    });
  }
  return feeds;
}
