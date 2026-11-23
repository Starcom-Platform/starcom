/**
 * Which territory a coordinate falls in, and how many territories there are.
 *
 * This is the only coverage axis with a TRUE denominator: the territory set is
 * known and finite, so "reports fall in 3 of 242" is a real statement about
 * the world rather than about the corpus.
 *
 * ─── IT INFERS, AND THAT IS THE POINT AND THE PROBLEM ──────────────────────
 *
 * A stated jurisdiction is a quotation; this is a claim BY THIS NODE about
 * someone else's report, derived from their coordinate. It is worth computing
 * because it covers publishers who state nothing, and it is worth keeping
 * separate from the stated axis because the two are different kinds of fact.
 *
 * Nothing derived here is written to the report. Storing it would turn an
 * inference into part of the record, where a later reader could not tell it
 * from something the publisher said.
 *
 * ─── SHAPE OF THE WORK ─────────────────────────────────────────────────────
 *
 * Bounding boxes in an RBush first, precise ray casting only on the handful of
 * candidates it returns — the same arrangement borderIndex uses for segments.
 * 242 polygons tested precisely per report would be correct and wasteful.
 */
import RBush from 'rbush';
import {
  pointInGeometry, boundsOf, type PolygonGeometry,
} from '../../geoint/pointInPolygon';

interface TerritoryItem {
  minX: number; minY: number; maxX: number; maxY: number;
  name: string;
  geometry: PolygonGeometry;
}

export interface TerritoryIndex {
  /** How many territories exist — the denominator. */
  size: number;
  /** The territory containing this point, or null where none does (ocean). */
  at(lat: number, lon: number): string | null;
  /**
   * The territory a jurisdiction code names, for a report that states where it
   * is about without saying where it is. Null when nothing matches, which is
   * the common case for anything sub-national — see territoryCodeOf.
   */
  byCode(code: string): { name: string; geometry: PolygonGeometry } | null;
  /** Every country with a code, once, by name: for finding one by what it is called (plan item 3.5). */
  countries(): Array<{ code: string; name: string }>;
  /** A territory's two-letter code by Natural Earth's ADM0_A3, as the meshes and a country's card carry it ("JPN"). */
  a2Of(a3: string): string | null;
}

/** Natural Earth carries several name fields; the first present one wins. */
const NAME_KEYS = ['ADMIN', 'SOVEREIGNT', 'NAME', 'NAME_LONG', 'BRK_NAME'];

/**
 * The two-letter code for a territory, working around a Natural Earth quirk.
 *
 * `ISO_A2` is `-99` for eight territories — France and Norway among them,
 * because the field carries the code of the disputed-status entity rather than
 * the sovereign one. `ISO_A2_EH` holds the real code in exactly those cases.
 * A lookup reading only ISO_A2 would fail to find France, which is not an edge
 * case anybody would discover late by accident: it is one of the first places
 * anyone tests.
 */
export const territoryCodeOf = (properties: Record<string, unknown> | undefined): string | null => {
  for (const key of ['ISO_A2', 'ISO_A2_EH', 'WB_A2']) {
    const value = properties?.[key];
    if (typeof value === 'string' && value !== '-99' && value.trim().length === 2) {
      return value.trim().toUpperCase();
    }
  }
  return null;
};

const nameOf = (properties: Record<string, unknown> | undefined, fallback: number): string => {
  for (const key of NAME_KEYS) {
    const value = properties?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  // Never invent a name. An unnamed polygon is identified by its position in
  // the file, which is at least checkable against the source.
  return `territory ${fallback}`;
};

export function buildTerritoryIndex(features: ReadonlyArray<{
  properties?: Record<string, unknown>;
  geometry: PolygonGeometry;
}>): TerritoryIndex {
  const tree = new RBush<TerritoryItem>();
  const items: TerritoryItem[] = [];
  const byCode = new Map<string, { name: string; geometry: PolygonGeometry }>();
  const a2ByA3 = new Map<string, string>();

  features.forEach((feature, i) => {
    if (!feature.geometry || !('coordinates' in feature.geometry)) return;
    const [minX, minY, maxX, maxY] = boundsOf(feature.geometry);
    if (!Number.isFinite(minX)) return;
    const name = nameOf(feature.properties, i);
    items.push({ minX, minY, maxX, maxY, name, geometry: feature.geometry });
    const code = territoryCodeOf(feature.properties);
    // First wins: Natural Earth lists a sovereign state before its dependencies,
    // so a shared code resolves to the state rather than to an island of it.
    if (code && !byCode.has(code)) byCode.set(code, { name, geometry: feature.geometry });
    const a3 = feature.properties?.ADM0_A3;
    if (code && typeof a3 === 'string' && !a2ByA3.has(a3)) a2ByA3.set(a3, code);
  });
  tree.load(items);

  return {
    size: items.length,
    at(lat, lon) {
      const candidates = tree.search({ minX: lon, minY: lat, maxX: lon, maxY: lat });
      for (const candidate of candidates) {
        if (pointInGeometry(lat, lon, candidate.geometry)) return candidate.name;
      }
      return null;
    },
    byCode(code) {
      /*
       * A jurisdiction is matched only at country level. A peer publishes both
       * `us` and `us-tx`, and this dataset has 242 COUNTRIES — there is no
       * polygon for Texas in it, so `us-tx` resolves to nothing rather than
       * being silently widened to the whole United States. Drawing a state's
       * subject as its country would be a bigger claim than the publisher made.
       */
      const normalised = code.trim().toUpperCase();
      if (normalised.length !== 2) return null;
      return byCode.get(normalised) ?? null;
    },
    a2Of(a3) {
      return a2ByA3.get(a3.trim().toUpperCase()) ?? null;
    },
    countries() {
      return [...byCode.entries()]
        .map(([code, { name }]) => ({ code, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}
