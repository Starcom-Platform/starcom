/**
 * What the header search needs of the Zones, and no more (decision D-ZR, ZR17's follow-up): each Zone and Sector's
 * id, name, level, landmarks, box and label, and every id the partition holds. The search read the whole partition
 * to find names, which at ZSP 2.0's full scale is about 6 MB fetched the moment the search opens; the handoff's
 * "Starcom loads it only when Zones mode is on" was not true of it. This is baked from the served files
 * (`npm run bake:zone-search`, part of `bake:areas`) into public/geopolitical/zones-search.json, and a test fails
 * when the two drift apart.
 */
import { useEffect, useState } from 'react';
import type { ZoneIndex, ZspPlace } from '../../../geopolitical/zones/zsp';

/** A place as the search shows it and flies to it. */
export type ZoneSearchPlace = Pick<ZspPlace, 'id' | 'name' | 'level' | 'landmarks' | 'bbox' | 'label'>;

/** What the search reads: a full ZoneIndex is one too. */
export interface ZoneSearch {
  zones: ReadonlyArray<{ root: ZoneSearchPlace; sectors: readonly ZoneSearchPlace[] }>;
  /** Every id the partition holds, so an area that is a Zone is not offered twice. */
  byId: { has(id: string): boolean };
}

/** The baked file. */
export interface ZoneSearchFile {
  zsp: string;
  zones: Array<{ root: ZoneSearchPlace; sectors: ZoneSearchPlace[] }>;
  /** Every other id the partition holds, its Terrae and Maria: the Zones' and Sectors' are in `zones`. */
  ids: string[];
}

export const ZONE_SEARCH_URL = '/geopolitical/zones-search.json';

const round = (n: number) => Math.round(n * 1000) / 1000;
const placeOf = (p: ZspPlace): ZoneSearchPlace => ({
  id: p.id,
  name: p.name,
  level: p.level,
  landmarks: [...p.landmarks],
  bbox: p.bbox.map(round) as ZspPlace['bbox'],
  label: { lat: round(p.label.lat), lon: round(p.label.lon) },
});

/** The search's file from the served partition, as `bake:zone-search` writes it. */
export function zoneSearchOf(index: ZoneIndex): ZoneSearchFile {
  const listed = listedIds(index.zones);
  return {
    zsp: index.edition,
    zones: index.zones.map((zone) => ({ root: placeOf(zone.root), sectors: zone.sectors.map(placeOf) })),
    ids: [...index.byId.keys()].filter((id) => !listed.has(id)),
  };
}

/** The ids of the Zones and Sectors a search lists. */
const listedIds = (zones: ZoneSearch['zones']): Set<string> =>
  new Set(zones.flatMap((zone) => [zone.root.id, ...zone.sectors.map((sector) => sector.id)]));

const fromFile = (file: ZoneSearchFile): ZoneSearch => ({ zones: file.zones, byId: new Set([...listedIds(file.zones), ...file.ids]) });

let loading: Promise<ZoneSearch | null> | null = null;

/** The search's Zones, fetched once; null when they cannot be read, and asked again next time. */
export function loadZoneSearch(): Promise<ZoneSearch | null> {
  loading ??= fetch(ZONE_SEARCH_URL)
    .then((res) => (res.ok ? res.json() as Promise<ZoneSearchFile> : Promise.reject(new Error(String(res.status)))))
    .then(fromFile)
    .catch(() => {
      loading = null;
      return null;
    });
  return loading;
}

/** Test-only: forget the fetched search. */
export function resetZoneSearchForTests(): void {
  loading = null;
}

/** The search's Zones once `wanted`, or null until then and when they cannot be read. */
export function useZoneSearch(wanted: boolean): ZoneSearch | null {
  const [search, setSearch] = useState<ZoneSearch | null>(null);
  useEffect(() => {
    if (!wanted || search) return;
    let alive = true;
    void loadZoneSearch().then((found) => { if (alive && found) setSearch(found); });
    return () => { alive = false; };
  }, [wanted, search]);
  return search;
}
