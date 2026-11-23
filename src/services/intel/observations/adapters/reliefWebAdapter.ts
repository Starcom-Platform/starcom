import type { Source } from '../../../../types/intel/SourceObservation';
import { createObservation, ObservationValidationError } from '../createObservation';
import type { AdapterResult, SourceAdapter } from './types';

/**
 * ReliefWeb (UN OCHA) disasters → Observation.
 *
 * NOTE ON WIRING, stated rather than discovered later: this adapter is
 * complete and tested against ReliefWeb's documented v1 `/disasters` shape,
 * but there is currently NO fetch path feeding it. The app's only one lived in
 * FeedsService, which has been deleted (dead code, and it carried hardcoded
 * API keys). Wiring a real fetch against api.reliefweb.int is a separate task
 * from mapping the records, and mapping is what II.A.2 is for. The adapter is
 * correct; the pipe into it does not exist yet.
 */

/** The subset of a ReliefWeb v1 disaster record this adapter reads. */
export interface ReliefWebDisaster {
  id?: string | number;
  fields?: {
    name?: string;
    status?: string;
    date?: { created?: string; changed?: string };
    primary_country?: { name?: string; location?: { lat?: number; lon?: number } };
    country?: Array<{ name?: string; location?: { lat?: number; lon?: number } }>;
    type?: Array<{ name?: string }>;
    description?: string;
  };
}

export const RELIEFWEB_SOURCE: Source = {
  id: 'reliefweb',
  kind: 'open-data',
  label: 'ReliefWeb (UN OCHA)',
  // B — usually reliable. Humanitarian reporting curated by UN OCHA with a
  // published editorial process, compiled from partner agency reporting rather
  // than observed directly.
  trustBaseline: 'B',
  ingestMethod: 'poll',
  isMock: false,
};

export class ReliefWebAdapter implements SourceAdapter<ReliefWebDisaster> {
  readonly source: Source;

  constructor(source: Source = RELIEFWEB_SOURCE) {
    this.source = source;
  }

  toObservations(raw: ReliefWebDisaster[]): AdapterResult {
    const observations = [];
    const dropped: AdapterResult['dropped'] = [];

    for (const rec of raw ?? []) {
      if (!rec || typeof rec !== 'object') {
        dropped.push({ reason: 'record is not an object' });
        continue;
      }

      const nativeId = rec.id != null ? String(rec.id) : undefined;
      if (!nativeId) {
        dropped.push({ reason: 'no stable upstream identifier' });
        continue;
      }

      const fields = rec.fields ?? {};
      const timestamp = fields.date?.created ?? fields.date?.changed;
      if (!timestamp) {
        dropped.push({ nativeId, reason: 'no created or changed date' });
        continue;
      }

      const country = fields.primary_country ?? fields.country?.[0];
      const subject = country?.name ?? fields.name;
      if (!subject) {
        dropped.push({ nativeId, reason: 'no country or disaster name to attribute the record to' });
        continue;
      }

      // Location is optional here. ReliefWeb's country centroid is a coarse
      // position for a whole country, and a disaster is not AT its country's
      // centroid — emitting it as a precise point would put false precision
      // into the spatial correlation. Carried only when present, and the
      // coarseness is recorded in the claim so a consumer can discount it.
      const lat = country?.location?.lat;
      const lon = country?.location?.lon;
      const hasGeo = typeof lat === 'number' && typeof lon === 'number';

      try {
        observations.push(createObservation(this.source, {
          nativeId,
          subjectEntityRef: subject,
          claim: {
            attribute: 'humanitarian_disaster',
            value: {
              name: fields.name,
              status: fields.status,
              disasterTypes: (fields.type ?? []).map(t => t.name).filter(Boolean),
              country: country?.name,
              geoPrecision: hasGeo ? 'country-centroid' : 'none',
            },
          },
          timestamp,
          method: 'reported',
          geo: hasGeo ? { lat: lat as number, lon: lon as number } : undefined,
          label: fields.name ?? `Disaster in ${subject}`,
          tags: ['humanitarian', 'reliefweb', country?.name].filter(Boolean) as string[],
          // The subject is a country or a named disaster — neither is a thing
          // that occupies one location at a time.
          subjectKind: 'place',
        }));
      } catch (err) {
        dropped.push({
          nativeId,
          reason: err instanceof ObservationValidationError ? err.message : 'unexpected mapping failure',
        });
      }
    }

    return { observations, dropped };
  }
}

export const reliefWebAdapter = new ReliefWebAdapter();
