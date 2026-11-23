/**
 * What a click on a satellite opens (critique C5, the open list of decision D-CT): its name and catalogue number as
 * CelesTrak lists them, its altitude as drawn, that the position is predicted from published elements and not
 * observed, and its record in CelesTrak's satellite catalogue (SATCAT), which links on to the elements themselves.
 *
 * Its role ("Starlink", "GPS") is the legend's, the word its colour stands for. The country the catalogue manager
 * guesses from a name is a guess, so it is not shown. A piece of one of the three debris clouds also says what broke
 * up, and when, with NASA's report of it.
 */
import { labelForType } from '../../../components/Globe/satellitePoints';
import { SATELLITE_PREDICTED_NOTE } from '../../../services/Satellites/SatelliteDataManager';
import { debrisCloudOf } from '../../../services/Satellites/debrisClouds';
import type { GlobeNoteSet } from './globeNoteStore';

export interface SatelliteNoteInput {
  /** Its NORAD catalogue number, as CelesTrak gives it. */
  id: string;
  name: string;
  type: string;
  /** Kilometres above the surface, as drawn. */
  altitude: number;
  /** For a piece of a debris cloud, the cloud's key (debrisClouds.ts). */
  debrisOf?: string;
}

/** A NORAD catalogue number, and nothing else, may become part of a link. */
const CATALOGUE_NUMBER = /^\d{1,9}$/;

export function satelliteNoteSet(sat: SatelliteNoteInput): GlobeNoteSet {
  const numbered = CATALOGUE_NUMBER.test(sat.id);
  const cloud = debrisCloudOf(sat.debrisOf);
  const lines = [
    ...(cloud ? [cloud.breakup] : []),
    ...(numbered ? [`NORAD catalogue number ${sat.id}`] : []),
    ...(Number.isFinite(sat.altitude) ? [`Altitude about ${Math.round(sat.altitude)} km`] : []),
    SATELLITE_PREDICTED_NOTE,
  ];
  return {
    heading: 'Satellites',
    notes: [{
      id: sat.id,
      kind: `Satellite, ${labelForType(sat.type)}`,
      title: sat.name,
      text: lines.join('\n'),
      // Its position is predicted for the moment drawn; nothing about it was published at a time of its own.
      timeMs: null,
      sources: [
        ...(numbered ? [`https://celestrak.org/satcat/table-satcat.php?CATNR=${sat.id}`] : []),
        ...(cloud ? [cloud.source] : []),
      ],
    }],
  };
}
