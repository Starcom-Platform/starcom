import type { Observation, Source } from '../../../../types/intel/SourceObservation';
import { OBSERVATION_SCHEMA_VERSION } from '../../../../types/intel/SourceObservation';
import type { AdapterResult, SourceAdapter } from './types';
import { NO_PLACE_RESOLVER, type PlaceResolver } from '../placeGazetteer';

/**
 * GLEIF — the Global LEI Index.
 *
 * The first source deliberately chosen to be corroborated rather than to
 * corroborate: an authoritative registry of legal entities whose claims another
 * open registry also makes, which is what the project has been missing. See
 * docs/research/independent-sources.md.
 *
 * Emits NO coordinates, and that is not an omission. GLEIF publishes structured
 * address components (`addressLines`, `city`, `region`, `country`,
 * `postalCode`) and no latitude or longitude anywhere in the record. Geocoding
 * them would need a credentialed third-party service — failing the OSEE test
 * that an unaffiliated group can stand this up — and would invent precision the
 * registry never claimed. So these are equality-matched claims, which is why
 * the engine learned to compare them.
 */

/** The subset of a GLEIF LEI record this adapter reads. */
export interface GleifRecord {
  id?: string;
  attributes?: {
    lei?: string;
    entity?: {
      legalName?: { name?: string };
      legalAddress?: {
        city?: string | null;
        region?: string | null;
        country?: string | null;
        postalCode?: string | null;
      };
      status?: string;
    };
    registration?: {
      lastUpdateDate?: string;
      status?: string;
    };
  };
}

/**
 * Source ids of the national company registers this instance ingests.
 *
 * Named so the derivation below reads as a fact about GLEIF rather than two
 * unexplained strings, and so a second adapter deriving from the same
 * registers can reuse it instead of copying the list.
 */
export const NATIONAL_REGISTER_SOURCE_IDS = ['companies-house', 'brreg'] as const;

/** Internal — consumers use the `gleifAdapter` singleton and read `.source`. */
const GLEIF_SOURCE: Source = {
  id: 'gleif',
  kind: 'open-data',
  label: 'GLEIF Global LEI Index',
  /**
   * A — a registry of record.
   *
   * LEI data is submitted by the entity and validated by an accredited Local
   * Operating Unit under a published governance regime, then republished by
   * GLEIF. That is about as direct as documentary evidence about a company's
   * registration gets. Graded here, by us, at registration.
   *
   * The grade is about the REGISTRATION, not the company: an A source can
   * faithfully record an address a shell company chose precisely to be
   * uninformative.
   */
  trustBaseline: 'A',
  ingestMethod: 'poll',
  isMock: false,
  /**
   * Upstream of aggregators, DOWNSTREAM of national registers.
   *
   * This said `[]` with the note "upstream of others rather than derived from
   * any". That is true of Wikidata — which is why Wikidata statements citing
   * the Global LEI Index must not corroborate it (D13) — and false of the
   * registers themselves. To issue an LEI, an accredited Local Operating Unit
   * validates the entity against its home register and records the
   * registration number it found there, then revalidates annually.
   *
   * So GLEIF agreeing with a national register is substantially one source
   * restating another. Measured, not assumed: 57,187 Norwegian entities joined
   * on organisation number agree on postcode 91% of the time, and the
   * agreement is maintained by the copying rather than observed independently
   * — LEI records still being revalidated disagree 2.96% of the time, lapsed
   * ones 23.50%. See docs/measurements/gleif-register-agreement.md.
   *
   * Declaring it costs nothing today, because `independentFeeds` only
   * discounts a feed when its upstream is PRESENT in the same group and
   * registers are enumeration sources that produce no observations yet. It
   * matters the moment one becomes an observation source: without this, the
   * engine would read GLEIF-agrees-with-Companies-House as two independent
   * witnesses and manufacture confidence out of a copy, which is the exact
   * failure D13 exists to prevent.
   *
   * The list names the registers this instance actually ingests. That is
   * sufficient rather than a compromise — a register absent from the corpus
   * cannot appear in a group, so it cannot be discounted against. ADDING A
   * REGISTER SOURCE MEANS ADDING ITS ID HERE.
   */
  derivesFrom: [...NATIONAL_REGISTER_SOURCE_IDS],
};

/**
 * Attributes this adapter asserts. Both equality-matched — neither is a
 * coordinate.
 *
 * REGISTERED, not headquarters. GLEIF's `legalAddress` is where the entity is
 * legally registered, which is frequently not where it operates — and the gap
 * between the two is the signal an investigation into shell structures is
 * looking for, not noise to be reconciled. Wikidata's headquarters statements
 * assert `headquartersCity`/`headquartersCountry` and deliberately do not
 * corroborate these.
 */
const CITY = 'registeredCity';
const COUNTRY = 'registeredCountry';

class GleifAdapter implements SourceAdapter<GleifRecord> {
  readonly source: Source;
  private readonly resolvePlace: PlaceResolver;

  /**
   * The resolver is injected rather than imported, so an adapter without a
   * gazetteer resolves nothing and says so instead of silently falling back to
   * raw string comparison — which is the behaviour D14 recorded.
   */
  constructor(resolvePlace: PlaceResolver = NO_PLACE_RESOLVER, source: Source = GLEIF_SOURCE) {
    this.resolvePlace = resolvePlace;
    this.source = source;
  }

  toObservations(raw: GleifRecord[]): AdapterResult {
    const observations: Observation[] = [];
    const dropped: AdapterResult['dropped'] = [];

    for (const record of raw) {
      // A null or non-object row is dropped, not dereferenced. The shared
      // contract suite feeds these deliberately, and it caught this: upstream
      // JSON is not ours, and one bad row throwing would take down the whole
      // ingest rather than costing one record.
      if (!record || typeof record !== 'object') {
        dropped.push({ reason: 'record is not an object' });
        continue;
      }
      const a = record.attributes;
      const lei = a?.lei ?? record.id;
      if (!lei) {
        dropped.push({ reason: 'no LEI — nothing to identify the subject by' });
        continue;
      }

      const addr = a?.entity?.legalAddress;
      const name = a?.entity?.legalName?.name;

      /**
       * The observation timestamp is the registration's last update.
       *
       * Not "now". A registry record states what was true when it was last
       * validated, and stamping it with fetch time would make a decade-old
       * filing look like today's evidence — and would make the derived weight,
       * which decays with age, systematically overstate every record.
       */
      const updated = a?.registration?.lastUpdateDate;
      if (!updated || Number.isNaN(Date.parse(updated))) {
        dropped.push({ nativeId: lei, reason: 'no usable registration lastUpdateDate' });
        continue;
      }
      const timestamp = new Date(updated).toISOString();

      /**
       * The subject reference is the LEI, not the company name.
       *
       * This is the whole reason this pairing works where cross-source event
       * identity failed. An earthquake had to be matched by inferring identity
       * from coordinates; a legal entity carries a global identifier assigned
       * by a third party, so identity is GIVEN. Names are not: GLEIF's legal
       * name and another registry's label differ constantly in punctuation,
       * legal form, transliteration and language.
       *
       * The human name goes in `label`, where it informs a reader without
       * being load-bearing for matching.
       */
      const subjectEntityRef = lei;

      const base = {
        sourceId: this.source.id,
        subjectEntityRef,
        timestamp,
        method: 'reported' as const,
        label: name ? `${name} (${lei})` : lei,
        // The legal name again, on its own, for a panel to show in place of
        // the LEI (plan item 3.6). For reading only, as `label` is.
        ...(name ? { subjectName: name } : {}),
        tags: ['registry', 'legal-entity', this.source.id],
        // An organisation is not in one place at a time, so contradiction
        // detection must not treat two addresses as impossible.
        subjectKind: 'organization' as const,
        isMock: this.source.isMock,
        /**
         * A registry record is current until superseded, so its timing is not
         * a point — it is "as of the last update". Day precision: the
         * lastUpdateDate is a date, and claiming better would assert a
         * precision the field does not carry.
         */
        timePrecisionMs: 24 * 60 * 60 * 1000,
        schemaVersion: OBSERVATION_SCHEMA_VERSION,
      };

      const city = addr?.city?.trim();
      // Uppercased to the ISO 3166-1 alpha-2 canonical form, which is what
      // Wikidata's P297 emits. The engine compares exactly and does not fold.
      const country = addr?.country?.trim().toUpperCase();

      if (city) {
        /**
         * The city claim is the place's Wikidata id, not its name.
         *
         * GLEIF writes the local spelling — `Köln`, `München` — and the other
         * registry may write any of a dozen others. Publishing the raw string
         * made those read as disagreement (D14). Resolving to an id a third
         * party assigned is the same move the LEI already makes for the
         * company itself.
         */
        const qid = this.resolvePlace(city, country ?? undefined);
        if (qid) {
          observations.push({
            ...base,
            id: `${this.source.id}:${lei}:${CITY}`,
            label: `${base.label} — ${city}`,
            claim: { attribute: CITY, value: qid },
            // The city as the registry writes it: the id is what matches.
            valueLabel: city,
          });
        } else {
          // Counted, never guessed. An unresolvable city is a gap in the
          // gazetteer, and emitting the raw name instead would reintroduce
          // exactly the cross-language mismatch this resolves.
          dropped.push({ nativeId: lei, reason: `city "${city}" not in the place gazetteer` });
        }
      }
      if (country) {
        observations.push({ ...base, id: `${this.source.id}:${lei}:${COUNTRY}`, claim: { attribute: COUNTRY, value: country } });
      }
      if (!city && !country) {
        dropped.push({ nativeId: lei, reason: 'legal address states neither a city nor a country' });
      }
    }

    return { observations, dropped };
  }
}

/**
 * Build a GLEIF adapter bound to a place gazetteer.
 *
 * A factory rather than a singleton because the gazetteer is data loaded at
 * ingest time, and an adapter constructed before it exists would resolve
 * nothing for the life of the process.
 */
export function createGleifAdapter(resolvePlace: PlaceResolver): SourceAdapter<GleifRecord> {
  return new GleifAdapter(resolvePlace);
}
