/**
 * The desk's map (decision D-LD, LD2): how many leads name each country, shaded, and each US state
 * listed, for organisations and places only — people are never placed (BF2). Choosing a country or a
 * state shows its leads in the list. The countries are the globe's own outlines
 * (world-territories-lod0.geojson, a file the globe already serves), fetched once a session and only
 * when the map is opened; a place the outlines cannot hold is named, never guessed.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { geoArea, geoNaturalEarth1, geoPath } from 'd3';
import type { Lead } from '../../../services/exchange/leads';
import { countsByPlace, placeIndex } from '../../../services/exchange/leadPlaces';

interface CountryFeature {
  type: 'Feature';
  properties: Record<string, unknown> | null;
  geometry: unknown;
}

const WIDTH = 560;
const HEIGHT = 300;

type Ring = number[][];
type Geometry = { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] } | { type: string; coordinates?: unknown };

/**
 * d3 draws on the sphere and takes a ring's winding as which side is inside: a country wound the way
 * GeoJSON's RFC 7946 winds it reads as the whole world but that country, and fills the map (found on
 * the build). A polygon covering more than a hemisphere is wound the other way, so its rings turn.
 */
function forD3(feature: CountryFeature): CountryFeature {
  const g = feature.geometry as Geometry;
  const fix = (rings: Ring[]): Ring[] => (geoArea({ type: 'Polygon', coordinates: rings } as never) > 2 * Math.PI ? rings.map((r) => [...r].reverse()) : rings);
  if (g?.type === 'Polygon') return { ...feature, geometry: { type: 'Polygon', coordinates: fix(g.coordinates as Ring[]) } };
  if (g?.type === 'MultiPolygon') return { ...feature, geometry: { type: 'MultiPolygon', coordinates: (g.coordinates as Ring[][]).map(fix) } };
  return feature;
}

let territories: Promise<CountryFeature[]> | null = null;
function loadTerritories(): Promise<CountryFeature[]> {
  territories ??= fetch('/geopolitical/world-territories-lod0.geojson', { cache: 'force-cache' })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`the outlines answered ${res.status}`))))
    .then((geo: { features?: CountryFeature[] }) => (geo.features ?? []).map(forD3))
    .catch((error: unknown) => {
      // A failed fetch must not stand for the session: the next opening asks again.
      territories = null;
      throw error;
    });
  return territories;
}

/** The shade for a count: 1, 2 to 4, 5 or more. */
const shadeOf = (n: number) => (n >= 5 ? 0.9 : n >= 2 ? 0.6 : 0.32);
const SHADES: Array<[string, number]> = [['1 lead', 1], ['2–4', 2], ['5 or more', 5]];

export const LeadMap: React.FC<{ leads: readonly Lead[]; onPick: (label: string, ids: readonly string[]) => void }> = ({ leads, onPick }) => {
  const [features, setFeatures] = useState<CountryFeature[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadTerritories().then(
      (f) => { if (live) setFeatures(f); },
      (error: unknown) => { if (live) setFailed(error instanceof Error ? error.message : String(error)); },
    );
    return () => { live = false; };
  }, []);

  const counts = useMemo(() => (features ? countsByPlace(leads, placeIndex(features)) : null), [features, leads]);
  const path = useMemo(() => {
    if (!features) return null;
    const projection = geoNaturalEarth1().fitSize([WIDTH, HEIGHT], { type: 'FeatureCollection', features } as never);
    return geoPath(projection);
  }, [features]);

  if (failed) return <Typography variant="body2" color="text.secondary" data-testid="lead-map">{`The map's outlines did not load (${failed}).`}</Typography>;
  if (!features || !counts || !path) return <Typography variant="body2" color="text.secondary" data-testid="lead-map">Loading the map…</Typography>;

  const placed = [...counts.countries.values()].reduce((n, ids) => n + ids.length, 0);
  const states = [...counts.states].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  return (
    <Box data-testid="lead-map">
      <Box sx={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" style={{ minWidth: WIDTH, display: 'block' }} role="img" aria-label="Leads by the countries they name">
          {features.map((f, i) => {
            const code = typeof f.properties?.ADM0_A3 === 'string' ? f.properties.ADM0_A3 : '';
            const name = typeof f.properties?.NAME === 'string' ? f.properties.NAME : code;
            const ids = counts.countries.get(code) ?? [];
            const d = path(f as never) ?? undefined;
            if (!ids.length) return <path key={code || i} d={d} style={{ fill: 'none', stroke: 'var(--sc-divider)', strokeWidth: 0.5 }} />;
            return (
              <path
                key={code || i}
                d={d}
                data-testid="map-country"
                data-code={code}
                role="button"
                tabIndex={0}
                aria-label={`${name}: ${ids.length} ${ids.length === 1 ? 'lead' : 'leads'}`}
                onClick={() => onPick(name, ids)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(name, ids); } }}
                style={{ fill: 'var(--sc-accent)', fillOpacity: shadeOf(ids.length), stroke: 'var(--sc-divider)', strokeWidth: 0.5, cursor: 'pointer' }}
              >
                <title>{`${name}: ${ids.length} ${ids.length === 1 ? 'lead' : 'leads'}`}</title>
              </path>
            );
          })}
        </svg>
      </Box>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
        {SHADES.map(([label, n]) => (
          <Stack key={label} direction="row" spacing={0.5} alignItems="center">
            <Box component="span" sx={{ width: 12, height: 12, bgcolor: 'var(--sc-accent)', opacity: shadeOf(n), borderRadius: 0.5 }} />
            <Typography variant="caption">{label}</Typography>
          </Stack>
        ))}
        <Typography variant="caption" color="text.secondary">
          {`${counts.countries.size} countries named by ${new Set([...counts.countries.values()].flat()).size} leads (${placed} in all). Organisations and places only; people are never placed.`}
        </Typography>
      </Stack>
      {states.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="overline" component="h3">United States, by state</Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {states.map(([state, ids]) => (
              <Chip key={state} size="small" variant="outlined" data-testid="map-state" label={`${state} ${ids.length}`}
                onClick={() => onPick(`${state}, United States`, ids)} />
            ))}
          </Stack>
        </Box>
      )}
      {counts.unplaced.length > 0 && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
          {`Named but not on the map: ${counts.unplaced.join('; ')}.`}
        </Typography>
      )}
    </Box>
  );
};
