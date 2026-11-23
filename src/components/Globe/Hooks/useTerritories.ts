/**
 * The territory polygons, fetched once and shared.
 *
 * A megabyte of GeoJSON the globe already serves for its own layers, so this
 * is a second reader of a shipped file rather than a new download — but it is
 * still a megabyte, so it is fetched once per session and only when something
 * asks. Two consumers now want it (coverage, and the region marks), which is
 * why it lives here rather than inside either.
 */
import { useEffect, useState } from 'react';
import { buildTerritoryIndex, type TerritoryIndex } from '../../../services/intel/coverage/territoryIndex';

let territoryPromise: Promise<TerritoryIndex | undefined> | null = null;

export const loadTerritories = (): Promise<TerritoryIndex | undefined> => {
  territoryPromise ??= fetch('/geopolitical/world-territories-lod0.geojson', { cache: 'force-cache' })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then((geo) => buildTerritoryIndex(geo.features ?? []))
    .catch(() => {
      // A failed fetch must not poison the session: the next caller retries,
      // and until one succeeds the surfaces say they are not measured.
      territoryPromise = null;
      return undefined;
    });
  return territoryPromise;
};

/** The index once it has loaded, or undefined until then. */
export function useTerritories(): TerritoryIndex | undefined {
  const [index, setIndex] = useState<TerritoryIndex | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadTerritories().then((t) => { if (alive) setIndex(t); });
    return () => { alive = false; };
  }, []);
  return index;
}
