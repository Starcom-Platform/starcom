import type { IntelReliability } from '../../../../types/intel/IntelItemUI';
import type { Observation, Source } from '../../../../types/intel/SourceObservation';
import { OBSERVATION_SCHEMA_VERSION } from '../../../../types/intel/SourceObservation';
import type { AdapterResult, SourceAdapter } from './types';

/**
 * Wikidata company records — an AGGREGATOR, handled as one.
 *
 * Wikidata does not observe anything. Each statement cites the source it came
 * from, and treating the lot as a single feed called "wikidata" would be wrong
 * in both directions: it would flatten a dozen genuinely distinct national
 * registries into one, and — worse — it would let statements imported FROM
 * GLEIF corroborate GLEIF.
 *
 * That second case is not hypothetical. Measured against the live endpoint:
 * of the headquarters statements on LEI-carrying companies, 5,957 cite the
 * Global LEI Index. They ARE GLEIF. See docs/research/independent-sources.md.
 *
 * So every observation carries `upstreamSourceId` naming the cited source, and
 * a GLEIF citation is mapped onto GLEIF's own feed id. The two then share a
 * feed and cannot corroborate each other — no special case needed, because
 * D12's feed counting already does the work.
 */

/** One headquarters statement, with the source Wikidata says it came from. */
export interface WikidataHqStatement {
  /** The company's LEI — the join key shared with GLEIF. */
  lei?: string;
  /**
   * The company's name, from the snapshot's `companyNames`, for display only
   * (plan item 3.6). The LEI stays the identity.
   */
  company?: string;
  /** Wikidata item id of the headquarters place — the canonical identity. */
  hqQid?: string;
  /** Headquarters place label, for display only. */
  hq?: string;
  /** Country of the headquarters place, when stated. */
  country?: string;
  /** Wikidata item id of the CITED source, e.g. `Q55259097`. */
  sourceQid?: string;
  /** Human label of the cited source, for provenance display. */
  sourceLabel?: string;
  /** When the statement was last modified, ISO 8601. */
  modified?: string;
}

/**
 * Wikidata item ids of cited sources that are really other feeds we already
 * ingest, mapped onto those feeds' own ids.
 *
 * `Q55259097` is the Global LEI Index. A statement citing it is a GLEIF record
 * that travelled through Wikidata, and must land in GLEIF's feed.
 */
const UPSTREAM_FEED_BY_QID: Record<string, string> = {
  Q55259097: 'gleif',
};

/**
 * Cited sources that are tertiary — encyclopaedia articles rather than
 * registries. Real evidence, weaker evidence.
 */
const TERTIARY_QIDS = new Set([
  'Q48183',   // German Wikipedia
  'Q328',     // English Wikipedia
  'Q8447',    // French Wikipedia
  'Q11920',   // Italian Wikipedia
]);

const WIKIDATA_SOURCE: Source = {
  id: 'wikidata',
  kind: 'open-data',
  label: 'Wikidata (company headquarters statements)',
  /**
   * C — fairly reliable, and the grade is about the AGGREGATOR rather than any
   * one statement. Wikidata is openly editable and its statements vary from
   * national-registry imports to an unsourced edit. Per-statement quality is
   * expressed through `observedTrust`, which is clamped so it can only ever be
   * equal to or worse than this.
   */
  trustBaseline: 'C',
  ingestMethod: 'poll',
  isMock: false,
};

/**
 * HEADQUARTERS, not registered address — and the distinction is load-bearing.
 *
 * Wikidata's P159 is "headquarters location": where a company actually
 * operates. GLEIF's `legalAddress` is where it is legally registered. A company
 * registered in Frankfurt and headquartered in Munich is not a contradiction,
 * it is two true facts.
 *
 * These were both called `registeredCity` at first, which made GLEIF and
 * Wikidata appear to corroborate each other and measured 65% "agreement". That
 * number was meaningless: the 35% were not mismatches to be fixed but
 * companies whose registered office differs from their operations, which is
 * ordinary and — for an investigation into shell structures — precisely the
 * interesting part.
 */
const CITY = 'headquartersCity';
const COUNTRY = 'headquartersCountry';

class WikidataAdapter implements SourceAdapter<WikidataHqStatement> {
  readonly source: Source = WIKIDATA_SOURCE;

  toObservations(raw: WikidataHqStatement[]): AdapterResult {
    const observations: Observation[] = [];
    const dropped: AdapterResult['dropped'] = [];

    for (const st of raw) {
      if (!st || typeof st !== 'object') {
        dropped.push({ reason: 'statement is not an object' });
        continue;
      }
      const lei = st.lei?.trim().toUpperCase();
      if (!lei) {
        dropped.push({ reason: 'no LEI — nothing to join on' });
        continue;
      }

      /**
       * A statement with no cited source is DROPPED.
       *
       * Unattributed provenance is not permission — the same rule
       * publicationPolicy applies to `isMock`. An unsourced Wikidata edit
       * counted as an independent registry would be the cheapest possible way
       * to manufacture corroboration: anyone can make one.
       */
      const qid = st.sourceQid?.trim();
      if (!qid) {
        dropped.push({ nativeId: lei, reason: 'statement cites no source' });
        continue;
      }

      const modified = st.modified;
      if (!modified || Number.isNaN(Date.parse(modified))) {
        dropped.push({ nativeId: lei, reason: 'no usable modification date' });
        continue;
      }

      /**
       * The feed this statement really belongs to.
       *
       * A known upstream keeps its own id, so a relayed claim shares a feed
       * with the original. Everything else is namespaced by the citation's
       * item id rather than its label: labels are edited, `Q`-ids are stable,
       * and a feed identity that changes when someone renames a page would
       * silently split one source into two.
       */
      const upstreamSourceId = UPSTREAM_FEED_BY_QID[qid] ?? `wikidata-cites:${qid}`;

      // Tertiary sources are graded down. observedTrust is clamped to no
      // better than the source baseline, so this can only ever lower it.
      const observedTrust: IntelReliability | undefined = TERTIARY_QIDS.has(qid) ? 'D' : undefined;

      const base = {
        sourceId: this.source.id,
        upstreamSourceId,
        // The cited source's name, for reading only: the feed stays keyed by its Q-id.
        ...(st.sourceLabel?.trim() ? { upstreamSourceLabel: st.sourceLabel.trim() } : {}),
        subjectEntityRef: lei,
        ...(st.company?.trim() ? { subjectName: st.company.trim() } : {}),
        timestamp: new Date(modified).toISOString(),
        // Relayed from a registry or an article, never observed by Wikidata.
        method: 'reported' as const,
        label: `${st.hq ?? lei} (${lei}) via ${st.sourceLabel ?? qid}`,
        tags: ['registry', 'legal-entity', this.source.id, qid],
        subjectKind: 'organization' as const,
        isMock: this.source.isMock,
        observedTrust,
        timePrecisionMs: 24 * 60 * 60 * 1000,
        schemaVersion: OBSERVATION_SCHEMA_VERSION,
      };

      const hqQid = st.hqQid?.trim();
      const country = st.country?.trim().toUpperCase();

      if (hqQid) {
        // The place's own Wikidata id, so GLEIF's `Köln` and this `Cologne`
        // resolve to the same claim rather than reading as a disagreement.
        observations.push({
          ...base,
          id: `${this.source.id}:${lei}:${qid}:${CITY}`,
          claim: { attribute: CITY, value: hqQid },
          ...(st.hq?.trim() ? { valueLabel: st.hq.trim() } : {}),
        });
      }
      if (country) {
        observations.push({ ...base, id: `${this.source.id}:${lei}:${qid}:${COUNTRY}`, claim: { attribute: COUNTRY, value: country } });
      }
      if (!hqQid && !country) {
        dropped.push({ nativeId: lei, reason: 'statement names neither a headquarters nor a country' });
      }
    }

    return { observations, dropped };
  }
}

export const wikidataAdapter = new WikidataAdapter();
