#!/usr/bin/env tsx
/**
 * Bakes the Smithsonian Global Volcanism Program's Holocene volcano catalog
 * (1,214 real, named volcanoes with rich properties — type, last eruption year,
 * elevation, tectonic setting, country/region) to a static JSON asset at build
 * time, mirroring scripts/geopolitical/bake-territories.ts's pattern for exactly
 * this kind of near-static reference data.
 *
 * Must be baked, not fetched live: confirmed directly (curl with an Origin header)
 * that GVP's WFS endpoint sends no Access-Control-Allow-Origin header, so a browser
 * fetch() would be CORS-blocked despite curl/Node succeeding fine (CORS is
 * enforced by browsers, not the server or Node's own fetch).
 *
 * Output: public/eco-natural/volcanoes-baked.json
 */
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE_URL =
  'https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes&outputFormat=application/json';

const OUTPUT_DIR = resolve('public/eco-natural');
const OUTPUT_FILE = resolve(OUTPUT_DIR, 'volcanoes-baked.json');

interface RawVolcanoProperties {
  Volcano_Number: number;
  Volcano_Name: string;
  Primary_Volcano_Type?: string;
  Last_Eruption_Year?: number | null;
  Country?: string;
  Region?: string;
  Elevation?: number;
  Tectonic_Setting?: string;
}

interface RawVolcanoFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: RawVolcanoProperties;
}

interface RawVolcanoResponse {
  type: 'FeatureCollection';
  totalFeatures: number;
  features: RawVolcanoFeature[];
}

export interface BakedVolcano {
  id: number;
  name: string;
  lat: number;
  lng: number;
  type?: string;
  lastEruptionYear?: number | null;
  country?: string;
  region?: string;
  elevation?: number;
  tectonicSetting?: string;
}

export interface ParsedVolcanoes {
  volcanoes: BakedVolcano[];
  dropped: number;
}

/** Pure mapping/validation, split out from the fetch/write I/O for direct unit testing. */
export function parseVolcanoFeatures(payload: RawVolcanoResponse): ParsedVolcanoes {
  const volcanoes: BakedVolcano[] = [];
  let dropped = 0;
  for (const feature of payload.features) {
    const [lng, lat] = feature.geometry?.coordinates ?? [];
    const props = feature.properties;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !props?.Volcano_Number || !props?.Volcano_Name) {
      dropped++;
      continue;
    }

    volcanoes.push({
      id: props.Volcano_Number,
      name: props.Volcano_Name,
      lat: lat as number,
      lng: lng as number,
      type: props.Primary_Volcano_Type || undefined,
      lastEruptionYear: typeof props.Last_Eruption_Year === 'number' ? props.Last_Eruption_Year : null,
      country: props.Country || undefined,
      region: props.Region || undefined,
      elevation: typeof props.Elevation === 'number' ? props.Elevation : undefined,
      tectonicSetting: props.Tectonic_Setting || undefined
    });
  }
  return { volcanoes, dropped };
}

async function main(): Promise<void> {
  console.log(`Fetching real Smithsonian GVP volcano catalog from ${SOURCE_URL} ...`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`GVP WFS request failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as RawVolcanoResponse;
  if (!payload || !Array.isArray(payload.features)) {
    throw new Error('GVP WFS payload missing features array');
  }

  const { volcanoes, dropped } = parseVolcanoFeatures(payload);

  if (volcanoes.length === 0) {
    throw new Error('Zero usable volcanoes parsed from GVP WFS response — refusing to write an empty catalog');
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const output = {
    source: 'Smithsonian Institution Global Volcanism Program (GVP-VOTW Holocene Volcanoes)',
    sourceUrl: SOURCE_URL,
    generatedAt: new Date().toISOString(),
    count: volcanoes.length,
    volcanoes
  };
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log(`Wrote ${volcanoes.length} real volcanoes to ${OUTPUT_FILE} (dropped ${dropped} malformed entries, reported totalFeatures=${payload.totalFeatures}).`);
}

// Only run as a side effect when executed directly (`tsx bake-volcanoes.ts`) — not
// when imported (e.g. by bake-volcanoes.test.ts for parseVolcanoFeatures), which
// would otherwise fire a real network request and process.exit() during a test run.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error('Failed to bake volcano catalog:', err);
    process.exit(1);
  });
}
